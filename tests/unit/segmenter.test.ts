import { describe, it, expect } from 'vitest';
import {
  words,
  wordCount,
  sentences,
  paragraphs,
  syllablesIn,
  complexWordCount,
} from '@/core/segmenter';

describe('segmenter (§10.1)', () => {
  it('counts words, keeping contractions and hyphenates whole', () => {
    expect(wordCount("It's a well-known fact.")).toBe(4);
    expect(words('one two three').map((w) => w.text)).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('splits sentences, respecting abbreviations, decimals and ellipses', () => {
    expect(sentences('Hello world. How are you?').map((s) => s.text)).toEqual([
      'Hello world.',
      'How are you?',
    ]);
    expect(sentences('Dr. Smith arrived. He was late.')).toHaveLength(2);
    expect(sentences('The value is 3.14 exactly.')).toHaveLength(1);
    expect(sentences('Well... I am not sure about that.')).toHaveLength(1);
    expect(sentences('e.g. this counts as one sentence here')).toHaveLength(1);
  });

  it('a trailing fragment with no terminator is one sentence', () => {
    expect(sentences('just a fragment')).toHaveLength(1);
  });

  it('splits paragraphs on blank lines', () => {
    const p = paragraphs('First para.\nStill first.\n\nSecond para.');
    expect(p).toHaveLength(2);
    expect(p[1]?.text).toBe('Second para.');
  });

  it('estimates syllables reasonably (heuristic — within ±1)', () => {
    expect(syllablesIn('cat')).toBe(1);
    expect(syllablesIn('the')).toBe(1);
    expect(syllablesIn('table')).toBe(2);
    expect(syllablesIn('little')).toBe(2);
    expect(syllablesIn('beautiful')).toBeGreaterThanOrEqual(3);
    expect(syllablesIn('readability')).toBeGreaterThanOrEqual(4);
    expect(syllablesIn('communication')).toBeGreaterThanOrEqual(4);
  });

  it('counts 3+ syllable words as complex (Fog/SMOG)', () => {
    expect(
      complexWordCount(
        'The extraordinarily complicated documentation confused everyone.',
      ),
    ).toBeGreaterThanOrEqual(3);
    expect(complexWordCount('The cat sat on the mat.')).toBe(0);
  });
});
