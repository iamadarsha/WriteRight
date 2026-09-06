import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHarperLinter } from '../support/harper';
import { LinguisticEngine } from '@/engine/linguistic-engine';
import type { AnalysisRequest } from '@/engine/engine-host';
import { EVAL_SET, type EvalCategory } from '../fixtures/engine-eval-set';

/**
 * Enforces the engine-eval numbers (§23.3). `scripts/eval-engine.ts` is the
 * human-facing report; this is the CI gate. Two invariants:
 *   1. ZERO hard false positives — no trap ever draws an error/warning flag.
 *   2. per-category recall never drops below the floors locked in here.
 * Raising a floor after a genuine improvement is encouraged; lowering one
 * needs a reason in the PR.
 */

const RECALL_FLOOR: Partial<Record<EvalCategory, number>> = {
  spelling: 1,
  'a-vs-an': 1,
  'modal-of': 1,
  'its-vs-its': 1,
  'loose-vs-lose': 1,
  'to-vs-too': 1,
  'your-vs-youre': 1,
  'there-their-theyre': 1,
  'then-vs-than': 1,
  'subject-verb': 0.85,
  'duplicate-word': 1,
  whitespace: 1,
  wordiness: 1,
};

let engine: LinguisticEngine;
beforeAll(async () => {
  engine = new LinguisticEngine(createTestHarperLinter('en-US'));
  await engine.initialize();
}, 60_000);
afterAll(() => engine.shutdown());

function req(text: string): AnalysisRequest {
  return {
    requestId: 'e',
    sessionId: 's',
    documentVersion: 1,
    text,
    dialect: 'en-US',
    styleChecksEnabled: true,
    buzzwords: [],
    disabledRuleIds: [],
    ignoredKeys: [],
    extraIgnorePatterns: [],
    presetId: null,
    withInsights: false,
  };
}

describe('engine eval — false-positive gate (§23.4)', () => {
  for (const c of EVAL_SET.filter((c) => !c.shouldFlag)) {
    it(`${c.id}: stays clean — "${c.text}"`, async () => {
      const { suggestions } = await engine.analyze(req(c.text));
      const errorish = suggestions.filter(
        (s) => s.severity === 'error' || s.severity === 'warning',
      );
      expect(
        errorish.map((s) => `${s.source}/${s.ruleId ?? ''}:"${s.original}"`),
      ).toEqual([]);
    });
  }
});

describe('engine eval — recall floors (§23.3)', () => {
  it('every category meets its recall floor', async () => {
    const hitByCat = new Map<EvalCategory, { tp: number; n: number }>();
    for (const c of EVAL_SET) {
      if (!c.shouldFlag || !c.flag) continue;
      const flag = c.flag;
      const { suggestions } = await engine.analyze(req(c.text));
      const at = c.text.indexOf(flag);
      const hit = suggestions.some(
        (s) => s.start < at + flag.length && at < s.end,
      );
      const t = hitByCat.get(c.category) ?? { tp: 0, n: 0 };
      t.n += 1;
      if (hit) t.tp += 1;
      hitByCat.set(c.category, t);
    }
    const failures: string[] = [];
    for (const [cat, t] of hitByCat) {
      const floor = RECALL_FLOOR[cat] ?? 0;
      const recall = t.tp / t.n;
      if (recall < floor - 1e-9) {
        failures.push(`${cat}: recall ${recall.toFixed(2)} < floor ${floor}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
