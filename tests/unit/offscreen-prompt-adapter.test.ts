import { describe, it, expect, vi, afterEach } from 'vitest';
import { OffscreenPromptApiAdapter } from '@/ai/offscreen-prompt-adapter';
import { OFFSCREEN_MSG, type OffscreenRequest } from '@/ai/offscreen-protocol';
import type { AiGenerateInput } from '@/ai/ai-types';

afterEach(() => vi.unstubAllGlobals());

/** Fake `chrome.offscreen` + a `runtime.sendMessage` router into a fake doc. */
function installChrome(reply: (req: OffscreenRequest) => unknown): {
  created: number;
  requests: OffscreenRequest[];
} {
  const state = { created: 0, requests: [] as OffscreenRequest[] };
  vi.stubGlobal('chrome', {
    offscreen: {
      hasDocument: async () => state.created > 0,
      createDocument: async () => {
        state.created += 1;
      },
    },
    runtime: {
      sendMessage: async (req: OffscreenRequest) => {
        state.requests.push(req);
        return reply(req);
      },
    },
  });
  return state;
}

function genInput(): AiGenerateInput {
  return {
    system: 's',
    user: 'rewrite this',
    wantJson: false,
    signal: new AbortController().signal,
    model: null,
    maxOutputChars: 400,
  };
}

describe('OffscreenPromptApiAdapter (spike 3.1)', () => {
  it('creates the document once, then proxies probe', async () => {
    const state = installChrome((req) =>
      req.op === 'probe'
        ? {
            ok: true,
            op: 'probe',
            probe: { id: 'chrome', state: 'ready', detail: 'ok' },
          }
        : { ok: false, error: 'no' },
    );
    const a = new OffscreenPromptApiAdapter();
    const p1 = await a.probe();
    const p2 = await a.probe();
    expect(p1.state).toBe('ready');
    expect(p2.state).toBe('ready');
    expect(state.created).toBe(1); // hasDocument() short-circuits the second
  });

  it('proxies generate without the AbortSignal', async () => {
    const state = installChrome(() => ({
      ok: true,
      op: 'generate',
      raw: {
        raw: 'a tighter line',
        provider: 'chrome',
        model: 'chrome-builtin',
      },
    }));
    const a = new OffscreenPromptApiAdapter();
    const raw = await a.generate(genInput());
    expect(raw.raw).toBe('a tighter line');
    const sent = state.requests.find((r) => r.op === 'generate');
    expect(sent).toBeDefined();
    expect(sent && 'input' in sent && 'signal' in sent.input).toBe(false);
  });

  it('a failed offscreen reply becomes a thrown error / unavailable probe', async () => {
    installChrome(() => ({ ok: false, error: 'NotSupportedError' }));
    const a = new OffscreenPromptApiAdapter();
    await expect(a.generate(genInput())).rejects.toThrow(/NotSupportedError/);
    const probe = await a.probe();
    expect(probe.state).toBe('unavailable');
    expect(probe.detail).toContain('NotSupportedError');
  });

  it('reports unavailable when the browser has no chrome.offscreen', async () => {
    vi.stubGlobal('chrome', { runtime: { sendMessage: async () => ({}) } });
    const a = new OffscreenPromptApiAdapter();
    const probe = await a.probe();
    expect(probe.state).toBe('unavailable');
    expect(probe.detail).toMatch(/offscreen/i);
  });

  it('uses the shared OFFSCREEN_MSG discriminator', () => {
    expect(OFFSCREEN_MSG).toBe('wr-offscreen-prompt');
  });
});
