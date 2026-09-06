import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BackgroundController } from '@/core/background-controller';
import { sendToBackground } from '@/messaging';
import type { EngineBackend } from '@/core/engine-backend';
import { getSiteRule } from '@/storage/site-rules';

let dict: string[] = [];

const engineStub: EngineBackend = {
  start: async () => {},
  stop: () => {},
  analyze: async (m) => ({
    requestId: m.requestId,
    sessionId: m.sessionId,
    documentVersion: m.documentVersion,
    suggestions: [],
    insights: null,
    degraded: false,
  }),
  rewrite: async (m) => ({ changed: false, text: m.text, changes: [] }),
  cancel: () => {},
  addDictionaryWord: async (w) => {
    if (!dict.includes(w)) dict.push(w);
    return [...dict];
  },
  removeDictionaryWord: async (w) => {
    dict = dict.filter((x) => x !== w);
    return [...dict];
  },
  getDictionary: async () => [...dict],
  importDictionary: async (text) => {
    const added = text
      .split(/[\r\n,]+/)
      .map((w) => w.trim())
      .filter((w) => w && !dict.includes(w));
    dict.push(...added);
    return { words: [...dict], added: added.length };
  },
  clearDictionary: async () => {
    dict = [];
    return [];
  },
  ruleDescription: async () => 'A description.',
  status: async () => ({
    phase: 'ready',
    smoke: null,
    dictionaryWordCount: dict.length,
  }),
};

let bg: BackgroundController;

beforeEach(async () => {
  dict = [];
  bg = new BackgroundController({ engine: engineStub });
  await bg.start();
});
afterEach(() => bg.stop());

describe('BackgroundController Phase 2 handlers (§2, §26)', () => {
  it('ANALYZE_TEXT routes to the engine and echoes identity', async () => {
    const res = await sendToBackground({
      type: 'ANALYZE_TEXT',
      requestId: 'req-1',
      sessionId: 'sess-1',
      documentVersion: 9,
      origin: 'https://example.com',
      text: 'hello',
      withInsights: true,
    });
    expect(res.ok && res.data).toMatchObject({
      requestId: 'req-1',
      sessionId: 'sess-1',
      documentVersion: 9,
      degraded: false,
    });
  });

  it('ADD_DICTIONARY_WORD returns the updated word list', async () => {
    const res = await sendToBackground({
      type: 'ADD_DICTIONARY_WORD',
      word: 'Kubernetes',
    });
    expect(res.ok && res.data.words).toEqual(['Kubernetes']);
  });

  it('the dictionary handlers round-trip add → get → remove → import → clear', async () => {
    await sendToBackground({ type: 'ADD_DICTIONARY_WORD', word: 'Kubernetes' });

    const get1 = await sendToBackground({ type: 'GET_DICTIONARY' });
    expect(get1.ok && get1.data.words).toEqual(['Kubernetes']);

    const removed = await sendToBackground({
      type: 'REMOVE_DICTIONARY_WORD',
      word: 'Kubernetes',
    });
    expect(removed.ok && removed.data.words).toEqual([]);

    const imported = await sendToBackground({
      type: 'IMPORT_DICTIONARY',
      text: 'alpha\nbeta, gamma',
    });
    expect(imported.ok && imported.data.added).toBe(3);
    expect(imported.ok && imported.data.words).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);

    const cleared = await sendToBackground({ type: 'CLEAR_DICTIONARY' });
    expect(cleared.ok && cleared.data.words).toEqual([]);
  });

  it('SET_SITE_IGNORED_RULE toggles the rule on the site record', async () => {
    const origin = 'https://blog.example.com';
    await sendToBackground({
      type: 'SET_SITE_IGNORED_RULE',
      origin,
      ruleId: 'wr:buzzword',
      ignored: true,
    });
    expect((await getSiteRule(origin))?.ignoredRuleIds).toContain(
      'wr:buzzword',
    );

    await sendToBackground({
      type: 'SET_SITE_IGNORED_RULE',
      origin,
      ruleId: 'wr:buzzword',
      ignored: false,
    });
    expect((await getSiteRule(origin))?.ignoredRuleIds).not.toContain(
      'wr:buzzword',
    );
  });

  it('GET_ENGINE_STATUS reports the engine phase', async () => {
    const res = await sendToBackground({ type: 'GET_ENGINE_STATUS' });
    expect(res.ok && res.data.phase).toBe('ready');
  });

  it('GET_RULE_DESCRIPTION proxies to the engine', async () => {
    const res = await sendToBackground({
      type: 'GET_RULE_DESCRIPTION',
      ruleId: 'harper:Spelling',
    });
    expect(res.ok && res.data.description).toBe('A description.');
  });

  it('GET_DIAGNOSTICS reflects engineReady once the engine is ready', async () => {
    const res = await sendToBackground({ type: 'GET_DIAGNOSTICS' });
    expect(res.ok && res.data.engineReady).toBe(true);
  });
});
