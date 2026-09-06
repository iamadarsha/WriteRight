/**
 * Universal in-page Shadow DOM host (§15.1, §1.2, §6.5).
 *
 * A single closed shadow root that owns every piece of WriteRight UI injected
 * into a page (future: underline overlay, suggestion popover, universal
 * sidebar). Isolated styles, no host-page CSS leakage in either direction, and
 * idempotent mount/unmount so lifecycle churn cannot create duplicates (§5.3).
 *
 * Phase 1 renders nothing visible — it only proves the host mounts cleanly and
 * tears down without residue.
 */

import tokensCss from './styles/tokens.css?inline';
import type { Settings } from '@/types/settings';
import { resolveTheme } from './theme';
import { createLogger } from '@/utils/logger';

const log = createLogger('shadow-host');
const HOST_ID = 'writeright-host';

export interface ShadowHost {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
  /** Layer for non-interactive overlays (underlines). `pointer-events: none`. */
  readonly overlayLayer: HTMLElement;
  /** Layer for interactive UI (popover, sidebar). */
  readonly uiLayer: HTMLElement;
  applyStyleSheet(css: string): void;
  /** Apply the user's theme / motion / font-scale to the shadow root (§9.1). */
  applyPreferences(settings: Settings): void;
  destroy(): void;
}

let current: ShadowHost | null = null;

export function getShadowHost(): ShadowHost | null {
  return current;
}

export function mountShadowHost(doc: Document = document): ShadowHost {
  if (current && current.host.isConnected) return current;

  // Clean up any stale host from a previous injection (extension reload, §0.4).
  doc.getElementById(HOST_ID)?.remove();

  const host = doc.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-writeright', 'host');
  // The host itself must not affect layout or intercept input.
  host.style.cssText =
    'all: initial; position: fixed; inset: 0; z-index: 2147483646; pointer-events: none;';

  const root = host.attachShadow({ mode: 'closed' });

  const style = doc.createElement('style');
  style.textContent = tokensCss;
  root.appendChild(style);

  const shell = doc.createElement('div');
  shell.setAttribute('data-writeright-root', '');
  shell.style.cssText =
    'position: absolute; inset: 0; font-family: var(--wr-font-sans); color: var(--wr-text);';

  const overlayLayer = doc.createElement('div');
  overlayLayer.setAttribute('data-wr-layer', 'overlay');
  overlayLayer.style.cssText =
    'position: absolute; inset: 0; pointer-events: none;';

  const uiLayer = doc.createElement('div');
  uiLayer.setAttribute('data-wr-layer', 'ui');
  uiLayer.style.cssText = 'position: absolute; inset: 0; pointer-events: none;';

  shell.append(overlayLayer, uiLayer);
  root.appendChild(shell);
  (doc.body ?? doc.documentElement).appendChild(host);

  const extraSheets: HTMLStyleElement[] = [];

  const instance: ShadowHost = {
    host,
    root,
    overlayLayer,
    uiLayer,
    applyStyleSheet(css: string) {
      const el = doc.createElement('style');
      el.textContent = css;
      root.appendChild(el);
      extraSheets.push(el);
    },
    applyPreferences(settings: Settings) {
      const simple = settings.simpleMode ? 'true' : 'false';
      const motion = settings.reducedMotion ? 'true' : 'false';
      shell.setAttribute('data-wr-theme', resolveTheme(settings.theme));
      shell.setAttribute('data-wr-reduced-motion', motion);
      shell.setAttribute('data-wr-simple', simple);
      shell.style.setProperty('--wr-font-scale', String(settings.fontScale));
      // Mirror onto the light-DOM host so automation / debugging can see it
      // without piercing the closed root (counts & flags only, §6.8).
      host.dataset['wrSimple'] = simple;
      host.dataset['wrReducedMotion'] = motion;
    },
    destroy() {
      for (const s of extraSheets.splice(0)) s.remove();
      host.remove();
      if (current === instance) current = null;
    },
  };

  current = instance;
  log.debug('shadow host mounted');
  return instance;
}
