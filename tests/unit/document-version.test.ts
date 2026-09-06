import { describe, it, expect } from 'vitest';
import { DocumentVersion } from '@/core/document-version';

describe('DocumentVersion (§17.3)', () => {
  it('starts at 0 and increments monotonically', () => {
    const v = new DocumentVersion();
    expect(v.value).toBe(0);
    expect(v.bump()).toBe(1);
    expect(v.bump()).toBe(2);
    expect(v.value).toBe(2);
  });

  it('isCurrent only matches the latest version', () => {
    const v = new DocumentVersion(5);
    expect(v.isCurrent(5)).toBe(true);
    v.bump();
    expect(v.isCurrent(5)).toBe(false);
    expect(v.isCurrent(6)).toBe(true);
  });
});
