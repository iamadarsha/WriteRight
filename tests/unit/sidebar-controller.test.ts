import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SidebarController } from '@/core/sidebar-controller';
import { BackgroundController } from '@/core/background-controller';
import { mountShadowHost, type ShadowHost } from '@/ui/shadow-host';
import type { EngineBackend } from '@/core/engine-backend';
import type { AnalysisCoordinator } from '@/core/analysis-coordinator';
import type { Suggestion } from '@/types/suggestion';
import type { DocumentInsights } from '@/types/insights';

/**
 * §15 sidebar orchestration — launcher visibility across focus changes, the
 * status the shell renders, and the paste-and-analyse fallback for editors
 * WriteRight cannot check inline (§3.9, §5.1).
 */

function sug(over: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 's1',
    sessionId: 'sess',
    documentVersion: 1,
    source: 'spell',
    start: 0,
    end: 5,
    original: 'havve',
    originalHash: 'h',
    message: 'Misspelling',
    suggestions: ['have'],
    severity: 'error',
    confidence: 0.9,
    ruleId: 'harper:Spelling',
    canAutoApply: true,
    ...over,
  };
}

interface FakeState {
  suggestions: Suggestion[];
  insights: DocumentInsights | null;
  calls: string[];
}

function fakeCoordinator(
  over: Partial<FakeState> = {},
  element: Element = document.createElement('div'),
): {
  coordinator: AnalysisCoordinator;
  state: FakeState;
} {
  const state: FakeState = {
    suggestions: over.suggestions ?? [],
    insights: over.insights ?? null,
    calls: [],
  };
  const adapter = {
    element,
    getText: () => 'the whole field',
    focus: () => state.calls.push('adapter.focus'),
  };
  const coordinator = {
    get suggestions() {
      return state.suggestions;
    },
    get insights() {
      return state.insights;
    },
    get session() {
      return { adapter, sessionId: 'sess' };
    },
    onUpdate: () => {
      state.calls.push('onUpdate');
      return () => state.calls.push('unsubscribe');
    },
    geometry: {
      subscribe: (cb: () => void) => {
        state.calls.push('geo.subscribe');
        cb();
        return () => state.calls.push('geo.unsubscribe');
      },
      notify: () => {},
      fieldRect: () => element.getBoundingClientRect(),
      element,
      dispose: () => {},
    },
    applyById: (id: string, i: number) =>
      state.calls.push(`applyById:${id}:${i}`),
    ignoreOnceById: (id: string) => state.calls.push(`ignoreOnce:${id}`),
    addToDictionaryById: (id: string) => state.calls.push(`addToDict:${id}`),
    revealSuggestion: (id: string) => state.calls.push(`reveal:${id}`),
    requestRewrite: async () => ({ changed: false, text: '', changes: [] }),
    applyFullText: (t: string) => {
      state.calls.push(`applyFullText:${t}`);
      return true;
    },
    aiTarget: () => null,
    sentenceTargetFor: (id: string) =>
      id === 's1' ? { start: 0, end: 15, text: 'the whole field' } : null,
    applyRange: () => true,
    reanalyze: () => state.calls.push('reanalyze'),
  } as unknown as AnalysisCoordinator;
  return { coordinator, state };
}

const engineStub: EngineBackend = {
  start: async () => {},
  stop: () => {},
  analyze: async (m) => ({
    requestId: m.requestId,
    sessionId: m.sessionId,
    documentVersion: m.documentVersion,
    suggestions: [
      { ...sug(), sessionId: m.sessionId, documentVersion: m.documentVersion },
    ],
    insights: { score: { score: 82 } } as unknown as DocumentInsights,
    degraded: false,
  }),
  rewrite: async (m) => ({ changed: false, text: m.text, changes: [] }),
  cancel: () => {},
  addDictionaryWord: async (w) => [w],
  removeDictionaryWord: async () => [],
  getDictionary: async () => [],
  importDictionary: async () => ({ words: [], added: 0 }),
  clearDictionary: async () => [],
  ruleDescription: async () => null,
  status: async () => ({ phase: 'ready', smoke: null, dictionaryWordCount: 0 }),
};

let host: ShadowHost;
let bg: BackgroundController;
let ctl: SidebarController;
let resumeCalls: number;

beforeEach(async () => {
  document.body.innerHTML = '';
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  host = mountShadowHost(document);
  bg = new BackgroundController({ engine: engineStub });
  await bg.start();
  resumeCalls = 0;
  ctl = new SidebarController(host, 'https://example.com', null, () => {
    resumeCalls += 1;
  });
});

afterEach(() => {
  ctl.destroy();
  bg.stop();
  host.destroy();
  vi.unstubAllGlobals();
});

function launcher(): HTMLButtonElement {
  return host.uiLayer.querySelector<HTMLButtonElement>('.wr-launcher')!;
}

describe('SidebarController (§15)', () => {
  it('keeps the launcher hidden until an editor is bound, then hides it again on unbind', () => {
    expect(launcher().hidden).toBe(true);

    const { coordinator } = fakeCoordinator();
    ctl.bind(coordinator);
    expect(launcher().hidden).toBe(false);

    ctl.bind(null);
    expect(launcher().hidden).toBe(true);
  });

  it('reflects the issue count onto the launcher pill (info is not an issue)', () => {
    const { coordinator, state } = fakeCoordinator();
    state.suggestions = [
      sug({ id: 'a', severity: 'error' }),
      sug({ id: 'b', severity: 'warning' }),
      sug({ id: 'c', severity: 'info' }),
    ];
    ctl.bind(coordinator);
    expect(launcher().getAttribute('aria-label')).toBe(
      'Open WriteRight — 2 suggestions',
    );
  });

  it('keeps the launcher visible on an unsupported-editor page with no coordinator', () => {
    ctl.setPageStatus('unsupported');
    expect(launcher().hidden).toBe(false);

    const { coordinator } = fakeCoordinator();
    ctl.bind(coordinator);
    ctl.bind(null);
    expect(launcher().hidden).toBe(false);

    ctl.setPageStatus('active');
    expect(launcher().hidden).toBe(true);
  });

  it('open() / toggle() / isOpen track the sidebar element', () => {
    expect(ctl.isOpen).toBe(false);
    ctl.open();
    expect(ctl.isOpen).toBe(true);
    ctl.toggle();
    expect(ctl.isOpen).toBe(false);
  });

  it('the shell status is no-editor / analyzing / ready from the bound coordinator', () => {
    expect(ctl.source.getStatus()).toBe('no-editor');

    const { coordinator, state } = fakeCoordinator();
    ctl.bind(coordinator);
    expect(ctl.source.getStatus()).toBe('analyzing');

    state.suggestions = [sug()];
    expect(ctl.source.getStatus()).toBe('ready');
  });

  it('analyzeText() routes through ANALYZE_TEXT and returns suggestions + insights', async () => {
    const out = await ctl.source.analyzeText('Some pasted paragraph.');
    expect(out.suggestions.length).toBe(1);
    expect(out.suggestions[0]?.original).toBe('havve');
    expect(out.insights?.score.score).toBe(82);
  });

  it('a disabled-field page turns the launcher into a "turn back on" pill (§4.1 #23)', () => {
    ctl.setPageStatus('disabled-field');
    const l = launcher();
    expect(l.hidden).toBe(false);
    expect(l.classList.contains('resume')).toBe(true);
    expect(l.getAttribute('aria-label')).toMatch(
      /turn writeright on for this field/i,
    );

    l.click();
    expect(resumeCalls).toBe(1);

    // Back to a normal page — the pill returns to "open sidebar".
    ctl.setPageStatus('ready');
    expect(l.classList.contains('resume')).toBe(false);
  });

  it('the analyse fallback surfaces in the shell when there is no editor', async () => {
    ctl.setPageStatus('unsupported');
    ctl.open();
    const input =
      host.uiLayer.querySelector<HTMLTextAreaElement>('.wr-sb-analyze-in');
    expect(input).not.toBeNull();
  });

  it('shows the site-specific reason above the paste box (§5.1 Google Docs)', () => {
    ctl.setPageStatus(
      'unsupported',
      'Google Docs draws your document on a canvas, so WriteRight can’t check it inline.',
    );
    expect(ctl.source.getFallbackNote?.()).toMatch(/canvas/i);

    ctl.open();
    const note = host.uiLayer.querySelector('.wr-sb-note');
    expect(note?.textContent).toMatch(/Google Docs/);

    // Clears when the page is no longer unsupported.
    ctl.setPageStatus('ready');
    expect(ctl.source.getFallbackNote?.()).toBeNull();
  });

  it('delegates apply / ignore / dictionary / reveal / close to the coordinator', () => {
    const { coordinator, state } = fakeCoordinator();
    ctl.bind(coordinator);
    ctl.source.apply('x', 1);
    ctl.source.ignoreOnce('x');
    ctl.source.addToDictionary('x');
    ctl.source.reveal('x');
    ctl.source.onClose();
    expect(state.calls).toEqual(
      expect.arrayContaining([
        'applyById:x:1',
        'ignoreOnce:x',
        'addToDict:x',
        'reveal:x',
        'adapter.focus',
      ]),
    );
  });

  it('requestRewrite() reports the before-text alongside the engine result', async () => {
    const { coordinator } = fakeCoordinator();
    ctl.bind(coordinator);
    const { before, result } = await ctl.source.requestRewrite();
    expect(before).toBe('the whole field');
    expect(result.changed).toBe(false);
  });

  it('runAi with nothing focused is blocked with a helpful message', async () => {
    const { coordinator } = fakeCoordinator();
    ctl.bind(coordinator);
    const res = await ctl.source.runAi('simplify');
    expect(res.response.status).toBe('blocked');
    if (res.response.status === 'blocked') {
      expect(res.response.message).toMatch(/text field/i);
    }
  });

  it('rephraseSentence falls back to deterministic tidy-up when there is no local AI (§12.3)', async () => {
    const { coordinator } = fakeCoordinator();
    ctl.bind(coordinator);
    // s1's sentence resolves via the fake; the engine stub reports no change,
    // so the honest "needs local AI" message comes back rather than a rewrite.
    const res = await ctl.source.rephraseSentence('s1');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/local ai/i);
  });

  it('rephraseSentence reports when the sentence cannot be located', async () => {
    const { coordinator } = fakeCoordinator();
    ctl.bind(coordinator);
    const res = await ctl.source.rephraseSentence('missing');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/sentence/i);
  });

  it('setPreset() persists to the site record and re-analyses', async () => {
    const { coordinator, state } = fakeCoordinator();
    ctl.bind(coordinator);
    ctl.source.setPreset('academic');
    expect(ctl.source.getActivePresetId()).toBe('academic');
    await vi.waitFor(() => expect(state.calls).toContain('reanalyze'));
  });

  it('anchors the launcher to the bound field’s own corner, and unanchors on unbind (§8)', async () => {
    const field = document.createElement('div');
    document.body.appendChild(field);
    field.getBoundingClientRect = () =>
      ({
        x: 100,
        y: 200,
        width: 300,
        height: 40,
        top: 200,
        left: 100,
        right: 400,
        bottom: 240,
        toJSON: () => ({}),
      }) as DOMRect;

    const { coordinator } = fakeCoordinator({}, field);
    ctl.bind(coordinator);
    const l = launcher();
    expect(l.classList.contains('anchored')).toBe(true);
    expect(l.querySelector('.wr-launcher-label')?.hasAttribute('hidden')).toBe(
      true,
    );

    await vi.waitFor(() => expect(l.style.left).not.toBe(''));
    expect(l.style.top).not.toBe('');

    ctl.bind(null);
    expect(l.classList.contains('anchored')).toBe(false);
    expect(l.style.left).toBe('');
  });

  it('destroy() removes the launcher and sidebar from the host', () => {
    ctl.open();
    expect(host.uiLayer.querySelector('.wr-sb')).not.toBeNull();
    ctl.destroy();
    expect(host.uiLayer.querySelector('.wr-launcher')).toBeNull();
    expect(host.uiLayer.querySelector('.wr-sb')).toBeNull();
    ctl = new SidebarController(host, 'https://example.com', null);
  });
});
