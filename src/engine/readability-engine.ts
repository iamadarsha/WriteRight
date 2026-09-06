/**
 * Deterministic document statistics + readability metrics (§12.1, §3.8).
 *
 * Pure functions over the normalized snapshot. Short-text guardrails: the
 * grade-level formulas are only meaningful past ~3 sentences / ~30 words, so
 * `sufficientText` gates how the UI presents them (§3.1).
 */

import type { DocumentStats, ReadabilityScores } from '@/types/insights';
import {
  words,
  sentences,
  paragraphs,
  totalSyllables,
  complexWordCount,
} from '@/core/segmenter';

const READING_WPM = 238;
const SPEAKING_WPM = 150;
const LONG_SENTENCE_WORDS = 25;
const MIN_WORDS_FOR_READABILITY = 30;
const MIN_SENTENCES_FOR_READABILITY = 3;

const FILLER_RE =
  /\b(?:really|very|quite|actually|basically|literally|just|simply|totally|honestly|essentially|in order to|due to the fact that|at this point in time|the fact that|needless to say)\b/gi;
const PASSIVE_RE =
  /\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(?:\w+ed|\w+en|done|made|given|taken|seen|known|shown|written|held|kept|built|sent|told|found|brought|bought|caught|taught|thought)\b/gi;

export function computeStats(text: string): DocumentStats {
  const wordSpans = words(text);
  const sentenceSpans = sentences(text);
  const paraSpans = paragraphs(text);

  const wordCount = wordSpans.length;
  const sentenceCount = Math.max(sentenceSpans.length, wordCount > 0 ? 1 : 0);

  const sentenceWordCounts = sentenceSpans.map((s) => words(s.text).length);
  const longSentences = sentenceWordCounts.filter(
    (n) => n > LONG_SENTENCE_WORDS,
  ).length;
  const longestSentence = sentenceWordCounts.reduce(
    (a, b) => Math.max(a, b),
    0,
  );

  let adjacentDuplicates = 0;
  for (let i = 1; i < wordSpans.length; i++) {
    if (
      wordSpans[i]!.text.toLowerCase() === wordSpans[i - 1]!.text.toLowerCase()
    ) {
      adjacentDuplicates += 1;
    }
  }

  return {
    words: wordCount,
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    sentences: sentenceCount,
    paragraphs: Math.max(paraSpans.length, wordCount > 0 ? 1 : 0),
    avgSentenceLength:
      sentenceCount > 0 ? round(wordCount / sentenceCount, 1) : 0,
    longestSentenceLength: longestSentence,
    longSentenceCount: longSentences,
    longSentencePct:
      sentenceCount > 0 ? round((longSentences / sentenceCount) * 100, 0) : 0,
    readingTimeSeconds: Math.round((wordCount / READING_WPM) * 60),
    speakingTimeSeconds: Math.round((wordCount / SPEAKING_WPM) * 60),
    passiveVoiceCount: countMatches(text, PASSIVE_RE),
    fillerCount: countMatches(text, FILLER_RE),
    repeatedWordRate:
      wordCount > 1 ? round(adjacentDuplicates / (wordCount - 1), 4) : 0,
  };
}

export function computeReadability(
  text: string,
  stats: DocumentStats = computeStats(text),
): ReadabilityScores {
  const nWords = stats.words;
  const nSentences = stats.sentences;
  const nSyllables = totalSyllables(text);
  const nComplex = complexWordCount(text);
  const letters = text.replace(/[^A-Za-z]/g, '').length;

  const sufficient =
    nWords >= MIN_WORDS_FOR_READABILITY &&
    nSentences >= MIN_SENTENCES_FOR_READABILITY;

  if (nWords === 0 || nSentences === 0) {
    return {
      sufficientText: false,
      fleschReadingEase: 0,
      fleschKincaidGrade: 0,
      gunningFog: 0,
      colemanLiau: 0,
      smog: 0,
      grade: 'Not enough text yet',
    };
  }

  const wordsPerSentence = nWords / nSentences;
  const syllablesPerWord = nSyllables / nWords;

  const fleschReadingEase = clamp(
    206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord,
    0,
    100,
  );
  const fleschKincaidGrade = Math.max(
    0,
    round(0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59, 1),
  );
  const gunningFog = Math.max(
    0,
    round(0.4 * (wordsPerSentence + 100 * (nComplex / nWords)), 1),
  );
  const L = (letters / nWords) * 100;
  const S = (nSentences / nWords) * 100;
  const colemanLiau = round(0.0588 * L - 0.296 * S - 15.8, 1);
  // SMOG normalizes to a 30-sentence sample; small samples inflate variance,
  // which `sufficientText` warns the UI about.
  const smog = round(
    1.043 * Math.sqrt(nComplex * (30 / nSentences)) + 3.1291,
    1,
  );

  return {
    sufficientText: sufficient,
    fleschReadingEase: round(fleschReadingEase, 0),
    fleschKincaidGrade,
    gunningFog,
    colemanLiau: Math.max(0, colemanLiau),
    smog: Math.max(0, smog),
    grade: describeGrade(fleschKincaidGrade, fleschReadingEase),
  };
}

function describeGrade(fkGrade: number, ease: number): string {
  const g = Math.round(fkGrade);
  const band =
    ease >= 70
      ? 'easy to read'
      : ease >= 50
        ? 'plain English'
        : ease >= 30
          ? 'fairly difficult'
          : 'hard going';
  if (g <= 6) return `Grade ${Math.max(1, g)} — ${band}`;
  if (g <= 9) return `Grade ${g} — ${band}`;
  if (g <= 12) return `Grade ${g} (high school) — ${band}`;
  if (g <= 16) return `College level — ${band}`;
  return `Postgraduate — ${band}`;
}

function countMatches(text: string, re: RegExp): number {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text) !== null) n += 1;
  return n;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
