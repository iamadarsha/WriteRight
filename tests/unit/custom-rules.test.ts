import { describe, it, expect } from 'vitest';
import { runCustomRules } from '@/engine/rules/rule-engine';
import type { RuleContext } from '@/engine/rules/rule-types';
import { findProtectedSpans } from '@/core/protected-spans';

function ctx(text: string, over: Partial<RuleContext> = {}): RuleContext {
  return {
    protectedSpans: findProtectedSpans(text),
    buzzwords: [],
    styleChecksEnabled: true,
    readabilityEnabled: true,
    ...over,
  };
}

function ids(text: string, over?: Partial<RuleContext>): string[] {
  return runCustomRules(text, ctx(text, over)).map((f) => f.ruleId);
}

describe('repeated-spaces (§2.4)', () => {
  it('flags a double space mid-line', () => {
    const f = runCustomRules('Two  spaces here', ctx('Two  spaces here'));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      ruleId: 'wr:repeated-spaces',
      replacements: [' '],
      canAutoApply: true,
    });
  });
  it('does NOT flag leading indentation or single spaces', () => {
    expect(ids('  indented line')).not.toContain('wr:repeated-spaces');
    expect(ids('one two three')).not.toContain('wr:repeated-spaces');
  });
  it('does NOT flag spaces inside a code span', () => {
    expect(ids('run `a  b` please')).not.toContain('wr:repeated-spaces');
  });
});

describe('repeated-punctuation (§2.4)', () => {
  it('flags ",," and "!!!" but not "..."', () => {
    expect(ids('Wait,, stop!!!')).toEqual(
      expect.arrayContaining(['wr:repeated-punctuation']),
    );
    expect(ids('Well... maybe.')).not.toContain('wr:repeated-punctuation');
  });
  it('flags a space before punctuation', () => {
    const f = runCustomRules('Hello .', ctx('Hello .'));
    expect(f.some((x) => x.replacements[0] === '.')).toBe(true);
  });
});

describe('duplicate-word (§2.4)', () => {
  it('flags "the the"', () => {
    const f = runCustomRules('I saw the the dog.', ctx('I saw the the dog.'));
    expect(f[0]).toMatchObject({
      ruleId: 'wr:duplicate-word',
      replacements: ['the'],
    });
  });
  it('does NOT flag legitimate doubles or across a newline', () => {
    expect(ids('I know that that book is good.')).not.toContain(
      'wr:duplicate-word',
    );
    expect(ids('had had')).not.toContain('wr:duplicate-word');
    expect(ids('end.\nEnd of section')).not.toContain('wr:duplicate-word');
  });
  it('does NOT flag different case ("The the" at sentence start)', () => {
    expect(ids('The the')).not.toContain('wr:duplicate-word');
  });
});

describe('sentence-start-case (§2.4)', () => {
  it('flags a lowercase sentence start', () => {
    const f = runCustomRules(
      'Hello. this is wrong.',
      ctx('Hello. this is wrong.'),
    );
    const hit = f.find((x) => x.ruleId === 'wr:sentence-start-case');
    expect(hit).toMatchObject({ replacements: ['T'], original: 't' });
  });
  it('does NOT flag "i.e." or "e.g."', () => {
    expect(ids('Bring snacks. e.g. chips.')).not.toContain(
      'wr:sentence-start-case',
    );
  });
});

describe('filler-phrase + buzzword (§2.4, §11.2)', () => {
  it('flags "in order to" → "to"', () => {
    const f = runCustomRules(
      'We met in order to plan.',
      ctx('We met in order to plan.'),
    );
    const hit = f.find((x) => x.ruleId === 'wr:filler-phrase');
    expect(hit?.replacements).toContain('to');
    expect(hit?.canAutoApply).toBe(false);
  });
  it('flags default and user buzzwords', () => {
    expect(ids('Lets circle back on this.')).toContain('wr:buzzword');
    expect(
      ids('That is very webscale.', { buzzwords: ['webscale'] }),
    ).toContain('wr:buzzword');
  });
  it('style rules are silent when styleChecksEnabled is false', () => {
    expect(
      ids('We should circle back in order to plan.', {
        styleChecksEnabled: false,
      }),
    ).not.toEqual(expect.arrayContaining(['wr:buzzword', 'wr:filler-phrase']));
  });
});
