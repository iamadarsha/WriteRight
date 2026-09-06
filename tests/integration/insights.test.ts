import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHarperLinter } from '../support/harper';
import { LinguisticEngine } from '@/engine/linguistic-engine';
import type { AnalysisRequest } from '@/engine/engine-host';

let engine: LinguisticEngine;

beforeAll(async () => {
  engine = new LinguisticEngine(createTestHarperLinter('en-US'));
  await engine.initialize();
}, 60_000);
afterAll(async () => {
  await engine.shutdown();
});

function req(
  text: string,
  over: Partial<AnalysisRequest> = {},
): AnalysisRequest {
  return {
    requestId: 'r',
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
    withInsights: true,
    ...over,
  };
}

const ESSAY =
  'The committee reviewed the proposal carefully. Every member raised ' +
  'concerns about the budget. After a long discussion, the group agreed to ' +
  'revise the plan and meet again next week. The revised plan was circulated ' +
  'to all members before the meeting.';

describe('DocumentInsights via the pipeline (§12, §13)', () => {
  it('are absent when withInsights is false, present when true', async () => {
    expect(
      (await engine.analyze(req(ESSAY, { withInsights: false }))).insights,
    ).toBeNull();
    expect((await engine.analyze(req(ESSAY))).insights).not.toBeNull();
  });

  it('reports stats, readability, tone and a transparent score', async () => {
    const { insights } = await engine.analyze(req(ESSAY));
    expect(insights).not.toBeNull();
    const i = insights!;
    expect(i.stats.words).toBeGreaterThan(30);
    expect(i.stats.sentences).toBeGreaterThanOrEqual(4);
    expect(i.readability.sufficientText).toBe(true);
    expect(i.tone.label).toMatch(/Likely|Possibly|Leaning|unclear/);
    expect(i.score.score).toBeGreaterThan(0);
    expect(i.score.score).toBeLessThanOrEqual(100);
    const w = i.score.components.reduce((a, c) => a + c.weight, 0);
    expect(Math.round(w * 100) / 100).toBe(1);
  });

  it('the score reflects the suggestion count', async () => {
    const clean = await engine.analyze(req(ESSAY));
    const messy = await engine.analyze(
      req(
        'The teh comittee reveiwed teh propsal carefuly. It was recieved wel.',
      ),
    );
    expect(clean.insights!.score.score).toBeGreaterThan(
      messy.insights!.score.score,
    );
    expect(messy.insights!.suggestionCounts.error).toBeGreaterThan(0);
  });

  it('the score is deterministic for identical input (§ gate)', async () => {
    const a = await engine.analyze(req(ESSAY));
    const b = await engine.analyze(req(ESSAY));
    expect(a.insights!.score).toEqual(b.insights!.score);
    expect(a.insights!.tone.primary).toBe(b.insights!.tone.primary);
  });

  it('a format preset relaxes non-preset custom rules', async () => {
    const text = 'We should circle back on this synergy.';
    const noPreset = await engine.analyze(req(text));
    const creative = await engine.analyze(req(text, { presetId: 'creative' }));
    expect(noPreset.suggestions.some((s) => s.ruleId === 'wr:buzzword')).toBe(
      true,
    );
    expect(creative.suggestions.some((s) => s.ruleId === 'wr:buzzword')).toBe(
      false,
    );
  });
});
