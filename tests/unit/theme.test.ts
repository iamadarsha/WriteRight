import { describe, it, expect, vi } from 'vitest';
import { resolveTheme, applyTheme } from '@/ui/theme';
import { DEFAULT_SETTINGS } from '@/types/settings';

describe('theme (§9.1)', () => {
  it('resolves explicit preferences directly', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('resolves "system" against prefers-color-scheme', () => {
    vi.stubGlobal(
      'matchMedia',
      (q: string) =>
        ({ matches: q.includes('dark'), media: q }) as MediaQueryList,
    );
    expect(resolveTheme('system')).toBe('dark');
    vi.unstubAllGlobals();
  });

  it('falls back to light when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(resolveTheme('system')).toBe('light');
    vi.unstubAllGlobals();
  });

  it('applyTheme sets data attributes and font scale', () => {
    const root = document.createElement('div');
    applyTheme(root, {
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      reducedMotion: true,
      fontScale: 1.2,
    });
    expect(root.getAttribute('data-wr-theme')).toBe('dark');
    expect(root.getAttribute('data-wr-reduced-motion')).toBe('true');
    expect(root.style.getPropertyValue('--wr-font-scale')).toBe('1.2');
  });
});
