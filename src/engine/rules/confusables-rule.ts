/**
 * High-frequency confusable-word checks (§2.4) — the errors Harper misses that
 * a reader still expects a writing assistant to catch: to/too, your/you're,
 * its/it's, loose/lose, and a few pronoun–verb agreement slips.
 *
 * Every pattern is deliberately narrow. Each match is the exact wrong token
 * (via lookahead / lookbehind), guarded so the correct use of the same word
 * never fires. Precision-over-recall (§35): a rule that flags correct text is
 * worse than one that stays quiet. `scripts/eval-engine.ts` tracks both.
 */

import type { RawFinding, StyleRule } from './rule-types';
import { isProtected, matchAll } from './rule-types';

interface Confusable {
  readonly id: string;
  /** Matches the wrong token itself (use lookahead/lookbehind for context). */
  readonly re: RegExp;
  readonly fix: readonly string[];
  readonly message: string;
  readonly explanation: string;
  readonly example: string;
  readonly severity: 'error' | 'warning';
  readonly confidence: number;
  /** Return true to discard a match (correct use in disguise). */
  readonly reject?: (m: RegExpExecArray, text: string) => boolean;
}

/** Degree words: "to <one of these>" is reliably "too". */
const DEGREE =
  'much|many|little|few|late|early|soon|far|big|small|large|short|long|slow|' +
  'fast|hard|easy|old|young|high|low|hot|cold|expensive|cheap|good|bad|weak|' +
  'strong|heavy|light|tight|loose|close|busy|tired|complex|complicated|simple|' +
  'broad|narrow|vague|risky|aggressive|conservative|quiet|loud|dark|bright|' +
  'often|rarely|frequently|slowly|quickly';

/** Contraction-only contexts for "it's" / "you're". Never possessive. */
const ITS_CONTRACTION =
  'been|a|an|the|not|no|going|getting|becoming|gonna|just|also|still|now|' +
  'clear|unclear|important|possible|impossible|likely|unlikely|obvious|true|' +
  'false|hard|easy|difficult|too|so|very|really|all|my|your|our|his|her|their|' +
  'time';

const YOURE_FOLLOWERS =
  'welcome|going|doing|getting|being|coming|making|taking|seeing|saying|' +
  'kidding|joking|gonna|not';

const LOOSE_OBJECT =
  'the|your|my|our|their|his|her|its|a|all|it|them|this|that|these|those|' +
  'weight|money|track|control|interest|faith|hope|sight|momentum|access|' +
  'customers?|clients?|users?|subscribers?';

/** Curly OR straight apostrophe — autocorrect and manual typing both occur. */
const APOS = "['’]";

/** Verbs / phrases that legitimately end a clause with a bare "to". */
const INFINITIVE_TAIL =
  'want|wants|wanted|have|has|had|need|needs|needed|going|able|unable|' +
  'supposed|used|like|likes|liked|love|hate|try|tried|plan|planned|hope|' +
  'hoped|wish|ought|get|got|meant|expect|expected|willing|allowed|' +
  'forgot|forgotten|refuse|refused|hesitate|hesitated|intend|intended';

const CONFUSABLES: readonly Confusable[] = [
  {
    id: 'wr:confuse-to-too',
    re: new RegExp(`\\bto\\b(?=\\s+(?:${DEGREE})\\b)`, 'gi'),
    fix: ['too'],
    message: '“to” before a describing word is usually “too”.',
    explanation:
      '“Too” means excessively or also; “to” points somewhere or marks an ' +
      'infinitive. Before a word like “much”, “many”, or “late” you want “too”.',
    example: '“to much detail” → “too much detail”',
    severity: 'warning',
    confidence: 0.9,
  },
  {
    id: 'wr:confuse-to-too-final',
    re: /\bto\b(?=\s*[.!?](?:\s|$))/gi,
    fix: ['too'],
    message: 'At the end of a sentence like this, “to” is usually “too”.',
    explanation:
      'A sentence ending in a bare “to” is almost always a typo for “too” ' +
      '(meaning “also”) — unless the verb before it takes an infinitive ' +
      '(“I’d love to.”), which is left alone.',
    example: '“…come to the workshop to.” → “…too.”',
    severity: 'warning',
    confidence: 0.82,
    reject: (m, text) => {
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      return new RegExp(`\\b(?:${INFINITIVE_TAIL})\\s+$`, 'i').test(before);
    },
  },
  {
    id: 'wr:confuse-your-youre',
    re: new RegExp(`\\byour\\b(?=\\s+(?:${YOURE_FOLLOWERS})\\b)`, 'gi'),
    fix: ["you're"],
    message: '“your” should be “you’re” (you are) here.',
    explanation:
      '“You’re” is “you are”. “Your” shows possession (“your file”). Before ' +
      '“welcome”, “going”, “doing” and the like, you want “you’re”.',
    example: '“Your welcome to join” → “You’re welcome to join”',
    severity: 'warning',
    confidence: 0.88,
    reject: (m, text) => {
      // "your welcome message / email / packet" is a real possessive.
      const after = text.slice(m.index + m[0].length).trimStart();
      return /^welcome\s+(?:message|email|note|packet|kit|gift|letter|pack|bonus)\b/i.test(
        after,
      );
    },
  },
  {
    id: 'wr:confuse-your-youre-right',
    re: /\byour\b(?=\s+(?:right|wrong|correct|mistaken)(?:\s*[.,!?]|\s+(?:about|that|there|when|to)\b))/gi,
    fix: ["you're"],
    message: '“your” should be “you’re” (you are) here.',
    explanation:
      '“You’re right” = “you are right”. “Your” before an adjective that ' +
      'describes *you* is “you’re”.',
    example: '“I think your right” → “I think you’re right”',
    severity: 'warning',
    confidence: 0.85,
  },
  {
    id: 'wr:confuse-its-contraction',
    re: new RegExp(`\\bits\\b(?=\\s+(?:${ITS_CONTRACTION})\\b)`, 'gi'),
    fix: ["it's"],
    message: '“its” should be “it’s” (it is / it has) here.',
    explanation:
      '“It’s” is “it is” or “it has”. “Its” is possessive (“its colour”). ' +
      'Before “a”, “been”, “not”, “going” and the like, you want “it’s”.',
    example: '“Its been fixed” → “It’s been fixed”',
    severity: 'warning',
    confidence: 0.9,
    reject: (m, text) => {
      // "its time" is a contraction only in "its time to/for"; "its time zone"
      // etc. is possessive.
      const after = text.slice(m.index + m[0].length).trimStart();
      return /^time\b(?!\s+(?:to|for)\b)/i.test(after);
    },
  },
  {
    id: 'wr:confuse-loose-lose',
    re: new RegExp(
      `(?<=\\b(?:might|may|will|would|could|can|to|gonna|not|don${APOS}t|won${APOS}t|shouldn${APOS}t|wouldn${APOS}t|couldn${APOS}t)\\s)loose\\b`,
      'gi',
    ),
    fix: ['lose'],
    message: '“loose” should be “lose” — you mean the verb.',
    explanation:
      '“Lose” is the verb (to misplace, to be defeated). “Loose” is an ' +
      'adjective (not tight). After a word like “might” or “to” you want “lose”.',
    example: '“might loose the contract” → “might lose the contract”',
    severity: 'warning',
    confidence: 0.9,
  },
  {
    id: 'wr:confuse-loose-lose-object',
    re: new RegExp(`\\bloose\\b(?=\\s+(?:${LOOSE_OBJECT})\\b)`, 'gi'),
    fix: ['lose'],
    message: '“loose” should be “lose” — you mean the verb.',
    explanation:
      '“Lose” is the verb here (to misplace, to be defeated). “Loose” only ' +
      'means “not tight”.',
    example: '“don’t loose your notes” → “don’t lose your notes”',
    severity: 'warning',
    confidence: 0.85,
    reject: (m, text) => {
      // "loose the reins/rope/knot/screw" — releasing something — is valid.
      const after = text.slice(m.index + m[0].length).trimStart();
      return /^(?:the\s+)?(?:reins?|rope|knot|screw|straps?|laces?|bolt)\b/i.test(
        after,
      );
    },
  },
  {
    id: 'wr:confuse-their-theyre',
    re: /\btheir\b(?=\s+\w+ing\b)/gi,
    fix: ["they're"],
    message: '“their” should be “they’re” (they are) here.',
    explanation:
      '“They’re” is “they are”. Before an -ing verb like “coming” or “going”, ' +
      'that’s what you want — unless a preposition before it makes it a ' +
      'phrase like “of their leaving”, which is left alone.',
    example: '“I know their coming” → “I know they’re coming”',
    severity: 'warning',
    confidence: 0.82,
    reject: (m, text) => {
      const before = text.slice(Math.max(0, m.index - 24), m.index);
      // "of / to / about / at / on / for / with / against their <gerund>" is a
      // real possessive-gerund construction.
      return /\b(?:of|to|about|at|on|for|with|against|despite|regarding|from|by|after|before|without)\s+$/i.test(
        before,
      );
    },
  },
  {
    id: 'wr:confuse-rather-then',
    re: /(?<=\brather\s(?:\w+\s){0,3}?)then\b/gi,
    fix: ['than'],
    message: '“then” should be “than” — “rather … than” is a comparison.',
    explanation:
      '“Rather X than Y” weighs one option against another. “Than” is the ' +
      'comparison word; “then” is about time.',
    example: '“rather wait then rush it” → “rather wait than rush it”',
    severity: 'warning',
    confidence: 0.85,
  },
  {
    id: 'wr:confuse-then-than',
    re: /\bthen\b(?=\s+(?:that|this|the|a|an|any|expected|planned|usual|before|ever|most|before)\b|\s*[.,!?])/gi,
    fix: ['than'],
    message: '“then” should be “than” — this is a comparison.',
    explanation:
      '“Than” compares two things; “then” is about time or sequence. After a ' +
      'comparative word (“better”, “more”, “rather”, “longer”) you want “than”.',
    example: '“better then before” → “better than before”',
    severity: 'warning',
    confidence: 0.8,
    reject: (m, text) => {
      const before = text.slice(Math.max(0, m.index - 60), m.index);
      // Only a comparison: a comparative -er word, or more/less/rather/other/
      // better/worse/fewer/greater/sooner earlier in the clause.
      return !/\b(?:more|less|rather|other|better|worse|fewer|greater|sooner|later|older|younger|bigger|smaller|higher|lower|faster|slower|longer|shorter|harder|easier|cheaper|\w+er)\b[^.!?]*$/i.test(
        before,
      );
    },
  },
  {
    id: 'wr:agree-he-dont',
    re: new RegExp(`(?<=\\b(?:he|she|it)\\s)don${APOS}t\\b`, 'gi'),
    fix: ["doesn't"],
    message: '“he/she/it” takes “doesn’t”, not “don’t”.',
    explanation:
      'A singular subject (he, she, it) pairs with “doesn’t”. “Don’t” goes ' +
      'with I / you / we / they.',
    example: '“She don’t know” → “She doesn’t know”',
    severity: 'warning',
    confidence: 0.92,
  },
  {
    id: 'wr:agree-i-were',
    re: /(?<=\bI\s)were\b/g,
    fix: ['was'],
    message: '“I” takes “was”, not “were”.',
    explanation:
      '“I was” is the past tense. “I were” is only correct in a hypothetical ' +
      '(“if I were you”) — flagged only outside that.',
    example: '“I were going to call” → “I was going to call”',
    severity: 'warning',
    confidence: 0.85,
    reject: (m, text) => {
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      // subjunctive: "if I were", "wish I were", "as though/if I were"
      return /\b(?:if|wish|though|as if|imagine|suppose|rather)\s+I\s$/i.test(
        before,
      );
    },
  },
];

export const confusablesRule: StyleRule = {
  id: 'wr:confusables',
  label: 'Commonly confused words',
  appliesTo: () => true,
  check(text, ctx) {
    const out: RawFinding[] = [];
    for (const c of CONFUSABLES) {
      for (const m of matchAll(c.re, text)) {
        const start = m.index;
        const end = start + m[0].length;
        if (isProtected(start, end, ctx.protectedSpans)) continue;
        if (c.reject?.(m, text)) continue;
        out.push({
          ruleId: c.id,
          source: 'grammar',
          start,
          end,
          original: m[0],
          message: c.message,
          replacements: matchCase(m[0], c.fix),
          severity: c.severity,
          confidence: c.confidence,
          explanation: c.explanation,
          example: c.example,
          canAutoApply: false,
        });
      }
    }
    return out;
  },
};

/** Mirror the capitalisation of the original onto each replacement. */
function matchCase(
  original: string,
  fixes: readonly string[],
): readonly string[] {
  const isCap = /^[A-Z]/.test(original);
  if (!isCap) return fixes;
  return fixes.map((f) => f.charAt(0).toUpperCase() + f.slice(1));
}
