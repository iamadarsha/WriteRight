/**
 * Theme + accessibility preference application (§9.1, §9.5, §20.1).
 *
 * Applies `theme`, `fontScale` and `reducedMotion` to a root element by setting
 * `data-*` attributes that `tokens.css` reacts to. Works for the popup/options
 * documents and for the content-script Shadow DOM host.
 */

import type { Settings, ThemePreference } from '@/types/settings';

export interface ThemeableRoot {
  setAttribute(name: string, value: string): void;
  style: { setProperty(name: string, value: string): void };
}

/** Resolve `system` against the current media query. */
export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  const mql = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  return mql?.matches ? 'dark' : 'light';
}

export function applyTheme(root: ThemeableRoot, settings: Settings): void {
  root.setAttribute('data-writeright-root', '');
  root.setAttribute('data-wr-theme', resolveTheme(settings.theme));
  root.setAttribute(
    'data-wr-reduced-motion',
    settings.reducedMotion ? 'true' : 'false',
  );
  root.setAttribute('data-wr-simple', settings.simpleMode ? 'true' : 'false');
  root.style.setProperty('--wr-font-scale', String(settings.fontScale));
  root.style.setProperty(
    'font-size',
    `calc(${13} * var(--wr-font-scale, 1) * 1px)`,
  );
}

/**
 * Subscribe to OS theme changes so a `system` preference stays live.
 * Returns an unsubscribe function.
 */
export function watchSystemTheme(onChange: () => void): () => void {
  const mql = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mql) return () => {};
  const handler = (): void => onChange();
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
