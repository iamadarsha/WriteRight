/**
 * One editor session per active text surface (§19).
 *
 * Owns an {@link EditorAdapter}, tracks the document version and a content hash,
 * and (from Phase 2) the suggestion list for that surface. Suggestions never
 * cross sessions (§19, §31 Rule 14).
 */

import type { EditorAdapter } from '@/types/editor';
import type { Suggestion } from '@/types/suggestion';
import { contentHash } from '@/utils/hash';
import { newId } from '@/utils/id';

export type AnalysisState =
  'idle' | 'scheduled' | 'running' | 'complete' | 'error';

export class EditorSession {
  readonly sessionId: string;
  readonly adapter: EditorAdapter;

  #textHash: string;
  #suggestions: Suggestion[] = [];
  #activeSuggestionId: string | undefined;
  #analysisState: AnalysisState = 'idle';
  #active = false;
  #unsubscribe: (() => void) | undefined;

  constructor(adapter: EditorAdapter) {
    this.sessionId = newId('ses');
    this.adapter = adapter;
    this.#textHash = contentHash(adapter.getText());
  }

  get adapterId(): string {
    return this.adapter.id;
  }

  get version(): number {
    return this.adapter.getDocumentVersion();
  }

  get textHash(): string {
    return this.#textHash;
  }

  get analysisState(): AnalysisState {
    return this.#analysisState;
  }

  get suggestions(): readonly Suggestion[] {
    return this.#suggestions;
  }

  get activeSuggestionId(): string | undefined {
    return this.#activeSuggestionId;
  }

  get isActive(): boolean {
    return this.#active;
  }

  /** Mark this session as the focused one; begin listening for changes. */
  activate(onChange: () => void): void {
    if (this.#active) return;
    this.#active = true;
    this.#unsubscribe = this.adapter.subscribe(() => {
      this.#textHash = contentHash(this.adapter.getText());
      // Any pending suggestions are now stale until re-analysis (§31 Rule 12).
      if (this.#suggestions.length > 0) {
        this.#suggestions = this.#suggestions.filter(
          (s) => s.documentVersion === this.version,
        );
      }
      onChange();
    });
  }

  /** Stop listening but keep lightweight state (§19 "retain only necessary"). */
  deactivate(): void {
    this.#active = false;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#analysisState = 'idle';
  }

  setAnalysisState(state: AnalysisState): void {
    this.#analysisState = state;
  }

  /** Accept a fresh suggestion set, dropping any not matching the current version. */
  setSuggestions(next: readonly Suggestion[]): void {
    const v = this.version;
    this.#suggestions = next.filter(
      (s) => s.sessionId === this.sessionId && s.documentVersion === v,
    );
    if (
      this.#activeSuggestionId &&
      !this.#suggestions.some((s) => s.id === this.#activeSuggestionId)
    ) {
      this.#activeSuggestionId = undefined;
    }
  }

  setActiveSuggestion(id: string | undefined): void {
    this.#activeSuggestionId = id;
  }

  /** Full teardown: deactivate + destroy the adapter. Idempotent. */
  destroy(): void {
    this.deactivate();
    this.#suggestions = [];
    this.#activeSuggestionId = undefined;
    this.adapter.destroy();
  }
}
