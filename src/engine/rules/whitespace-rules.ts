/**
 * Whitespace & punctuation hygiene (§2.4). Near-certain, auto-applyable fixes.
 */

import type { RawFinding, StyleRule } from './rule-types';
import { isProtected, matchAll } from './rule-types';

/** Two or more spaces (not tabs/newlines) where one is intended. */
export const repeatedSpacesRule: StyleRule = {
  id: 'wr:repeated-spaces',
  label: 'Repeated spaces',
  appliesTo: () => true,
  check(text, ctx) {
    const out: RawFinding[] = [];
    for (const m of matchAll(/ {2,}/g, text)) {
      const start = m.index;
      const end = start + m[0].length;
      // A run of spaces at the start of a line can be deliberate indentation.
      if (text[start - 1] === '\n' || start === 0) continue;
      if (isProtected(start, end, ctx.protectedSpans)) continue;
      out.push({
        ruleId: this.id,
        source: 'punctuation',
        start,
        end,
        original: m[0],
        message: 'Remove the extra space.',
        explanation:
          'Consecutive spaces are usually a typing slip and can show up as an ' +
          'odd gap once the text is rendered elsewhere.',
        example: '“the  results” → “the results”',
        replacements: [' '],
        severity: 'info',
        confidence: 0.97,
        canAutoApply: true,
      });
    }
    return out;
  },
};

/**
 * Repeated punctuation: `,,` `;;` `..` `?!?!` `!!!` etc. Leaves a deliberate
 * `...` ellipsis and a single `?!` / `!?` alone.
 */
export const repeatedPunctuationRule: StyleRule = {
  id: 'wr:repeated-punctuation',
  label: 'Repeated punctuation',
  appliesTo: () => true,
  check(text, ctx) {
    const out: RawFinding[] = [];

    // Same mark repeated 2+ times (3+ for `.` so `...` survives).
    for (const m of matchAll(
      /([,;:])\1+|([!?])\2{2,}|(?<!\.)\.\.(?!\.)/g,
      text,
    )) {
      const start = m.index;
      const end = start + m[0].length;
      if (isProtected(start, end, ctx.protectedSpans)) continue;
      const mark = m[0][0] ?? '';
      out.push({
        ruleId: this.id,
        source: 'punctuation',
        start,
        end,
        original: m[0],
        message: `Use a single “${mark}”.`,
        explanation:
          'Doubled punctuation reads as a mistake in formal writing. A single ' +
          'mark carries the same meaning; use an ellipsis (…) deliberately if ' +
          'that is what you meant.',
        example: '“Wait,,” → “Wait,”',
        replacements: [mark],
        severity: 'info',
        confidence: 0.9,
        canAutoApply: true,
      });
    }

    // A space before sentence punctuation: "word ." → "word."
    for (const m of matchAll(/[ \t]+([,.;:!?])/g, text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (isProtected(start, end, ctx.protectedSpans)) continue;
      out.push({
        ruleId: this.id,
        source: 'punctuation',
        start,
        end,
        original: m[0],
        message: 'Remove the space before punctuation.',
        explanation:
          'In English, sentence punctuation sits directly against the word it ' +
          'follows, with the space after it.',
        example: '“done .” → “done.”',
        replacements: [m[1] ?? ''],
        severity: 'info',
        confidence: 0.93,
        canAutoApply: true,
      });
    }

    return out;
  },
};
