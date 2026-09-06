import { describe, it, expect } from 'vitest';
import { rewriteText } from '@/engine/rewrite-engine';
import { diffWords } from '@/ui/sidebar/word-diff';

describe('rewriteText — safe deterministic rewrites (§14.2)', () => {
  it('collapses repeated spaces and punctuation', () => {
    const r = rewriteText('Hello   world!!!  Really??');
    expect(r.text).toBe('Hello world! Really??');
    expect(r.changed).toBe(true);
  });

  it('removes filler intensifiers and leading filler', () => {
    const r = rewriteText('Basically, this is really very important.');
    expect(r.text).toBe('this is important.');
  });

  it('does not touch spacing inside a code span', () => {
    const r = rewriteText('Run `git   push` and also   tidy this.');
    expect(r.text).toContain('`git   push`');
    expect(r.text).toContain('also tidy'); // the unprotected double space collapsed
  });

  it('leaves a URL intact', () => {
    const r = rewriteText('Visit https://example.com/really/long/path now.');
    expect(r.text).toContain('https://example.com/really/long/path');
  });

  it('expands contractions only when asked', () => {
    expect(rewriteText("I can't do this, don't worry.").text).toBe(
      "I can't do this, don't worry.",
    );
    expect(
      rewriteText("I can't do this, don't worry.", {
        formalizeContractions: true,
      }).text,
    ).toBe('I cannot do this, do not worry.');
  });

  it('is a no-op on already-clean text', () => {
    const r = rewriteText('This sentence is already tidy and clear.');
    expect(r.changed).toBe(false);
    expect(r.changes).toEqual([]);
  });

  it('reports what it changed and why', () => {
    const r = rewriteText('Hello   world .');
    expect(r.changes.map((c) => c.reason)).toEqual(
      expect.arrayContaining([
        'Collapsed repeated spaces',
        'Removed a space before punctuation',
      ]),
    );
  });
});

describe('diffWords', () => {
  it('marks inserts and deletes', () => {
    const ops = diffWords('the quick brown fox', 'the slow brown fox');
    expect(
      ops.some((o) => o.type === 'delete' && o.text.includes('quick')),
    ).toBe(true);
    expect(
      ops.some((o) => o.type === 'insert' && o.text.includes('slow')),
    ).toBe(true);
    expect(ops.filter((o) => o.type === 'equal').length).toBeGreaterThan(0);
  });

  it('identical strings are all equal', () => {
    const ops = diffWords('same text here', 'same text here');
    expect(ops.every((o) => o.type === 'equal')).toBe(true);
  });
});
