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
    requestId: 'r1',
    sessionId: 's1',
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
    ...over,
  };
}

describe('LinguisticEngine pipeline (§10.1, §21)', () => {
  it('comes up ready and passes the smoke test', () => {
    expect(engine.isReady()).toBe(true);
    expect(engine.getSmokeResult()?.ok).toBe(true);
  });

  it('produces spelling + grammar suggestions with valid offsets', async () => {
    const text = 'I havve a apple and he are happy.';
    const { suggestions } = await engine.analyze(req(text));
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(text.slice(s.start, s.end)).toBe(s.original);
      expect(s.sessionId).toBe('s1');
      expect(s.documentVersion).toBe(1);
    }
    expect(suggestions.some((s) => s.source === 'spell')).toBe(true);
  });

  it('a clean sentence yields nothing', async () => {
    const { suggestions } = await engine.analyze(
      req('The committee reviewed the report carefully before publishing it.'),
    );
    expect(suggestions).toEqual([]);
  });

  it('custom rules fire: repeated spaces + duplicate word', async () => {
    const { suggestions } = await engine.analyze(
      req('This  has the the problem.'),
    );
    expect(suggestions.some((s) => s.ruleId === 'wr:repeated-spaces')).toBe(
      true,
    );
    expect(suggestions.some((s) => s.ruleId === 'wr:duplicate-word')).toBe(
      true,
    );
  });

  it('does not flag inside a URL or code span (§10.2)', async () => {
    const { suggestions } = await engine.analyze(
      req('Visit https://example.com/teh/wrold and run `git psuh` now.'),
    );
    // "teh"/"wrold"/"psuh" are misspellings but they live in protected spans.
    expect(
      suggestions.every(
        (s) => !['teh', 'wrold', 'psuh'].includes(s.original.toLowerCase()),
      ),
    ).toBe(true);
  });

  it('respects disabledRuleIds', async () => {
    const text = 'This  has  extra  spaces.';
    const on = await engine.analyze(req(text));
    expect(on.suggestions.some((s) => s.ruleId === 'wr:repeated-spaces')).toBe(
      true,
    );
    const off = await engine.analyze(
      req(text, { disabledRuleIds: ['wr:repeated-spaces'] }),
    );
    expect(off.suggestions.some((s) => s.ruleId === 'wr:repeated-spaces')).toBe(
      false,
    );
  });

  it('respects the personal dictionary', async () => {
    const text = 'Our product Flindle is great.';
    const before = await engine.analyze(req(text));
    expect(before.suggestions.some((s) => s.original === 'Flindle')).toBe(true);

    await engine.setPersonalDictionary(['Flindle']);
    const after = await engine.analyze(req(text));
    expect(after.suggestions.some((s) => s.original === 'Flindle')).toBe(false);
    await engine.setPersonalDictionary([]);
  });

  it('style checks off → no buzzword/filler findings', async () => {
    const text = 'We should circle back in order to synergize.';
    const on = await engine.analyze(req(text, { styleChecksEnabled: true }));
    expect(on.suggestions.some((s) => s.source === 'style')).toBe(true);
    const off = await engine.analyze(req(text, { styleChecksEnabled: false }));
    expect(off.suggestions.some((s) => s.ruleId === 'wr:buzzword')).toBe(false);
  });

  it('merges overlapping findings — one winner per span (§21)', async () => {
    const { suggestions } = await engine.analyze(req('I havee a pencil.'));
    // No two suggestions should overlap after merge.
    for (let i = 0; i < suggestions.length; i++) {
      for (let j = i + 1; j < suggestions.length; j++) {
        const a = suggestions[i]!;
        const b = suggestions[j]!;
        expect(a.start < b.end && b.start < a.end).toBe(false);
      }
    }
  });

  it('cancel(requestId) short-circuits that request', async () => {
    engine.cancel('cancel-me');
    const res = await engine.analyze(
      req('I havve errors.', { requestId: 'cancel-me' }),
    );
    expect(res.suggestions).toEqual([]);
  });
});
