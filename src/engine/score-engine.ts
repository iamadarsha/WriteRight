/**
 * Writing Health Score (§12.2) — an original, fully transparent formula.
 *
 *   health = 0.40·correctness + 0.20·clarity + 0.15·readability
 *          + 0.15·concision   + 0.10·consistency
 *
 * Every component is 0–100 and computed only from deterministic local metrics
 * (§12.2 "Store no hidden user profile"). Each carries a plain-language note so
 * the UI can always explain *why* the number is what it is (§12.3). No AI or
 * taste judgment ever touches this number.
 */

import type {
  DocumentStats,
  HealthScore,
  HealthScoreComponent,
  ReadabilityScores,
} from '@/types/insights';

export interface ScoreInputs {
  readonly stats: DocumentStats;
  readonly readability: ReadabilityScores;
  readonly suggestionCounts: {
    readonly error: number;
    readonly warning: number;
    readonly info: number;
  };
  /**
   * Mechanical-consistency assessment from {@link assessConsistency} (§12.2).
   * The score engine works from pre-computed inputs, so the caller (which has
   * the raw text) supplies this. Omitted ⇒ treated as fully consistent.
   */
  readonly consistency?: { readonly value: number; readonly note: string };
}

const WEIGHTS = {
  correctness: 0.4,
  clarity: 0.2,
  readability: 0.15,
  concision: 0.15,
  consistency: 0.1,
} as const;

export function computeHealthScore(inputs: ScoreInputs): HealthScore {
  const { stats, readability, suggestionCounts } = inputs;
  const words = Math.max(1, stats.words);
  const per100 = (n: number): number => (n / words) * 100;

  /* --- correctness: spelling + grammar errors and warnings ---------- */
  const errPer100 = per100(suggestionCounts.error);
  const warnPer100 = per100(suggestionCounts.warning);
  const correctness = clamp(100 - (errPer100 * 12 + warnPer100 * 5));
  const correctnessNote =
    suggestionCounts.error + suggestionCounts.warning === 0
      ? 'No spelling or grammar issues found.'
      : `${suggestionCounts.error} error${plural(suggestionCounts.error)}, ` +
        `${suggestionCounts.warning} warning${plural(suggestionCounts.warning)}.`;

  /* --- clarity: sentence length + passive voice ------------------- */
  const avgLen = stats.avgSentenceLength;
  const lengthPenalty =
    avgLen <= 18
      ? 0
      : avgLen <= 25
        ? (avgLen - 18) * 2.5
        : 17.5 + (avgLen - 25) * 4;
  const longPenalty = stats.longSentencePct * 0.6;
  const passivePenalty = per100(stats.passiveVoiceCount) * 6;
  const clarity = clamp(100 - lengthPenalty - longPenalty - passivePenalty);
  const clarityNote =
    avgLen === 0
      ? 'Not enough text to judge clarity.'
      : `Average sentence ${avgLen} words` +
        (stats.longSentenceCount > 0
          ? `, ${stats.longSentenceCount} long sentence${plural(stats.longSentenceCount)}`
          : '') +
        (stats.passiveVoiceCount > 0
          ? `, ${stats.passiveVoiceCount} passive construction${plural(stats.passiveVoiceCount)}.`
          : '.');

  /* --- readability: Flesch Reading Ease mapped to 0..100 ---------- */
  const readabilityValue = readability.sufficientText
    ? mapEase(readability.fleschReadingEase)
    : 75; // neutral-ish default for short text
  const readabilityNote = readability.sufficientText
    ? `${readability.grade} (Flesch ${readability.fleschReadingEase}).`
    : 'Too short for a reliable reading-level estimate.';

  /* --- concision: filler + repeated words ------------------------ */
  const fillerPenalty = per100(stats.fillerCount) * 7;
  const repeatPenalty = stats.repeatedWordRate * 400;
  const concision = clamp(100 - fillerPenalty - repeatPenalty);
  const concisionNote =
    stats.fillerCount === 0 && stats.repeatedWordRate === 0
      ? 'Tight — no filler phrases detected.'
      : `${stats.fillerCount} filler word${plural(stats.fillerCount)}` +
        (stats.repeatedWordRate > 0 ? ', some repeated words.' : '.');

  /* --- consistency: dialect / quote / spacing / hyphenation drift --- */
  const consistencyValue = inputs.consistency?.value ?? 100;
  const consistencyNote =
    inputs.consistency?.note ??
    'Spelling, spacing and punctuation are consistent.';

  const components: HealthScoreComponent[] = [
    comp('correctness', 'Correctness', correctness, correctnessNote),
    comp('clarity', 'Clarity', clarity, clarityNote),
    comp('readability', 'Readability', readabilityValue, readabilityNote),
    comp('concision', 'Concision', concision, concisionNote),
    comp('consistency', 'Consistency', consistencyValue, consistencyNote),
  ];

  const score = Math.round(
    components.reduce((sum, c) => sum + c.value * c.weight, 0),
  );

  return {
    score: clamp(score),
    components,
    notes: components
      .filter((c) => c.value < 90)
      .sort((a, b) => a.value - b.value)
      .slice(0, 3)
      .map((c) => `${c.label}: ${c.note}`),
  };
}

/**
 * Explain a score change (§12.3): "86 → 91 · +3 fewer grammar issues · …".
 */
export function explainScoreChange(
  prev: HealthScore,
  next: HealthScore,
): string[] {
  if (prev.score === next.score) return [];
  const lines: string[] = [`${prev.score} → ${next.score}`];
  const prevBy = new Map(prev.components.map((c) => [c.key, c.value]));
  for (const c of next.components) {
    const before = prevBy.get(c.key) ?? c.value;
    const delta = Math.round(c.value - before);
    if (delta === 0) continue;
    lines.push(`${delta > 0 ? '+' : ''}${delta} ${c.label.toLowerCase()}`);
  }
  return lines;
}

function comp(
  key: HealthScoreComponent['key'],
  label: string,
  value: number,
  note: string,
): HealthScoreComponent {
  return {
    key,
    label,
    value: Math.round(clamp(value)),
    weight: WEIGHTS[key],
    note,
  };
}

function mapEase(ease: number): number {
  // Flesch Reading Ease: 60–70 is "plain English" → treat that band as ~85.
  if (ease >= 70) return 95;
  if (ease >= 60) return 85;
  if (ease >= 50) return 72;
  if (ease >= 30) return 55;
  return 35;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function plural(n: number): string {
  return n === 1 ? '' : 's';
}
