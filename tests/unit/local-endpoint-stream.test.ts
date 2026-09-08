import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenAiCompatibleAdapter } from '@/ai/local-endpoint-adapter';
import type { AiGenerateInput, AiStreamChunk } from '@/ai/ai-types';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function streamOf(...pieces: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const p of pieces) c.enqueue(enc.encode(p));
      c.close();
    },
  });
}

function stubStreamingFetch(body: ReadableStream<Uint8Array>): void {
  globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }) as unknown as typeof fetch;
}

function genInput(over: Partial<AiGenerateInput> = {}): AiGenerateInput {
  return {
    system: 'sys',
    user: 'rewrite this',
    wantJson: false,
    signal: new AbortController().signal,
    model: 'local-model',
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

const adapter = (): OpenAiCompatibleAdapter =>
  new OpenAiCompatibleAdapter('lmstudio', 'LM Studio', {
    endpoint: 'http://localhost:1234',
    model: '',
  });

describe('OpenAiCompatibleAdapter.generateStream (SSE, §4.8)', () => {
  it('parses data: lines into deltas and ends on [DONE]', async () => {
    stubStreamingFetch(
      streamOf(
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"A tighter "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"sentence."}}]}\n\n',
        'data: [DONE]\n\n',
      ),
    );
    const chunks = await collect(adapter().generateStream!(genInput()));
    const deltas = chunks
      .filter((c): c is { type: 'delta'; text: string } => c.type === 'delta')
      .map((c) => c.text);
    expect(deltas).toEqual(['A tighter ', 'sentence.']);
    const last = chunks.at(-1)!;
    expect(last.type).toBe('done');
    if (last.type === 'done') {
      expect(last.raw.raw).toBe('A tighter sentence.');
      expect(last.raw.provider).toBe('lmstudio');
    }
  });

  it('reassembles a data: line split across two network chunks', async () => {
    stubStreamingFetch(
      streamOf(
        'data: {"choices":[{"delta":{"con',
        'tent":"whole"}}]}\n\ndata: [DONE]\n\n',
      ),
    );
    const chunks = await collect(adapter().generateStream!(genInput()));
    expect(chunks).toContainEqual({ type: 'delta', text: 'whole' });
    expect(chunks.at(-1)!.type).toBe('done');
  });

  it('ends with done even when the server closes without [DONE]', async () => {
    stubStreamingFetch(
      streamOf('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
    );
    const chunks = await collect(adapter().generateStream!(genInput()));
    expect(chunks.at(-1)).toEqual({
      type: 'done',
      raw: { raw: 'partial', provider: 'lmstudio', model: 'local-model' },
    });
  });

  it('yields an error (never a done) on HTTP failure', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('x', { status: 503 }),
    ) as unknown as typeof fetch;
    const chunks = await collect(adapter().generateStream!(genInput()));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.type).toBe('error');
  });
});
