/**
 * Word-level checks (§2.4): consecutive duplicate words, and a lowercase letter
 * starting a sentence. Both are conservative — Harper also covers some of this,
 * and the merger drops duplicates (§21).
 */

import type { RawFinding, StyleRule } from './rule-types';
import { isProtected, matchAll } from './rule-types';

/**
 * "the the", "and and". Skips legitimate doublings ("had had", "that that",
 * "is is" as in "all that is is temporary") and hyphenated cases.
 */
const LEGIT_DOUBLES = new Set([
  'had had',
  'that that',
  'is is',
  'is is,',
  'so so',
  'no no',
  'blah blah',
  'ha ha',
  'bye bye',
  'night night',
  'pop pop',
  'boo boo',
  'yada yada',
]);

export const duplicateWordRule: StyleRule = {
  id: 'wr:duplicate-word',
  label: 'Repeated word',
  appliesTo: () => true,
  check(text, ctx) {
    const out: RawFinding[] = [];
    for (const m of matchAll(/\b([A-Za-z']+)(\s+)(\1)\b/gi, text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (isProtected(start, end, ctx.protectedSpans)) continue;

      const first = m[1] ?? '';
      const second = m[3] ?? '';
      // Only when the two words match case-sensitively (avoids "The the" at a
      // sentence boundary, which is usually a real capitalization choice) and
      // the separator is a single run of spaces (not a newline).
      if (first !== second) continue;
      if ((m[2] ?? '').includes('\n')) continue;
      if (LEGIT_DOUBLES.has(m[0].toLowerCase())) continue;
      // Single-letter "words" ("A a") are almost always intentional or noise.
      if (first.length < 2) continue;

      out.push({
        ruleId: this.id,
        source: 'grammar',
        start,
        end,
        original: m[0],
        message: `You wrote “${first}” twice.`,
        replacements: [first],
        severity: 'warning',
        confidence: 0.82,
        explanation:
          'The same word appears twice in a row — almost always a typing slip ' +
          'when moving words around. If it was intentional for emphasis, ignore this.',
        example: '“send the the file” → “send the file”',
        canAutoApply: false,
      });
    }
    return out;
  },
};

/**
 * A sentence that starts with a lowercase letter. Deliberately conservative —
 * Harper's `Capitalization` rules cover most of this. We only fire when the
 * boundary is unambiguous: the document start, or a `. ` where the word before
 * the period is a real word (≥3 letters, not an abbreviation like "e.g.").
 */
const ABBREVIATION_BEFORE =
  /(?:^|\s)(?:[a-z]{1,2}|etc|vs|mr|mrs|ms|dr|prof|no|al|st|approx|dept|est|fig|inc|jr|sr|govt)\.$/i;

export const sentenceStartCaseRule: StyleRule = {
  id: 'wr:sentence-start-case',
  label: 'Sentence capitalization',
  appliesTo: () => true,
  check(text, ctx) {
    const out: RawFinding[] = [];
    for (const m of matchAll(/(^|[.!?]["')\]]?\s+)([a-z])/g, text)) {
      const lead = m[1] ?? '';
      const letterIndex = m.index + lead.length;
      const letter = m[2] ?? '';
      if (isProtected(letterIndex, letterIndex + 1, ctx.protectedSpans))
        continue;

      // The "sentence" itself looks like an abbreviation: "e.g.", "i.e.", "a.m."
      if (/^[a-z]\.[a-z]\.?/i.test(text.slice(letterIndex, letterIndex + 4))) {
        continue;
      }

      if (m.index > 0) {
        // Text immediately before the sentence-ending punctuation.
        const before = text.slice(Math.max(0, m.index - 12), m.index + 1);
        if (ABBREVIATION_BEFORE.test(before)) continue;
        // Require a real word (3+ letters) right before the period.
        if (!/[A-Za-z]{3}[.!?]$/.test(before.replace(/["')\]]$/, ''))) continue;
      }

      out.push({
        ruleId: this.id,
        source: 'grammar',
        start: letterIndex,
        end: letterIndex + 1,
        original: letter,
        message: 'Start the sentence with a capital letter.',
        explanation:
          'A new sentence begins with a capital. This is flagged only where ' +
          'the sentence boundary is unambiguous, so it is safe to apply.',
        example: '“…done. next, we…” → “…done. Next, we…”',
        replacements: [letter.toUpperCase()],
        severity: 'warning',
        confidence: 0.78,
        canAutoApply: false,
      });
    }
    return out;
  },
};
