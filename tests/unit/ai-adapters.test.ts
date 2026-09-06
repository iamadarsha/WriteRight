import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaAdapter } from '@/ai/ollama-adapter';
import { LmStudioAdapter } from '@/ai/lm-studio-adapter';
import { OpenAiCompatibleAdapter } from '@/ai/local-endpoint-adapter';
import type { AiGenerateInput } from '@/ai/ai-types';

/** Minimal `fetch` stub keyed by URL substring; honours an aborted signal. */
function stubFetch(routes: Record<string, unknown>): typeof fetch {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    if (init?.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    const url = typeof input === 'string' ? input : input.href;
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(routes[key]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function genInput(over: Partial<AiGenerateInput> = {}): AiGenerateInput {
  return {
    system: 'sys',
    user: 'do the thing',
    wantJson: true,
    signal: new AbortController().signal,
    model: null,
    maxOutputChars: 400,
    ...over,
  };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe('OllamaAdapter (§4.3)', () => {
  beforeEach(() => {
    globalThis.fetch = stubFetch({
      '/api/tags': { models: [{ name: 'llama3' }, { name: 'mistral' }] },
      '/api/chat': { message: { content: '{"rewrittenText":"clean"}' } },
    });
  });

  it('probes /api/tags and reports ready with the first model', async () => {
    const a = new OllamaAdapter({
      endpoint: 'http://localhost:11434',
      model: '',
    });
    const probe = await a.probe();
    expect(probe.state).toBe('ready');
    expect(probe.model).toBe('llama3');
    expect(probe.endpoint).toBe('localhost:11434');
  });

  it('refuses a non-loopback endpoint without any network call', async () => {
    const calls = vi.fn();
    globalThis.fetch = calls as unknown as typeof fetch;
    const a = new OllamaAdapter({
      endpoint: 'http://api.openai.com',
      model: 'x',
    });
    const probe = await a.probe();
    expect(probe.state).toBe('unavailable');
    expect(calls).not.toHaveBeenCalled();
  });

  it('lists models', async () => {
    const a = new OllamaAdapter({
      endpoint: 'http://localhost:11434',
      model: '',
    });
    expect(await a.listModels()).toEqual(['llama3', 'mistral']);
  });

  it('generates via /api/chat', async () => {
    const a = new OllamaAdapter({
      endpoint: 'http://localhost:11434',
      model: 'llama3',
    });
    const out = await a.generate(genInput());
    expect(out.raw).toContain('rewrittenText');
    expect(out.provider).toBe('ollama');
  });

  it('rejects immediately when the signal is already aborted (§4.9)', async () => {
    const a = new OllamaAdapter({
      endpoint: 'http://localhost:11434',
      model: 'llama3',
    });
    const ac = new AbortController();
    ac.abort(new Error('cancelled'));
    await expect(a.generate(genInput({ signal: ac.signal }))).rejects.toThrow();
  });
});

describe('OpenAI-compatible adapters (§4.4)', () => {
  beforeEach(() => {
    globalThis.fetch = stubFetch({
      '/v1/models': { data: [{ id: 'local-model' }] },
      '/v1/chat/completions': {
        choices: [{ message: { content: '{"rewrittenText":"tidy"}' } }],
      },
    });
  });

  it('LM Studio probes /v1/models on its default loopback endpoint', async () => {
    const a = new LmStudioAdapter({
      endpoint: 'http://localhost:1234',
      model: '',
    });
    const probe = await a.probe();
    expect(probe.state).toBe('ready');
    expect(probe.model).toBe('local-model');
  });

  it('generates via /v1/chat/completions', async () => {
    const a = new LmStudioAdapter({
      endpoint: 'http://localhost:1234',
      model: 'local-model',
    });
    const out = await a.generate(genInput());
    expect(out.raw).toContain('tidy');
  });

  it('the generic adapter also refuses non-loopback', async () => {
    const a = new OpenAiCompatibleAdapter('custom', 'Local endpoint', {
      endpoint: 'http://10.1.2.3:1234',
      model: 'x',
    });
    expect((await a.probe()).state).toBe('unavailable');
    await expect(a.generate(genInput())).rejects.toThrow(/loopback/i);
  });
});
