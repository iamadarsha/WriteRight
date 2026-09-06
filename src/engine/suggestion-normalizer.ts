/**
 * Convert engine-native findings into the shared {@link Suggestion} contract
 * (§2.3, §10.3). Offsets pass through unchanged — Harper reports UTF-16 code
 * units (verified) and the custom rules already work in those units.
 */

import type { Suggestion } from '@/types/suggestion';
import type { HarperFinding } from './harper/harper-types';
import type { RawFinding } from './rules/rule-types';
import { newId } from '@/utils/id';
import { shortHash } from '@/utils/hash';
import { profileForKind, canAutoApply } from './confidence';

export interface NormalizeContext {
  readonly sessionId: string;
  readonly documentVersion: number;
  /** The exact normalized snapshot the findings were computed against. */
  readonly snapshot: string;
}

export function normalizeHarperFinding(
  finding: HarperFinding,
  ctx: NormalizeContext,
): Suggestion | null {
  const original = ctx.snapshot.slice(finding.start, finding.end);
  // Guard: if Harper's problem text no longer matches the snapshot slice, the
  // offsets are unusable — drop rather than mis-highlight (§10.4).
  if (finding.problemText && original !== finding.problemText) return null;

  const profile = profileForKind(finding.kind);
  const replacements = dedupeStrings(
    finding.replacements
      .map((r) => {
        if (r.kind === 'remove') return '';
        if (r.kind === 'insert-after') return original + r.text;
        return r.text;
      })
      .filter((t, i, arr) => t !== original || arr.length === 1),
  );

  return {
    id: newId('sg'),
    sessionId: ctx.sessionId,
    documentVersion: ctx.documentVersion,
    source: profile.source,
    start: finding.start,
    end: finding.end,
    original,
    originalHash: shortHash(original),
    message: finding.message,
    suggestions: replacements,
    severity: profile.severity,
    confidence: profile.confidence,
    ruleId: finding.ruleId,
    explanation: undefined,
    example: undefined,
    canAutoApply: canAutoApply(finding, profile) && replacements.length > 0,
  };
}

export function normalizeRawFinding(
  finding: RawFinding,
  ctx: NormalizeContext,
): Suggestion | null {
  const original = ctx.snapshot.slice(finding.start, finding.end);
  if (finding.original && original !== finding.original) return null;

  return {
    id: newId('sg'),
    sessionId: ctx.sessionId,
    documentVersion: ctx.documentVersion,
    source: finding.source,
    start: finding.start,
    end: finding.end,
    original,
    originalHash: shortHash(original),
    message: finding.message,
    suggestions: dedupeStrings(
      finding.replacements.filter((r) => r !== original),
    ),
    severity: finding.severity,
    confidence: finding.confidence,
    ruleId: finding.ruleId,
    explanation: finding.explanation,
    example: finding.example,
    canAutoApply: finding.canAutoApply && finding.replacements.length > 0,
  };
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
