/**
 * Mechanical-consistency assessment (§12.2) — the "Consistency" component of the
 * Writing Health Score.
 *
 * Deterministic and local: a handful of checks over the raw text for the kinds
 * of drift a careful editor would flag — a document that mixes US and GB
 * spelling, straight and curly quotes, one and two spaces after a full stop, or
 * hyphenates the same word two different ways. No Harper call, no AI, no taste
 * judgement. Conservative by design: a single dialect used throughout, or a
 * hyphenated compound with no closed-form counterpart, is *not* an inconsistency.
 */

export type ConsistencyKind =
  | 'quote-style'
  | 'dialect-spelling'
  | 'sentence-spacing'
  | 'hyphenation'
  | 'serial-comma';

export interface ConsistencyFinding {
  readonly kind: ConsistencyKind;
  readonly detail: string;
}

export interface ConsistencyAssessment {
  /** 0–100, where 100 = nothing inconsistent found. */
  readonly value: number;
  /** Plain-language summary for the score breakdown (§12.3). */
  readonly note: string;
  readonly findings: readonly ConsistencyFinding[];
}

/** Fixed point deduction per finding kind. */
const PENALTY: Record<ConsistencyKind, number> = {
  'dialect-spelling': 14,
  'quote-style': 12,
  hyphenation: 10,
  'sentence-spacing': 8,
  'serial-comma': 6,
};

/**
 * US ⇄ GB pairs where *both* forms appearing in one document is almost always
 * unintentional. Only unambiguous pairs — nothing where one side is a common
 * unrelated word (tire/tyre, program/programme, practice/practise, mold/mould).
 */
const DIALECT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['color', 'colour'],
  ['honor', 'honour'],
  ['favor', 'favour'],
  ['favorite', 'favourite'],
  ['flavor', 'flavour'],
  ['humor', 'humour'],
  ['labor', 'labour'],
  ['neighbor', 'neighbour'],
  ['behavior', 'behaviour'],
  ['rumor', 'rumour'],
  ['harbor', 'harbour'],
  ['odor', 'odour'],
  ['center', 'centre'],
  ['theater', 'theatre'],
  ['meter', 'metre'],
  ['liter', 'litre'],
  ['fiber', 'fibre'],
  ['organize', 'organise'],
  ['organized', 'organised'],
  ['realize', 'realise'],
  ['recognize', 'recognise'],
  ['apologize', 'apologise'],
  ['analyze', 'analyse'],
  ['catalog', 'catalogue'],
  ['dialog', 'dialogue'],
  ['defense', 'defence'],
  ['offense', 'offence'],
  ['traveled', 'travelled'],
  ['traveler', 'traveller'],
  ['canceled', 'cancelled'],
  ['modeling', 'modelling'],
  ['labeled', 'labelled'],
  ['gray', 'grey'],
  ['jewelry', 'jewellery'],
  ['aluminum', 'aluminium'],
  ['plow', 'plough'],
  ['mustache', 'moustache'],
  ['skillful', 'skilful'],
  ['fulfill', 'fulfil'],
  ['enrollment', 'enrolment'],
  ['installment', 'instalment'],
];

const has = (text: string, word: string): boolean =>
  new RegExp(`\\b${word}\\b`, 'i').test(text);

export function assessConsistency(text: string): ConsistencyAssessment {
  const findings: ConsistencyFinding[] = [];

  // --- dialect / spelling mix ---------------------------------------------
  for (const [us, gb] of DIALECT_PAIRS) {
    if (has(text, us) && has(text, gb)) {
      findings.push({
        kind: 'dialect-spelling',
        detail: `mixes “${us}” and “${gb}” — pick one dialect`,
      });
      break;
    }
  }

  // --- straight vs curly double quotes ----------------------------------
  const straightPairs = (text.match(/"/g) ?? []).length;
  const curlyMarks = (text.match(/[“”]/g) ?? []).length;
  if (straightPairs >= 2 && curlyMarks >= 1) {
    findings.push({
      kind: 'quote-style',
      detail: 'mixes straight ("…") and curly (“…”) quotation marks',
    });
  }

  // --- one vs two spaces after . ! ? ----------------------------------
  const singleGap = (text.match(/[.!?] (?=["“'A-Z])/g) ?? []).length;
  const doubleGap = (text.match(/[.!?] {2}(?=["“'A-Z])/g) ?? []).length;
  if (singleGap >= 1 && doubleGap >= 1 && singleGap + doubleGap >= 3) {
    findings.push({
      kind: 'sentence-spacing',
      detail: 'mixes one and two spaces after sentences',
    });
  }

  // --- same word hyphenated in one place, closed in another -----------
  const seen = new Set<string>();
  for (const m of text.matchAll(/\b([a-z]+)-([a-z]{2,})\b/gi)) {
    const a = m[1]!.toLowerCase();
    const b = m[2]!.toLowerCase();
    const closed = a + b;
    if (closed.length < 5 || seen.has(closed)) continue;
    seen.add(closed);
    if (new RegExp(`\\b${closed}\\b`, 'i').test(text)) {
      findings.push({
        kind: 'hyphenation',
        detail: `writes both “${a}-${b}” and “${closed}”`,
      });
      break;
    }
  }

  // --- serial (Oxford) comma used inconsistently ---------------------
  const withOxford = /\w+,\s+\w[\w'-]*,\s+and\s+\w/i.test(text);
  const withoutOxford = /\w+,\s+\w[\w'-]*\s+and\s+\w/i.test(text);
  if (withOxford && withoutOxford) {
    findings.push({
      kind: 'serial-comma',
      detail: 'uses the serial comma in some lists but not others',
    });
  }

  const penalty = findings.reduce((sum, f) => sum + PENALTY[f.kind], 0);
  const value = Math.max(0, Math.min(100, 100 - penalty));
  const note =
    findings.length === 0
      ? 'Spelling, spacing and punctuation are consistent.'
      : `The text ${findings[0]!.detail}.`;

  return { value, note, findings };
}
