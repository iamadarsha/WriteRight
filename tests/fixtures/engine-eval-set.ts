/**
 * Labelled evaluation set for `scripts/eval-engine.ts` (§23.3).
 *
 * Unlike the golden corpus (which asserts result *classes* and must never
 * regress), this set exists to *measure* the engine: precision / recall / F1
 * per error category, tracked release over release. Adding a category the
 * engine can't yet handle is expected — the report shows the gap.
 *
 * Each case is either a real error that SHOULD be flagged (`flag` = the exact
 * substring), or correct text that must stay clean (`shouldFlag: false`).
 * A "hit" only counts as a true positive when a suggestion actually overlaps
 * the `flag` span — flagging the wrong word doesn't count.
 */

export type EvalCategory =
  | 'spelling'
  | 'subject-verb'
  | 'its-vs-its'
  | 'there-their-theyre'
  | 'then-vs-than'
  | 'your-vs-youre'
  | 'to-vs-too'
  | 'a-vs-an'
  | 'modal-of'
  | 'loose-vs-lose'
  | 'duplicate-word'
  | 'whitespace'
  | 'wordiness'
  | 'readability';

export interface EvalCase {
  readonly id: string;
  readonly category: EvalCategory;
  readonly text: string;
  /** Exact substring a suggestion must overlap for a hit. Omit for a trap. */
  readonly flag?: string;
  readonly shouldFlag: boolean;
  readonly note?: string;
}

export const EVAL_SET: readonly EvalCase[] = [
  /* ---- spelling (baseline — Harper) ------------------------------- */
  {
    id: 'sp-1',
    category: 'spelling',
    text: 'I sent teh file this morning.',
    flag: 'teh',
    shouldFlag: true,
  },
  {
    id: 'sp-2',
    category: 'spelling',
    text: 'Please recieve this with thanks.',
    flag: 'recieve',
    shouldFlag: true,
  },
  {
    id: 'sp-3',
    category: 'spelling',
    text: 'The two teams stayed seperate.',
    flag: 'seperate',
    shouldFlag: true,
  },
  {
    id: 'sp-4',
    category: 'spelling',
    text: 'It occured twice last night.',
    flag: 'occured',
    shouldFlag: true,
  },
  {
    id: 'sp-clean-1',
    category: 'spelling',
    text: 'The committee reviewed the proposal carefully.',
    shouldFlag: false,
  },
  {
    id: 'sp-clean-2',
    category: 'spelling',
    text: 'Kubernetes restarted the pod after the OOMKilled event.',
    shouldFlag: false,
  },

  /* ---- subject–verb agreement ----------------------------------- */
  {
    id: 'sv-1',
    category: 'subject-verb',
    text: 'They was late to the meeting again.',
    flag: 'was',
    shouldFlag: true,
  },
  {
    id: 'sv-2',
    category: 'subject-verb',
    text: 'We was hoping to finish today.',
    flag: 'was',
    shouldFlag: true,
  },
  {
    id: 'sv-3',
    category: 'subject-verb',
    text: 'You was right about the deadline.',
    flag: 'was',
    shouldFlag: true,
  },
  {
    id: 'sv-4',
    category: 'subject-verb',
    text: 'She don’t want to come to the party.',
    flag: 'don’t',
    shouldFlag: true,
  },
  {
    id: 'sv-5',
    category: 'subject-verb',
    text: 'He don’t know the answer yet.',
    flag: 'don’t',
    shouldFlag: true,
  },
  {
    id: 'sv-6',
    category: 'subject-verb',
    text: 'It don’t matter now.',
    flag: 'don’t',
    shouldFlag: true,
  },
  {
    id: 'sv-7',
    category: 'subject-verb',
    text: 'The cats is hungry.',
    flag: 'is',
    shouldFlag: true,
  },
  {
    id: 'sv-8',
    category: 'subject-verb',
    text: 'I were going to call you.',
    flag: 'were',
    shouldFlag: true,
  },
  {
    id: 'sv-clean-1',
    category: 'subject-verb',
    text: 'They were late to the meeting again.',
    shouldFlag: false,
  },
  {
    id: 'sv-clean-2',
    category: 'subject-verb',
    text: 'She doesn’t want to come to the party.',
    shouldFlag: false,
  },
  {
    id: 'sv-clean-3',
    category: 'subject-verb',
    text: 'If I were you, I would wait.',
    shouldFlag: false,
    note: 'subjunctive "were" is correct',
  },
  {
    id: 'sv-clean-4',
    category: 'subject-verb',
    text: 'The cat is hungry and the dogs are asleep.',
    shouldFlag: false,
  },

  /* ---- its vs it’s ----------------------------------------------- */
  {
    id: 'its-1',
    category: 'its-vs-its',
    text: 'Its a great day for a launch.',
    flag: 'Its',
    shouldFlag: true,
  },
  {
    id: 'its-2',
    category: 'its-vs-its',
    text: 'I think its been fixed already.',
    flag: 'its',
    shouldFlag: true,
  },
  {
    id: 'its-3',
    category: 'its-vs-its',
    text: 'Its not clear who owns this.',
    flag: 'Its',
    shouldFlag: true,
  },
  {
    id: 'its-4',
    category: 'its-vs-its',
    text: 'The build failed but its going to be retried.',
    flag: 'its',
    shouldFlag: true,
  },
  {
    id: 'its-clean-1',
    category: 'its-vs-its',
    text: 'The team shipped its first release today.',
    shouldFlag: false,
  },
  {
    id: 'its-clean-2',
    category: 'its-vs-its',
    text: 'Each service manages its own state.',
    shouldFlag: false,
  },
  {
    id: 'its-clean-3',
    category: 'its-vs-its',
    text: "It's been a long week for everyone.",
    shouldFlag: false,
  },

  /* ---- there / their / they’re -------------------------------- */
  {
    id: 'ttt-1',
    category: 'there-their-theyre',
    text: 'Their going to send the contract tomorrow.',
    flag: 'Their',
    shouldFlag: true,
  },
  {
    id: 'ttt-2',
    category: 'there-their-theyre',
    text: 'I know their coming to the review.',
    flag: 'their',
    shouldFlag: true,
  },
  {
    id: 'ttt-3',
    category: 'there-their-theyre',
    text: 'There house is at the end of the street.',
    flag: 'There',
    shouldFlag: true,
  },
  {
    id: 'ttt-4',
    category: 'there-their-theyre',
    text: 'Put it over their by the door.',
    flag: 'their',
    shouldFlag: true,
  },
  {
    id: 'ttt-clean-1',
    category: 'there-their-theyre',
    text: 'Their proposal was approved yesterday.',
    shouldFlag: false,
  },
  {
    id: 'ttt-clean-2',
    category: 'there-their-theyre',
    text: "They're going to send the contract tomorrow.",
    shouldFlag: false,
  },
  {
    id: 'ttt-clean-3',
    category: 'there-their-theyre',
    text: 'There are three open tickets.',
    shouldFlag: false,
  },
  {
    id: 'ttt-clean-4',
    category: 'there-their-theyre',
    text: 'I object to their leaving so early.',
    shouldFlag: false,
    note: 'gerund — "their leaving" is correct',
  },

  /* ---- then vs than ------------------------------------------- */
  {
    id: 'tt-1',
    category: 'then-vs-than',
    text: 'This option is better then the last one.',
    flag: 'then',
    shouldFlag: true,
  },
  {
    id: 'tt-2',
    category: 'then-vs-than',
    text: 'It took longer then expected.',
    flag: 'then',
    shouldFlag: true,
  },
  {
    id: 'tt-3',
    category: 'then-vs-than',
    text: 'We have more then enough time.',
    flag: 'then',
    shouldFlag: true,
  },
  {
    id: 'tt-4',
    category: 'then-vs-than',
    text: 'The result was worse then before.',
    flag: 'then',
    shouldFlag: true,
  },
  {
    id: 'tt-5',
    category: 'then-vs-than',
    text: 'She would rather wait then rush it.',
    flag: 'then',
    shouldFlag: true,
  },
  {
    id: 'tt-clean-1',
    category: 'then-vs-than',
    text: 'Finish the draft, then send it to the team.',
    shouldFlag: false,
  },
  {
    id: 'tt-clean-2',
    category: 'then-vs-than',
    text: 'This option is better than the last one.',
    shouldFlag: false,
  },
  {
    id: 'tt-clean-3',
    category: 'then-vs-than',
    text: 'If the test passes, then we deploy.',
    shouldFlag: false,
  },

  /* ---- your vs you’re ------------------------------------------ */
  {
    id: 'yy-1',
    category: 'your-vs-youre',
    text: 'Your welcome to join the call.',
    flag: 'Your',
    shouldFlag: true,
  },
  {
    id: 'yy-2',
    category: 'your-vs-youre',
    text: 'I think your right about that.',
    flag: 'your',
    shouldFlag: true,
  },
  {
    id: 'yy-3',
    category: 'your-vs-youre',
    text: 'Your going to love the new layout.',
    flag: 'Your',
    shouldFlag: true,
  },
  {
    id: 'yy-clean-1',
    category: 'your-vs-youre',
    text: 'Please send your feedback by Friday.',
    shouldFlag: false,
  },
  {
    id: 'yy-clean-2',
    category: 'your-vs-youre',
    text: "You're welcome to join the call.",
    shouldFlag: false,
  },
  {
    id: 'yy-clean-3',
    category: 'your-vs-youre',
    text: 'Your team did great work this quarter.',
    shouldFlag: false,
  },

  /* ---- to vs too --------------------------------------------- */
  {
    id: 'to-1',
    category: 'to-vs-too',
    text: 'This is to much detail for a summary.',
    flag: 'to',
    shouldFlag: true,
  },
  {
    id: 'to-2',
    category: 'to-vs-too',
    text: 'There are to many open questions.',
    flag: 'to',
    shouldFlag: true,
  },
  {
    id: 'to-3',
    category: 'to-vs-too',
    text: 'It is to late to change the schema.',
    flag: 'to',
    shouldFlag: true,
  },
  {
    id: 'to-4',
    category: 'to-vs-too',
    text: 'I want to come to the workshop to.',
    flag: 'to.',
    shouldFlag: true,
    note: 'sentence-final "to" → "too"',
  },
  {
    id: 'to-clean-1',
    category: 'to-vs-too',
    text: 'I need to review this before the call.',
    shouldFlag: false,
  },
  {
    id: 'to-clean-2',
    category: 'to-vs-too',
    text: 'This is too much detail for a summary.',
    shouldFlag: false,
  },
  {
    id: 'to-clean-3',
    category: 'to-vs-too',
    text: 'We drove to Boston to see the office.',
    shouldFlag: false,
  },

  /* ---- a vs an ---------------------------------------------- */
  {
    id: 'an-1',
    category: 'a-vs-an',
    text: 'He picked up a apple from the basket.',
    flag: 'a',
    shouldFlag: true,
  },
  {
    id: 'an-2',
    category: 'a-vs-an',
    text: 'This needs a extra review pass.',
    flag: 'a',
    shouldFlag: true,
  },
  {
    id: 'an-3',
    category: 'a-vs-an',
    text: 'She gave an demo to the client.',
    flag: 'an',
    shouldFlag: true,
  },
  {
    id: 'an-clean-1',
    category: 'a-vs-an',
    text: 'He picked up an apple from the basket.',
    shouldFlag: false,
  },
  {
    id: 'an-clean-2',
    category: 'a-vs-an',
    text: 'It was a unique opportunity.',
    shouldFlag: false,
    note: '"unique" = /juː/ consonant sound',
  },
  {
    id: 'an-clean-3',
    category: 'a-vs-an',
    text: 'We waited an hour for the build.',
    shouldFlag: false,
    note: 'silent h',
  },

  /* ---- modal + "of" ---------------------------------------- */
  {
    id: 'mof-1',
    category: 'modal-of',
    text: 'You could of told me sooner.',
    flag: 'could of',
    shouldFlag: true,
  },
  {
    id: 'mof-2',
    category: 'modal-of',
    text: 'We should of tested that path.',
    flag: 'should of',
    shouldFlag: true,
  },
  {
    id: 'mof-3',
    category: 'modal-of',
    text: 'It would of been faster to cache it.',
    flag: 'would of',
    shouldFlag: true,
  },
  {
    id: 'mof-4',
    category: 'modal-of',
    text: 'They must of missed the email.',
    flag: 'must of',
    shouldFlag: true,
  },
  {
    id: 'mof-clean-1',
    category: 'modal-of',
    text: 'You could have told me sooner.',
    shouldFlag: false,
  },
  {
    id: 'mof-clean-2',
    category: 'modal-of',
    text: 'The list could contain thousands of rows.',
    shouldFlag: false,
    note: '"of" here is correct',
  },

  /* ---- loose vs lose -------------------------------------- */
  {
    id: 'll-1',
    category: 'loose-vs-lose',
    text: 'We might loose the contract if we delay.',
    flag: 'loose',
    shouldFlag: true,
  },
  {
    id: 'll-2',
    category: 'loose-vs-lose',
    text: "Don't loose your notes before the review.",
    flag: 'loose',
    shouldFlag: true,
  },
  {
    id: 'll-clean-1',
    category: 'loose-vs-lose',
    text: 'The cable connector felt loose.',
    shouldFlag: false,
  },
  {
    id: 'll-clean-2',
    category: 'loose-vs-lose',
    text: "We don't want to lose the contract.",
    shouldFlag: false,
  },

  /* ---- duplicate word (custom rule) ---------------------- */
  {
    id: 'dup-1',
    category: 'duplicate-word',
    text: 'Could you send me the the report by Friday?',
    flag: 'the the',
    shouldFlag: true,
  },
  {
    id: 'dup-2',
    category: 'duplicate-word',
    text: 'We need to to confirm the numbers.',
    flag: 'to to',
    shouldFlag: true,
  },
  {
    id: 'dup-clean-1',
    category: 'duplicate-word',
    text: 'All that is is temporary.',
    shouldFlag: false,
    note: 'legitimate "is is"',
  },
  {
    id: 'dup-clean-2',
    category: 'duplicate-word',
    text: 'She had had enough by then.',
    shouldFlag: false,
  },

  /* ---- whitespace (custom rule) ------------------------- */
  {
    id: 'ws-1',
    category: 'whitespace',
    text: 'The results  were surprising.',
    flag: '  ',
    shouldFlag: true,
  },
  {
    id: 'ws-2',
    category: 'whitespace',
    text: 'Wait ,then check the log.',
    flag: ' ,',
    shouldFlag: true,
  },
  {
    id: 'ws-clean-1',
    category: 'whitespace',
    text: 'The results were surprising.',
    shouldFlag: false,
  },

  /* ---- wordiness (style — info severity) ---------------- */
  {
    id: 'wd-1',
    category: 'wordiness',
    text: 'We met in order to align on scope.',
    flag: 'in order to',
    shouldFlag: true,
  },
  {
    id: 'wd-2',
    category: 'wordiness',
    text: 'Due to the fact that the API changed, we rewrote it.',
    flag: 'due to the fact that',
    shouldFlag: true,
  },
  {
    id: 'wd-clean-1',
    category: 'wordiness',
    text: 'We met to align on scope.',
    shouldFlag: false,
  },

  /* ---- readability (clarity — info severity, §12.3) ---------------- */
  {
    id: 'rd-1',
    category: 'readability',
    text: 'The quarterly review meeting, which had been postponed twice already because of scheduling conflicts across three different time zones, finally happened on Thursday, and it ran long because every team wanted to present their roadmap in full detail rather than the summary we had asked for.',
    flag: 'The quarterly review meeting',
    shouldFlag: true,
    note: 'one 48-word sentence',
  },
  {
    id: 'rd-2',
    category: 'readability',
    text: 'When the migration finally shipped, after months of planning and a launch window that slipped three times, the team was relieved, but the on-call rotation stayed nervous for weeks because nobody fully trusted that the old code paths were actually gone for good.',
    flag: 'When the migration finally shipped',
    shouldFlag: true,
    note: '42 words, many clauses',
  },
  {
    id: 'rd-clean-1',
    category: 'readability',
    text: 'The meeting was postponed twice. It finally happened on Thursday. It ran long because every team wanted to present in full.',
    shouldFlag: false,
    note: 'same content, split into short sentences',
  },
  {
    id: 'rd-clean-2',
    category: 'readability',
    text: 'We shipped the migration last week. The rollback plan held. On-call stayed quiet.',
    shouldFlag: false,
  },
  {
    id: 'rd-clean-3',
    category: 'readability',
    text: 'Thanks for the detailed write-up — this is exactly what we needed to move forward, and I have shared it with the wider group for their input before Friday.',
    shouldFlag: false,
    note: '28 words but a single clean clause structure — must not flag',
  },
];
