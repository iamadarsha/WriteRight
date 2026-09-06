/**
 * Background-hosted offline vocabulary service (§11.3).
 *
 * A thin wrapper over {@link LexiconStore} that binds it to the packaged
 * `public/lexicon/*.bin` assets and the service worker's `DecompressionStream`.
 * All work is lazy — nothing loads until the first `define()` / `synonyms()`.
 */

import { browser } from '#imports';
import { LexiconStore } from '@/engine/lexicon/lexicon-store';
import type { LexiconBackend } from './lexicon-backend';
import type { DefineResult, SynonymResult } from '@/engine/lexicon/types';
import { createLogger } from '@/utils/logger';

const log = createLogger('lexicon-service');

const INDEX_PATH = '/lexicon/lemmas.bin';
const DATA_PATH = '/lexicon/glosses.bin';

export class LexiconService implements LexiconBackend {
  #store: LexiconStore | null = null;

  start(): Promise<void> {
    // Construction is free; the store loads on first lookup. Build it here so
    // `getURL` runs while the SW context is definitely alive.
    try {
      this.#store = new LexiconStore({
        indexUrl: browser.runtime.getURL(
          INDEX_PATH as Parameters<typeof browser.runtime.getURL>[0],
        ),
        dataUrl: browser.runtime.getURL(
          DATA_PATH as Parameters<typeof browser.runtime.getURL>[0],
        ),
      });
    } catch (err) {
      log.warn('lexicon service unavailable', err);
    }
    return Promise.resolve();
  }

  async define(text: string): Promise<DefineResult> {
    if (!this.#store) return { entries: [], unavailable: true };
    try {
      return await this.#store.define(text);
    } catch (err) {
      log.warn('define failed', err);
      return { entries: [], unavailable: true };
    }
  }

  async synonyms(word: string): Promise<SynonymResult> {
    if (!this.#store) {
      return { word, synonyms: [], antonyms: [], unavailable: true };
    }
    try {
      return await this.#store.synonyms(word);
    } catch (err) {
      log.warn('synonyms failed', err);
      return { word, synonyms: [], antonyms: [], unavailable: true };
    }
  }
}
