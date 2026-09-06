import { describe, it, expect, afterEach, vi } from 'vitest';
import { extensionContextGone } from '@/utils/extension-context';

afterEach(() => vi.unstubAllGlobals());

describe('extensionContextGone (§5.3)', () => {
  it('recognises the invalidation message in any casing / phrasing', () => {
    expect(
      extensionContextGone(new Error('Extension context invalidated.')),
    ).toBe(true);
    expect(
      extensionContextGone(new Error('The extension context was invalidated')),
    ).toBe(true);
    expect(extensionContextGone('context invalidated')).toBe(true);
  });

  it('is false for ordinary errors', () => {
    expect(extensionContextGone(new Error('network timeout'))).toBe(false);
    expect(extensionContextGone(new Error('quota exceeded'))).toBe(false);
    expect(extensionContextGone(undefined)).toBe(false);
  });

  it('true when chrome.runtime exists but its id is gone (the signature)', () => {
    vi.stubGlobal('chrome', { runtime: {} });
    expect(extensionContextGone()).toBe(true);
  });

  it('false when chrome.runtime has an id', () => {
    vi.stubGlobal('chrome', { runtime: { id: 'abcdefghijklmnop' } });
    expect(extensionContextGone()).toBe(false);
  });

  it('false when there is no chrome global at all (tests / non-extension)', () => {
    vi.stubGlobal('chrome', undefined);
    expect(extensionContextGone()).toBe(false);
    expect(extensionContextGone(new Error('some other failure'))).toBe(false);
  });

  it('true when touching chrome.runtime throws', () => {
    vi.stubGlobal('chrome', {
      get runtime(): never {
        throw new Error('Extension context invalidated.');
      },
    });
    expect(extensionContextGone()).toBe(true);
  });
});
