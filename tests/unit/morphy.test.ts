import { describe, it, expect } from 'vitest';
import { morphCandidates } from '@/engine/lexicon/morphy';

describe('Morphy lemmatiser (§11.3)', () => {
  it('always offers the word itself first', () => {
    expect(morphCandidates('cat')[0]).toBe('cat');
    expect(morphCandidates('CATS')[0]).toBe('cats');
  });

  it('maps irregular forms to their lemma', () => {
    expect(morphCandidates('mice')).toContain('mouse');
    expect(morphCandidates('children')).toContain('child');
    expect(morphCandidates('went')).toContain('go');
    expect(morphCandidates('better')).toContain('good');
    expect(morphCandidates('was')).toContain('be');
    expect(morphCandidates('analyses')).toContain('analysis');
  });

  it('applies regular noun plural rules', () => {
    expect(morphCandidates('cats')).toContain('cat');
    expect(morphCandidates('boxes')).toContain('box');
    expect(morphCandidates('parties')).toContain('party');
    expect(morphCandidates('churches')).toContain('church');
  });

  it('applies regular verb rules incl. doubled consonants', () => {
    expect(morphCandidates('running')).toContain('run');
    expect(morphCandidates('stopped')).toContain('stop');
    expect(morphCandidates('tries')).toContain('try');
    expect(morphCandidates('makes')).toContain('make');
  });

  it('applies comparative / superlative rules', () => {
    expect(morphCandidates('faster')).toContain('fast');
    expect(morphCandidates('happiest')).toContain('happy');
    expect(morphCandidates('larger')).toContain('large');
  });

  it('deduplicates and never emits an empty string', () => {
    const c = morphCandidates('is');
    expect(new Set(c).size).toBe(c.length);
    expect(c).not.toContain('');
  });
});
