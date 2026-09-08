import { describe, it, expect, afterEach } from 'vitest';
import { PromptApiAdapter } from '@/ai/prompt-api-adapter';
import type { AiGenerateInput, AiStreamChunk } from '@/ai/ai-types';

type G = typeof globalThis & { LanguageModel?: unknown };
afterEach(() => {
  delete (globalThis as G).LanguageModel;
});

function streamOf(...strings: string[]): ReadableStream<string> {
  return new ReadableStream({
    start(c) {
      for (const s of strings) c.enqueue(s);
      c.close();
    },
  });
}

function installModel(
  promptStreaming: (u: string) => ReadableStream<string>,
): void {
  (globalThis as G).LanguageModel = {
    availability: async () => 'available',
    create: async () => ({
      prompt: async () => '',
      promptStreaming,
      destroy: () => {},
    }),
  };
}

function genInput(over: Partial<AiGenerateInput> = {}): AiGenerateInput {
  return {
    system: 'sys',
    user: 'rewrite this',
    wantJson: false,
    signal: new AbortController().signal,
    model: null,
    maxOutputChars: 400,
    ...over,
  };
}

async function collect(
  it: AsyncIterable<AiStreamChunk>,
): Promise<AiStreamChunk[]> {
  const out: AiStreamChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

describe('PromptApiAdapter.generateStream (§4.8)', () => {
  it('streams delta chunks and finishes with the assembled text', async () => {
    installModel(() => streamOf('A ', 'tighter ', 'sentence.'));
    const chunks = await collect(
      new PromptApiAdapter().generateStream!(genInput()),
    );
    const deltas = chunks
      .filter((c): c is { type: 'delta'; text: string } => c.type === 'delta')
      .map((c) => c.text);
    expect(deltas).toEqual(['A ', 'tighter ', 'sentence.']);
    expect(chunks.at(-1)).toEqual({
      type: 'done',
      raw: {
        raw: 'A tighter sentence.',
        provider: 'chrome',
        model: 'chrome-builtin',
      },
    });
  });

  it('handles cumulative chunks (older Chrome shape) without duplicating text', async () => {
    installModel(() => streamOf('A ', 'A tighter ', 'A tighter sentence.'));
    const chunks = await collect(
      new PromptApiAdapter().generateStream!(genInput()),
    );
    const deltas = chunks
      .filter((c): c is { type: 'delta'; text: string } => c.type === 'delta')
      .map((c) => c.text);
    expect(deltas).toEqual(['A ', 'tighter ', 'sentence.']);
    expect(chunks.at(-1)).toMatchObject({
      type: 'done',
      raw: { raw: 'A tighter sentence.' },
    });
  });

  it('yields an error (never a done) when the model is unavailable', async () => {
    const chunks = await collect(
      new PromptApiAdapter().generateStream!(genInput()),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.type).toBe('error');
  });
});
