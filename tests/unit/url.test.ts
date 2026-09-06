import { describe, it, expect } from 'vitest';
import { isEligibleWebPage, originKey, originLabel } from '@/utils/url';

describe('isEligibleWebPage (§0.4 privileged surfaces)', () => {
  it('accepts ordinary http/https pages', () => {
    expect(isEligibleWebPage('https://example.com/page').eligible).toBe(true);
    expect(isEligibleWebPage('http://localhost:3000/').eligible).toBe(true);
  });

  it('rejects browser-internal and extension schemes', () => {
    for (const url of [
      'chrome://extensions',
      'about:addons',
      'edge://settings',
      'moz-extension://abc/options.html',
      'chrome-extension://abc/popup.html',
      'view-source:https://example.com',
      'devtools://devtools/bundled/inspector.html',
    ]) {
      const r = isEligibleWebPage(url);
      expect(r.eligible, url).toBe(false);
    }
  });

  it('rejects browser web stores', () => {
    expect(
      isEligibleWebPage('https://chromewebstore.google.com/detail/abc')
        .eligible,
    ).toBe(false);
    expect(
      isEligibleWebPage('https://addons.mozilla.org/en-US/firefox/').eligible,
    ).toBe(false);
  });

  it('rejects malformed URLs and non-web schemes', () => {
    expect(isEligibleWebPage('not a url').eligible).toBe(false);
    expect(isEligibleWebPage('ftp://files.example.com').eligible).toBe(false);
    expect(isEligibleWebPage('data:text/html,<h1>hi').eligible).toBe(false);
  });
});

describe('originKey / originLabel', () => {
  it('keys on protocol//host and treats subdomains as distinct sites', () => {
    expect(originKey('https://mail.google.com/mail/u/0')).toBe(
      'https://mail.google.com',
    );
    expect(originKey('https://google.com/')).not.toBe(
      originKey('https://mail.google.com/'),
    );
  });

  it('distinguishes ports', () => {
    expect(originKey('http://localhost:3000/')).not.toBe(
      originKey('http://localhost:4000/'),
    );
  });

  it('labels an origin with just the host', () => {
    expect(originLabel('https://mail.google.com')).toBe('mail.google.com');
  });
});
