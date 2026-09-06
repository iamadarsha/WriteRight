/**
 * Personal dictionary (§11.4).
 *
 * Phase 1 ships the durable store + add/remove/has/import/export so the privacy
 * and settings surfaces are complete. The spell engine consumes it in Phase 2.
 * Case is preserved on storage; lookup is case-insensitive.
 */

import { storage } from '#imports';
import type { PersonalDictionaryStore } from '@/types/settings';
import {
  DEFAULT_DICTIONARY,
  DICTIONARY_SCHEMA_VERSION,
} from '@/types/settings';
import { STORAGE_KEYS } from './keys';

const MAX_WORDS = 20_000;
const WORD_RE = /^[\p{L}\p{M}][\p{L}\p{M}\p{Nd}'’.-]{0,63}$/u;

export const dictionaryItem = storage.defineItem<PersonalDictionaryStore>(
  STORAGE_KEYS.dictionary,
  {
    fallback: DEFAULT_DICTIONARY,
    version: DICTIONARY_SCHEMA_VERSION,
  },
);

export async function getDictionary(): Promise<readonly string[]> {
  const store = await dictionaryItem.getValue();
  return store.words ?? [];
}

export function isValidDictionaryWord(word: string): boolean {
  return WORD_RE.test(word.trim());
}

export async function hasWord(word: string): Promise<boolean> {
  const target = word.trim().toLocaleLowerCase();
  const words = await getDictionary();
  return words.some((w) => w.toLocaleLowerCase() === target);
}

export async function addWord(word: string): Promise<readonly string[]> {
  const trimmed = word.trim();
  if (!isValidDictionaryWord(trimmed)) return getDictionary();
  const words = await getDictionary();
  if (
    words.some((w) => w.toLocaleLowerCase() === trimmed.toLocaleLowerCase())
  ) {
    return words;
  }
  const next = [...words, trimmed].slice(0, MAX_WORDS);
  await dictionaryItem.setValue({
    schemaVersion: DICTIONARY_SCHEMA_VERSION,
    words: next,
  });
  return next;
}

export async function removeWord(word: string): Promise<readonly string[]> {
  const target = word.trim().toLocaleLowerCase();
  const words = await getDictionary();
  const next = words.filter((w) => w.toLocaleLowerCase() !== target);
  if (next.length === words.length) return words;
  await dictionaryItem.setValue({
    schemaVersion: DICTIONARY_SCHEMA_VERSION,
    words: next,
  });
  return next;
}

export async function importWords(
  raw: string,
): Promise<{ added: number; total: readonly string[] }> {
  const candidates = raw
    .split(/[\r\n,]+/)
    .map((w) => w.trim())
    .filter((w) => isValidDictionaryWord(w));
  const existing = await getDictionary();
  const lower = new Set(existing.map((w) => w.toLocaleLowerCase()));
  const additions: string[] = [];
  for (const c of candidates) {
    const key = c.toLocaleLowerCase();
    if (!lower.has(key)) {
      lower.add(key);
      additions.push(c);
    }
  }
  const next = [...existing, ...additions].slice(0, MAX_WORDS);
  await dictionaryItem.setValue({
    schemaVersion: DICTIONARY_SCHEMA_VERSION,
    words: next,
  });
  return { added: additions.length, total: next };
}

export async function exportWords(): Promise<string> {
  const words = await getDictionary();
  return words.join('\n');
}

export async function resetDictionary(): Promise<void> {
  await dictionaryItem.setValue(DEFAULT_DICTIONARY);
}

export function watchDictionary(
  cb: (words: readonly string[]) => void,
): () => void {
  return dictionaryItem.watch((value) => cb(value.words ?? []));
}
