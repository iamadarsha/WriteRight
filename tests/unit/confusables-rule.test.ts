import { describe, it, expect } from 'vitest';
import { confusablesRule } from '@/engine/rules/confusables-rule';
import type { RuleContext } from '@/engine/rules/rule-types';

const ctx: RuleContext = {
  protectedSpans: [],
  buzzwords: [],
  styleChecksEnabled: true,
};

function flags(
  text: string,
): Array<{ text: string; fix: string[]; id: string }> {
  return confusablesRule.check(text, ctx).map((f) => ({
    id: f.ruleId,
    text: text.slice(f.start, f.end),
    fix: [...f.replacements],
  }));
}

describe('confusablesRule (§2.4)', () => {
  describe('to / too', () => {
    it.each([
      ['This is to much detail.', 'to', 'too'],
      ['There are to many bugs.', 'to', 'too'],
      ['It is to late now.', 'to', 'too'],
      ['I want to come to the workshop to.', 'to', 'too'], // sentence-final
    ])('flags %j', (text, hit, fix) => {
      const f = flags(text).find((x) => x.id.startsWith('wr:confuse-to-too'));
      expect(f?.text).toBe(hit);
      expect(f?.fix).toContain(fix);
    });

    it.each([
      'I need to review this first.',
      'This is too much detail.',
      'We drove to Boston to see the office.',
      "I'd love to.", // elided infinitive — must not fire
      'She has to.',
    ])('stays quiet on %j', (text) => {
      expect(
        flags(text).some((x) => x.id.startsWith('wr:confuse-to-too')),
      ).toBe(false);
    });
  });

  describe('your / you’re', () => {
    it.each([
      ['Your welcome to join.', 'Your', "You're"],
      ['I think your right about that.', 'your', "you're"],
      ['Your going to love it.', 'Your', "You're"],
    ])('flags %j', (text, hit, fix) => {
      const f = flags(text).find((x) => x.id.startsWith('wr:confuse-your'));
      expect(f?.text).toBe(hit);
      expect(f?.fix).toContain(fix);
    });

    it.each([
      'Please send your feedback by Friday.',
      "You're welcome to join.",
      'Your team did great work.',
      'Check your welcome email for the link.', // possessive "your welcome email"
      'Raise your right hand.',
    ])('stays quiet on %j', (text) => {
      expect(flags(text).some((x) => x.id.startsWith('wr:confuse-your'))).toBe(
        false,
      );
    });
  });

  describe('its / it’s', () => {
    it('flags contraction contexts', () => {
      expect(flags('Its a great day.')[0]).toMatchObject({
        text: 'Its',
        fix: ["It's"],
      });
      expect(flags('I think its been fixed.')[0]?.text).toBe('its');
      expect(flags("It's time to ship it — its now or never.")).toContainEqual(
        expect.objectContaining({ text: 'its', fix: ["it's"] }),
      );
    });

    it.each([
      'The team shipped its first release.',
      'Each service manages its own state.',
      "It's been a long week.",
      'The library kept its original API surface.',
      'Reset the counter to its time zone default.', // possessive "its time zone"
    ])('stays quiet on %j', (text) => {
      expect(
        flags(text).some((x) => x.id === 'wr:confuse-its-contraction'),
      ).toBe(false);
    });
  });

  describe('loose / lose', () => {
    it.each([
      'We might loose the contract.',
      "Don't loose your notes.",
      'You could loose access.',
    ])('flags %j', (text) => {
      const f = flags(text).find((x) => x.id.startsWith('wr:confuse-loose'));
      expect(f?.text).toBe('loose');
      expect(f?.fix).toContain('lose');
    });

    it.each([
      'The connector felt loose.',
      "We don't want to lose the contract.",
      'Loose the reins a little.', // release — valid
    ])('stays quiet on %j', (text) => {
      expect(flags(text).some((x) => x.id.startsWith('wr:confuse-loose'))).toBe(
        false,
      );
    });
  });

  describe('their / they’re', () => {
    it('flags "their <gerund>" outside a preposition phrase', () => {
      expect(flags('I know their coming to the review.')[0]).toMatchObject({
        text: 'their',
        fix: ["they're"],
      });
    });
    it.each([
      'Their proposal was approved.',
      'I object to their leaving so early.', // gerund after preposition
      'We disapprove of their spending.',
    ])('stays quiet on %j', (text) => {
      expect(flags(text).some((x) => x.id === 'wr:confuse-their-theyre')).toBe(
        false,
      );
    });
  });

  describe('then / than', () => {
    it.each([
      'She would rather wait then rush it.',
      'This is better then that.',
      'It took longer then before.',
    ])('flags %j', (text) => {
      const f = flags(text).find((x) => x.id.startsWith('wr:confuse'));
      expect(f?.text.toLowerCase()).toBe('then');
      expect(f?.fix).toContain('than');
    });

    it.each([
      'Finish the draft, then send it.',
      'If the test passes, then we deploy.',
      'We reviewed it and then merged.',
    ])('stays quiet on %j', (text) => {
      expect(flags(text).some((x) => x.fix.includes('than'))).toBe(false);
    });
  });

  describe('subject–verb (pronoun)', () => {
    it.each([
      ['She don’t know.', 'don’t', "doesn't"],
      ["He don't care.", "don't", "doesn't"],
      ['I were going to call.', 'were', 'was'],
    ])('flags %j', (text, hit, fix) => {
      const f = flags(text).find((x) => x.id.startsWith('wr:agree'));
      expect(f?.text).toBe(hit);
      expect(f?.fix).toContain(fix);
    });

    it.each([
      "She doesn't know.",
      'If I were you, I would wait.',
      'I wish I were done.',
      'They were going to call.',
    ])('stays quiet on %j', (text) => {
      expect(flags(text).some((x) => x.id.startsWith('wr:agree'))).toBe(false);
    });
  });

  it('respects protected spans', () => {
    const text = 'Set its_value to much_data.';
    const protectedSpans = [
      { start: 4, end: 13, text: 'its_value', kind: 'identifier' as const },
      { start: 17, end: 26, text: 'much_data', kind: 'identifier' as const },
    ];
    expect(
      confusablesRule.check(text, { ...ctx, protectedSpans }),
    ).toHaveLength(0);
  });
});
