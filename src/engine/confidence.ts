/**
 * Confidence scoring (§10.3, §21). High precision beats high recall (§1) — so
 * grammar/style stay conservative and only spelling with a clear top suggestion
 * is auto-applyable.
 */

import type { HarperFinding, HarperLintKind } from './harper/harper-types';
import type { SuggestionSeverity, SuggestionSource } from '@/types/suggestion';

interface KindProfile {
  source: SuggestionSource;
  severity: SuggestionSeverity;
  confidence: number;
}

const KIND_PROFILES: Record<HarperLintKind, KindProfile> = {
  Spelling: { source: 'spell', severity: 'error', confidence: 0.9 },
  Typo: { source: 'spell', severity: 'error', confidence: 0.9 },
  Agreement: { source: 'grammar', severity: 'error', confidence: 0.85 },
  Grammar: { source: 'grammar', severity: 'error', confidence: 0.83 },
  BoundaryError: { source: 'grammar', severity: 'error', confidence: 0.8 },
  WordOrder: { source: 'grammar', severity: 'warning', confidence: 0.75 },
  Usage: { source: 'grammar', severity: 'warning', confidence: 0.72 },
  Capitalization: { source: 'grammar', severity: 'warning', confidence: 0.8 },
  Punctuation: { source: 'grammar', severity: 'warning', confidence: 0.78 },
  Formatting: { source: 'style', severity: 'info', confidence: 0.7 },
  Style: { source: 'style', severity: 'info', confidence: 0.5 },
  Regionalism: { source: 'grammar', severity: 'warning', confidence: 0.7 },
  Nonstandard: { source: 'grammar', severity: 'warning', confidence: 0.7 },
  Eggcorn: { source: 'grammar', severity: 'warning', confidence: 0.72 },
  Malapropism: { source: 'grammar', severity: 'warning', confidence: 0.7 },
  WordChoice: { source: 'style', severity: 'info', confidence: 0.55 },
  Redundancy: { source: 'style', severity: 'info', confidence: 0.6 },
  Repetition: { source: 'style', severity: 'info', confidence: 0.6 },
  Enhancement: { source: 'style', severity: 'info', confidence: 0.5 },
  Readability: { source: 'readability', severity: 'info', confidence: 0.5 },
  Miscellaneous: { source: 'grammar', severity: 'info', confidence: 0.55 },
  Unknown: { source: 'grammar', severity: 'info', confidence: 0.5 },
};

export function profileForKind(kind: HarperLintKind): KindProfile {
  return KIND_PROFILES[kind] ?? KIND_PROFILES.Unknown;
}

/**
 * Whether a finding is safe for one-click apply without a preview (§10.4).
 * Only spelling/typo fixes with an unambiguous top replacement qualify.
 */
export function canAutoApply(
  finding: HarperFinding,
  profile: KindProfile,
): boolean {
  if (profile.source !== 'spell') return false;
  const top = finding.replacements[0];
  if (!top || top.kind !== 'replace' || top.text.length === 0) return false;
  // If Harper is unsure (many near-equal options) still allow — the user can undo.
  return profile.confidence >= 0.85;
}

/** Rank for overlap resolution (§21): higher wins. */
export function severityRank(severity: SuggestionSeverity): number {
  return severity === 'error' ? 3 : severity === 'warning' ? 2 : 1;
}

export function sourceRank(source: SuggestionSource): number {
  switch (source) {
    case 'spell':
      return 5;
    case 'grammar':
      return 4;
    case 'punctuation':
      return 4;
    case 'style':
      return 2;
    case 'tone':
      return 2;
    case 'readability':
      return 1;
    case 'ai':
      return 3;
  }
}
