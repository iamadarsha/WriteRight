import { describe, it, expect, beforeEach } from 'vitest';
import { mountShadowHost, getShadowHost } from '@/ui/shadow-host';
import { DEFAULT_SETTINGS } from '@/types/settings';

beforeEach(() => {
  document.body.innerHTML = '';
  getShadowHost()?.destroy();
});

describe('mountShadowHost (§15.1, §6.5)', () => {
  it('mounts a single closed shadow root with overlay + ui layers', () => {
    const host = mountShadowHost(document);
    expect(document.getElementById('writeright-host')).toBe(host.host);
    expect(host.root.mode).toBe('closed');
    expect(host.overlayLayer.getAttribute('data-wr-layer')).toBe('overlay');
    expect(host.uiLayer.getAttribute('data-wr-layer')).toBe('ui');
  });

  it('is idempotent — a second mount returns the same instance', () => {
    const a = mountShadowHost(document);
    const b = mountShadowHost(document);
    expect(a).toBe(b);
    expect(document.querySelectorAll('#writeright-host')).toHaveLength(1);
  });

  it('the host does not intercept pointer events or affect layout', () => {
    const host = mountShadowHost(document);
    expect(host.host.style.pointerEvents).toBe('none');
    expect(host.host.style.position).toBe('fixed');
  });

  it('applyPreferences() reflects theme, motion and font-scale onto the shell (§9.1)', () => {
    const host = mountShadowHost(document);
    host.applyPreferences({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      reducedMotion: true,
      fontScale: 1.25,
    });
    const shell = host.root.querySelector(
      '[data-writeright-root]',
    ) as HTMLElement;
    expect(shell.getAttribute('data-wr-theme')).toBe('dark');
    expect(shell.getAttribute('data-wr-reduced-motion')).toBe('true');
    expect(shell.style.getPropertyValue('--wr-font-scale')).toBe('1.25');

    host.applyPreferences({
      ...DEFAULT_SETTINGS,
      theme: 'light',
      reducedMotion: false,
      fontScale: 1,
    });
    expect(shell.getAttribute('data-wr-theme')).toBe('light');
    expect(shell.getAttribute('data-wr-reduced-motion')).toBe('false');
  });

  it('destroy() removes the host entirely', () => {
    const host = mountShadowHost(document);
    host.destroy();
    expect(document.getElementById('writeright-host')).toBeNull();
    expect(getShadowHost()).toBeNull();
  });

  it('re-mount after an extension reload clears the stale host', () => {
    const first = mountShadowHost(document);
    // Simulate a reload leaving a detached-then-reattached DOM: force a new host.
    first.host.remove();
    const second = mountShadowHost(document);
    expect(second).not.toBe(first);
    expect(document.querySelectorAll('#writeright-host')).toHaveLength(1);
  });
});
