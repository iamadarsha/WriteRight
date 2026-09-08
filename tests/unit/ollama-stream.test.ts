import { describe, it, expect, vi, afterEach } from 'vitest';
import { OllamaAdapter } from '@/ai/ollama-adapter';
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
    if (init?.signal?.aborted) {
      throw new DOMException('aborted', 'AbortError');
    }
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
    });
  }) as unknown as typeof fetch;
}

function genInput(over: Partial<AiGenerateInput> = {}): AiGenerateInput {
  return {
    system: 'sys',
    user: 'rewrite this',
    wantJson: false,
    signal: new AbortController().signal,
    model: 'llama3',
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

describe('OllamaAdapter.generateStream (NDJSON, §4.8)', () => {
  it('emits a delta per line and a done with the concatenated text', async () => {
    stubStreamingFetch(
      streamOf(
        '{"message":{"content":"The "},"done":false}\n',
        '{"message":{"content":"last vendor "},"done":false}\n',
        '{"message":{"content":"missed deadlines."},"done":false}\n',
        '{"message":{"content":""},"done":true,"done_reason":"stop"}\n',
      ),
    );
    const a = new OllamaAdapter({
      endpoint: 'http://localhost:11434',
      model: '',
    });
    const chunks = await collect(a.generateStream!(genInput()));

    const deltas = chunks
      .filter((c): c is { type: 'delta'; text: string } => c.type === 'delta')
      .map((c) => c.text);
    expect(deltas).toEqual(['The ', 'last vendor ', 'missed deadlines.']);

    const last = chunks.at(-1)!;
    expect(last.type).toBe('done');
    if (last.type === 'done') {
      expect(last.raw.raw).toBe('The last vendor missed deadlines.');
      expect(last.raw.provider).toBe('ollama');
      expect(last.raw.model).toBe('llama3');
    }
  });

  it('handles a JSON object split across two network chunks', async () => {
    stubStreamingFetch(
      streamOf(
        '{"message":{"content":"Half',
        ' and half"},"done":false}\n{"message":{"content":""},"done":true}\n',
      ),
    );
    const a = new OllamaAdapter({
      endpoint: 'http://localhost:11434',
      model: '',
    });
    const chunks = await collect(a.generateStream!(genInput()));
    expect(chunks).toContainEqual({ type: 'delta', text: 'Half and half' });
    expect(chunks.at(-1)!.type).toBe('done');
  });

  it('stops when the caller aborts', async () => {
    const ac = new AbortController();
    stubStreamingFetch(
      streamOf('{"message":{"content":"one"},"done":false}\n'),
    );
    const a = new OllamaAdapter({
      endpoint: 'http://localhost:11434',
      model: '',
    });
    ac.abort();
    const chunks = await collect(
      a.generateStream!(genInput({ signal: ac.signal })),
    );
    // Either nothing, or a single terminal error — never a done.
    expect(chunks.every((c) => c.type !== 'done')).toBe(true);
  });

  it('yields an error (not a done) on an HTTP failure', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('nope', { status: 500 }),
    ) as unknown as typeof fetch;
    const a = new OllamaAdapter({
      endpoint: 'http://localhost:11434',
      model: '',
    });
    const chunks = await collect(a.generateStream!(genInput()));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.type).toBe('error');
  });
});
