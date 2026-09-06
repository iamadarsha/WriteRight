import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PageLifecycle } from '@/core/page-lifecycle';

let lifecycle: PageLifecycle;

beforeEach(() => {
  lifecycle = new PageLifecycle();
});
afterEach(() => {
  lifecycle.stop();
  window.history.replaceState(null, '', '/');
});

describe('PageLifecycle (§5.3, §0.4)', () => {
  it('emits url-changed on popstate when the URL actually changed', () => {
    lifecycle.start();
    const seen: string[] = [];
    lifecycle.events.on('url-changed', ({ to }) => seen.push(to));

    window.history.pushState(null, '', '/page-2');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('/page-2');

    // No change → no event.
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(seen).toHaveLength(1);
  });

  it('emits page-shown / page-hidden with the persisted flag', () => {
    lifecycle.start();
    const shown = vi.fn();
    const hidden = vi.fn();
    lifecycle.events.on('page-shown', shown);
    lifecycle.events.on('page-hidden', hidden);

    window.dispatchEvent(
      Object.assign(new Event('pageshow'), { persisted: true }),
    );
    window.dispatchEvent(
      Object.assign(new Event('pagehide'), { persisted: false }),
    );
    expect(shown).toHaveBeenCalledWith({ persisted: true });
    expect(hidden).toHaveBeenCalledWith({ persisted: false });
  });

  it('emits visibility-changed', () => {
    lifecycle.start();
    const fn = vi.fn();
    lifecycle.events.on('visibility-changed', fn);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fn).toHaveBeenCalledWith({
      visible: document.visibilityState === 'visible',
    });
  });

  it('notifyDomReplaced emits dom-replaced', () => {
    lifecycle.start();
    const fn = vi.fn();
    lifecycle.events.on('dom-replaced', fn);
    lifecycle.notifyDomReplaced();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stop() detaches every listener', () => {
    lifecycle.start();
    const fn = vi.fn();
    lifecycle.events.on('page-shown', fn);
    lifecycle.stop();
    window.dispatchEvent(
      Object.assign(new Event('pageshow'), { persisted: false }),
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('start() is idempotent (no duplicate listeners)', () => {
    lifecycle.start();
    lifecycle.start();
    const fn = vi.fn();
    lifecycle.events.on('page-shown', fn);
    window.dispatchEvent(
      Object.assign(new Event('pageshow'), { persisted: false }),
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
