/**
 * Deterministic text segmentation (§10.1 "segmenter") — sentences, words,
 * paragraphs, and syllable estimation.
 *
 * All offsets are UTF-16 code units against the normalized snapshot (§10.3).
 * These functions are pure and locale-light: good enough for English
 * readability/stat math, not a full ICU segmenter.
 */

export interface Span {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** Abbreviations that should NOT end a sentence when followed by a period. */
const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'vs',
  'etc',
  'inc',
  'ltd',
  'co',
  'corp',
  'dept',
  'est',
  'fig',
  'gen',
  'gov',
  'hon',
  'no',
  'op',
  'pp',
  'rev',
  'sec',
  'al',
  'ca',
  'cf',
  'ed',
  'eds',
  'esp',
  'ibid',
  'i.e',
  'e.g',
  'a.m',
  'p.m',
  'u.s',
  'u.k',
  'ph.d',
  'm.d',
  'b.a',
  'm.a',
]);

const WORD_RE = /[\p{L}\p{M}](?:[\p{L}\p{M}\p{Nd}''-]*[\p{L}\p{M}\p{Nd}])?/gu;

/** Split into word spans (UTF-16 offsets). Hyphenated/apostrophized words stay whole. */
export function words(text: string): Span[] {
  const out: Span[] = [];
  WORD_RE.lastIndex = 0;
  for (let m = WORD_RE.exec(text); m !== null; m = WORD_RE.exec(text)) {
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return out;
}

export function wordCount(text: string): number {
  let n = 0;
  WORD_RE.lastIndex = 0;
  while (WORD_RE.exec(text) !== null) n++;
  return n;
}

/** Split into paragraph spans on blank lines. */
export function paragraphs(text: string): Span[] {
  const out: Span[] = [];
  const re = /[^\n]+(?:\n(?!\s*\n)[^\n]*)*/g;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const raw = m[0];
    const trimmedStart = raw.length - raw.trimStart().length;
    const trimmedEnd = raw.length - raw.trimEnd().length;
    if (raw.trim().length === 0) continue;
    out.push({
      start: m.index + trimmedStart,
      end: m.index + raw.length - trimmedEnd,
      text: raw.trim(),
    });
  }
  return out;
}

/**
 * Split into sentence spans. Heuristic: a run of `.!?` ends a sentence unless
 * it looks like an abbreviation, an initial, a decimal number, or an ellipsis
 * mid-thought. A trailing fragment with no terminator counts as one sentence.
 */
export function sentences(text: string): Span[] {
  const out: Span[] = [];
  let start = 0;
  const n = text.length;

  for (let i = 0; i < n; i++) {
    const ch = text[i]!;
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;

    // Consume a run of terminators + closing quotes/brackets.
    let end = i + 1;
    while (end < n && '.!?)]}"’”'.includes(text[end]!)) end++;

    const after = text.slice(end);
    const before = text.slice(start, i + 1);
    const terminatorRun = text.slice(i, end).replace(/[)\]}"’”]/g, '');

    // Need whitespace/end after the terminator to be a boundary.
    if (after.length > 0 && !/^\s/.test(after)) {
      i = end - 1;
      continue;
    }
    // A three-dot ellipsis is a pause, not a sentence end (four+ dots is).
    if (terminatorRun === '...' || terminatorRun === '..') {
      i = end - 1;
      continue;
    }
    // Abbreviation / single initial before the period.
    const lastToken = /([\p{L}.]+)\.?$/u.exec(before.trimEnd())?.[1] ?? '';
    const bare = lastToken.replace(/\.$/, '').toLowerCase();
    if (ch === '.' && (ABBREVIATIONS.has(bare) || /^\p{L}$/u.test(bare))) {
      i = end - 1;
      continue;
    }
    // Decimal number: "3.14" — period between digits.
    if (ch === '.' && /\d$/.test(before) && /^\d/.test(after.trimStart())) {
      i = end - 1;
      continue;
    }

    const sentenceText = text.slice(start, end).trim();
    if (sentenceText.length > 0) {
      const leading =
        text.slice(start, end).length -
        text.slice(start, end).trimStart().length;
      out.push({
        start: start + leading,
        end: start + text.slice(start, end).trimEnd().length,
        text: sentenceText,
      });
    }
    start = end;
    i = end - 1;
  }

  const tail = text.slice(start).trim();
  if (tail.length > 0) {
    const leading =
      text.slice(start).length - text.slice(start).trimStart().length;
    out.push({
      start: start + leading,
      end: start + text.slice(start).trimEnd().length,
      text: tail,
    });
  }
  return out;
}

export function sentenceCount(text: string): number {
  return sentences(text).length;
}

/**
 * Estimate syllables in an English word (vowel-group heuristic with the common
 * silent-e / "-le" / diphthong corrections). Not perfect, but stable and
 * standard for Flesch-family scores.
 */
export function syllablesIn(word: string): number {
  const original = word.toLowerCase().replace(/[^a-z]/g, '');
  if (original.length === 0) return 0;
  if (original.length <= 3) return 1;

  // Drop a silent trailing "e" / "es" / "ed" so it is not counted as a group.
  const stripped = original
    .replace(/(?:[^laeiouy]e|es|ed)$/, (m) =>
      m.length === 1 ? '' : m.slice(1),
    )
    .replace(/e$/, '')
    .replace(/^y/, '');

  const groups = stripped.match(/[aeiouy]{1,3}/g);
  let count = groups ? groups.length : 0;

  // "consonant + le" at the end is its own syllable ("table", "little").
  if (/[^aeiouy]le$/.test(original)) count += 1;

  return Math.max(1, count);
}

export function totalSyllables(text: string): number {
  let total = 0;
  for (const w of words(text)) total += syllablesIn(w.text);
  return total;
}

/** Words with 3+ syllables — "complex" words for Gunning Fog / SMOG. */
export function complexWordCount(text: string): number {
  let n = 0;
  for (const w of words(text)) {
    const bare = w.text.toLowerCase();
    // Exclude common suffix-inflated words per Fog's definition.
    if (
      /(?:es|ed|ing)$/.test(bare) &&
      syllablesIn(bare.replace(/(?:es|ed|ing)$/, '')) < 3
    ) {
      continue;
    }
    if (syllablesIn(bare) >= 3) n += 1;
  }
  return n;
}
