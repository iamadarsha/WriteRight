import { describe, it, expect } from 'vitest';
import { normalizeLineEndings } from '@/core/text-normalize';
import { words, sentences } from '@/core/segmenter';

/**
 * §23.2 — every shared offset is a UTF-16 code unit. This suite pins that
 * behaviour for the hard cases: astral emoji (surrogate pairs), ZWJ sequences,
 * skin-tone modifiers, flags, combining marks, and non-Latin scripts including
 * a right-to-left one.
 */

const ZWJ_FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}'; // 👨‍👩‍👧, 8 UTF-16 units
const FLAG_JP = '\u{1F1EF}\u{1F1F5}'; // 🇯🇵, 4 units
const SKIN_TONE = '\u{1F44B}\u{1F3FD}'; // 👋🏽, 4 units
const COMBINING = 'é'; // é as e + combining acute, 2 units
const CJK = '文字校正'; // 4 units, no spaces
const ARABIC = 'مرحبا بالعالم'; // RTL

describe('UTF-16 code-unit offsets (§10.3, §23.2)', () => {
  it('String indexing is code units, not code points — sanity', () => {
    expect(ZWJ_FAMILY.length).toBe(8);
    expect(FLAG_JP.length).toBe(4);
    expect([...ZWJ_FAMILY].length).toBeLessThan(ZWJ_FAMILY.length);
  });

  it('normalizeLineEndings maps offsets across surrogate pairs and combining marks', () => {
    const src = `${COMBINING}\r\n${ZWJ_FAMILY}\r\ntail`;
    const { text, toSource, fromSource } = normalizeLineEndings(src);
    // CRLF collapsed to LF; every other code unit preserved.
    expect(text).toBe(`${COMBINING}\n${ZWJ_FAMILY}\ntail`);
    // The mapping is monotonic and covers the whole normalized string, and it
    // round-trips (§10.3 "must be reversible").
    for (let i = 0; i <= text.length; i++) {
      const orig = toSource(i);
      expect(orig).toBeGreaterThanOrEqual(0);
      expect(orig).toBeLessThanOrEqual(src.length);
      expect(fromSource(orig)).toBe(i);
    }
    // A position at the start of the ZWJ family (right after the first LF) maps
    // past the dropped '\r' in the source.
    const startOfFamilyNormalized = COMBINING.length + 1;
    expect(toSource(startOfFamilyNormalized)).toBe(COMBINING.length + 2);
  });

  it('a suggestion-style slice round-trips for emoji-laden text', () => {
    // Simulate: engine reports [start,end) in the normalized snapshot; the
    // renderer slices it back out and must get exactly the original substring.
    const snapshot = `Hi ${SKIN_TONE} team, ${FLAG_JP} launch ${ZWJ_FAMILY} soon`;
    const target = 'launch';
    const start = snapshot.indexOf(target);
    const end = start + target.length;
    expect(snapshot.slice(start, end)).toBe(target);
    // The emoji before it occupy real code units — the offset is not a
    // grapheme or code-point index.
    expect(start).toBeGreaterThan([...`Hi  team,  `].length);
  });

  it('word segmentation keeps emoji out of word spans but never splits a surrogate pair', () => {
    const text = `deploy ${ZWJ_FAMILY} the ${FLAG_JP} build`;
    const spans = words(text);
    for (const span of spans) {
      // Each word span is well-formed: slicing it yields the reported text and
      // does not start or end in the middle of a surrogate pair.
      expect(text.slice(span.start, span.end)).toBe(span.text);
      expect(isLoneSurrogate(text.charCodeAt(span.start))).toBe(false);
      expect(isLoneSurrogate(text.charCodeAt(span.end - 1))).toBe(false);
    }
    expect(spans.map((s) => s.text)).toEqual(
      expect.arrayContaining(['deploy', 'the', 'build']),
    );
  });

  it('handles CJK text with no spaces (non-Latin, §23.2)', () => {
    const text = `${CJK}。${CJK}。`;
    const sents = sentences(text);
    expect(sents.length).toBeGreaterThanOrEqual(1);
    for (const s of sents) expect(text.slice(s.start, s.end)).toBe(s.text);
  });

  it('handles right-to-left text without corrupting offsets', () => {
    const text = `note: ${ARABIC} (draft)`;
    const spans = words(text);
    for (const span of spans) {
      expect(text.slice(span.start, span.end)).toBe(span.text);
    }
    // The parenthetical Latin word is still found at its code-unit position.
    const draftAt = text.indexOf('draft');
    expect(text.slice(draftAt, draftAt + 5)).toBe('draft');
  });

  it('combining marks are not split by segmentation', () => {
    const text = `caf${COMBINING} au lait`; // "café au lait" with decomposed é
    const spans = words(text);
    const first = spans[0]!;
    expect(text.slice(first.start, first.end)).toBe(`caf${COMBINING}`);
  });
});

function isLoneSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdfff;
}
