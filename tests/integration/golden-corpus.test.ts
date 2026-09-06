import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHarperLinter } from '../support/harper';
import { LinguisticEngine } from '@/engine/linguistic-engine';
import type { AnalysisRequest } from '@/engine/engine-host';
import type { Suggestion } from '@/types/suggestion';
import {
  GOLDEN_CORPUS,
  DIALECT_CORPUS,
  type ResultClass,
} from '../fixtures/golden-corpus';

/**
 * §23.3 golden corpus + §23.4 false-positive gate.
 *
 * Each release runs the corpus through the engine and compares expected result
 * *classes*. When an entry regresses, investigate rule precision / dictionary
 * coverage / protected spans — do not weaken the corpus (§23.4).
 */

let engine: LinguisticEngine;
let engineGB: LinguisticEngine;

beforeAll(async () => {
  engine = new LinguisticEngine(createTestHarperLinter('en-US'));
  engineGB = new LinguisticEngine(createTestHarperLinter('en-GB'));
  await Promise.all([engine.initialize(), engineGB.initialize()]);
}, 60_000);
afterAll(async () => {
  await Promise.all([engine.shutdown(), engineGB.shutdown()]);
});

function req(
  text: string,
  dialect: 'en-US' | 'en-GB' = 'en-US',
): AnalysisRequest {
  return {
    requestId: 'g',
    sessionId: 's',
    documentVersion: 1,
    text,
    dialect,
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

function classify(suggestions: readonly Suggestion[]): Set<ResultClass> {
  const classes = new Set<ResultClass>();
  const errorish = suggestions.filter(
    (s) => s.severity === 'error' || s.severity === 'warning',
  );
  for (const s of suggestions) {
    classes.add('flagged');
    if (s.source === 'spell') classes.add('spelling');
    else if (s.source === 'grammar') classes.add('grammar');
  }
  if (errorish.length === 0) classes.add('clean');
  if (suggestions.length === 0) classes.add('trap-clean');
  return classes;
}

describe('golden corpus (§23.3)', () => {
  for (const entry of GOLDEN_CORPUS) {
    it(`${entry.id}: ${entry.expect}${entry.note ? ` — ${entry.note}` : ''}`, async () => {
      const { suggestions } = await engine.analyze(req(entry.text));
      const classes = classify(suggestions);
      const detail = suggestions
        .map((s) => `${s.source}:${s.ruleId ?? ''}`)
        .join(', ');

      if (entry.expect === 'trap-clean') {
        expect(
          suggestions.length,
          `expected NOTHING flagged, got: ${detail}`,
        ).toBe(0);
      } else if (entry.expect === 'clean') {
        expect(
          classes.has('clean'),
          `expected no error/warning, got: ${detail}`,
        ).toBe(true);
      } else {
        expect(
          classes.has(entry.expect),
          `expected a ${entry.expect} suggestion, got: ${detail || '(none)'}`,
        ).toBe(true);
      }
    });
  }
});

describe('dialect false-positive gate (§23.4)', () => {
  for (const entry of DIALECT_CORPUS) {
    it(`${entry.id}: clean under ${entry.cleanUnder}`, async () => {
      const gb = await engineGB.analyze(req(entry.text, 'en-GB'));
      const gbSpelling = gb.suggestions.filter((s) => s.source === 'spell');
      expect(
        gbSpelling.length,
        `en-GB should not flag: ${gbSpelling.map((s) => s.original).join(', ')}`,
      ).toBe(0);
    });
  }
});
