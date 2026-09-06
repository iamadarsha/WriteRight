/**
 * The stable cross-engine suggestion contract (§10.3).
 *
 * Every analysis engine (spell, grammar, style, tone, readability, ai) emits
 * this shape after normalization at the engine boundary. Phase 1 does not
 * produce suggestions yet, but the type is defined here so adapters, the
 * session model, and messaging can be built against it.
 */

export type SuggestionSource =
  'spell' | 'grammar' | 'punctuation' | 'style' | 'tone' | 'readability' | 'ai';

export type SuggestionSeverity = 'info' | 'warning' | 'error';

export interface Suggestion {
  /** Stable within a session for the lifetime of the finding. */
  readonly id: string;
  /** The {@link EditorSession} this suggestion belongs to. Never cross sessions. */
  readonly sessionId: string;
  /** Document version the offsets were computed against (§10.4, §17.3). */
  readonly documentVersion: number;
  readonly source: SuggestionSource;
  /** UTF-16 code-unit offset into the normalized snapshot. */
  readonly start: number;
  /** UTF-16 code-unit offset into the normalized snapshot. */
  readonly end: number;
  /** Exact original substring `snapshot.slice(start, end)` at creation time. */
  readonly original: string;
  /** Hash of {@link original} for cheap tamper/version checks (§10.4). */
  readonly originalHash: string;
  /** Human-readable, plain-text explanation of what is wrong. */
  readonly message: string;
  /** Ordered replacements; index 0 is the highest-confidence fix (§9.7). */
  readonly suggestions: readonly string[];
  readonly severity: SuggestionSeverity;
  /** 0..1 confidence. High-precision engines should be conservative (§1). */
  readonly confidence: number;
  readonly ruleId?: string;
  /** Plain-language "why this is flagged" — the explanation panel's body (§3.7). */
  readonly explanation?: string;
  /** A short before/after or illustrative example for the explanation panel (§3.7). */
  readonly example?: string;
  /** Whether a one-click apply is safe without a preview (§10.4). */
  readonly canAutoApply: boolean;
}
