/**
 * Golden English corpus (§23.3).
 *
 * A curated set of sentences with an expected *result class*, not an exact
 * suggestion list — engine wording changes across `harper.js` releases, but the
 * class (does it flag a spelling error? does it correctly stay silent?) must
 * not regress. `tests/integration/golden-corpus.test.ts` runs every entry
 * through the real pipeline.
 *
 * `trap-clean` entries are the false-positive gate (§23.4): text that looks
 * unusual but is correct and must NOT be flagged. When one regresses,
 * investigate protected spans / dictionary coverage / rule precision — do not
 * weaken the corpus.
 *
 * Known limitation (documented, not a bug): a local dictionary engine flags
 * uncommon or non-English personal names it doesn't know (e.g. "Aoife",
 * "Bjørn"). The mitigation is the personal dictionary. Common names in a
 * normal sentence stay clean — see `trap-proper-nouns`.
 */

export type ResultClass =
  /** At least one spelling suggestion (Harper Spelling/Typo → source 'spell'). */
  | 'spelling'
  /** At least one grammar suggestion. */
  | 'grammar'
  /** At least one suggestion of any kind (used where the exact source varies). */
  | 'flagged'
  /** No error- or warning-severity suggestions (info/style allowed). */
  | 'clean'
  /** Nothing at all — a false-positive trap. */
  | 'trap-clean';

export interface CorpusEntry {
  readonly id: string;
  readonly text: string;
  readonly expect: ResultClass;
  readonly note?: string;
}

export const GOLDEN_CORPUS: readonly CorpusEntry[] = [
  /* ---- correct sentences ------------------------------------------- */
  {
    id: 'clean-simple',
    text: 'The committee reviewed the proposal and approved the budget.',
    expect: 'clean',
  },
  {
    id: 'clean-compound',
    text: 'She finished the report, sent it to the team, and left for the day.',
    expect: 'clean',
  },
  {
    id: 'clean-question',
    text: 'Could you let me know whether the meeting is still on for Thursday?',
    expect: 'clean',
  },

  /* ---- common spelling mistakes ---------------------------------- */
  {
    id: 'spell-teh',
    text: 'I sent teh document to the wrong address.',
    expect: 'spelling',
  },
  {
    id: 'spell-recieve',
    text: 'You should recieve the confirmation shortly.',
    expect: 'spelling',
  },
  {
    id: 'spell-seperate',
    text: 'Please keep the two invoices seperate.',
    expect: 'spelling',
  },
  {
    id: 'spell-occured',
    text: 'The error occured during the nightly build.',
    expect: 'spelling',
  },
  {
    id: 'spell-definately',
    text: 'We will definately follow up next week.',
    expect: 'spelling',
  },
  {
    id: 'spell-dont',
    text: 'She dont want to come to the party.',
    expect: 'spelling',
    note: 'missing apostrophe — Harper corrects "dont" as a spelling',
  },

  /* ---- grammar mistakes ---------------------------------------- */
  {
    id: 'grammar-a-apple',
    text: 'He picked up a apple from the basket.',
    expect: 'grammar',
    note: 'a/an',
  },
  {
    id: 'grammar-agreement',
    text: 'They was late to the meeting again.',
    expect: 'grammar',
    note: 'subject-verb agreement',
  },
  {
    id: 'grammar-their-theyre',
    text: 'Their going to send the contract tomorrow.',
    expect: 'grammar',
    note: 'their / they’re',
  },
  {
    id: 'grammar-to-too',
    text: 'This is to much detail for a summary.',
    expect: 'grammar',
    note: 'to / too — wr:confusables',
  },
  {
    id: 'grammar-your-youre',
    text: 'I think your right about the deadline.',
    expect: 'grammar',
    note: 'your / you’re — wr:confusables',
  },
  {
    id: 'grammar-its-its',
    text: 'Its been a rough week for the team.',
    expect: 'grammar',
    note: 'its / it’s — wr:confusables',
  },
  {
    id: 'grammar-loose-lose',
    text: 'We might loose the account if we slip again.',
    expect: 'grammar',
    note: 'loose / lose — wr:confusables',
  },
  {
    id: 'grammar-he-dont',
    text: 'She don’t want to be on the call.',
    expect: 'grammar',
    note: 'he/she/it don’t → doesn’t — wr:confusables',
  },

  /* ---- custom style / clarity rules --------------------------- */
  {
    id: 'style-repeated-word',
    text: 'Could you send me the the report by Friday?',
    expect: 'flagged',
    note: 'duplicate word — Harper or wr:duplicate-word, source varies',
  },
  {
    id: 'style-double-space',
    text: 'The results  were surprising.',
    expect: 'flagged',
    note: 'repeated whitespace',
  },

  /* ---- false-positive traps (§23.4) -------------------------- */
  {
    id: 'trap-proper-nouns',
    text: 'Sarah met David and Michael at the London office on Tuesday.',
    expect: 'trap-clean',
    note: 'common names + place in an ordinary sentence must stay clean',
  },
  {
    id: 'trap-url',
    text: 'See the docs at https://example.com/guide/getting-started?ref=readme for details.',
    expect: 'trap-clean',
  },
  {
    id: 'trap-email',
    text: 'Forward the invoice to accounts.payable@example.co.uk when you can.',
    expect: 'trap-clean',
  },
  {
    id: 'trap-code-identifier',
    text: 'Call getUserById(id) and then await conn.commit() to persist the row.',
    expect: 'trap-clean',
    note: 'code-like strings in prose — protected spans',
  },
  {
    id: 'trap-technical-terms',
    text: 'The Kubernetes pod restarted after the OOMKilled event in the sidecar.',
    expect: 'trap-clean',
  },
  {
    id: 'trap-contractions',
    text: "It's been a long week, but we're almost done and they'll ship tomorrow.",
    expect: 'trap-clean',
  },
  {
    id: 'trap-acronyms',
    text: 'The API returns JSON over HTTPS; the SDK wraps it for TypeScript.',
    expect: 'trap-clean',
  },
  {
    id: 'trap-numbers-units',
    text: 'The archive was 4.7 GB and finished uploading in about 12 minutes.',
    expect: 'trap-clean',
  },
  {
    id: 'trap-hyphenated',
    text: 'This is a well-documented, state-of-the-art, privacy-first approach.',
    expect: 'trap-clean',
  },
  {
    id: 'trap-color-us',
    text: 'Pick a color for the header background.',
    expect: 'trap-clean',
    note: 'en-US spelling — clean under en-US',
  },
  {
    id: 'trap-confusables-correct',
    text: 'Send your feedback to the team; each service keeps its own state.',
    expect: 'trap-clean',
    note: 'correct "your" + "its" (possessive) must not trip wr:confusables',
  },
  {
    id: 'trap-then-sequence',
    text: 'Run the tests, then merge, then deploy to staging.',
    expect: 'trap-clean',
    note: 'sequential "then" is correct — not a comparison',
  },
];

/** GB-specific spellings that should be clean under en-GB. */
export const DIALECT_CORPUS: ReadonlyArray<{
  id: string;
  text: string;
  cleanUnder: 'en-GB';
}> = [
  {
    id: 'variant-colour-gb',
    text: 'Pick a colour for the header background.',
    cleanUnder: 'en-GB',
  },
  {
    id: 'variant-organise-gb',
    text: 'We need to organise the files before the audit.',
    cleanUnder: 'en-GB',
  },
];
