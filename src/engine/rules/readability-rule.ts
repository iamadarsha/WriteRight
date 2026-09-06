/**
 * Inline clarity check (§12.3) — flags individual sentences that are likely
 * hard to read, so "understandability" is actionable at the point of the
 * problem instead of only a number in the sidebar.
 *
 * Deterministic and deliberately conservative: length is the primary signal
 * (it's unambiguous), with a secondary "too many clauses" case for shorter
 * sentences that still overload the reader. One finding per sentence, never an
 * auto-fix — the payoff is the explanation and (when local AI is on) the
 * "Rephrase" action on the card.
 */

import type { RawFinding, StyleRule } from './rule-types';
import { isProtected } from './rule-types';
import { sentences, words } from '@/core/segmenter';

/** A clear run-on — the message says "two or three sentences". */
const VERY_LONG_WORDS = 44;
/** Long enough that splitting almost always helps. */
const LONG_WORDS = 34;
/** Shorter, but only flagged when it also stacks up clauses. */
const DENSE_MIN_WORDS = 26;
const DENSE_MIN_CONNECTORS = 4;

/** Clause boundaries: semicolons, "comma + coordinator", and subordinators. */
const CONNECTOR_RE =
  /;|,\s+(?:and|but|or|nor|so|yet)\b|\b(?:which|who|whom|whose|because|although|though|whereas|while|since|unless|whenever)\b/gi;

function countConnectors(sentence: string): number {
  const m = sentence.match(CONNECTOR_RE);
  return m ? m.length : 0;
}

export const readabilityRule: StyleRule = {
  id: 'wr:hard-to-read-sentence',
  label: 'Hard-to-read sentences',
  appliesTo: (ctx) => ctx.readabilityEnabled,
  check(text, ctx) {
    const out: RawFinding[] = [];

    for (const s of sentences(text)) {
      if (isProtected(s.start, s.end, ctx.protectedSpans)) continue;

      const n = words(s.text).length;
      if (n < DENSE_MIN_WORDS) continue;

      // Clarity findings are always `info` — below errors/warnings in the list
      // and a single blue underline colour, regardless of how long. The
      // wording carries the degree.
      let message: string;
      let confidence: number;

      if (n >= VERY_LONG_WORDS) {
        confidence = 0.8;
        message = `This sentence runs to ${n} words. Breaking it into two or three shorter sentences will be much easier to follow.`;
      } else if (n >= LONG_WORDS) {
        confidence = 0.7;
        message = `This sentence is ${n} words long. A shorter sentence, or a split into two, usually reads more clearly.`;
      } else if (countConnectors(s.text) >= DENSE_MIN_CONNECTORS) {
        confidence = 0.55;
        message = `This sentence links several clauses together. Splitting it up will make each idea land.`;
      } else {
        continue;
      }

      out.push({
        ruleId: this.id,
        source: 'readability',
        start: s.start,
        end: s.end,
        original: s.text,
        message,
        explanation:
          'Long or multi-clause sentences make the reader hold more in mind at ' +
          'once. Shorter sentences — one idea each — are read faster and ' +
          'remembered better. This is a readability nudge, not an error; keep ' +
          'it if the length is deliberate.',
        example:
          '“The report, which was late, covered Q3, and because the numbers ' +
          'slipped it also proposed cuts.” → “The report was late. It covered ' +
          'Q3. Because the numbers slipped, it also proposed cuts.”',
        replacements: [],
        severity: 'info',
        confidence,
        canAutoApply: false,
      });
    }

    return out;
  },
};
