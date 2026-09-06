import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnalysisCoordinator } from '@/core/analysis-coordinator';
import { EditorSession } from '@/core/editor-session';
import { TextareaAdapter } from '@/adapters/textarea-adapter';
import { ContentEditableAdapter } from '@/adapters/contenteditable-adapter';
import { mountShadowHost, type ShadowHost } from '@/ui/shadow-host';
import { SuggestionPopoverElement } from '@/ui/popover/suggestion-popover';
import { UNDERLINE_CSS } from '@/ui/underline';
import { POPOVER_CSS } from '@/ui/popover/popover-styles';
import { shortHash } from '@/utils/hash';
import type { Suggestion } from '@/types/suggestion';
import type { AnalyzeInput, AnalyzeOutput } from '@/core/analysis-scheduler';

function suggestionFor(
  text: string,
  start: number,
  end: number,
  sessionId: string,
  over: Partial<Suggestion> = {},
): Suggestion {
  const original = text.slice(start, end);
  return {
    id: `sg-${start}`,
    sessionId,
    documentVersion: 0,
    source: 'spell',
    start,
    end,
    original,
    originalHash: shortHash(original),
    message: 'Misspelling',
    suggestions: ['have'],
    severity: 'error',
    confidence: 0.9,
    ruleId: 'harper:Spelling',
    canAutoApply: true,
    ...over,
  };
}

let host: ShadowHost;
let popover: SuggestionPopoverElement;
let ta: HTMLTextAreaElement;
let session: EditorSession;
let coord: AnalysisCoordinator;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  host = mountShadowHost(document);
  host.applyStyleSheet(UNDERLINE_CSS);
  host.applyStyleSheet(POPOVER_CSS);
  popover = new SuggestionPopoverElement(host.uiLayer);
  ta = document.createElement('textarea');
  ta.value = 'I havve a pencil.';
  document.body.appendChild(ta);
  session = new EditorSession(new TextareaAdapter(ta));
  session.activate(() => {});
});

afterEach(() => {
  coord?.dispose();
  session.destroy();
  popover.destroy();
  host.destroy();
  vi.unstubAllGlobals();
});

function makeCoordinator(
  suggestions: Suggestion[],
  analyze?: (input: AnalyzeInput, sessionId: string) => Promise<AnalyzeOutput>,
  extra: Partial<ConstructorParameters<typeof AnalysisCoordinator>[0]> = {},
): AnalysisCoordinator {
  return new AnalysisCoordinator({
    session,
    host,
    popover,
    origin: 'https://example.com',
    ...extra,
    analyze:
      analyze ??
      (async (input) => ({
        requestId: input.requestId,
        documentVersion: input.documentVersion,
        suggestions: suggestions.map((s) => ({
          ...s,
          documentVersion: input.documentVersion,
          sessionId: session.sessionId,
        })),
        insights: null,
        degraded: false,
      })),
  });
}

describe('AnalysisCoordinator (§2.6–2.8)', () => {
  it('renders underlines from analysis results', async () => {
    coord = makeCoordinator([suggestionFor(ta.value, 2, 7, session.sessionId)]);
    await vi.waitFor(() => expect(coord.suggestions.length).toBe(1));
    const mark = host.overlayLayer.querySelector('.wr-u');
    expect(mark?.textContent).toBe('havve');
  });

  it('opening the popover at the caret and applying a fix edits the field', async () => {
    coord = makeCoordinator([suggestionFor(ta.value, 2, 7, session.sessionId)]);
    await vi.waitFor(() => expect(coord.suggestions.length).toBe(1));

    ta.setSelectionRange(4, 4); // caret inside "havve"
    ta.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() =>
      expect(
        host.uiLayer.querySelector('.wr-pop:not([hidden])'),
      ).not.toBeNull(),
    );

    host.uiLayer.querySelector<HTMLButtonElement>('.wr-pop-repl')!.click();
    expect(ta.value).toBe('I have a pencil.');
    await vi.waitFor(() => expect(coord.suggestions.length).toBe(0));
  });

  it('a refused apply flashes a notice instead of a silent no-op (§9.7)', async () => {
    // The suggestion targets "havve" but the field now says something else —
    // the safety gate refuses, and the user must see *why*.
    coord = makeCoordinator([suggestionFor('I havve a pencil.', 2, 7, 'sess')]);
    await vi.waitFor(() => expect(coord.suggestions.length).toBe(1));
    ta.value = 'Totally different text now.';

    coord.applyById(coord.suggestions[0]!.id, 0);

    const pop = host.uiLayer.querySelector('.wr-pop:not([hidden])');
    expect(pop?.classList.contains('wr-pop-notice')).toBe(true);
    expect(pop?.textContent).toMatch(/changed|apply/i);
    expect(ta.value).toBe('Totally different text now.'); // untouched
  });

  it('when a rich editor silently reverts an applied fix, the user is told and the underline returns', async () => {
    // ProseMirror / Lexical / Slate (Notion, Gamma, …) accept a DOM edit and
    // then restore their own model a tick later. The adapter reports success
    // synchronously; the coordinator must notice the snap-back, flash a notice,
    // and re-run analysis so the suggestion isn't silently lost (§10.4).
    const rangeProto = Range.prototype as unknown as {
      getClientRects: () => DOMRect[];
    };
    const origRects = rangeProto.getClientRects;
    rangeProto.getClientRects = () => [];

    const ceHost = document.createElement('div');
    ceHost.setAttribute('contenteditable', 'true');
    ceHost.textContent = 'We use AI to explaining slide by slide.';
    document.body.appendChild(ceHost);
    const frozen = ceHost.innerHTML;
    const mo = new MutationObserver(() => {
      if (ceHost.innerHTML !== frozen) ceHost.innerHTML = frozen;
    });
    mo.observe(ceHost, { childList: true, subtree: true, characterData: true });

    const ceSession = new EditorSession(new ContentEditableAdapter(ceHost));
    ceSession.activate(() => {});
    const at = ceSession.adapter.getText().indexOf('explaining');
    const ceCoord = new AnalysisCoordinator({
      session: ceSession,
      host,
      popover,
      origin: 'https://gamma.app',
      analyze: async (input) => ({
        requestId: input.requestId,
        documentVersion: input.documentVersion,
        suggestions: ceSession.adapter.getText().includes('explaining')
          ? [
              {
                ...suggestionFor(
                  ceSession.adapter.getText(),
                  at,
                  at + 'explaining'.length,
                  ceSession.sessionId,
                  { id: 'rv', message: 'Wordy', suggestions: ['explain'] },
                ),
                documentVersion: input.documentVersion,
              },
            ]
          : [],
        insights: null,
        degraded: false,
      }),
    });

    await vi.waitFor(() => expect(ceCoord.suggestions.length).toBe(1));
    ceCoord.applyById('rv', 0);

    // The notice appears and the (reverted) suggestion comes back.
    await vi.waitFor(() => {
      const pop = host.uiLayer.querySelector('.wr-pop:not([hidden])');
      expect(pop?.classList.contains('wr-pop-notice')).toBe(true);
      expect(pop?.textContent).toMatch(/by hand/i);
    });
    await vi.waitFor(() => expect(ceCoord.suggestions.length).toBe(1));
    expect(ceSession.adapter.getText()).toContain('explaining');

    mo.disconnect();
    ceCoord.dispose();
    ceSession.destroy();
    rangeProto.getClientRects = origRects;
  });

  it('a clarity popover offers "Rephrase sentence" (§12.3)', async () => {
    ta.value = 'This is fine. This particular sentence has a probblem in it.';
    const at = ta.value.indexOf('probblem');
    coord = makeCoordinator([
      suggestionFor(ta.value, at, at + 8, session.sessionId, {
        source: 'readability',
        severity: 'info',
        suggestions: [],
        message: 'This sentence is dense.',
      }),
    ]);
    await vi.waitFor(() => expect(coord.suggestions.length).toBe(1));

    coord.revealSuggestion(coord.suggestions[0]!.id);
    await vi.waitFor(() =>
      expect(
        host.uiLayer.querySelector('.wr-pop:not([hidden])'),
      ).not.toBeNull(),
    );
    const actions = [
      ...host.uiLayer.querySelectorAll<HTMLButtonElement>('.wr-pop-action'),
    ].map((b) => b.textContent?.trim());
    expect(actions).toContain('Rephrase sentence');
  });

  it('"ignore once" removes the suggestion and does not bring it back', async () => {
    let call = 0;
    coord = makeCoordinator([], async (input) => {
      call += 1;
      return {
        requestId: input.requestId,
        documentVersion: input.documentVersion,
        suggestions: [
          {
            ...suggestionFor('I havve a pencil.', 2, 7, session.sessionId),
            documentVersion: input.documentVersion,
          },
        ],
        insights: null,
        degraded: false,
      };
    });
    await vi.waitFor(() => expect(coord.suggestions.length).toBe(1));

    ta.setSelectionRange(4, 4);
    ta.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() =>
      expect(
        host.uiLayer.querySelector('.wr-pop:not([hidden])'),
      ).not.toBeNull(),
    );

    const ignoreBtn = [
      ...host.uiLayer.querySelectorAll<HTMLButtonElement>('.wr-pop-action'),
    ].find((b) => b.textContent === 'Ignore')!;
    ignoreBtn.click();
    expect(coord.suggestions.length).toBe(0);

    // A later edit triggers re-analysis; the ignored finding stays filtered.
    ta.value = 'I havve a pen.';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(call).toBeGreaterThan(1));
    expect(coord.suggestions.length).toBe(0);
  });

  it('dispose() removes underlines and the popover', async () => {
    coord = makeCoordinator([suggestionFor(ta.value, 2, 7, session.sessionId)]);
    await vi.waitFor(() => expect(coord.suggestions.length).toBe(1));
    coord.dispose();
    expect(host.overlayLayer.querySelector('.wr-u')).toBeNull();
  });

  /* ---- sidebar-facing API (§15) + AI helpers (§4.6, §4.8) --------- */

  it('exposes suggestions by id and applies through them', async () => {
    coord = makeCoordinator([], async (input) => ({
      requestId: input.requestId,
      documentVersion: input.documentVersion,
      // Only report the misspelling while it is still present.
      suggestions: ta.value.includes('havve')
        ? [
            {
              ...suggestionFor('I havve a pencil.', 2, 7, session.sessionId, {
                id: 'a1',
              }),
              documentVersion: input.documentVersion,
            },
          ]
        : [],
      insights: null,
      degraded: false,
    }));
    await vi.waitFor(() => expect(coord.suggestions.length).toBe(1));
    expect(coord.suggestionById('a1')?.original).toBe('havve');

    coord.applyById('a1', 0);
    await vi.waitFor(() => expect(ta.value).toBe('I have a pencil.'));
    await vi.waitFor(() => expect(coord.suggestionById('a1')).toBeUndefined());
  });

  it('onUpdate fires when results change', async () => {
    coord = makeCoordinator([suggestionFor(ta.value, 2, 7, session.sessionId)]);
    const seen: number[] = [];
    coord.onUpdate(() => seen.push(coord.suggestions.length));
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
  });

  it('aiTarget() returns the selection, or the whole field when nothing is selected', async () => {
    coord = makeCoordinator([]);
    await vi.waitFor(() => expect(coord.suggestions).toEqual([]));

    // Nothing selected → whole field.
    ta.setSelectionRange(0, 0);
    const whole = coord.aiTarget();
    expect(whole).toMatchObject({ whole: true, text: 'I havve a pencil.' });

    // A real selection → just that span.
    ta.setSelectionRange(2, 7);
    ta.dispatchEvent(new Event('select'));
    const sel = coord.aiTarget();
    expect(sel).toMatchObject({
      whole: false,
      text: 'havve',
      start: 2,
      end: 7,
    });
  });

  it('sentenceTargetFor() returns the whole sentence a suggestion sits in (§12.3)', async () => {
    ta.value = 'First one is fine. This second sentence has a probblem in it.';
    const at = ta.value.indexOf('probblem');
    coord = makeCoordinator([
      suggestionFor(ta.value, at, at + 'probblem'.length, session.sessionId),
    ]);
    await vi.waitFor(() => expect(coord.suggestions.length).toBe(1));
    const id = coord.suggestions[0]!.id;

    const target = coord.sentenceTargetFor(id);
    expect(target).toEqual({
      start: ta.value.indexOf('This second'),
      end: ta.value.length,
      text: 'This second sentence has a probblem in it.',
    });

    expect(coord.sentenceTargetFor('no-such-id')).toBeNull();
  });

  it('applyRange() replaces exactly the given range and re-analyses', async () => {
    coord = makeCoordinator([]);
    await vi.waitFor(() => expect(coord.suggestions).toEqual([]));
    const ok = coord.applyRange(2, 7, 'have');
    expect(ok).toBe(true);
    expect(ta.value).toBe('I have a pencil.');
    // out-of-bounds is refused, not "best effort"
    expect(coord.applyRange(0, 999, 'x')).toBe(false);
    // a no-op range (text already equal) succeeds without an edit
    expect(coord.applyRange(0, 1, 'I')).toBe(true);
  });

  it('applyFullText() replaces the document and is a no-op when unchanged', async () => {
    coord = makeCoordinator([]);
    await vi.waitFor(() => expect(coord.suggestions).toEqual([]));
    expect(coord.applyFullText('I havve a pencil.')).toBe(true); // unchanged
    expect(coord.applyFullText('Clean sentence.')).toBe(true);
    expect(ta.value).toBe('Clean sentence.');
  });

  /* ---- per-category toggles (§1.2.0) ------------------------------- */

  it('hides suggestions from a disabled category, live, without a re-analysis', async () => {
    ta.value = 'I havve  two spaces.';
    let enabled = new Set(['spell', 'punctuation']);
    coord = makeCoordinator(
      [
        suggestionFor(ta.value, 2, 7, session.sessionId, {
          id: 'sp',
          source: 'spell',
        }),
        suggestionFor(ta.value, 8, 10, session.sessionId, {
          id: 'pn',
          source: 'punctuation',
          message: 'Extra space',
        }),
      ],
      undefined,
      { categoryEnabled: (s) => enabled.has(s) },
    );
    await vi.waitFor(() => expect(coord.suggestions.length).toBe(2));

    enabled = new Set(['spell']);
    coord.setCategoryEnabled((s) => enabled.has(s));
    expect(coord.suggestions.map((s) => s.id)).toEqual(['sp']);

    enabled = new Set(['spell', 'punctuation']);
    coord.setCategoryEnabled((s) => enabled.has(s));
    expect(coord.suggestions.length).toBe(2);
  });
});
