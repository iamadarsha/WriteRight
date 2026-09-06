/**
 * The custom WriteRight rule layer (§2.4, §11.2).
 *
 * A *thin* set of high-confidence, deterministic checks for things Harper does
 * not cover or that WriteRight wants to configure differently. Every rule ships
 * with positive AND negative tests (§2.4). We do NOT re-implement general
 * grammar here (§35).
 *
 * All offsets are UTF-16 code units against the normalized snapshot (§10.3).
 */

import type { SuggestionSeverity, SuggestionSource } from '@/types/suggestion';
import type { ProtectedSpan } from '@/core/protected-spans';

export interface RuleContext {
  /** Spans to skip (URLs, code, identifiers…) — §10.2. */
  readonly protectedSpans: readonly ProtectedSpan[];
  /** Extra buzzwords the user configured. */
  readonly buzzwords: readonly string[];
  /** Whether the passive-voice / buzzword style checks are enabled (§20.1). */
  readonly styleChecksEnabled: boolean;
}

export interface RawFinding {
  readonly ruleId: string;
  readonly source: SuggestionSource;
  readonly start: number;
  readonly end: number;
  readonly original: string;
  readonly message: string;
  readonly replacements: readonly string[];
  readonly severity: SuggestionSeverity;
  /** 0..1 — style rules stay low; whitespace fixes are near-certain. */
  readonly confidence: number;
  /** Plain-language "why" for the explanation panel (§3.7). */
  readonly explanation?: string;
  /** Short before/after example for the explanation panel (§3.7). */
  readonly example?: string;
  readonly canAutoApply: boolean;
}

export interface StyleRule {
  readonly id: string;
  /** Human label for the settings UI / "ignore rule". */
  readonly label: string;
  /** Whether this rule should run given the current context. */
  appliesTo(ctx: RuleContext): boolean;
  /** Return findings for `text`. Must not throw. */
  check(text: string, ctx: RuleContext): RawFinding[];
}

/** True when `[start, end)` overlaps any protected span. */
export function isProtected(
  start: number,
  end: number,
  spans: readonly ProtectedSpan[],
): boolean {
  return spans.some((s) => start < s.end && s.start < end);
}

/** Iterate global-regex matches safely (guards against zero-length loops). */
export function* matchAll(
  re: RegExp,
  text: string,
): Generator<RegExpExecArray> {
  const rx = new RegExp(
    re.source,
    re.flags.includes('g') ? re.flags : re.flags + 'g',
  );
  rx.lastIndex = 0;
  for (let m = rx.exec(text); m !== null; m = rx.exec(text)) {
    yield m;
    if (m[0].length === 0) rx.lastIndex += 1;
  }
}
