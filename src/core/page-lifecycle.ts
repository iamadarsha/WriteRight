/**
 * Page lifecycle observation (§5.3, §0.4 "always live").
 *
 * Emits normalized lifecycle events so the {@link TextFieldManager} can rescan,
 * re-snapshot and recover after: SPA route changes, bfcache restore, tab
 * visibility changes and browser sleep/wake.
 *
 * We prefer lightweight observation over monkey-patching page globals (§5.3):
 * the Navigation API when present, otherwise `popstate`/`hashchange` plus a
 * cheap URL check driven by events we already listen to.
 */

import { EventBus } from './event-bus';

export type PageLifecycleEvents = {
  'url-changed': { from: string; to: string };
  'page-shown': { persisted: boolean };
  'page-hidden': { persisted: boolean };
  'visibility-changed': { visible: boolean };
  /** A large DOM subtree was replaced — likely a client-side view swap. */
  'dom-replaced': Record<string, never>;
};

interface NavigationLike extends EventTarget {
  addEventListener(type: 'navigate', listener: () => void): void;
  removeEventListener(type: 'navigate', listener: () => void): void;
}

export class PageLifecycle {
  readonly events = new EventBus<PageLifecycleEvents>();
  #cleanups: Array<() => void> = [];
  #lastUrl = location.href;
  #started = false;

  start(): void {
    if (this.#started) return;
    this.#started = true;

    const onPageShow = (ev: PageTransitionEvent): void => {
      this.#checkUrl();
      this.events.emit('page-shown', { persisted: ev.persisted });
    };
    const onPageHide = (ev: PageTransitionEvent): void => {
      this.events.emit('page-hidden', { persisted: ev.persisted });
    };
    const onVisibility = (): void => {
      const visible = document.visibilityState === 'visible';
      if (visible) this.#checkUrl();
      this.events.emit('visibility-changed', { visible });
    };
    const onPopState = (): void => this.#checkUrl();
    const onHashChange = (): void => this.#checkUrl();

    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);

    this.#cleanups.push(
      () => window.removeEventListener('pageshow', onPageShow),
      () => window.removeEventListener('pagehide', onPageHide),
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => window.removeEventListener('popstate', onPopState),
      () => window.removeEventListener('hashchange', onHashChange),
    );

    const nav = (window as Window & { navigation?: NavigationLike }).navigation;
    if (nav && typeof nav.addEventListener === 'function') {
      const onNavigate = (): void => {
        // Navigation API fires before the URL settles; defer a tick.
        queueMicrotask(() => this.#checkUrl());
      };
      nav.addEventListener('navigate', onNavigate);
      this.#cleanups.push(() =>
        nav.removeEventListener('navigate', onNavigate),
      );
    }
  }

  /** Call from the manager's MutationObserver when a big subtree changes. */
  notifyDomReplaced(): void {
    this.#checkUrl();
    this.events.emit('dom-replaced', {});
  }

  stop(): void {
    for (const fn of this.#cleanups.splice(0)) fn();
    this.events.clear();
    this.#started = false;
  }

  #checkUrl(): void {
    const current = location.href;
    if (current === this.#lastUrl) return;
    const from = this.#lastUrl;
    this.#lastUrl = current;
    this.events.emit('url-changed', { from, to: current });
  }
}
