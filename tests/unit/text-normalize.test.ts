import { describe, it, expect } from 'vitest';
import { normalizeLineEndings } from '@/core/text-normalize';

describe('normalizeLineEndings (§10.3 reversible normalization)', () => {
  it('is identity when there are no CR characters', () => {
    const n = normalizeLineEndings('hello\nworld 🧠');
    expect(n.identity).toBe(true);
    expect(n.text).toBe('hello\nworld 🧠');
    expect(n.toSource(5)).toBe(5);
    expect(n.fromSource(5)).toBe(5);
  });

  it('collapses CRLF to LF and maps offsets back to source', () => {
    const src = 'a\r\nb\r\nc';
    const n = normalizeLineEndings(src);
    expect(n.text).toBe('a\nb\nc');
    // normalized "b" is at index 2; in source it is at index 3.
    expect(n.text[2]).toBe('b');
    expect(src[n.toSource(2)]).toBe('b');
    // round trip
    for (let i = 0; i <= n.text.length; i++) {
      expect(n.fromSource(n.toSource(i))).toBe(i);
    }
  });

  it('converts a lone CR to LF (length preserved)', () => {
    const n = normalizeLineEndings('a\rb');
    expect(n.text).toBe('a\nb');
    expect(n.toSource(3)).toBe(3);
  });

  it('clamps out-of-range offsets', () => {
    const n = normalizeLineEndings('a\r\nb');
    expect(n.toSource(999)).toBe(4);
    expect(n.fromSource(-5)).toBe(0);
  });

  it('preserves emoji / combining marks in the mapping', () => {
    const src = 'é\r\n😀\r\nx'; // é (combining), emoji (surrogate pair)
    const n = normalizeLineEndings(src);
    expect(n.text).toBe('é\n😀\nx');
    for (let i = 0; i <= n.text.length; i++) {
      expect(n.fromSource(n.toSource(i))).toBe(i);
    }
  });
});
