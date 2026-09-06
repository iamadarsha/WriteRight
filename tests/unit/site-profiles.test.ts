import { describe, it, expect } from 'vitest';
import { resolveSiteProfile } from '@/adapters/sites/site-profiles';

/**
 * §5.1 — known canvas / virtualized editors that WriteRight cannot check
 * inline. The matcher must be tight: the Google Docs *editor* is unsupported,
 * but the Docs home / list view, Drive, Gmail and the rest of google.com are
 * ordinary pages and must fall through to normal field detection.
 */

const loc = (url: string): { hostname: string; pathname: string } => {
  const u = new URL(url);
  return { hostname: u.hostname, pathname: u.pathname };
};

describe('resolveSiteProfile — Google Docs (§5.1)', () => {
  it.each([
    'https://docs.google.com/document/d/1AbCdEfHiJk/edit',
    'https://docs.google.com/document/d/1AbCdEfHiJk/edit?usp=sharing',
    'https://docs.google.com/document/u/0/d/1AbCdEfHiJk/edit',
    'https://docs.google.com/document/u/2/d/1AbCdEfHiJk/edit',
  ])('matches the doc editor: %s', (url) => {
    const p = resolveSiteProfile(loc(url));
    expect(p?.id).toBe('google-docs');
    expect(p?.label).toBe('Google Docs');
    expect(p?.detail).toMatch(/canvas/i);
    expect(p?.detail).toMatch(/sidebar/i);
  });

  it.each([
    'https://docs.google.com/document/u/0/', // doc list
    'https://docs.google.com/document/', // bare
    'https://docs.google.com/spreadsheets/d/1AbC/edit', // Sheets
    'https://docs.google.com/presentation/d/1AbC/edit', // Slides
    'https://drive.google.com/drive/my-drive',
    'https://mail.google.com/mail/u/0/#inbox',
    'https://www.google.com/search?q=docs',
    'https://example.com/document/d/123/edit', // look-alike path, wrong host
    'https://notdocs.google.com.evil.test/document/d/1/edit',
  ])('does not match: %s', (url) => {
    expect(resolveSiteProfile(loc(url))).toBeNull();
  });

  it('tolerates a malformed location without throwing', () => {
    expect(resolveSiteProfile({ hostname: '', pathname: '' })).toBeNull();
    expect(
      resolveSiteProfile({
        hostname: 'docs.google.com',
        pathname: '',
      }),
    ).toBeNull();
  });
});
