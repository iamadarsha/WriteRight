import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AiService } from '@/ai/ai-service';
import { patchSettings } from '@/storage/settings';
import { initStorage } from '@/storage';

/** A fake Chrome on-device model — no network, deterministic. */
function installFakeLanguageModel(
  reply: (system: string, user: string) => string,
): void {
  (globalThis as { LanguageModel?: unknown }).LanguageModel = {
    availability: async () => 'available',
    create: async (opts?: { initialPrompts?: Array<{ content: string }> }) => {
      const system = opts?.initialPrompts?.[0]?.content ?? '';
      return {
        prompt: async (user: string) => reply(system, user),
        destroy: () => {},
      };
    },
  };
}

let ai: AiService;

beforeEach(async () => {
  await initStorage();
  ai = new AiService();
});
afterEach(() => {
  ai.stop();
  delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
});

describe('AiService (§4.5–§4.9)', () => {
  it('is blocked and honest when AI is disabled (§4.1)', async () => {
    await ai.start();
    const res = await ai.run({
      requestId: 'r1',
      task: 'simplify',
      whole: false,
      selection: 'the aforementioned document herein',
    });
    expect(res.status).toBe('blocked');
    if (res.status === 'blocked') {
      expect(res.message).toMatch(/offline|turned off/i);
      expect(res.message).not.toMatch(/cloud|subscription/i);
    }
  });

  it('runs a rewrite through the on-device model and validates the output', async () => {
    installFakeLanguageModel(() =>
      JSON.stringify({
        rewrittenText: 'the document mentioned above',
        changes: [{ type: 'clarity', reason: 'plainer words' }],
      }),
    );
    await patchSettings({
      features: { ai: true },
      ai: { provider: 'chrome', acknowledgedPrivacy: true },
    });
    await ai.start();

    const res = await ai.run({
      requestId: 'r2',
      task: 'simplify',
      whole: false,
      selection: 'the aforementioned document herein',
    });
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.kind).toBe('rewrite');
      expect(res.text).toBe('the document mentioned above');
      expect(res.provider).toBe('chrome');
    }
  });

  it('stays blocked when Strict privacy mode is on, even with AI enabled (§10.2)', async () => {
    installFakeLanguageModel(() => 'should never be reached');
    await patchSettings({
      features: { ai: true },
      ai: { provider: 'chrome', acknowledgedPrivacy: true },
      strictPrivacy: true,
    });
    await ai.start();

    const res = await ai.run({
      requestId: 'r-strict',
      task: 'simplify',
      whole: false,
      selection: 'the aforementioned document herein',
    });
    expect(res.status).toBe('blocked');

    const cap = await ai.getCapability(true);
    expect(cap.capability.enabled).toBe(false);
  });

  it('rejects a model response that tries to inject HTML (§14.6)', async () => {
    installFakeLanguageModel(
      () =>
        '{"rewrittenText":"<script>alert(1)</script> the aforementioned document"}',
    );
    await patchSettings({
      features: { ai: true },
      ai: { provider: 'chrome', acknowledgedPrivacy: true },
    });
    await ai.start();
    const res = await ai.run({
      requestId: 'r3',
      task: 'simplify',
      whole: false,
      selection: 'the aforementioned document herein',
    });
    expect(res.status).toBe('blocked');
    if (res.status === 'blocked') {
      expect(res.message).toMatch(/could not safely use/i);
    }
  });

  it('does not send an AI request for a rewrite with no selection', async () => {
    await patchSettings({
      features: { ai: true },
      ai: { provider: 'chrome', acknowledgedPrivacy: true },
    });
    installFakeLanguageModel(() => 'should not be called');
    await ai.start();
    const res = await ai.run({
      requestId: 'r4',
      task: 'simplify',
      whole: false,
      selection: '',
    });
    expect(res.status).toBe('blocked');
    if (res.status === 'blocked') expect(res.mode).toBe('deterministic');
  });

  it('cancel() aborts an in-flight request (§4.9)', async () => {
    (globalThis as { LanguageModel?: unknown }).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: (_user: string, o?: { signal?: AbortSignal }) =>
          new Promise<string>((_res, rej) => {
            o?.signal?.addEventListener('abort', () =>
              rej(new DOMException('aborted', 'AbortError')),
            );
          }),
        destroy: () => {},
      }),
    };
    await patchSettings({
      features: { ai: true },
      ai: { provider: 'chrome', acknowledgedPrivacy: true },
    });
    await ai.start();

    const p = ai.run({
      requestId: 'r5',
      task: 'simplify',
      whole: false,
      selection: 'the aforementioned document herein',
    });
    await new Promise((r) => setTimeout(r, 10));
    ai.cancel('r5');
    const res = await p;
    expect(res.status).toBe('blocked');
    if (res.status === 'blocked') expect(res.message).toMatch(/cancel/i);
  });

  it('chat round-trips through the model', async () => {
    installFakeLanguageModel((_s, user) => `echo: ${user.slice(-20)}`);
    await patchSettings({
      features: { ai: true },
      ai: { provider: 'chrome', acknowledgedPrivacy: true },
    });
    await ai.start();
    const res = await ai.chat({
      requestId: 'c1',
      history: [],
      message: 'help me tighten this paragraph',
    });
    expect(res.status).toBe('ok');
    if (res.status === 'ok') expect(res.reply).toMatch(/echo:/);
  });

  it('chat history is only persisted when the user opts in (§4.7, §28)', async () => {
    await ai.start();
    // default: keepChatHistory off → save is a no-op, load returns []
    await ai.saveChatHistory([{ role: 'user', content: 'secret note' }]);
    expect((await ai.getChatHistory()).turns).toEqual([]);

    await patchSettings({ ai: { keepChatHistory: true } });
    await ai.saveChatHistory([
      { role: 'user', content: 'keep me' },
      { role: 'assistant', content: 'ok' },
    ]);
    expect((await ai.getChatHistory()).turns).toHaveLength(2);

    // turning it back off clears what was stored
    await patchSettings({ ai: { keepChatHistory: false } });
    await ai.saveChatHistory([{ role: 'user', content: 'x' }]);
    expect((await ai.getChatHistory()).turns).toEqual([]);
  });

  it('a loopback endpoint is required for a local test connection (§6.3)', async () => {
    await ai.start();
    const res = await ai.testConnection({
      provider: 'ollama',
      endpoint: 'http://api.openai.com',
    });
    expect(res.probe.state).toBe('unavailable');
    expect(res.probe.detail).toMatch(/loopback/i);
  });
});
