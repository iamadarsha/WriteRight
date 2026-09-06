/**
 * Offline vocabulary layer (§11.3) — types shared by the build script, the
 * background {@link LexiconStore}, and the content-script define UI.
 *
 * Source data: Open English WordNet 2025+ (CC-BY-4.0). Only the subset WriteRight
 * needs — lemma, part of speech, definition, one example, synonyms, antonyms —
 * is extracted, into a compact block-compressed binary (never raw WordNet).
 */

/** WordNet parts of speech, collapsed to the four the UI shows. */
export type LexPos = 'noun' | 'verb' | 'adjective' | 'adverb';

/** One sense (synset) of a word. */
export interface LexSense {
  readonly pos: LexPos;
  /** The gloss / definition, plain text. */
  readonly definition: string;
  /** One usage example, if the synset had one. */
  readonly example?: string;
  /** Other members of this synset (near-synonyms), lower-cased, deduped. */
  readonly synonyms: readonly string[];
  /** Direct antonyms (lexical `!` relation), lower-cased. */
  readonly antonyms: readonly string[];
}

/** The full lookup result for one head word. */
export interface LexEntry {
  /** The matched head word, in the form stored in the lexicon (lower-case). */
  readonly word: string;
  /**
   * The lemma the lookup actually resolved to, when Morphy had to inflect the
   * query (e.g. query "running" → lemma "run"). Absent when the query matched
   * a stored lemma directly.
   */
  readonly resolvedFrom?: string;
  readonly senses: readonly LexSense[];
}

export interface DefineResult {
  readonly entries: readonly LexEntry[];
  /** True when the lexicon data could not be loaded — the UI says so honestly. */
  readonly unavailable?: boolean;
}

export interface SynonymResult {
  readonly word: string;
  readonly synonyms: readonly string[];
  readonly antonyms: readonly string[];
  readonly unavailable?: boolean;
}

/* ---- binary format (produced by scripts/build-lexicon.ts) ------------- */

/** Magic + version for the two artefacts. Bump on any layout change. */
export const LEXICON_INDEX_MAGIC = 0x57524c49; // "WRLI"
export const LEXICON_DATA_MAGIC = 0x57524c44; // "WRLD"
export const LEXICON_FORMAT_VERSION = 1;

/** POS code ↔ enum, as written in the binary. */
export const POS_CODES: Record<number, LexPos> = {
  0: 'noun',
  1: 'verb',
  2: 'adjective',
  3: 'adverb',
};
export const POS_TO_CODE: Record<LexPos, number> = {
  noun: 0,
  verb: 1,
  adjective: 2,
  adverb: 3,
};

/**
 * One resident index row (kept in memory after first load — a few dozen bytes
 * per block, so the whole index is ~10–20 KB).
 */
export interface LexBlockRef {
  /** Byte offset of the gzip payload in `glosses.bin`. */
  readonly offset: number;
  /** Gzip payload length in bytes. */
  readonly length: number;
  /** Smallest lemma in the block (inclusive). */
  readonly firstLemma: string;
  /** Largest lemma in the block (inclusive). */
  readonly lastLemma: string;
}
