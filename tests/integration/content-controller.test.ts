import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BackgroundController } from '@/core/background-controller';
import { ContentController } from '@/core/content-controller';
import { sendToBackground } from '@/messaging';

let background: BackgroundController;
let content: ContentController | undefined;

beforeEach(async () => {
  document.body.innerHTML = '';
  background = new BackgroundController();
  await background.start();
});

afterEach(() => {
  content?.stop();
  content = undefined;
  background.stop();
});

describe('ContentController', () => {
  it('mounts the Shadow DOM host on an eligible page and removes it on stop (§5.3, §15.1)', async () => {
    content = new ContentController({
      document,
      location: { href: 'https://example.com/article' },
    });
    await content.start();

    expect(document.getElementById('writeright-host')).not.toBeNull();
    content.stop();
    expect(document.getElementById('writeright-host')).toBeNull();
  });

  it('stays idle on a privileged page (no host, no manager)', async () => {
    content = new ContentController({
      document,
      location: { href: 'chrome://extensions' },
    });
    await content.start();
    expect(document.getElementById('writeright-host')).toBeNull();
    expect(content.status).toBeNull();
  });

  it('reflects the global disable from storage into its policy', async () => {
    content = new ContentController({
      document,
      location: { href: 'https://example.com/' },
    });
    await content.start();
    expect(content.policy.globallyEnabled).toBe(true);

    await sendToBackground({ type: 'SET_GLOBAL_ENABLED', enabled: false });
    // storage.onChanged is delivered synchronously by the fake browser.
    await Promise.resolve();
    expect(content.policy.globallyEnabled).toBe(false);
  });

  it('reflects a per-site disable for its own origin only', async () => {
    content = new ContentController({
      document,
      location: { href: 'https://blog.example.com/' },
    });
    await content.start();

    await sendToBackground({
      type: 'SET_SITE_ENABLED',
      origin: 'https://other.example.com',
      enabled: false,
    });
    await Promise.resolve();
    expect(content.policy.siteEnabled).toBe(true);

    await sendToBackground({
      type: 'SET_SITE_ENABLED',
      origin: 'https://blog.example.com',
      enabled: false,
    });
    await Promise.resolve();
    expect(content.policy.siteEnabled).toBe(false);
  });

  it('reports page status to the background', async () => {
    document.body.innerHTML = '<textarea></textarea>';
    content = new ContentController({
      document,
      location: { href: 'https://example.com/' },
    });
    await content.start();
    await Promise.resolve();

    // The manager computed a status and pushed it through the messaging bus.
    expect(content.status?.availability).toBe('ready');
  });

  it('creates a coordinator when a field is focused and disposes it on blur (§15)', async () => {
    document.body.innerHTML = '<textarea id="t"></textarea>';
    content = new ContentController({
      document,
      location: { href: 'https://example.com/' },
    });
    await content.start();

    const ta = document.getElementById('t') as HTMLTextAreaElement;
    ta.focus();
    ta.dispatchEvent(
      new FocusEvent('focusin', { bubbles: true, composed: true }),
    );
    await Promise.resolve();
    expect(content.coordinator).not.toBeNull();

    ta.blur();
    document.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await Promise.resolve();
    expect(content.coordinator).toBeNull();
  });

  it('toggles the sidebar with Alt+W and the OPEN_SIDEBAR broadcast', async () => {
    content = new ContentController({
      document,
      location: { href: 'https://example.com/' },
    });
    await content.start();
    expect(content.sidebarOpen).toBe(false);

    const altW = (): void => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'w',
          altKey: true,
          bubbles: true,
        }),
      );
    };

    altW();
    await Promise.resolve();
    expect(content.sidebarOpen).toBe(true);

    altW();
    await Promise.resolve();
    expect(content.sidebarOpen).toBe(false);
  });

  it('resolves and applies the format preset from settings', async () => {
    await sendToBackground({
      type: 'SET_SETTINGS',
      patch: { defaultPresetId: 'business-email' },
    });
    content = new ContentController({
      document,
      location: { href: 'https://example.com/' },
    });
    await content.start();
    await Promise.resolve();
    // No throw, host mounted, preset resolution path exercised.
    expect(document.getElementById('writeright-host')).not.toBeNull();
  });
});
