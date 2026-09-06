import { describe, it, expect } from 'vitest';
import { computeHealthScore, explainScoreChange } from '@/engine/score-engine';
import { computeStats, computeReadability } from '@/engine/readability-engine';

function score(text: string, counts = { error: 0, warning: 0, info: 0 }) {
  const stats = computeStats(text);
  return computeHealthScore({
    stats,
    readability: computeReadability(text, stats),
    suggestionCounts: counts,
  });
}

const CLEAN =
  'The team shipped the update on time. Each change was reviewed carefully. ' +
  'Feedback was collected and folded in before release.';

describe('computeHealthScore (§12.2)', () => {
  it('clean, readable prose scores high; error-laden prose scores lower', () => {
    const good = score(CLEAN);
    const bad = score(CLEAN, { error: 6, warning: 4, info: 2 });
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.score).toBeGreaterThan(80);
  });

  it('is fully transparent — weights sum to 1 and every component has a note', () => {
    const s = score(CLEAN);
    const totalWeight = s.components.reduce((a, c) => a + c.weight, 0);
    expect(round2(totalWeight)).toBe(1);
    for (const c of s.components) {
      expect(c.value).toBeGreaterThanOrEqual(0);
      expect(c.value).toBeLessThanOrEqual(100);
      expect(c.note.length).toBeGreaterThan(0);
    }
  });

  it('the score is exactly the weighted sum of its components', () => {
    const s = score(CLEAN, { error: 2, warning: 1, info: 0 });
    const manual = Math.round(
      s.components.reduce((sum, c) => sum + c.value * c.weight, 0),
    );
    expect(s.score).toBe(manual);
  });

  it('long, passive sentences drag down clarity', () => {
    const wordy = `${'the process was carefully and thoroughly analysed by the committee '.repeat(3)}.`;
    const s = score(wordy);
    const clarity = s.components.find((c) => c.key === 'clarity')!;
    expect(clarity.value).toBeLessThan(80);
  });

  it('explainScoreChange lists the deltas (§12.3)', () => {
    const before = score(CLEAN, { error: 4, warning: 0, info: 0 });
    const after = score(CLEAN, { error: 0, warning: 0, info: 0 });
    const lines = explainScoreChange(before, after);
    expect(lines[0]).toMatch(/^\d+ → \d+$/);
    expect(lines.some((l) => l.includes('correctness'))).toBe(true);
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
