import { describe, it, expect, afterEach } from 'vitest';
import { PromptApiAdapter } from '@/ai/prompt-api-adapter';

type G = typeof globalThis & { LanguageModel?: unknown };
const g = globalThis as G;

afterEach(() => {
  delete g.LanguageModel;
});

describe('PromptApiAdapter — Chrome on-device (§4.2, §29.1)', () => {
  it('reports unavailable when the browser has no Prompt API', async () => {
    const probe = await new PromptApiAdapter().probe();
    expect(probe.state).toBe('unavailable');
    expect(probe.detail).toMatch(/no built-in on-device AI/i);
  });

  it('maps availability() === "downloadable" to a download-needed state (§14.5)', async () => {
    g.LanguageModel = {
      availability: async () => 'downloadable',
      create: async () => ({ prompt: async () => '' }),
    };
    const probe = await new PromptApiAdapter().probe();
    expect(probe.state).toBe('downloadable');
  });

  it('runs a prompt and returns the raw text, then destroys the session', async () => {
    let destroyed = false;
    g.LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async (text: string) => `answer to: ${text}`,
        destroy: () => {
          destroyed = true;
        },
      }),
    };
    const adapter = new PromptApiAdapter();
    expect((await adapter.probe()).state).toBe('ready');
    const out = await adapter.generate({
      system: 'sys',
      user: 'hello',
      wantJson: false,
      signal: new AbortController().signal,
      model: null,
      maxOutputChars: 200,
    });
    expect(out.raw).toBe('answer to: hello');
    expect(out.provider).toBe('chrome');
    expect(destroyed).toBe(true);
  });

  it('supports the older capabilities() shape', async () => {
    g.LanguageModel = {
      capabilities: async () => ({ available: 'readily' }),
      create: async () => ({ prompt: async () => 'ok' }),
    };
    expect((await new PromptApiAdapter().probe()).state).toBe('ready');
  });

  it('startDownload reports an honest error when the browser has no Prompt API', async () => {
    const result = await new PromptApiAdapter().startDownload();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no built-in on-device AI/i);
  });

  it('startDownload triggers create(), tracks live progress, then destroys the session (§14.5)', async () => {
    let destroyed = false;
    let progressListener: ((e: unknown) => void) | null = null;
    g.LanguageModel = {
      availability: async () => 'downloadable',
      create: async (opts: { monitor?: (m: unknown) => void }) => {
        opts.monitor?.({
          addEventListener: (_type: string, cb: (e: unknown) => void) => {
            progressListener = cb;
          },
        });
        progressListener?.({ loaded: 0.5 });
        return {
          prompt: async () => '',
          destroy: () => {
            destroyed = true;
          },
        };
      },
    };
    const adapter = new PromptApiAdapter();
    const result = await adapter.startDownload();
    expect(result.ok).toBe(true);
    expect(destroyed).toBe(true);
    // Never left claiming "downloading" once the call has actually settled.
    expect((await adapter.probe()).state).not.toBe('downloading');
  });

  it('probe() authoritatively reports downloading + live progress while a download is in flight', async () => {
    let capturedMonitor: (e: unknown) => void = () => {};
    let resolveCreate: (v: {
      prompt: () => Promise<string>;
    }) => void = () => {};
    const createPromise = new Promise<{ prompt: () => Promise<string> }>(
      (resolve) => {
        resolveCreate = resolve;
      },
    );
    g.LanguageModel = {
      availability: async () => 'downloadable',
      create: (opts: { monitor?: (m: unknown) => void }) => {
        opts.monitor?.({
          addEventListener: (_type: string, cb: (e: unknown) => void) => {
            capturedMonitor = cb;
          },
        });
        return createPromise;
      },
    };
    const adapter = new PromptApiAdapter();
    const downloadPromise = adapter.startDownload();
    await Promise.resolve();
    await Promise.resolve();
    capturedMonitor({ loaded: 0.42 });

    const during = await adapter.probe();
    expect(during.state).toBe('downloading');
    expect(during.progress).toBeCloseTo(0.42);

    resolveCreate({ prompt: async () => '' });
    await downloadPromise;
    expect((await adapter.probe()).state).not.toBe('downloading');
  });

  it('startDownload reports failure honestly and still cleans up when create() rejects', async () => {
    g.LanguageModel = {
      availability: async () => 'downloadable',
      create: async () => {
        throw new Error('download failed');
      },
    };
    const adapter = new PromptApiAdapter();
    const result = await adapter.startDownload();
    expect(result.ok).toBe(false);
    expect(result.error).toBe('download failed');
    expect((await adapter.probe()).state).not.toBe('downloading');
  });
});
