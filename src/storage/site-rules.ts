/**
 * Per-site controls (§20.3, §1.7).
 *
 * Keyed by origin (`protocol//host`). The most important lever is `enabled` —
 * users must be able to turn WriteRight off for a site permanently (§6.4).
 */

import { storage } from '#imports';
import type { SiteRule, SiteRulesStore } from '@/types/settings';
import {
  DEFAULT_SITE_RULES,
  SITE_RULES_SCHEMA_VERSION,
} from '@/types/settings';
import { STORAGE_KEYS } from './keys';
import { extensionContextGone } from '@/utils/extension-context';
import { createLogger } from '@/utils/logger';

const log = createLogger('storage:site-rules');

export const siteRulesItem = storage.defineItem<SiteRulesStore>(
  STORAGE_KEYS.siteRules,
  {
    fallback: DEFAULT_SITE_RULES,
    version: SITE_RULES_SCHEMA_VERSION,
  },
);

export async function getSiteRules(): Promise<SiteRulesStore> {
  try {
    const value = await siteRulesItem.getValue();
    return {
      schemaVersion: SITE_RULES_SCHEMA_VERSION,
      rules: value.rules ?? {},
    };
  } catch (err) {
    if (extensionContextGone(err)) {
      log.debug('site rules read skipped — extension context gone');
      return DEFAULT_SITE_RULES;
    }
    log.error('site rules read failed — using empty set', err);
    return DEFAULT_SITE_RULES;
  }
}

export async function getSiteRule(
  origin: string,
): Promise<SiteRule | undefined> {
  const store = await getSiteRules();
  return store.rules[origin];
}

/** `true` unless the user explicitly disabled this origin. */
export async function isSiteEnabled(origin: string): Promise<boolean> {
  const rule = await getSiteRule(origin);
  return rule?.enabled ?? true;
}

export async function setSiteEnabled(
  origin: string,
  enabled: boolean,
): Promise<SiteRule> {
  return updateSiteRule(origin, (prev) => ({ ...prev, enabled }));
}

export async function setSiteIgnoredRules(
  origin: string,
  ignoredRuleIds: readonly string[],
): Promise<SiteRule> {
  return updateSiteRule(origin, (prev) => ({
    ...prev,
    ignoredRuleIds: [...new Set(ignoredRuleIds)],
  }));
}

export async function setSitePreset(
  origin: string,
  presetId: string | null,
): Promise<SiteRule> {
  return updateSiteRule(origin, (prev) => ({ ...prev, presetId }));
}

export async function removeSiteRule(origin: string): Promise<void> {
  const store = await getSiteRules();
  if (!(origin in store.rules)) return;
  const rules = { ...store.rules };
  delete rules[origin];
  await siteRulesItem.setValue({
    schemaVersion: SITE_RULES_SCHEMA_VERSION,
    rules,
  });
}

export async function resetSiteRules(): Promise<void> {
  await siteRulesItem.setValue(DEFAULT_SITE_RULES);
}

export function watchSiteRules(
  cb: (store: SiteRulesStore) => void,
): () => void {
  return siteRulesItem.watch((value) =>
    cb({ schemaVersion: SITE_RULES_SCHEMA_VERSION, rules: value.rules ?? {} }),
  );
}

async function updateSiteRule(
  origin: string,
  mutate: (prev: SiteRule) => SiteRule,
): Promise<SiteRule> {
  const store = await getSiteRules();
  const prev: SiteRule = store.rules[origin] ?? {
    origin,
    enabled: true,
    ignoredRuleIds: [],
    updatedAt: 0,
  };
  const next: SiteRule = { ...mutate(prev), origin, updatedAt: Date.now() };
  await siteRulesItem.setValue({
    schemaVersion: SITE_RULES_SCHEMA_VERSION,
    rules: { ...store.rules, [origin]: next },
  });
  return next;
}
