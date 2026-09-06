import { describe, it, expect } from 'vitest';
import {
  normalizeHarperFinding,
  normalizeRawFinding,
} from '@/engine/suggestion-normalizer';
import type { HarperFinding } from '@/engine/harper/harper-types';
import type { RawFinding } from '@/engine/rules/rule-types';

const ctx = {
  sessionId: 's',
  documentVersion: 3,
  snapshot: 'I havve a pencil.',
};

function harper(over: Partial<HarperFinding> = {}): HarperFinding {
  return {
    kind: 'Spelling',
    kindPretty: 'Spelling',
    start: 2,
    end: 7,
    problemText: 'havve',
    message: 'Did you mean...',
    replacements: [{ kind: 'replace', text: 'have' }],
    ruleId: 'harper:Spelling',
    ...over,
  };
}

describe('normalizeHarperFinding (§2.3, §10.3)', () => {
  it('maps a spelling finding to a Suggestion with matching offsets', () => {
    const s = normalizeHarperFinding(harper(), ctx)!;
    expect(s).toMatchObject({
      sessionId: 's',
      documentVersion: 3,
      source: 'spell',
      severity: 'error',
      start: 2,
      end: 7,
      original: 'havve',
      suggestions: ['have'],
      ruleId: 'harper:Spelling',
    });
    expect(s.canAutoApply).toBe(true);
    expect(s.originalHash).toBeTruthy();
  });

  it('drops a finding whose problemText no longer matches the snapshot', () => {
    expect(
      normalizeHarperFinding(harper({ problemText: 'DIFFERENT' }), ctx),
    ).toBeNull();
  });

  it('grammar findings are never auto-applyable (§9)', () => {
    const s = normalizeHarperFinding(
      harper({ kind: 'Agreement', problemText: 'havve' }),
      ctx,
    )!;
    expect(s.source).toBe('grammar');
    expect(s.canAutoApply).toBe(false);
  });

  it('translates a "remove" replacement to an empty string', () => {
    const s = normalizeHarperFinding(
      harper({ replacements: [{ kind: 'remove', text: '' }] }),
      ctx,
    )!;
    expect(s.suggestions).toEqual(['']);
  });

  it('translates "insert-after" to original + inserted text', () => {
    const s = normalizeHarperFinding(
      harper({ replacements: [{ kind: 'insert-after', text: 'x' }] }),
      ctx,
    )!;
    expect(s.suggestions).toEqual(['havvex']);
  });
});

describe('normalizeRawFinding', () => {
  it('carries source/severity/confidence/explanation through', () => {
    const raw: RawFinding = {
      ruleId: 'wr:duplicate-word',
      source: 'grammar',
      start: 0,
      end: 1,
      original: 'I',
      message: 'dup',
      replacements: ['I'],
      severity: 'warning',
      confidence: 0.82,
      explanation: 'why',
      canAutoApply: false,
    };
    const s = normalizeRawFinding(raw, ctx)!;
    expect(s).toMatchObject({
      ruleId: 'wr:duplicate-word',
      source: 'grammar',
      severity: 'warning',
      confidence: 0.82,
      explanation: 'why',
      canAutoApply: false,
    });
    // "I" === original, so the only replacement is filtered → no-op suggestion.
    expect(s.suggestions).toEqual([]);
  });
});
