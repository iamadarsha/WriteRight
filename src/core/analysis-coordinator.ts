/**
 * Per-active-editor analysis coordinator.
 *
 * Ties together, for the currently focused editor session:
 *  - the {@link AnalysisScheduler} (debounced, version-safe, §17),
 *  - the {@link UnderlineRenderer} for that adapter's tier (§18),
 *  - the shared {@link SuggestionPopoverElement} (§9.7),
 *  - the {@link applySuggestion} safety gate (§10.4),
 *  - the ignore-once / ignore-rule / add-to-dictionary actions (§2.7).
 *
 * One coordinator exists at a time; the {@link ContentController} recreates it
 * whenever the active session changes.
 */

import type { EditorSession } from './editor-session';
import type { ShadowHost } from '@/ui/shadow-host';
import type { SuggestionPopoverElement } from '@/ui/popover/suggestion-popover';
import type { Suggestion, SuggestionSource } from '@/types/suggestion';
import type { DocumentInsights } from '@/types/insights';
import type { RewriteResponse } from '@/types/messages';
import {
  createUnderlineRenderer,
  type UnderlineRenderer,
} from '@/ui/underline';
import { FieldGeometryTracker } from '@/ui/geometry/field-geometry-tracker';
import {
  AnalysisScheduler,
  type AnalyzeInput,
  type AnalyzeOutput,
} from './analysis-scheduler';
import { applySuggestion } from './apply-suggestion';
import { suggestionIgnoreKey } from '@/engine/engine-host';
import { normalizeLineEndings } from './text-normalize';
import { sentences } from './segmenter';
import { sendToBackground } from '@/messaging';
import { newId } from '@/utils/id';
import { createLogger } from '@/utils/logger';

const log = createLogger('analysis');

export interface AnalysisCoordinatorOptions {
  readonly session: EditorSession;
  readonly host: ShadowHost;
  readonly popover: SuggestionPopoverElement;
  readonly origin: string;
  readonly onAnalyzingChange?: (analyzing: boolean) => void;
  /**
   * Analysis transport. Defaults to an `ANALYZE_TEXT` message to the background
   * engine; overridable in tests.
   */
  readonly analyze?: (
    input: AnalyzeInput,
    sessionId: string,
  ) => Promise<AnalyzeOutput>;
  /** Called with fresh insights so the controller can report them to the popup. */
  readonly onInsights?: (insights: DocumentInsights | null) => void;
  /** Turn WriteRight off for this editor's field, from the popover (§4.1 #23). */
  readonly onDisableField?: () => void;
  /**
   * Which underline categories the user has enabled (§1.2.0 granular toggles).
   * Suggestions from a disabled category are hidden without a re-analysis.
   * Defaults to "all on".
   */
  readonly categoryEnabled?: (source: SuggestionSource) => boolean;
  /** Whether the popover shows a "find a better word" synonym row (§11.3). */
  readonly synonymsEnabled?: () => boolean;
}

export class AnalysisCoordinator {
  readonly #session: EditorSession;
  readonly #popover: SuggestionPopoverElement;
  readonly #origin: string;
  readonly #renderer: UnderlineRenderer;
  readonly #geometry: FieldGeometryTracker;
  readonly #scheduler: AnalysisScheduler;
  readonly #cleanups: Array<() => void> = [];
  readonly #ignoredOnce = new Set<string>();
  readonly #updateListeners = new Set<() => void>();
  #categoryEnabled: (source: SuggestionSource) => boolean;
  /** Last engine result, unfiltered — so a live category toggle re-renders instantly. */
  #rawSuggestions: readonly Suggestion[] = [];
  #suggestions: Suggestion[] = [];
  #insights: DocumentInsights | null = null;
  #reportInsights: ((i: DocumentInsights | null) => void) | undefined;
  #onDisableField: (() => void) | undefined;
  #synonymsEnabled: () => boolean;
  #disposed = false;

  constructor(opts: AnalysisCoordinatorOptions) {
    this.#session = opts.session;
    this.#popover = opts.popover;
    this.#origin = opts.origin;
    this.#reportInsights = opts.onInsights;
    this.#onDisableField = opts.onDisableField;
    this.#categoryEnabled = opts.categoryEnabled ?? (() => true);
    this.#synonymsEnabled = opts.synonymsEnabled ?? (() => false);

    const adapter = opts.session.adapter;
    this.#renderer = createUnderlineRenderer(adapter, opts.host.overlayLayer);
    this.#geometry = new FieldGeometryTracker(adapter.element);

    this.#scheduler = new AnalysisScheduler({
      snapshot: () => ({
        text: normalizeLineEndings(adapter.getText()).text,
        version: adapter.getDocumentVersion(),
      }),
      isComposing: () => adapter.isComposing(),
      analyze: (input) =>
        (opts.analyze ?? this.#analyzeViaBackground)(
          input,
          this.#session.sessionId,
        ),
      onResult: (output) => this.#onResult(output.suggestions, output.insights),
      onStateChange: (state) => opts.onAnalyzingChange?.(state === 'running'),
      debounceMs: 250,
      maxWaitMs: 1200,
    });

    // One geometry source drives the underline layer AND the open popover;
    // the launcher subscribes too (via SidebarController.bind → `geometry`).
    this.#cleanups.push(this.#geometry.subscribe(() => this.#repositionAll()));

    // Analyze on every edit; nudge geometry (an edit can reflow the field);
    // drop the popover if the span it points at changed.
    const unsubscribe = adapter.subscribe(() => {
      this.#geometry.notify();
      this.#maybeCloseStalePopover();
      this.#scheduler.schedule();
    });
    this.#cleanups.push(unsubscribe);

    this.#wireEditorInteraction();

    // Kick off an initial analysis for whatever is already in the field.
    this.#scheduler.flushNow();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const fn of this.#cleanups.splice(0)) fn();
    this.#geometry.dispose();
    this.#scheduler.dispose();
    this.#renderer.destroy();
    if (this.#popover.openSuggestionId) this.#popover.close();
    this.#suggestions = [];
  }

  /** The shared geometry source for this field — the launcher subscribes to it
   *  so the icon, the underlines, and the popover all track as one (§8). */
  get geometry(): FieldGeometryTracker {
    return this.#geometry;
  }

  /** Force a fresh analysis now (settings / dictionary / ignore-rule changed). */
  reanalyze(): void {
    if (!this.#disposed) this.#scheduler.flushNow();
  }

  /** For diagnostics / tests. */
  get suggestions(): readonly Suggestion[] {
    return this.#suggestions;
  }

  get insights(): DocumentInsights | null {
    return this.#insights;
  }

  /** The session this coordinator drives (test / diagnostics access). */
  get session(): EditorSession {
    return this.#session;
  }

  /* ---- sidebar-facing API (§15) -------------------------------------- */

  /** Subscribe to suggestion / insight changes. Returns an unsubscribe fn. */
  onUpdate(listener: () => void): () => void {
    this.#updateListeners.add(listener);
    return () => this.#updateListeners.delete(listener);
  }

  suggestionById(id: string): Suggestion | undefined {
    return this.#suggestions.find((s) => s.id === id);
  }

  applyById(id: string, replacementIndex = 0): void {
    const s = this.suggestionById(id);
    if (s) this.#apply(s, replacementIndex);
  }

  ignoreOnceById(id: string): void {
    const s = this.suggestionById(id);
    if (s) this.#ignoreOnce(s);
  }

  ignoreRuleById(id: string): void {
    const s = this.suggestionById(id);
    if (s) this.#ignoreRule(s);
  }

  addToDictionaryById(id: string): void {
    const s = this.suggestionById(id);
    if (s) this.#addToDictionary(s);
  }

  explainById(id: string): Promise<string | null> {
    const s = this.suggestionById(id);
    return s ? Promise.resolve(this.#explain(s)) : Promise.resolve(null);
  }

  /** Move the editor caret to a suggestion and open its popover. */
  revealSuggestion(id: string): void {
    const s = this.suggestionById(id);
    if (!s) return;
    const sel = this.#session.adapter;
    sel.focus();
    const el = sel.element;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      try {
        el.setSelectionRange(s.start, s.end);
      } catch {
        /* control may be detached */
      }
    }
    this.#renderer.reposition();
    this.#openPopover(s);
  }

  /** Ask the engine for a safe deterministic rewrite of the whole document. */
  async requestRewrite(): Promise<RewriteResponse> {
    const text = normalizeLineEndings(this.#session.adapter.getText()).text;
    const res = await sendToBackground({
      type: 'REWRITE_TEXT',
      origin: this.#origin,
      text,
    });
    return res.ok ? res.data : { changed: false, text, changes: [] };
  }

  /** Apply a full-document rewrite (called after the diff is confirmed, §3.5). */
  applyFullText(newText: string): boolean {
    const adapter = this.#session.adapter;
    const current = normalizeLineEndings(adapter.getText()).text;
    if (newText === current) return true;
    if (!adapter.isEditable() || adapter.isComposing()) return false;
    const ok = adapter.replaceRange({ start: 0, end: current.length }, newText);
    if (ok) {
      this.#popover.close();
      adapter.focus();
      this.#scheduler.flushNow();
      this.#confirmEditStuck(current, newText);
    }
    return ok;
  }

  /* ---- AI-facing helpers (§4.6, §4.8) ------------------------------- */

  /**
   * The text an AI action should operate on: the current selection, or the
   * whole document when nothing is selected. `whole` lets the UI warn before a
   * document-wide rewrite (§4.5 "user-invoked for broad rewrites").
   */
  aiTarget(): {
    start: number;
    end: number;
    text: string;
    whole: boolean;
  } | null {
    const adapter = this.#session.adapter;
    const full = normalizeLineEndings(adapter.getText()).text;
    const sel = adapter.getSelection();
    if (sel && sel.end > sel.start) {
      return {
        start: sel.start,
        end: sel.end,
        text: full.slice(sel.start, sel.end),
        whole: false,
      };
    }
    return { start: 0, end: full.length, text: full, whole: true };
  }

  /**
   * The sentence that contains suggestion `id`, as an AI/rewrite target (§3.5,
   * §12.3). Used by the "Rephrase" action so a whole hard-to-read sentence can
   * be rewritten in one tap without the user selecting it by hand.
   */
  sentenceTargetFor(
    id: string,
  ): { start: number; end: number; text: string } | null {
    const s = this.#suggestions.find((x) => x.id === id);
    if (!s) return null;
    const full = normalizeLineEndings(this.#session.adapter.getText()).text;
    for (const sent of sentences(full)) {
      // The suggestion span sits within (or straddles the start of) a sentence.
      if (s.start < sent.end && sent.start <= s.end) {
        return { start: sent.start, end: sent.end, text: sent.text };
      }
    }
    return null;
  }

  /**
   * Replace exactly `[start, end)` with `newText` (§4.8 — content outside the
   * range is unchanged by construction). Same safety gate as every edit.
   */
  applyRange(start: number, end: number, newText: string): boolean {
    const adapter = this.#session.adapter;
    if (!adapter.isEditable() || adapter.isComposing()) return false;
    const full = normalizeLineEndings(adapter.getText()).text;
    if (start < 0 || end > full.length || start > end) return false;
    if (full.slice(start, end) === newText) return true;
    const ok = adapter.replaceRange({ start, end }, newText);
    if (ok) {
      this.#popover.close();
      adapter.focus();
      this.#scheduler.flushNow();
      this.#confirmEditStuck(
        full,
        full.slice(0, start) + newText + full.slice(end),
      );
    }
    return ok;
  }

  #rephraseRange: { start: number; end: number } | null = null;

  /**
   * Rewrite the whole sentence suggestion `id` sits in (§3.5, §12.3). Local AI
   * does a real rewrite; without a ready model the deterministic engine tidies
   * that one sentence and says so. Shared by the popover's auto-rephrase and
   * the sidebar's "Rephrase" button.
   */
  async rephraseSentence(
    id: string,
  ): Promise<
    | { ok: true; text: string; deterministic: boolean }
    | { ok: false; message: string }
  > {
    const sent = this.sentenceTargetFor(id);
    if (!sent) {
      return { ok: false, message: 'Couldn’t find that sentence to rephrase.' };
    }
    this.#rephraseRange = { start: sent.start, end: sent.end };

    if (await this.#aiReady()) {
      const res = await sendToBackground({
        type: 'AI_RUN',
        requestId: newId('ai'),
        task: 'improve-clarity',
        selection: sent.text,
        whole: false,
      });
      if (!res.ok) {
        return {
          ok: false,
          message: res.error || 'Local AI could not rephrase this sentence.',
        };
      }
      if (res.data.status === 'ok' && res.data.kind === 'rewrite') {
        return { ok: true, text: res.data.text, deterministic: false };
      }
      return {
        ok: false,
        message:
          res.data.status === 'blocked'
            ? res.data.message
            : 'That produced an explanation, not a rewrite — try the Rewrite tab.',
      };
    }

    const res = await sendToBackground({
      type: 'REWRITE_TEXT',
      origin: this.#origin,
      text: sent.text,
    });
    if (
      res.ok &&
      res.data.changed &&
      res.data.text.trim().length > 0 &&
      res.data.text !== sent.text
    ) {
      return { ok: true, text: res.data.text, deterministic: true };
    }
    return {
      ok: false,
      message:
        'A full rephrase needs local AI. The safe tidy-up found nothing to ' +
        'change here — try splitting the sentence into two.',
    };
  }

  /** Apply a rephrased sentence to the range the last {@link rephraseSentence} used. */
  applyRephrase(text: string): boolean {
    const r = this.#rephraseRange;
    if (!r) return false;
    const ok = this.applyRange(r.start, r.end, text);
    if (ok) this.#rephraseRange = null;
    return ok;
  }

  /** Cheap "is a local model ready" check — the background caches the probe. */
  async #aiReady(): Promise<boolean> {
    try {
      const res = await sendToBackground({
        type: 'AI_GET_CAPABILITY',
        force: false,
      });
      return res.ok && res.data.capability.active != null;
    } catch {
      return false;
    }
  }

  #analyzeViaBackground = async (
    { requestId, documentVersion, text }: AnalyzeInput,
    sessionId: string,
  ): Promise<AnalyzeOutput> => {
    const res = await sendToBackground({
      type: 'ANALYZE_TEXT',
      requestId,
      sessionId,
      documentVersion,
      origin: this.#origin,
      text,
      withInsights: true,
    });
    if (!res.ok) {
      return {
        requestId,
        documentVersion,
        suggestions: [],
        insights: null,
        degraded: true,
      };
    }
    return {
      requestId: res.data.requestId,
      documentVersion: res.data.documentVersion,
      suggestions: res.data.suggestions,
      insights: res.data.insights,
      degraded: res.data.degraded,
    };
  };

  /* ---- results ---------------------------------------------------- */

  #onResult(
    suggestions: readonly Suggestion[],
    insights: DocumentInsights | null,
  ): void {
    if (this.#disposed) return;
    this.#rawSuggestions = suggestions;
    this.#insights = insights;
    this.#applyFilter();
    this.#reportInsights?.(insights);
  }

  /** Recompute the visible set from the last raw result + current filters. */
  #applyFilter(): void {
    this.#suggestions = this.#rawSuggestions.filter(
      (s) =>
        !this.#ignoredOnce.has(suggestionIgnoreKey(s)) &&
        this.#categoryEnabled(s.source),
    );
    this.#session.setSuggestions(this.#suggestions);
    this.#renderer.render(this.#suggestions);
    this.#maybeCloseStalePopover();
    this.#emitUpdate();
  }

  /** Update which underline categories are shown, live (§1.2.0 granular toggles). */
  setCategoryEnabled(fn: (source: SuggestionSource) => boolean): void {
    this.#categoryEnabled = fn;
    if (!this.#disposed) this.#applyFilter();
  }

  #emitUpdate(): void {
    for (const fn of [...this.#updateListeners]) {
      try {
        fn();
      } catch {
        /* a listener error must not stop the others */
      }
    }
  }

  /* ---- editor interaction --------------------------------------- */

  #wireEditorInteraction(): void {
    const el = this.#session.adapter.element;

    const openAtCaret = (): void => {
      const sel = this.#session.adapter.getSelection();
      if (!sel) return;
      const hit = this.#renderer.suggestionAtOffset(sel.start);
      if (hit) this.#openPopover(hit);
      else if (this.#popover.openSuggestionId) this.#popover.close();
    };

    const onClick = (): void => {
      // Read selection after the browser has placed the caret.
      queueMicrotask(openAtCaret);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      // Ctrl/Cmd+. opens the suggestion at the caret (keyboard path, §9.6).
      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        openAtCaret();
      }
    };

    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKeyDown as EventListener);
    this.#cleanups.push(
      () => el.removeEventListener('click', onClick),
      () => el.removeEventListener('keydown', onKeyDown as EventListener),
    );
  }

  /** Re-place the underline layer and the open popover from current geometry.
   *  Driven by {@link FieldGeometryTracker} (scroll / resize / observer / poll). */
  #repositionAll(): void {
    this.#renderer.reposition();
    const id = this.#popover.openSuggestionId;
    if (id) {
      const rect = this.#renderer.anchorRectFor(id);
      if (rect) this.#popover.reanchor(rect);
    }
  }

  /* ---- popover ------------------------------------------------- */

  #openPopover(suggestion: Suggestion): void {
    const anchor =
      this.#renderer.anchorRectFor(suggestion.id) ?? this.#caretRectFallback();
    if (!anchor) return;

    const canAddToDictionary =
      suggestion.source === 'spell' && /^\S+$/.test(suggestion.original);

    const oneWord = /^[\p{L}\p{M}'’-]+$/u.test(suggestion.original);
    const withSynonyms = oneWord && this.#synonymsEnabled();

    // A whole-sentence rewrite makes sense where a word-level fix doesn't:
    // clarity flags, and any card with no one-click replacement (wordy
    // phrasing, buzzwords, passive) — never for a single misspelling (§12.3).
    const withRephrase =
      suggestion.source === 'readability' ||
      (suggestion.suggestions.length === 0 && suggestion.source !== 'spell');

    this.#popover.open({
      suggestion,
      anchorRect: anchor,
      canAddToDictionary,
      onApply: (i) => this.#apply(suggestion, i),
      onIgnoreOnce: () => this.#ignoreOnce(suggestion),
      onIgnoreRule: () => this.#ignoreRule(suggestion),
      onAddToDictionary: () => this.#addToDictionary(suggestion),
      onDisableField: () => this.#disableField(),
      onExplainMore: () => this.#explain(suggestion),
      onSynonyms: withSynonyms
        ? () => this.#lookupSynonyms(suggestion.original)
        : undefined,
      onApplyWord: withSynonyms
        ? (word) => this.#applyWord(suggestion, word)
        : undefined,
      onRephrase: withRephrase
        ? () => this.rephraseSentence(suggestion.id)
        : undefined,
      onApplyRephrase: withRephrase
        ? (t) => void this.#applyRephrase(t)
        : undefined,
      onClose: () => {
        this.#popover.close();
        this.#session.adapter.focus();
      },
    });

    // Clarity cards auto-generate the rewrite on open, but only when a local
    // model is actually ready (an on-demand call, one sentence, only when the
    // user opened this card) — never a background loop over the whole doc.
    if (withRephrase && suggestion.source === 'readability') {
      void this.#aiReady().then((ready) => {
        if (ready && this.#popover.openSuggestionId === suggestion.id) {
          this.#popover.triggerRephrase();
        }
      });
    }
  }

  #applyRephrase(text: string): void {
    if (!this.applyRephrase(text)) {
      this.#popover.flashNotice('The text changed — re-checking.');
      this.#session.adapter.focus();
      this.#scheduler.flushNow();
    }
  }

  async #lookupSynonyms(word: string): Promise<readonly string[]> {
    const res = await sendToBackground({ type: 'LOOKUP_SYNONYMS', word });
    return res.ok ? res.data.synonyms : [];
  }

  #applyWord(suggestion: Suggestion, word: string): void {
    // Reuse the full safety gate by synthesising a one-replacement suggestion.
    this.#apply({ ...suggestion, suggestions: [word] }, 0);
  }

  #maybeCloseStalePopover(): void {
    const id = this.#popover.openSuggestionId;
    if (!id) return;
    if (!this.#suggestions.some((s) => s.id === id)) this.#popover.close();
  }

  #caretRectFallback(): DOMRect | null {
    return this.#session.adapter.element.getBoundingClientRect();
  }

  /* ---- actions ----------------------------------------------- */

  #apply(suggestion: Suggestion, replacementIndex: number): void {
    const before = normalizeLineEndings(this.#session.adapter.getText()).text;
    const outcome = applySuggestion(
      this.#session.adapter,
      this.#session.sessionId,
      suggestion,
      replacementIndex,
    );
    if (outcome.ok) {
      this.#suggestions = this.#suggestions.filter(
        (s) => s.id !== suggestion.id,
      );
      this.#session.setSuggestions(this.#suggestions);
      this.#renderer.render(this.#suggestions);
      this.#popover.close();
      this.#session.adapter.focus();
      this.#scheduler.flushNow();
      this.#confirmEditStuck(
        before,
        before.slice(0, suggestion.start) +
          outcome.replacement +
          before.slice(suggestion.end),
      );
    } else {
      log.debug('apply refused', outcome.reason);
      // Don't leave the click a silent no-op — say why, then re-analyse.
      const notice =
        outcome.reason === 'text-changed' || outcome.reason === 'out-of-bounds'
          ? 'The text changed — re-checking.'
          : outcome.reason === 'composing'
            ? 'Finish typing, then try again.'
            : "Couldn't apply that here — re-checking.";
      this.#popover.flashNotice(notice);
      this.#session.adapter.focus();
      this.#scheduler.flushNow();
    }
  }

  /**
   * A rich editor (ProseMirror / Lexical / Slate — Notion, Gamma, …) can take
   * our DOM edit synchronously and then revert it a tick later from its own
   * internal model. The adapter's synchronous check can't see that, so it
   * reports success and we optimistically close the card — leaving the user
   * with a click that seemingly did nothing. Look again a beat later: if the
   * field snapped back to *exactly* its pre-edit text, the editor rejected the
   * edit — say so and re-run analysis so the underline returns (§10.4, §9.7).
   */
  #confirmEditStuck(before: string, expectedAfter: string): void {
    if (before === expectedAfter || this.#disposed) return;
    const win = this.#session.adapter.element.ownerDocument.defaultView;
    let tries = 0;
    const check = (): void => {
      if (this.#disposed) return;
      const now = normalizeLineEndings(this.#session.adapter.getText()).text;
      // `!== before` means it held, or the user carried on typing — either way
      // not a revert. Only a byte-for-byte snap-back counts, and only after a
      // second look, so a merely slow editor isn't wrongly called a failure.
      if (now !== before) return;
      if (++tries < 2) {
        win?.setTimeout(check, 250);
        return;
      }
      log.debug('edit reverted by the editor — re-surfacing the suggestion');
      this.#popover.flashNotice(
        "This editor wouldn't accept the change — you'll need to edit it by hand.",
      );
      this.#scheduler.flushNow();
    };
    win?.setTimeout(check, 150);
  }

  #ignoreOnce(suggestion: Suggestion): void {
    this.#ignoredOnce.add(suggestionIgnoreKey(suggestion));
    this.#suggestions = this.#suggestions.filter((s) => s.id !== suggestion.id);
    this.#session.setSuggestions(this.#suggestions);
    this.#renderer.render(this.#suggestions);
    this.#popover.close();
    this.#session.adapter.focus();
  }

  /** Turn WriteRight off for this field — delegates to the field manager (§4.1 #23). */
  #disableField(): void {
    this.#popover.close();
    this.#renderer.render([]);
    this.#onDisableField?.();
  }

  #ignoreRule(suggestion: Suggestion): void {
    this.#popover.close();
    this.#session.adapter.focus();
    if (!suggestion.ruleId) return;
    void sendToBackground({
      type: 'SET_SITE_IGNORED_RULE',
      origin: this.#origin,
      ruleId: suggestion.ruleId,
      ignored: true,
    }).then(() => this.#scheduler.flushNow());
  }

  #addToDictionary(suggestion: Suggestion): void {
    this.#popover.close();
    this.#session.adapter.focus();
    void sendToBackground({
      type: 'ADD_DICTIONARY_WORD',
      word: suggestion.original,
    }).then(() => this.#scheduler.flushNow());
  }

  async #explain(suggestion: Suggestion): Promise<string | null> {
    if (suggestion.explanation) return suggestion.explanation;
    if (!suggestion.ruleId) return null;
    const res = await sendToBackground({
      type: 'GET_RULE_DESCRIPTION',
      ruleId: suggestion.ruleId,
    });
    return res.ok ? res.data.description : null;
  }
}
