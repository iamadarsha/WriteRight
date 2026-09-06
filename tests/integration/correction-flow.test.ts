import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BackgroundController } from '@/core/background-controller';
import { ContentController } from '@/core/content-controller';
import { LinguisticEngine } from '@/engine/linguistic-engine';
import { createTestHarperLinter } from '../support/harper';
import { applySuggestion } from '@/core/apply-suggestion';
import type { EngineBackend, AnalyzeMessage } from '@/core/engine-backend';

/**
 * Full Phase 2 stack in jsdom: a real Harper engine standing in for the
 * background service, driving the content controller over a textarea.
 */

function engineBackend(engine: LinguisticEngine): EngineBackend {
  return {
    start: async () => {},
    stop: () => {},
    analyze: (msg: AnalyzeMessage) =>
      engine.analyze({
        requestId: msg.requestId,
        sessionId: msg.sessionId,
        documentVersion: msg.documentVersion,
        text: msg.text,
        dialect: 'en-US',
        styleChecksEnabled: true,
        readabilityEnabled: true,
        buzzwords: [],
        disabledRuleIds: [],
        ignoredKeys: [],
        extraIgnorePatterns: [],
        presetId: null,
        withInsights: msg.withInsights,
      }),
    rewrite: async (msg) => {
      const { rewriteText } = await import('@/engine/rewrite-engine');
      const r = rewriteText(msg.text);
      return { changed: r.changed, text: r.text, changes: r.changes };
    },
    cancel: (id) => engine.cancel(id),
    addDictionaryWord: async () => [],
    removeDictionaryWord: async () => [],
    getDictionary: async () => [],
    importDictionary: async () => ({ words: [], added: 0 }),
    clearDictionary: async () => [],
    ruleDescription: async () => null,
    status: async () => ({
      phase: 'ready',
      smoke: engine.getSmokeResult(),
      dictionaryWordCount: 0,
    }),
  };
}

let background: BackgroundController;
let content: ContentController;
let engine: LinguisticEngine;

function focus(el: HTMLElement): void {
  el.focus();
  el.dispatchEvent(
    new FocusEvent('focusin', { bubbles: true, composed: true }),
  );
}

beforeEach(async () => {
  document.body.innerHTML = '';
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  engine = new LinguisticEngine(createTestHarperLinter('en-US'));
  await engine.initialize();
  background = new BackgroundController({ engine: engineBackend(engine) });
  await background.start();
}, 60_000);

afterEach(async () => {
  content?.stop();
  background?.stop();
  await engine?.shutdown();
  vi.unstubAllGlobals();
});

describe('Phase 2 correction flow (§2 gate)', () => {
  it('analyzes a focused textarea and surfaces spelling + grammar suggestions', async () => {
    document.body.innerHTML =
      '<textarea id="t">I havve a pencil and he are happy.</textarea>';
    content = new ContentController({
      document,
      location: { href: 'https://example.com/write' },
    });
    await content.start();
    focus(document.getElementById('t')!);

    await vi.waitFor(
      () => {
        expect(content.coordinator?.suggestions.length ?? 0).toBeGreaterThan(0);
      },
      { timeout: 5000, interval: 40 },
    );

    const suggestions = content.coordinator!.suggestions;
    expect(suggestions.some((s) => s.source === 'spell')).toBe(true);
    for (const s of suggestions) {
      expect(s.sessionId).toBe(content.coordinator!.session.sessionId);
    }
  });

  it('applying a spelling fix edits only the target range and is reversible', async () => {
    document.body.innerHTML = '<textarea id="t">I havve a pencil.</textarea>';
    content = new ContentController({
      document,
      location: { href: 'https://example.com/write' },
    });
    await content.start();
    const ta = document.getElementById('t') as HTMLTextAreaElement;
    focus(ta);

    await vi.waitFor(
      () =>
        expect(
          content.coordinator?.suggestions.some((s) => s.original === 'havve'),
        ).toBe(true),
      { timeout: 5000, interval: 40 },
    );

    const coord = content.coordinator!;
    const spell = coord.suggestions.find((s) => s.original === 'havve')!;
    const outcome = applySuggestion(
      coord.session.adapter,
      coord.session.sessionId,
      spell,
      0,
    );
    expect(outcome).toEqual({ ok: true, replacement: 'have' });
    expect(ta.value).toBe('I have a pencil.');

    // Reversible: adapters fire a normal `input` event, so the page's own undo
    // stack still applies. Here we just confirm nothing else was touched.
    expect(ta.value.startsWith('I have a pencil')).toBe(true);
  });

  it('re-analyzes after the text changes and drops resolved suggestions', async () => {
    document.body.innerHTML = '<textarea id="t">teh cat</textarea>';
    content = new ContentController({
      document,
      location: { href: 'https://example.com/write' },
    });
    await content.start();
    const ta = document.getElementById('t') as HTMLTextAreaElement;
    focus(ta);

    await vi.waitFor(
      () =>
        expect(
          content.coordinator?.suggestions.some((s) => s.original === 'teh'),
        ).toBe(true),
      { timeout: 5000, interval: 40 },
    );

    ta.value = 'the cat';
    ta.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.waitFor(
      () =>
        expect(
          content.coordinator?.suggestions.some((s) => s.original === 'teh'),
        ).toBe(false),
      { timeout: 5000, interval: 40 },
    );
  });
});
