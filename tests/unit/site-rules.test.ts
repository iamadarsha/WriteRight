import { describe, it, expect } from 'vitest';
import {
  isSiteEnabled,
  setSiteEnabled,
  setSiteIgnoredRules,
  getSiteRule,
  removeSiteRule,
  getSiteRules,
} from '@/storage/site-rules';

const ORIGIN = 'https://news.example.com';

describe('site rules (§20.3, §1.7)', () => {
  it('a site is enabled by default (no rule stored)', async () => {
    expect(await isSiteEnabled(ORIGIN)).toBe(true);
    expect(await getSiteRule(ORIGIN)).toBeUndefined();
  });

  it('disabling a site persists and is reflected by isSiteEnabled', async () => {
    await setSiteEnabled(ORIGIN, false);
    expect(await isSiteEnabled(ORIGIN)).toBe(false);
    const rule = await getSiteRule(ORIGIN);
    expect(rule?.enabled).toBe(false);
    expect(rule?.updatedAt).toBeGreaterThan(0);
  });

  it('re-enabling flips it back', async () => {
    await setSiteEnabled(ORIGIN, false);
    await setSiteEnabled(ORIGIN, true);
    expect(await isSiteEnabled(ORIGIN)).toBe(true);
  });

  it('removeSiteRule forgets the origin entirely', async () => {
    await setSiteEnabled(ORIGIN, false);
    await removeSiteRule(ORIGIN);
    expect(await getSiteRule(ORIGIN)).toBeUndefined();
    expect(Object.keys((await getSiteRules()).rules)).toHaveLength(0);
  });

  it('rules for different origins do not collide', async () => {
    await setSiteEnabled('https://a.example', false);
    await setSiteEnabled('https://b.example', true);
    expect(await isSiteEnabled('https://a.example')).toBe(false);
    expect(await isSiteEnabled('https://b.example')).toBe(true);
  });

  it('two concurrent updates on one origin both land (§20.4)', async () => {
    await Promise.all([
      setSiteEnabled(ORIGIN, false),
      setSiteIgnoredRules(ORIGIN, ['harper:Spelling']),
    ]);
    const rule = await getSiteRule(ORIGIN);
    expect(rule?.enabled).toBe(false);
    expect(rule?.ignoredRuleIds).toEqual(['harper:Spelling']);
  });
});
