/**
 * Central registry of every durable storage key WriteRight owns.
 *
 * Keeping them in one place makes "Reset all local data" (§28) and the
 * permission/data audits (§5.4, §6.7) exhaustive by construction.
 */

export const STORAGE_KEYS = {
  settings: 'local:writeright.settings',
  siteRules: 'local:writeright.siteRules',
  dictionary: 'local:writeright.dictionary',
  /** Opt-in local AI chat transcript (§4.7). Absent unless the user enables it. */
  aiChat: 'local:writeright.aiChat',
  /** Written only when a migration fails, so nothing is silently lost (§20.4). */
  settingsBackup: 'local:writeright.settings.backup',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** Ephemeral (session) keys — cleared on browser restart / extension reload. */
export const SESSION_KEYS = {
  /** Per-tab last-known page status, for a fast popup open. */
  tabStatusPrefix: 'session:writeright.tabStatus.',
  /** Per-tab last-known writing insights (§12, §13), for the popup. */
  tabInsightsPrefix: 'session:writeright.tabInsights.',
} as const;
