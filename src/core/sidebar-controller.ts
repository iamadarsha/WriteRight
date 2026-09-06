/**
 * Content-side sidebar orchestration (§15).
 *
 * Owns the in-page {@link SidebarElement} and {@link SidebarLauncher}, and
 * exposes a {@link SidebarDataSource} bound to whichever {@link AnalysisCoordinator}
 * is currently active. The sidebar and launcher persist across editor focus
 * changes; only the data binding moves.
 */

import type { ShadowHost } from '@/ui/shadow-host';
import type { AnalysisCoordinator } from './analysis-coordinator';
import {
  SidebarElement,
  type SidebarDataSource,
} from '@/ui/sidebar/sidebar-element';
import { SidebarLauncher } from '@/ui/sidebar/launcher';
import { normalizeLineEndings } from './text-normalize';
import { sendToBackground } from '@/messaging';
import type { AiCapability, AiChatTurn, AiTask } from '@/ai/ai-types';
import type { AiChatResponse, AiRunResponse } from '@/types/messages';
import type { Suggestion } from '@/types/suggestion';
import type { DocumentInsights } from '@/types/insights';
import { newId } from '@/utils/id';
import { createLogger } from '@/utils/logger';

const log = createLogger('sidebar');

export class SidebarController {
  readonly #sidebar: SidebarElement;
  readonly #launcher: SidebarLauncher;
  readonly #origin: string;
  #coordinator: AnalysisCoordinator | null = null;
  #presetId: string | null;
  #unsubscribe: (() => void) | undefined;
  #aiCapability: AiCapability | null = null;
  /** Range the last AI rewrite was computed against, for a safe apply (§4.8). */
  #aiRange: { start: number; end: number } | null = null;
  #aiRequestId: string | null = null;

  constructor(
    host: ShadowHost,
    origin: string,
    initialPresetId: string | null,
    onResumeField?: () => void,
    getFeatures?: () => { writingScore: boolean; toneHints: boolean },
    onState?: (open: boolean, tab: string) => void,
  ) {
    this.#origin = origin;
    this.#presetId = initialPresetId;
    this.#onResumeField = onResumeField;
    this.#getFeatures = getFeatures;
    this.#onState = onState;

    const source: SidebarDataSource = {
      getInsights: () => this.#coordinator?.insights ?? null,
      getSuggestions: () => this.#coordinator?.suggestions ?? [],
      getActivePresetId: () => this.#presetId,
      onUpdate: (listener) => this.#addUpdateListener(listener),
      apply: (id, i) => this.#coordinator?.applyById(id, i),
      ignoreOnce: (id) => this.#coordinator?.ignoreOnceById(id),
      addToDictionary: (id) => this.#coordinator?.addToDictionaryById(id),
      reveal: (id) => {
        this.#coordinator?.revealSuggestion(id);
      },
      requestRewrite: async () => {
        const before = this.#coordinator
          ? normalizeLineEndings(this.#coordinator.session.adapter.getText())
              .text
          : '';
        const result = (await this.#coordinator?.requestRewrite()) ?? {
          changed: false,
          text: before,
          changes: [],
        };
        return { before, result };
      },
      applyFullText: (t) => this.#coordinator?.applyFullText(t) ?? false,
      setPreset: (id) => this.#setPreset(id),
      onClose: () => {
        this.#coordinator?.session.adapter.focus();
      },
      getStatus: () => {
        if (!this.#coordinator) return 'no-editor';
        if (this.#coordinator.suggestions.length > 0) return 'ready';
        return this.#coordinator.insights ? 'ready' : 'analyzing';
      },
      getFeatures: () =>
        this.#getFeatures?.() ?? { writingScore: true, toneHints: true },
      analyzeText: (text) => this.#analyzeText(text),
      getAiCapability: () => this.#aiCapability,
      refreshAiCapability: () => this.#refreshAiCapability(),
      startAiDownload: () => this.#startAiDownload(),
      runAi: (task) => this.#runAi(task),
      applyAiRewrite: (text) => this.#applyAiRewrite(text),
      chatAi: (history, message) => this.#chatAi(history, message),
      cancelAi: () => this.#cancelAi(),
      acknowledgeAiPrivacy: () => this.#acknowledgeAiPrivacy(),
      loadChatHistory: () => this.#loadChatHistory(),
      saveChatHistory: (turns) => this.#saveChatHistory(turns),
    };

    this.#source = source;
    this.#sidebar = new SidebarElement(host.uiLayer, source, (open, tab) =>
      this.#onState?.(open, tab),
    );
    this.#launcher = new SidebarLauncher(
      host.uiLayer,
      () => this.open(),
      () => this.#resumeField(),
    );
  }

  readonly #onResumeField: (() => void) | undefined;
  readonly #getFeatures:
    (() => { writingScore: boolean; toneHints: boolean }) | undefined;
  readonly #onState: ((open: boolean, tab: string) => void) | undefined;
  #fieldPaused = false;

  #resumeField(): void {
    this.#fieldPaused = false;
    this.#launcher.setResumeMode(false);
    this.#onResumeField?.();
  }

  readonly #source: SidebarDataSource;

  /** The data binding handed to the sidebar shell. Diagnostics / tests (§23). */
  get source(): SidebarDataSource {
    return this.#source;
  }

  /** Whether the page has editors WriteRight cannot check inline (§5.1 Tier C/D). */
  #unsupportedEditors = false;

  /** Rebind to the coordinator for the newly-focused editor (or null). */
  bind(coordinator: AnalysisCoordinator | null): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#coordinator = coordinator;
    if (coordinator) {
      this.#fieldPaused = false;
      this.#launcher.setResumeMode(false);
      this.#launcher.attachTo(coordinator.session.adapter.element);
      this.#launcher.show();
      this.#unsubscribe = coordinator.onUpdate(() => this.#refreshLauncher());
    } else {
      this.#launcher.attachTo(null);
      if (
        !this.#sidebar.isOpen &&
        !this.#unsupportedEditors &&
        !this.#fieldPaused
      ) {
        this.#launcher.hide();
      }
    }
    this.#refreshLauncher();
  }

  /**
   * Page-level status from the {@link TextFieldManager}. When the page has an
   * editor WriteRight cannot check inline, keep the launcher visible so the
   * paste-and-analyse fallback is discoverable (§3.9, §5.1).
   */
  setPageStatus(availability: string): void {
    this.#unsupportedEditors = availability === 'unsupported';
    this.#fieldPaused = availability === 'disabled-field';
    this.#launcher.setResumeMode(this.#fieldPaused);
    if (this.#unsupportedEditors || this.#fieldPaused) this.#launcher.show();
    else if (!this.#coordinator && !this.#sidebar.isOpen) this.#launcher.hide();
    this.#refreshLauncher();
  }

  updatePreset(presetId: string | null): void {
    this.#presetId = presetId;
  }

  /** Re-render the sidebar (e.g. after a settings toggle changed a panel). */
  notifyChanged(): void {
    this.#refreshLauncher();
  }

  open(): void {
    this.#sidebar.open();
  }
  toggle(): void {
    this.#sidebar.toggle();
  }

  /** Diagnostics / tests. */
  get isOpen(): boolean {
    return this.#sidebar.isOpen;
  }

  destroy(): void {
    this.#unsubscribe?.();
    this.#sidebar.destroy();
    this.#launcher.destroy();
  }

  /* ---- internals ------------------------------------------------- */

  #updateListeners = new Set<() => void>();

  #addUpdateListener(listener: () => void): () => void {
    this.#updateListeners.add(listener);
    return () => this.#updateListeners.delete(listener);
  }

  #refreshLauncher(): void {
    const c = this.#coordinator;
    const issues = c
      ? c.suggestions.filter((s) => s.severity !== 'info').length
      : 0;
    this.#launcher.setState(issues);
    for (const fn of [...this.#updateListeners]) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
  }

  #setPreset(id: string | null): void {
    this.#presetId = id;
    void sendToBackground({
      type: 'SET_SITE_PRESET',
      origin: this.#origin,
      presetId: id,
    })
      .then(() => this.#coordinator?.reanalyze())
      .catch((err) => log.warn('set preset failed', err));
  }

  /* ---- AI (§4) --------------------------------------------------- */

  async #startAiDownload(): Promise<{ ok: boolean; error?: string }> {
    const res = await sendToBackground({ type: 'AI_START_DOWNLOAD' });
    return res.ok ? res.data : { ok: false, error: res.error };
  }

  async #refreshAiCapability(): Promise<AiCapability> {
    const res = await sendToBackground({
      type: 'AI_GET_CAPABILITY',
      force: true,
    });
    if (res.ok) this.#aiCapability = res.data.capability;
    return (
      this.#aiCapability ?? {
        enabled: false,
        active: null,
        label: 'AI Unavailable — local writing tools still active',
        providers: [],
        acknowledged: false,
        enhancedReview: false,
      }
    );
  }

  async #runAi(task: AiTask): Promise<{
    target: { whole: boolean; text: string };
    response: AiRunResponse;
  }> {
    const target = this.#coordinator?.aiTarget() ?? null;
    if (!target) {
      return {
        target: { whole: true, text: '' },
        response: {
          status: 'blocked',
          mode: 'deterministic',
          message: 'Click into a text field first.',
        },
      };
    }
    this.#aiRange = { start: target.start, end: target.end };
    const requestId = newId('ai');
    this.#aiRequestId = requestId;
    const res = await sendToBackground({
      type: 'AI_RUN',
      requestId,
      task,
      selection: target.text,
      whole: target.whole,
      formatHint:
        task === 'to-format' ? (this.#presetId ?? undefined) : undefined,
    });
    this.#aiRequestId = null;
    if (!res.ok) {
      return {
        target: { whole: target.whole, text: target.text },
        response: {
          status: 'blocked',
          mode: 'unsupported',
          message: res.error || 'Local AI failed.',
        },
      };
    }
    return {
      target: { whole: target.whole, text: target.text },
      response: res.data,
    };
  }

  #applyAiRewrite(text: string): boolean {
    const range = this.#aiRange;
    const coord = this.#coordinator;
    if (!range || !coord) return false;
    const ok = coord.applyRange(range.start, range.end, text);
    if (ok) this.#aiRange = null;
    return ok;
  }

  async #chatAi(
    history: readonly AiChatTurn[],
    message: string,
  ): Promise<AiChatResponse> {
    const requestId = newId('ai');
    this.#aiRequestId = requestId;
    const res = await sendToBackground({
      type: 'AI_CHAT',
      requestId,
      history: history.map((t) => ({ role: t.role, content: t.content })),
      message,
    });
    this.#aiRequestId = null;
    if (!res.ok) {
      return { status: 'blocked', message: res.error || 'Local AI failed.' };
    }
    return res.data;
  }

  #cancelAi(): void {
    if (!this.#aiRequestId) return;
    void sendToBackground({ type: 'AI_CANCEL', requestId: this.#aiRequestId });
    this.#aiRequestId = null;
  }

  async #acknowledgeAiPrivacy(): Promise<void> {
    await sendToBackground({ type: 'AI_ACK_PRIVACY' });
  }

  /** Read-only analysis of pasted text — the fallback for unsupported editors. */
  async #analyzeText(raw: string): Promise<{
    suggestions: readonly Suggestion[];
    insights: DocumentInsights | null;
  }> {
    const text = normalizeLineEndings(raw).text.slice(0, 100_000);
    const res = await sendToBackground({
      type: 'ANALYZE_TEXT',
      requestId: newId('fb'),
      sessionId: newId('fb-session'),
      documentVersion: 1,
      origin: this.#origin,
      text,
      withInsights: true,
    });
    if (!res.ok) return { suggestions: [], insights: null };
    return {
      suggestions: res.data.suggestions,
      insights: res.data.insights,
    };
  }

  async #loadChatHistory(): Promise<readonly AiChatTurn[]> {
    const res = await sendToBackground({ type: 'AI_GET_CHAT_HISTORY' });
    return res.ok ? res.data.turns : [];
  }

  #saveChatHistory(turns: readonly AiChatTurn[]): void {
    void sendToBackground({
      type: 'AI_SAVE_CHAT_HISTORY',
      turns: turns.map((t) => ({ role: t.role, content: t.content })),
    });
  }
}
