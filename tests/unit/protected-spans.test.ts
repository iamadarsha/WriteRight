import { describe, it, expect } from 'vitest';
import { findProtectedSpans, isRangeProtected } from '@/core/protected-spans';

describe('findProtectedSpans (§10.2)', () => {
  it('detects URLs and email addresses', () => {
    const text =
      'See https://example.com/docs or email a.b-c@sub.example.co.uk now';
    const spans = findProtectedSpans(text);
    const kinds = spans.map((s) => s.kind);
    expect(kinds).toContain('url');
    expect(kinds).toContain('email');
    const url = spans.find((s) => s.kind === 'url');
    expect(text.slice(url!.start, url!.end)).toBe('https://example.com/docs');
  });

  it('detects fenced and inline code, and does not double-claim inside a fence', () => {
    const text = 'before ```\nconst x = `t` // https://x.y\n``` after';
    const spans = findProtectedSpans(text);
    expect(spans.some((s) => s.kind === 'code-fence')).toBe(true);
    // The URL inside the fence must not appear as its own span.
    expect(spans.filter((s) => s.kind === 'url')).toHaveLength(0);
  });

  it('detects @mentions and #hashtags', () => {
    const spans = findProtectedSpans('hi @jane_doe about #ProjectX');
    expect(spans.find((s) => s.kind === 'mention')?.text).toBe('@jane_doe');
    expect(spans.find((s) => s.kind === 'hashtag')?.text).toBe('#ProjectX');
  });

  it('detects snake_case / camelCase identifiers and file paths', () => {
    const spans = findProtectedSpans(
      'call getUserProfile and read ./src/utils/hash.ts or my_var_name',
    );
    const kinds = spans.map((s) => s.kind);
    expect(kinds).toContain('file-path');
    expect(kinds).toContain('identifier');
  });

  it('honours user-provided extra patterns and ignores invalid regex', () => {
    const spans = findProtectedSpans('ticket ABC-123 and (bad', {
      extraPatterns: ['[A-Z]{3}-\\d+', '('],
    });
    expect(spans.find((s) => s.kind === 'custom')?.text).toBe('ABC-123');
  });

  it('leaves ordinary prose alone', () => {
    expect(findProtectedSpans('The cat sat on the mat.')).toHaveLength(0);
  });

  it('isRangeProtected reports overlap correctly', () => {
    const text = 'visit https://a.example now';
    const spans = findProtectedSpans(text);
    expect(isRangeProtected({ start: 6, end: 10 }, spans)).toBe(true);
    expect(isRangeProtected({ start: 0, end: 5 }, spans)).toBe(false);
  });
});
