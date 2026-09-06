/**
 * Engine evaluation harness (§23.3).
 *
 *   npx tsx scripts/eval-engine.ts            # print the precision/recall table
 *   npx tsx scripts/eval-engine.ts --show     # + list every case and what fired
 *   npx tsx scripts/eval-engine.ts --check    # exit non-zero if a rule is
 *                                             #   false-positive-prone
 *
 * Runs `tests/fixtures/engine-eval-set.ts` through the REAL linguistic engine
 * (Harper + the custom rule layer) and reports precision / recall / F1 per
 * error category. Recall gaps are expected and tracked — a category the engine
 * can't yet handle just shows a low recall number. What `--check` guards is
 * *precision*: a new rule that flags correct text is a regression.
 */

import { createTestHarperLinter } from '../tests/support/harper';
import { LinguisticEngine } from '../src/engine/linguistic-engine';
import type { AnalysisRequest } from '../src/engine/engine-host';
import type { Suggestion } from '../src/types/suggestion';
import {
  EVAL_SET,
  type EvalCase,
  type EvalCategory,
} from '../tests/fixtures/engine-eval-set';

const SHOW = process.argv.includes('--show');
const CHECK = process.argv.includes('--check');

/** Precision floor a category needs once it has this many "hit" cases. */
const PRECISION_FLOOR = 0.85;
const MIN_HITS_FOR_FLOOR = 3;

function request(text: string): AnalysisRequest {
  return {
    requestId: 'e',
    sessionId: 's',
    documentVersion: 1,
    text,
    dialect: 'en-US',
    styleChecksEnabled: true,
    readabilityEnabled: true,
    buzzwords: [],
    disabledRuleIds: [],
    ignoredKeys: [],
    extraIgnorePatterns: [],
    presetId: null,
    withInsights: false,
  };
}

function overlaps(s: Suggestion, start: number, end: number): boolean {
  return s.start < end && start < s.end;
}

interface Tally {
  tp: number;
  fp: number;
  fn: number;
  /** trap cases that only drew an info/style flag — noted, not scored as FP. */
  soft: number;
}

function blank(): Tally {
  return { tp: 0, fp: 0, fn: 0, soft: 0 };
}

interface CaseResult {
  readonly c: EvalCase;
  readonly fired: readonly Suggestion[];
  readonly verdict: 'TP' | 'FN' | 'FP' | 'ok' | 'soft-FP';
}

function scoreCase(
  c: EvalCase,
  suggestions: readonly Suggestion[],
): CaseResult {
  const errorish = suggestions.filter(
    (s) => s.severity === 'error' || s.severity === 'warning',
  );

  if (c.shouldFlag && c.flag) {
    const at = c.text.indexOf(c.flag);
    const span: [number, number] = [at, at + c.flag.length];
    const hit = suggestions.find((s) => overlaps(s, span[0], span[1]));
    return { c, fired: suggestions, verdict: hit ? 'TP' : 'FN' };
  }

  // trap — must stay clean.
  if (errorish.length > 0) return { c, fired: suggestions, verdict: 'FP' };
  if (suggestions.length > 0)
    return { c, fired: suggestions, verdict: 'soft-FP' };
  return { c, fired: suggestions, verdict: 'ok' };
}

function pct(n: number): string {
  return Number.isNaN(n) ? '  –  ' : `${(n * 100).toFixed(0).padStart(3)}%`;
}

async function main(): Promise<void> {
  const engine = new LinguisticEngine(createTestHarperLinter('en-US'));
  await engine.initialize();

  const byCat = new Map<EvalCategory, Tally>();
  const results: CaseResult[] = [];

  for (const c of EVAL_SET) {
    const { suggestions } = await engine.analyze(request(c.text));
    const r = scoreCase(c, suggestions);
    results.push(r);
    const t = byCat.get(c.category) ?? blank();
    if (r.verdict === 'TP') t.tp += 1;
    else if (r.verdict === 'FN') t.fn += 1;
    else if (r.verdict === 'FP') t.fp += 1;
    else if (r.verdict === 'soft-FP') t.soft += 1;
    byCat.set(c.category, t);
  }

  await engine.shutdown();

  if (SHOW) {
    for (const r of results) {
      const tag =
        r.verdict === 'TP' || r.verdict === 'ok'
          ? '✓'
          : r.verdict === 'soft-FP'
            ? '~'
            : '✗';
      const fired = r.fired
        .map(
          (s) => `${s.source}${s.ruleId ? `/${s.ruleId}` : ''}:"${s.original}"`,
        )
        .join(', ');
      console.log(
        `${tag} [${r.verdict.padEnd(6)}] ${r.c.id.padEnd(14)} ${r.c.text}`,
      );
      if (fired) console.log(`             ↳ ${fired}`);
    }
    console.log('');
  }

  console.log(
    'category               hits   P     R     F1    (fp, fn, soft-fp)',
  );
  console.log('─'.repeat(66));
  let total = blank();
  let failed = false;
  for (const [cat, t] of [...byCat].sort((a, b) => a[0].localeCompare(b[0]))) {
    const hits = t.tp + t.fn;
    const precision = t.tp + t.fp === 0 ? NaN : t.tp / (t.tp + t.fp);
    const recall = hits === 0 ? NaN : t.tp / hits;
    const f1 =
      Number.isNaN(precision) ||
      Number.isNaN(recall) ||
      precision + recall === 0
        ? NaN
        : (2 * precision * recall) / (precision + recall);
    total = {
      tp: total.tp + t.tp,
      fp: total.fp + t.fp,
      fn: total.fn + t.fn,
      soft: total.soft + t.soft,
    };
    const flag =
      hits >= MIN_HITS_FOR_FLOOR &&
      !Number.isNaN(precision) &&
      precision < PRECISION_FLOOR;
    if (flag) failed = true;
    console.log(
      `${cat.padEnd(22)} ${String(hits).padStart(4)}  ${pct(precision)} ${pct(recall)} ${pct(f1)}   (${t.fp}, ${t.fn}, ${t.soft})${flag ? '  ← precision below floor' : ''}`,
    );
  }
  console.log('─'.repeat(66));
  const tHits = total.tp + total.fn;
  console.log(
    `${'TOTAL'.padEnd(22)} ${String(tHits).padStart(4)}  ${pct(total.tp / (total.tp + total.fp))} ${pct(total.tp / tHits)} ${''.padStart(5)}   (${total.fp}, ${total.fn}, ${total.soft})`,
  );

  if (CHECK && failed) {
    console.error(
      '\n✗ a category with real coverage is flagging correct text — fix precision before shipping.',
    );
    process.exit(1);
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
