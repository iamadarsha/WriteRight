/**
 * Assembles {@link DocumentInsights} — statistics, readability, tone and the
 * writing-health score (§12, §13, §3.8) — from the normalized text and the
 * suggestions the pipeline already produced.
 *
 * Pure and deterministic. The score depends on the suggestion counts, so this
 * runs after suggestion merging.
 */

import type { Suggestion } from '@/types/suggestion';
import type { DocumentInsights } from '@/types/insights';
import { computeStats, computeReadability } from './readability-engine';
import { estimateTone } from './tone-engine';
import { computeHealthScore } from './score-engine';

export function computeInsights(
  text: string,
  suggestions: readonly Suggestion[],
  presetId: string | null,
): DocumentInsights {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const s of suggestions) counts[s.severity] += 1;

  const stats = computeStats(text);
  const readability = computeReadability(text, stats);
  const tone = estimateTone(text);
  const score = computeHealthScore({
    stats,
    readability,
    suggestionCounts: counts,
  });

  return {
    stats,
    readability,
    tone,
    score,
    suggestionCounts: counts,
    presetId,
  };
}
