import { describe, it, expect } from 'vitest';
import { computeStats, computeReadability } from '@/engine/readability-engine';

const SIMPLE = 'The cat sat on the mat. The dog ran fast. Birds can fly high.';
const COMPLEX =
  'The utilization of unnecessarily sophisticated terminology invariably ' +
  'obfuscates the fundamental communicative intention, thereby diminishing ' +
  'comprehensibility for the intended readership. Consequently, practitioners ' +
  'should endeavour to employ accessible vocabulary wherever feasible.';

describe('computeStats (§12.1, §3.8)', () => {
  it('counts words, sentences, paragraphs and characters', () => {
    const s = computeStats('Hello there.\n\nSecond paragraph here now.');
    expect(s.words).toBe(6);
    expect(s.sentences).toBe(2);
    expect(s.paragraphs).toBe(2);
    expect(s.charactersNoSpaces).toBeLessThan(s.characters);
  });

  it('flags long sentences and computes reading time', () => {
    const long = `${'word '.repeat(40)}end.`;
    const s = computeStats(long);
    expect(s.longSentenceCount).toBe(1);
    expect(s.readingTimeSeconds).toBeGreaterThan(0);
  });

  it('detects passive voice and filler words', () => {
    const s = computeStats(
      'The report was written by the team. It was really very important.',
    );
    expect(s.passiveVoiceCount).toBeGreaterThanOrEqual(1);
    expect(s.fillerCount).toBeGreaterThanOrEqual(2);
  });

  it('empty text yields zeroes, not NaN', () => {
    const s = computeStats('');
    expect(s.words).toBe(0);
    expect(Number.isNaN(s.avgSentenceLength)).toBe(false);
  });
});

describe('computeReadability (§12.1)', () => {
  it('simple prose scores as easy; dense prose scores as hard', () => {
    const simple = computeReadability(SIMPLE);
    const complex = computeReadability(COMPLEX);
    expect(simple.fleschReadingEase).toBeGreaterThan(complex.fleschReadingEase);
    expect(complex.fleschKincaidGrade).toBeGreaterThan(
      simple.fleschKincaidGrade,
    );
    expect(complex.gunningFog).toBeGreaterThan(simple.gunningFog);
  });

  it('guards short text — sufficientText is false', () => {
    const r = computeReadability('Too short.');
    expect(r.sufficientText).toBe(false);
    expect(r.grade).toBeTruthy();
  });

  it('all metrics are finite and non-negative', () => {
    const r = computeReadability(COMPLEX);
    for (const v of [
      r.fleschReadingEase,
      r.fleschKincaidGrade,
      r.gunningFog,
      r.colemanLiau,
      r.smog,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});
