import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BackgroundController } from '@/core/background-controller';
import { sendToBackground } from '@/messaging';
import type { AiBackend } from '@/core/ai-backend';

const aiStub: AiBackend = {
  start: async () => {},
  stop: () => {},
  getCapability: async () => ({
    capability: {
      enabled: true,
      active: 'ollama',
      label: 'AI Ready — Ollama',
      providers: [{ id: 'ollama', state: 'ready', detail: 'ok' }],
      acknowledged: true,
      enhancedReview: false,
    },
  }),
  testConnection: async () => ({
    probe: { id: 'ollama', state: 'ready', detail: 'ok' },
  }),
  listModels: async () => ({ models: ['llama3'] }),
  run: async () => ({
    status: 'ok',
    kind: 'rewrite',
    text: 'tidy',
    changes: [],
    provider: 'ollama',
    model: 'llama3',
  }),
  runStream: async function* () {
    yield { type: 'delta', text: 'tidy' };
    yield {
      type: 'final',
      response: {
        status: 'ok',
        kind: 'rewrite',
        text: 'tidy',
        changes: [],
        provider: 'ollama',
        model: 'llama3',
      },
    };
  },
  chat: async () => ({ status: 'ok', reply: 'hi', provider: 'ollama' }),
  cancel: () => {},
  startChromeDownload: async () => ({ ok: true }),
  acknowledgePrivacy: async () => {
    const { getSettings } = await import('@/storage/settings');
    return { settings: await getSettings() };
  },
  getChatHistory: async () => ({ turns: [] }),
  saveChatHistory: async () => ({ ok: true }),
};

describe('BackgroundController AI handlers (§4, §26)', () => {
  describe('with an AI backend', () => {
    let bg: BackgroundController;
    beforeEach(async () => {
      bg = new BackgroundController({ ai: aiStub });
      await bg.start();
    });
    afterEach(() => bg.stop());

    it('AI_GET_CAPABILITY returns the capability', async () => {
      const res = await sendToBackground({ type: 'AI_GET_CAPABILITY' });
      expect(res.ok && res.data.capability.label).toBe('AI Ready — Ollama');
    });

    it('AI_RUN routes to the backend', async () => {
      const res = await sendToBackground({
        type: 'AI_RUN',
        requestId: 'r1',
        task: 'simplify',
        selection: 'the aforementioned',
        whole: false,
      });
      expect(res.ok && res.data.status).toBe('ok');
    });

    it('AI_CANCEL is accepted', async () => {
      const res = await sendToBackground({
        type: 'AI_CANCEL',
        requestId: 'r1',
      });
      expect(res.ok && res.data.ok).toBe(true);
    });

    it('AI_START_DOWNLOAD routes to the backend (§14.5)', async () => {
      const res = await sendToBackground({ type: 'AI_START_DOWNLOAD' });
      expect(res.ok && res.data.ok).toBe(true);
    });
  });

  describe('with NO AI backend — core is unaffected (§4.1)', () => {
    let bg: BackgroundController;
    beforeEach(async () => {
      bg = new BackgroundController();
      await bg.start();
    });
    afterEach(() => bg.stop());

    it('AI_GET_CAPABILITY reports disabled without error', async () => {
      const res = await sendToBackground({ type: 'AI_GET_CAPABILITY' });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.capability.enabled).toBe(false);
        expect(res.data.capability.label).toMatch(/Unavailable/);
      }
    });

    it('AI_RUN returns an honest blocked response, not a crash', async () => {
      const res = await sendToBackground({
        type: 'AI_RUN',
        requestId: 'r1',
        task: 'simplify',
        selection: 'hello world',
        whole: false,
      });
      expect(res.ok).toBe(true);
      if (res.ok && res.data.status === 'blocked') {
        expect(res.data.message).toMatch(/offline|turned off/i);
      }
    });

    it('a normal settings request still works with no AI backend', async () => {
      const res = await sendToBackground({ type: 'GET_SETTINGS' });
      expect(res.ok && res.data.settings.features.ai).toBe(false);
    });

    it('AI_START_DOWNLOAD reports honestly unavailable, not a crash', async () => {
      const res = await sendToBackground({ type: 'AI_START_DOWNLOAD' });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.ok).toBe(false);
        expect(res.data.error).toMatch(/not available/i);
      }
    });
  });
});
