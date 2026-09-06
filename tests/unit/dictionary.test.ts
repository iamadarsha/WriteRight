import { describe, it, expect } from 'vitest';
import {
  addWord,
  removeWord,
  hasWord,
  importWords,
  exportWords,
  isValidDictionaryWord,
  getDictionary,
} from '@/storage/dictionary';

describe('personal dictionary (§11.4)', () => {
  it('adds a word (case preserved) with case-insensitive lookup', async () => {
    await addWord('Kubernetes');
    expect(await getDictionary()).toEqual(['Kubernetes']);
    expect(await hasWord('kubernetes')).toBe(true);
    expect(await hasWord('KUBERNETES')).toBe(true);
  });

  it('does not add duplicates (case-insensitive)', async () => {
    await addWord('WriteRight');
    await addWord('writeright');
    expect(await getDictionary()).toEqual(['WriteRight']);
  });

  it('removes a word case-insensitively', async () => {
    await addWord('Anthropic');
    await removeWord('ANTHROPIC');
    expect(await hasWord('anthropic')).toBe(false);
  });

  it('rejects invalid words', () => {
    expect(isValidDictionaryWord('hello')).toBe(true);
    expect(isValidDictionaryWord("O'Brien")).toBe(true);
    expect(isValidDictionaryWord('two words')).toBe(false);
    expect(isValidDictionaryWord('')).toBe(false);
    expect(isValidDictionaryWord('!!!')).toBe(false);
  });

  it('imports a list, skipping duplicates and invalid entries', async () => {
    await addWord('alpha');
    const { added } = await importWords('alpha\nbeta, gamma\nbad word\ndelta');
    expect(added).toBe(3); // beta, gamma, delta
    const words = await getDictionary();
    expect(words).toContain('beta');
    expect(words).not.toContain('bad word');
  });

  it('exports as newline-separated text', async () => {
    await addWord('one');
    await addWord('two');
    expect(await exportWords()).toBe('one\ntwo');
  });
});
