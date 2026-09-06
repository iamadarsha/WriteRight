import { describe, it, expect } from 'vitest';
import { mergeSuggestions } from '@/engine/suggestion-merger';
import type { Suggestion } from '@/types/suggestion';

function s(over: Partial<Suggestion>): Suggestion {
  return {
    id: Math.random().toString(36),
    sessionId: 's',
    documentVersion: 1,
    source: 'grammar',
    start: 0,
    end: 4,
    original: 'test',
    originalHash: 'h',
    message: 'm',
    suggestions: ['fix'],
    severity: 'warning',
    confidence: 0.7,
    canAutoApply: false,
    ...over,
  };
}

describe('mergeSuggestions (§21)', () => {
  it('keeps non-overlapping suggestions', () => {
    const out = mergeSuggestions([
      s({ start: 0, end: 3 }),
      s({ start: 10, end: 14 }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('drops exact duplicates', () => {
    const out = mergeSuggestions([
      s({
        start: 0,
        end: 3,
        source: 'spell',
        suggestions: ['the'],
        message: 'x',
      }),
      s({
        start: 0,
        end: 3,
        source: 'spell',
        suggestions: ['the'],
        message: 'x',
      }),
    ]);
    expect(out).toHaveLength(1);
  });

  it('at one span, the spelling error beats the style hint (§21)', () => {
    const out = mergeSuggestions([
      s({
        start: 5,
        end: 10,
        source: 'style',
        severity: 'info',
        confidence: 0.5,
      }),
      s({
        start: 5,
        end: 10,
        source: 'spell',
        severity: 'error',
        confidence: 0.9,
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe('spell');
  });

  it('prefers the more specific (smaller) span on a tie', () => {
    const out = mergeSuggestions([
      s({
        start: 0,
        end: 20,
        source: 'grammar',
        severity: 'error',
        confidence: 0.8,
      }),
      s({
        start: 3,
        end: 6,
        source: 'grammar',
        severity: 'error',
        confidence: 0.8,
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ start: 3, end: 6 });
  });

  it('returns suggestions sorted by position', () => {
    const out = mergeSuggestions([
      s({ start: 30, end: 33 }),
      s({ start: 2, end: 5 }),
      s({ start: 15, end: 18 }),
    ]);
    expect(out.map((x) => x.start)).toEqual([2, 15, 30]);
  });
});
