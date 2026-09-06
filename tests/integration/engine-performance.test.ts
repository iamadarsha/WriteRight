import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHarperLinter } from '../support/harper';
import { LinguisticEngine } from '@/engine/linguistic-engine';
import type { AnalysisRequest } from '@/engine/engine-host';

/**
 * Performance sizing (§2.9, §17.6). Node timings are not the P95-on-reference-
 * hardware figure, but they guard against a gross regression in the pipeline.
 * The reference target is P95 ≤ 120 ms incremental on a 500-word document;
 * these ceilings are deliberately generous for shared CI.
 */

const WORDS = [
  'the',
  'quick',
  'brown',
  'fox',
  'jumps',
  'over',
  'a',
  'lazy',
  'dog',
  'while',
  'the',
  'committee',
  'reviewed',
  'every',
  'report',
  'carefully',
  'before',
  'publishing',
  'its',
  'findings',
  'to',
  'the',
  'public',
  'record',
];

function doc(wordCount: number): string {
  const out: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    out.push(WORDS[i % WORDS.length]!);
    if (i % 18 === 17) out.push('.\n');
  }
  return out.join(' ') + '.';
}

let engine: LinguisticEngine;

beforeAll(async () => {
  engine = new LinguisticEngine(createTestHarperLinter('en-US'));
  await engine.initialize();
}, 60_000);
afterAll(async () => {
  await engine.shutdown();
});

function request(text: string): AnalysisRequest {
  return {
    requestId: 'p',
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

async function median(text: string, runs = 5): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await engine.analyze(request(text));
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)]!;
}

describe('engine performance (§2.9)', () => {
  it('100-word document', async () => {
    const ms = await median(doc(100));
    console.info(`  100 words: ${ms.toFixed(1)} ms (median)`);
    expect(ms).toBeLessThan(300);
  });

  it('500-word document', async () => {
    const ms = await median(doc(500));
    console.info(`  500 words: ${ms.toFixed(1)} ms (median)`);
    expect(ms).toBeLessThan(800);
  });

  it('2,000-word document', async () => {
    const ms = await median(doc(2000), 3);
    console.info(`  2000 words: ${ms.toFixed(1)} ms (median)`);
    expect(ms).toBeLessThan(3000);
  });

  it('10,000-word document completes and stays bounded', async () => {
    const t0 = performance.now();
    const res = await engine.analyze(request(doc(10_000)));
    const ms = performance.now() - t0;
    console.info(`  10000 words: ${ms.toFixed(1)} ms`);
    expect(res.suggestions).toBeDefined();
    expect(ms).toBeLessThan(15_000);
  }, 30_000);

  it('computing DocumentInsights adds only a small deterministic overhead (§12, §3.8)', async () => {
    const text = doc(500);
    const withRuns: number[] = [];
    const withoutRuns: number[] = [];
    for (let i = 0; i < 7; i++) {
      const a = performance.now();
      await engine.analyze({ ...request(text), withInsights: false });
      withoutRuns.push(performance.now() - a);
      const b = performance.now();
      await engine.analyze({ ...request(text), withInsights: true });
      withRuns.push(performance.now() - b);
    }
    const med = (xs: number[]): number =>
      [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    const overhead = med(withRuns) - med(withoutRuns);
    console.info(`  insights overhead (500 words): ${overhead.toFixed(1)} ms`);
    // Stats + readability + tone + score are all linear regex/arithmetic passes.
    expect(overhead).toBeLessThan(50);
  });
});
