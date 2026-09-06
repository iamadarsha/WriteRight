/**
 * Plain, serializable projections of Harper's WASM objects.
 *
 * Harper's `Lint` / `Span` / `Suggestion` are live WebAssembly handles that
 * must be `.free()`d. We read everything we need into these POJOs immediately
 * and release the handles, so nothing downstream depends on the WASM lifetime
 * or has to cross a worker/message boundary as a handle (§2.3).
 *
 * All offsets are UTF-16 code units — verified against Harper 2.7 with an
 * emoji/surrogate-pair regression test (§10.3, §23.2).
 */

/** Harper's lint categories (from `Lint.lint_kind()`), plus `Unknown`. */
export type HarperLintKind =
  | 'Agreement'
  | 'BoundaryError'
  | 'Capitalization'
  | 'Eggcorn'
  | 'Enhancement'
  | 'Formatting'
  | 'Grammar'
  | 'Malapropism'
  | 'Miscellaneous'
  | 'Nonstandard'
  | 'Punctuation'
  | 'Readability'
  | 'Redundancy'
  | 'Regionalism'
  | 'Repetition'
  | 'Spelling'
  | 'Style'
  | 'Typo'
  | 'Usage'
  | 'WordChoice'
  | 'WordOrder'
  | 'Unknown';

export type HarperSuggestionKind = 'replace' | 'remove' | 'insert-after';

export interface HarperReplacement {
  readonly kind: HarperSuggestionKind;
  /** Empty string when `kind` is `remove`. */
  readonly text: string;
}

export interface HarperFinding {
  readonly kind: HarperLintKind;
  readonly kindPretty: string;
  /** UTF-16 code-unit offsets against the analyzed text. */
  readonly start: number;
  readonly end: number;
  readonly problemText: string;
  readonly message: string;
  /** Ordered replacements; index 0 is Harper's best. */
  readonly replacements: readonly HarperReplacement[];
  /** Best-effort rule identifier for ignore-lists / "explain more". */
  readonly ruleId: string;
}

export interface HarperSmokeResult {
  readonly ok: boolean;
  readonly ruleCount: number;
  readonly detectedSpelling: boolean;
  readonly detectedGrammar: boolean;
  readonly cleanSentenceIsClean: boolean;
  readonly offsetsAreUtf16: boolean;
  readonly durationMs: number;
  readonly failures: readonly string[];
}
