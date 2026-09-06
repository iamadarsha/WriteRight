import { describe, it, expect } from 'vitest';
import { readabilityRule } from '@/engine/rules/readability-rule';
import type { RuleContext } from '@/engine/rules/rule-types';
import { findProtectedSpans } from '@/core/protected-spans';

/**
 * §12.3 inline clarity check. Deliberately conservative — the precision floor
 * in `npm run eval:engine` covers the "does not fire on normal prose" side; the
 * cases here pin the thresholds and the message wording.
 */

function ctx(text: string, over: Partial<RuleContext> = {}): RuleContext {
  return {
    protectedSpans: findProtectedSpans(text),
    buzzwords: [],
    styleChecksEnabled: true,
    readabilityEnabled: true,
    ...over,
  };
}

const run = (text: string, over?: Partial<RuleContext>) => {
  const c = ctx(text, over);
  return readabilityRule.appliesTo(c) ? readabilityRule.check(text, c) : [];
};

/** Build a sentence of exactly `n` words. */
const sentence = (n: number): string =>
  Array.from({ length: n }, (_, i) => (i === 0 ? 'The' : `word${i}`)).join(
    ' ',
  ) + '.';

describe('readabilityRule (§12.3)', () => {
  it('is silent on short and medium sentences', () => {
    expect(run('This is a short sentence. Here is another one.')).toEqual([]);
    expect(run(sentence(20))).toEqual([]);
    expect(run(sentence(33))).toEqual([]);
  });

  it('flags a long sentence (34+ words) as info, with no auto-fix', () => {
    const found = run(sentence(36));
    expect(found).toHaveLength(1);
    expect(found[0]!.source).toBe('readability');
    expect(found[0]!.severity).toBe('info');
    expect(found[0]!.ruleId).toBe('wr:hard-to-read-sentence');
    expect(found[0]!.replacements).toEqual([]);
    expect(found[0]!.canAutoApply).toBe(false);
    expect(found[0]!.message).toMatch(/36 words/);
  });

  it('uses the stronger "two or three sentences" wording past 44 words', () => {
    const found = run(sentence(50));
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toMatch(/two or three/i);
  });

  it('spans the whole sentence and matches the snapshot slice', () => {
    const lead = 'Fine. ';
    const text = lead + sentence(40);
    const [f] = run(text);
    expect(f).toBeDefined();
    expect(text.slice(f!.start, f!.end)).toBe(f!.original);
    expect(f!.start).toBe(lead.length);
  });

  it('flags a shorter sentence only when it stacks up clauses', () => {
    // ~28 words, but 4 clause connectors — a dense sentence.
    const dense =
      'The plan shifted because the budget slipped, and although the team ' +
      'pushed back, the timeline held, which meant the launch, while risky, ' +
      'stayed on the calendar.';
    const found = run(dense);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toMatch(/clauses/i);

    // Same length, one clause — left alone.
    const plain = sentence(28).replace(/word1/, 'and');
    expect(run(plain)).toEqual([]);
  });

  it('does nothing when the toggle is off', () => {
    expect(run(sentence(60), { readabilityEnabled: false })).toEqual([]);
  });

  it('skips a long run that sits inside a protected span (code block)', () => {
    const code = '```\n' + sentence(50) + '\n```';
    expect(run(code)).toEqual([]);
  });

  it('handles a long trailing fragment with no terminator', () => {
    const found = run(sentence(40).replace(/\.$/, ''));
    expect(found).toHaveLength(1);
  });
});
