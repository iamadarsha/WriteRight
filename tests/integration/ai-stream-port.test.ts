import { describe, it, expect } from 'vitest';
import {
  connectAiStream,
  handleAiStreamPort,
  type StreamPort,
} from '@/messaging/ai-stream';
import type { AiBackend, AiRunStreamChunk } from '@/core/ai-backend';
import type { AiRunResponse } from '@/types/messages';

/** A linked in-memory port pair — messages hop via microtask, like the real one. */
function portPair(): { client: StreamPort; server: StreamPort } {
  const listeners = {
    clientMsg: [] as Array<(m: unknown) => void>,
    serverMsg: [] as Array<(m: unknown) => void>,
    clientDisc: [] as Array<() => void>,
    serverDisc: [] as Array<() => void>,
  };
  let torn = false;
  // Chrome fires onDisconnect only on the *other* end, once for the pair.
  const tearDown = (otherDiscs: Array<() => void>): void => {
    if (torn) return;
    torn = true;
    queueMicrotask(() => otherDiscs.forEach((cb) => cb()));
  };
  const client: StreamPort = {
    name: 'wr-ai-stream',
    postMessage: (m) => {
      if (!torn)
        queueMicrotask(() => listeners.serverMsg.forEach((cb) => cb(m)));
    },
    disconnect: () => tearDown(listeners.serverDisc),
    onMessage: { addListener: (cb) => listeners.clientMsg.push(cb) },
    onDisconnect: { addListener: (cb) => listeners.clientDisc.push(cb) },
  };
  const server: StreamPort = {
    name: 'wr-ai-stream',
    postMessage: (m) => {
      if (!torn)
        queueMicrotask(() => listeners.clientMsg.forEach((cb) => cb(m)));
    },
    disconnect: () => tearDown(listeners.clientDisc),
    onMessage: { addListener: (cb) => listeners.serverMsg.push(cb) },
    onDisconnect: { addListener: (cb) => listeners.serverDisc.push(cb) },
  };
  return { client, server };
}

const OK: AiRunResponse = {
  status: 'ok',
  kind: 'rewrite',
  text: 'a tighter line',
  changes: [],
  provider: 'ollama',
  model: 'llama3',
};

function fakeAi(runStream: () => AsyncIterable<AiRunStreamChunk>): {
  ai: AiBackend;
  cancels: string[];
} {
  const cancels: string[] = [];
  const ai = {
    runStream,
    cancel: (id: string) => cancels.push(id),
  } as unknown as AiBackend;
  return { ai, cancels };
}

const INPUT = {
  requestId: 'r1',
  task: 'improve-clarity',
  selection: 'the aforementioned document herein',
  whole: false,
};

describe('AI_STREAM port transport (§4.8, §26)', () => {
  it('start → deltas → final round-trips end to end', async () => {
    const { client, server } = portPair();
    const { ai } = fakeAi(async function* () {
      yield { type: 'delta', text: 'a tighter ' };
      yield { type: 'delta', text: 'line' };
      yield { type: 'final', response: OK };
    });
    handleAiStreamPort(server, ai);

    const deltas: string[] = [];
    const final = await new Promise<AiRunResponse>((resolve) => {
      connectAiStream(
        INPUT,
        { onDelta: (t) => deltas.push(t), onFinal: resolve },
        () => client,
      );
    });

    expect(deltas.join('')).toBe('a tighter line');
    expect(final.status).toBe('ok');
  });

  it('a client disconnect aborts the run and synthesizes a blocked final', async () => {
    const { client, server } = portPair();
    const { ai, cancels } = fakeAi(async function* () {
      yield { type: 'delta', text: 'one' };
      await new Promise((r) => setTimeout(r, 5));
      yield { type: 'delta', text: 'two' };
      await new Promise((r) => setTimeout(r, 5));
      yield { type: 'final', response: OK };
    });
    handleAiStreamPort(server, ai);

    const final = await new Promise<AiRunResponse>((resolve) => {
      const handle = connectAiStream(
        INPUT,
        {
          onDelta: () => handle.cancel(),
          onFinal: resolve,
        },
        () => client,
      );
    });

    expect(final.status).toBe('blocked');
    await new Promise((r) => setTimeout(r, 15));
    expect(cancels).toContain('r1');
  });

  it('rejects a malformed start without calling runStream', async () => {
    const { client, server } = portPair();
    let called = false;
    const { ai } = fakeAi(async function* () {
      called = true;
      yield { type: 'final', response: OK }; // unreachable — never iterated
    });
    handleAiStreamPort(server, ai);

    const final = await new Promise<AiRunResponse>((resolve) => {
      connectAiStream(
        { ...INPUT, requestId: '' },
        { onDelta: () => {}, onFinal: resolve },
        () => client,
      );
    });
    expect(final.status).toBe('blocked');
    expect(called).toBe(false);
  });

  it('passes a blocked final (deterministic fallback) straight through', async () => {
    const { client, server } = portPair();
    const { ai } = fakeAi(async function* () {
      yield {
        type: 'final',
        response: {
          status: 'blocked',
          mode: 'deterministic',
          message: 'A full rephrase needs local AI.',
        },
      };
    });
    handleAiStreamPort(server, ai);

    const final = await new Promise<AiRunResponse>((resolve) => {
      connectAiStream(
        INPUT,
        { onDelta: () => {}, onFinal: resolve },
        () => client,
      );
    });
    expect(final).toMatchObject({ status: 'blocked', mode: 'deterministic' });
  });
});
