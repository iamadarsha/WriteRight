/**
 * Engine host abstraction (§5.3).
 *
 * Decouples the local linguistic engine from where it runs. Phase 2 ships
 * {@link LinguisticEngine} (Harper/WASM + custom rules) behind this, hosted in
 * the background service worker. {@link NoopEngineHost} remains the
 * graceful-degradation fallback (§1 "progressive enhancement").
 */

import type { Suggestion } from '@/types/suggestion';
import type { Dialect } from '@/types/settings';
import type { DocumentInsights } from '@/types/insights';

export interface AnalysisRequest {
  readonly requestId: string;
  readonly sessionId: string;
  readonly documentVersion: number;
  /** Canonical normalized snapshot (UTF-16, LF) — §10.3. */
  readonly text: string;
  readonly dialect: Dialect;
  /** §20.1 — gates the wordiness / buzzword rules. */
  readonly styleChecksEnabled: boolean;
  /** §12.3 — gates the inline clarity / long-sentence rule. */
  readonly readabilityEnabled: boolean;
  /** User-configured buzzwords (§11.2). */
  readonly buzzwords: readonly string[];
  /** Rule ids (`harper:Spelling`, `wr:filler-phrase`, …) the user muted (§20.3). */
  readonly disabledRuleIds: readonly string[];
  /** Stable keys of individually-ignored suggestions (§2.7 "ignore once/always"). */
  readonly ignoredKeys: readonly string[];
  /** Extra ignore patterns for protected spans (§10.2). */
  readonly extraIgnorePatterns: readonly string[];
  /** Active format preset id, if any (§3.4) — relaxes non-preset custom rules. */
  readonly presetId: string | null;
  /** Include the (heavier) readability / tone / score pass in the result. */
  readonly withInsights: boolean;
}

export interface AnalysisResult {
  readonly requestId: string;
  readonly sessionId: string;
  readonly documentVersion: number;
  readonly suggestions: readonly Suggestion[];
  /** Readability / tone / health score (§12, §13) — present when requested. */
  readonly insights: DocumentInsights | null;
  /** `true` when the engine could not run and results are empty by default. */
  readonly degraded: boolean;
}

export interface EngineHost {
  initialize(): Promise<void>;
  analyze(request: AnalysisRequest): Promise<AnalysisResult>;
  cancel(requestId: string): void;
  shutdown(): Promise<void>;
  /** Whether the underlying engine is loaded and ready (§14.4-style honesty). */
  isReady(): boolean;
}

/** A host that does no analysis — used when no real engine is available. */
export class NoopEngineHost implements EngineHost {
  #ready = false;

  initialize(): Promise<void> {
    this.#ready = true;
    return Promise.resolve();
  }

  analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    return Promise.resolve({
      requestId: request.requestId,
      sessionId: request.sessionId,
      documentVersion: request.documentVersion,
      suggestions: [],
      insights: null,
      degraded: true,
    });
  }

  cancel(): void {
    /* nothing scheduled */
  }

  shutdown(): Promise<void> {
    this.#ready = false;
    return Promise.resolve();
  }

  isReady(): boolean {
    return this.#ready;
  }
}

/** Stable, engine-agnostic key for an ignore-list entry (§2.7). */
export function suggestionIgnoreKey(s: {
  ruleId?: string;
  original: string;
  message: string;
}): string {
  return `${s.ruleId ?? 'unknown'}::${s.original}::${s.message}`;
}
