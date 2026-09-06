import { describe, it, expect } from 'vitest';
import { fnv1a, shortHash, contentHash } from '@/utils/hash';

describe('hash utils', () => {
  it('fnv1a is deterministic and unsigned 32-bit', () => {
    const a = fnv1a('the quick brown fox');
    expect(a).toBe(fnv1a('the quick brown fox'));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0xffffffff);
  });

  it('distinguishes near-identical strings', () => {
    expect(fnv1a('teh')).not.toBe(fnv1a('the'));
    expect(shortHash('a ')).not.toBe(shortHash(' a'));
  });

  it('handles unicode without throwing', () => {
    expect(() => fnv1a('café — 🧠 — 日本語')).not.toThrow();
    expect(contentHash('🧠')).toContain('-');
  });

  it('contentHash changes when length changes even if prefix matches', () => {
    expect(contentHash('abc')).not.toBe(contentHash('abcd'));
  });
});
