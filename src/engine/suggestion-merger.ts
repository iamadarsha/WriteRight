/**
 * Analysis priority & deduplication (§21).
 *
 * When multiple engines flag the same span, the user should see ONE correction,
 * not three competing ones. We:
 *  1. drop exact duplicates,
 *  2. group overlapping suggestions,
 *  3. keep the highest-priority, most-specific one per group,
 *  4. discard the rest (a "more suggestions" affordance is a Phase 3 nicety).
 *
 * Priority: source rank → severity rank → confidence → smaller span.
 *
 * Exception: `readability` findings span a whole sentence by design (§12.3), so
 * they'd lose every overlap group to a narrower word-level flag. They're a
 * different *layer* — "this sentence is hard to read" is orthogonal to "this
 * word is misspelled" — so they skip grouping and always survive (deduped).
 */

import type { Suggestion } from '@/types/suggestion';
import { severityRank, sourceRank } from './confidence';

function priority(s: Suggestion): number {
  return (
    sourceRank(s.source) * 1000 +
    severityRank(s.severity) * 100 +
    Math.round(s.confidence * 50)
  );
}

function overlaps(a: Suggestion, b: Suggestion): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Adjacent (touching) same-kind whitespace fixes count as overlapping too. */
function shouldGroup(a: Suggestion, b: Suggestion): boolean {
  if (overlaps(a, b)) return true;
  return a.end === b.start && a.ruleId === b.ruleId && a.source === 'style';
}

export function mergeSuggestions(
  suggestions: readonly Suggestion[],
): Suggestion[] {
  if (suggestions.length <= 1) return [...suggestions];

  // 1. exact-duplicate removal
  const seen = new Set<string>();
  const unique: Suggestion[] = [];
  for (const s of suggestions) {
    const key = `${s.start}:${s.end}:${s.source}:${s.suggestions[0] ?? ''}:${s.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
  }

  // 1b. lift the sentence-level clarity layer out — it never competes for a span
  const spanLevel = unique.filter((s) => s.source === 'readability');
  const tokenLevel = unique.filter((s) => s.source !== 'readability');
  if (tokenLevel.length === 0) {
    return [...spanLevel].sort((a, b) => a.start - b.start || a.end - b.end);
  }

  // 2. sort by start, then by priority desc (so the group leader is first)
  tokenLevel.sort(
    (a, b) => a.start - b.start || priority(b) - priority(a) || a.end - b.end,
  );

  // 3. sweep into overlap groups
  const winners: Suggestion[] = [];
  let group: Suggestion[] = [];
  let groupEnd = -1;

  const flush = (): void => {
    if (group.length === 0) return;
    const leader = [...group].sort((a, b) => {
      const p = priority(b) - priority(a);
      if (p !== 0) return p;
      // Prefer the more specific (smaller) span, then the earlier start.
      return a.end - a.start - (b.end - b.start) || a.start - b.start;
    })[0];
    if (leader) winners.push(leader);
    group = [];
    groupEnd = -1;
  };

  for (const s of tokenLevel) {
    if (
      group.length === 0 ||
      s.start < groupEnd ||
      shouldGroup(group[group.length - 1]!, s)
    ) {
      group.push(s);
      groupEnd = Math.max(groupEnd, s.end);
    } else {
      flush();
      group.push(s);
      groupEnd = s.end;
    }
  }
  flush();

  winners.push(...spanLevel);
  winners.sort((a, b) => a.start - b.start || a.end - b.end);
  return winners;
}
