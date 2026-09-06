/**
 * The surface the background message router needs from the offline vocabulary
 * layer (§11.3). Implemented by {@link LexiconService} in the extension and by a
 * lightweight double in tests.
 */

import type { DefineResult, SynonymResult } from '@/engine/lexicon/types';

export interface LexiconBackend {
  start(): Promise<void>;
  /** Definition(s) for a word or short phrase. Never rejects. */
  define(text: string): Promise<DefineResult>;
  /** Synonyms + antonyms for a single word. Never rejects. */
  synonyms(word: string): Promise<SynonymResult>;
}
