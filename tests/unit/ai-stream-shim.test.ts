import { describe, it, expect } from 'vitest';
import { streamViaGenerate } from '@/ai/stream-shim';
import type {
  AiAdapter,
  AiGenerateInput,
  AiRawOutput,
  AiStreamChunk,
} from '@/ai/ai-types';

function genInput(over: Partial<AiGenerateInput> = {}): AiGenerateInput {
  return {
    system: 'sys',
    user: 'do the thing',
    wantJson: false,
    signal: new AbortController().signal,
    model: null,
    maxOutputChars: 400,
    ...over,
  };
}

function fakeAdapter(
  impl: (input: AiGenerateInput) => Promise<AiRawOutput>,
): AiAdapter {
  return {
    id: 'ollama',
    probe: async () => ({ id: 'ollama', state: 'ready', detail: '' }),
    generate: impl,
  };
}

async function collect(
  it: AsyncIterable<AiStreamChunk>,
): Promise<AiStreamChunk[]> {
  const out: AiStreamChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

describe('streamViaGenerate (non-streaming shim, §4.8)', () => {
  it('yields one delta with the full text, then a done carrying the same raw', async () => {
    const raw: AiRawOutput = {
      raw: 'the tidy sentence',
      provider: 'ollama',
      model: 'llama3',
    };
    const chunks = await collect(
      streamViaGenerate(
        fakeAdapter(async () => raw),
        genInput(),
      ),
    );
    expect(chunks).toEqual([
      { type: 'delta', text: 'the tidy sentence' },
      { type: 'done', raw },
    ]);
  });

  it('turns a thrown error into a single error chunk — never a done', async () => {
    const chunks = await collect(
      streamViaGenerate(
        fakeAdapter(async () => {
          throw new Error('Ollama HTTP 500');
        }),
        genInput(),
      ),
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ type: 'error', message: 'Ollama HTTP 500' });
  });

  it('passes the generate input straight through to the adapter', async () => {
    let seen: AiGenerateInput | null = null;
    await collect(
      streamViaGenerate(
        fakeAdapter(async (input) => {
          seen = input;
          return { raw: 'x', provider: 'ollama', model: null };
        }),
        genInput({ user: 'rewrite: hello world', maxOutputChars: 999 }),
      ),
    );
    expect(seen!.user).toBe('rewrite: hello world');
    expect(seen!.maxOutputChars).toBe(999);
  });
});
