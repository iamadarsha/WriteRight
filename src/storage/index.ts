/**
 * Storage facade: startup initialization and the "Reset all local data"
 * command (§28). `resetAllData` must work regardless of migration state
 * (§20.4) and must clear *everything* WriteRight owns.
 */

import { storage } from '#imports';
import type { Settings } from '@/types/settings';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { STORAGE_KEYS } from './keys';
import { getSettings, resetSettings } from './settings';
import { resetSiteRules } from './site-rules';
import { resetDictionary } from './dictionary';
import { clearChatHistory } from './ai-chat';
import { migrationsAreConsistent } from './migrations';
import { createLogger } from '@/utils/logger';

const log = createLogger('storage');

export * from './settings';
export * from './site-rules';
export * from './dictionary';
export * from './ai-chat';
export * from './session-state';
export { STORAGE_KEYS } from './keys';

/**
 * Run once when the background context starts. Triggers migrations (by reading
 * each versioned item) and returns the effective settings.
 */
export async function initStorage(): Promise<Settings> {
  if (!migrationsAreConsistent()) {
    log.error('migration table is inconsistent — check storage/migrations.ts');
  }
  // Reading each item forces WXT to run any pending migrations before use.
  const settings = await getSettings();
  return settings;
}

/** §28 — delete personal dictionary, site settings, preferences, backups. */
export async function resetAllData(): Promise<Settings> {
  // 1. Hard-remove every key + its version metadata.
  await Promise.all([
    storage.removeItem(STORAGE_KEYS.settings, { removeMeta: true }),
    storage.removeItem(STORAGE_KEYS.siteRules, { removeMeta: true }),
    storage.removeItem(STORAGE_KEYS.dictionary, { removeMeta: true }),
    storage.removeItem(STORAGE_KEYS.aiChat),
    storage.removeItem(STORAGE_KEYS.settingsBackup),
    clearChatHistory(),
  ]);
  // 2. Re-seed defaults so the next read is clean and correctly versioned.
  const [settings] = await Promise.all([
    resetSettings(),
    resetSiteRules(),
    resetDictionary(),
  ]);
  log.info('all local data reset to defaults');
  return settings ?? DEFAULT_SETTINGS;
}
