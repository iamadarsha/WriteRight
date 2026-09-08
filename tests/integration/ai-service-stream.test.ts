import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AiService } from '@/ai/ai-service';
import { patchSettings } from '@/storage/settings';
import { initStorage } from '@/storage';
import type { AiRunStreamChunk } from '@/core/ai-backend';

type G = typeof globalThis & { LanguageModel?: unknown };

function streamOf(...strings: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(c) {
      for (const s of strings) c.enqueue(s);
      c.close();
    },
  });
}

/** A fake Chrome on-device model that streams `pieces` for every prompt. */
function installStreamingModel(pieces: string[]): void {
  (globalThis as G).LanguageModel = {
    availability: async () => 'available',
    create: async () => ({
      prompt: async () => pieces.join(''),
      promptStreaming: () => streamOf(...pieces),
      destroy: () => {},
    }),
  };
}

let ai: AiService;
beforeEach(async () => {
  await initStorage();
  ai = new AiService();
});
afterEach(() => {
  ai.stop();
  delete (globalThis as G).LanguageModel;
});

async function collect(
  it: AsyncIterable<AiRunStreamChunk>,
): Promise<AiRunStreamChunk[]> {
  const out: AiRunStreamChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

async function enableChromeAi(): Promise<void> {
  await patchSettings({
    features: { ai: true },
    ai: { provider: 'chrome', acknowledgedPrivacy: true },
  });
}

describe('AiService.runStream (§4.8)', () => {
  it('relays deltas then a validated final rewrite', async () => {
    installStreamingModel(['{"rewrittenText":"', 'A tighter line', '."}']);
    await enableChromeAi();
    await ai.start();

    const chunks = await collect(
      ai.runStream({
        requestId: 's1',
        task: 'improve-clarity',
        selection: 'the aforementioned document herein is verbose',
        whole: false,
      }),
    );

    const deltas = chunks.filter((c) => c.type === 'delta');
    expect(deltas.length).toBeGreaterThan(0);

    const final = chunks.at(-1)!;
    expect(final.type).toBe('final');
    if (final.type === 'final') {
      expect(final.response.status).toBe('ok');
      if (final.response.status === 'ok') {
        expect(final.response.kind).toBe('rewrite');
        expect(final.response.text).toBe('A tighter line.');
      }
    }
  });

  it('a done carrying an HTML payload is blocked, never ok', async () => {
    installStreamingModel(['<script>alert(1)</script> not a rewrite']);
    await enableChromeAi();
    await ai.start();

    const chunks = await collect(
      ai.runStream({
        requestId: 's2',
        task: 'improve-clarity',
        selection: 'make this cleaner please',
        whole: false,
      }),
    );
    const final = chunks.at(-1)!;
    expect(final.type).toBe('final');
    if (final.type === 'final') expect(final.response.status).toBe('blocked');
  });

  it('cancel() ends the stream with a cancelled final', async () => {
    // A model that streams slowly enough to cancel mid-flight.
    (globalThis as G).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => '',
        promptStreaming: () =>
          new ReadableStream<string>({
            async pull(c) {
              await new Promise((r) => setTimeout(r, 20));
              c.enqueue('slow ');
            },
          }),
        destroy: () => {},
      }),
    };
    await enableChromeAi();
    await ai.start();

    const it = ai.runStream({
      requestId: 's3',
      task: 'improve-clarity',
      selection: 'cancel me halfway through this one',
      whole: false,
    });
    const out: AiRunStreamChunk[] = [];
    for await (const c of it) {
      out.push(c);
      if (c.type === 'delta') ai.cancel('s3');
      if (out.length > 5) break;
    }
    const final = out.at(-1)!;
    expect(final.type).toBe('final');
    if (final.type === 'final') {
      expect(final.response.status).toBe('blocked');
      if (final.response.status === 'blocked') {
        expect(final.response.message).toMatch(/cancel/i);
      }
    }
  });

  it('is blocked immediately (no deltas) when AI is disabled', async () => {
    await ai.start();
    const chunks = await collect(
      ai.runStream({
        requestId: 's4',
        task: 'improve-clarity',
        selection: 'anything',
        whole: false,
      }),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.type).toBe('final');
    if (chunks[0]!.type === 'final') {
      expect(chunks[0]!.response.status).toBe('blocked');
    }
  });
});
