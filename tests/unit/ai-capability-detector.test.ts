import { describe, it, expect, afterEach, vi } from 'vitest';
import { CapabilityDetector } from '@/ai/capability-detector';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '@/types/settings';

function settings(over: Partial<AiSettings> = {}): AiSettings {
  return { ...DEFAULT_AI_SETTINGS, ...over };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
});

describe('CapabilityDetector (§4.1, §14.4)', () => {
  it('with AI disabled: no probing, honest "unavailable" label', async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const d = new CapabilityDetector(settings());
    const cap = await d.capability(false);
    expect(cap.enabled).toBe(false);
    expect(cap.active).toBeNull();
    expect(cap.label).toMatch(/local writing tools still active/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports the ready provider and a matching label', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.href;
      if (url.includes('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'llama3' }] }), {
          status: 200,
        });
      }
      return new Response('nope', { status: 404 });
    }) as unknown as typeof fetch;

    const d = new CapabilityDetector(
      settings({ ollamaEndpoint: 'http://localhost:11434' }),
    );
    const cap = await d.capability(true, true);
    expect(cap.enabled).toBe(true);
    expect(cap.active).toBe('ollama');
    expect(cap.label).toBe('AI Ready — Ollama');
  });

  it('honours an explicit provider preference over availability order', async () => {
    (globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({ prompt: async () => '' }),
    };
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ models: [{ name: 'm' }] }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;

    const prefersOllama = new CapabilityDetector(
      settings({
        provider: 'ollama',
        ollamaEndpoint: 'http://localhost:11434',
      }),
    );
    const cap = await prefersOllama.capability(true, true);
    expect(cap.active).toBe('ollama'); // not 'chrome', despite chrome being ready
  });

  it('active is null when nothing is ready — never a false "AI enabled"', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('down', { status: 500 }),
    ) as unknown as typeof fetch;
    const d = new CapabilityDetector(
      settings({ ollamaEndpoint: 'http://localhost:11434' }),
    );
    const cap = await d.capability(true, true);
    expect(cap.active).toBeNull();
    expect(cap.label).toMatch(/Unavailable/);
  });

  it('startChromeDownload delegates to the Chrome adapter and busts the probe cache (§14.5)', async () => {
    (globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: async () => 'downloadable',
      create: async () => ({ prompt: async () => '' }),
    };
    const d = new CapabilityDetector(settings());
    // Prime the cache with the pre-download "unavailable" verdict.
    const before = await d.capability(true, true);
    expect(before.active).toBeNull();

    const result = await d.startChromeDownload();
    expect(result.ok).toBe(true);

    // Without a busted cache this would still return the stale verdict above.
    (globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({ prompt: async () => '' }),
    };
    const after = await d.capability(true, false);
    expect(after.active).toBe('chrome');
  });
});
