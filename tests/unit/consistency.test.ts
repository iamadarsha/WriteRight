import { describe, it, expect } from 'vitest';
import { assessConsistency } from '@/engine/consistency';

const kinds = (text: string): string[] =>
  assessConsistency(text).findings.map((f) => f.kind);

describe('assessConsistency (§12.2)', () => {
  it('clean prose has no findings and scores 100', () => {
    const clean =
      'The team shipped the update on time. Each change was reviewed ' +
      'carefully. Feedback was collected and folded in before release.';
    const a = assessConsistency(clean);
    expect(a.findings).toEqual([]);
    expect(a.value).toBe(100);
    expect(a.note.length).toBeGreaterThan(0);
  });

  it('flags a US/GB spelling mix within one document', () => {
    expect(
      kinds('She organised the colour scheme, then fixed the color.'),
    ).toContain('dialect-spelling');
    // one dialect used consistently is fine
    expect(
      kinds('She organised the colour scheme this afternoon.'),
    ).not.toContain('dialect-spelling');
  });

  it('flags mixed straight and curly double quotes', () => {
    expect(
      kinds('He said "hello" to one group and “goodbye” to the other.'),
    ).toContain('quote-style');
  });

  it('flags inconsistent spacing after sentence punctuation', () => {
    const mixed =
      'First sentence here. Second one now.  Third one after two spaces. ' +
      'Fourth one after one.';
    expect(kinds(mixed)).toContain('sentence-spacing');
  });

  it('flags a word that appears both hyphenated and closed', () => {
    expect(
      kinds('Send me an e-mail today. I already sent you an email yesterday.'),
    ).toContain('hyphenation');
  });

  it('a document with several inconsistencies scores well below 100', () => {
    const messy =
      'We organise the colour palette. We organized the color too.  ' +
      'Then we sent an e-mail, and later an email. He said "hi" and ' +
      '“bye” as well.';
    const a = assessConsistency(messy);
    expect(a.value).toBeLessThan(75);
    expect(a.note).not.toMatch(/consistent/i);
  });

  it('does not flag ordinary hyphenated compounds with no closed form', () => {
    expect(
      kinds('This is a well-known, state-of-the-art, user-friendly tool.'),
    ).toEqual([]);
  });
});
