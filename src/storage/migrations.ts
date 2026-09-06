/**
 * Settings & data migrations (§20.4).
 *
 * Contract:
 *  - every durable schema has a version number (see `types/settings.ts`),
 *  - migrations are pure and idempotent-by-shape (running the chain twice on an
 *    already-current value is a no-op),
 *  - a failed migration must not lose data — `storage/settings.ts` writes a
 *    raw backup and falls back to defaults,
 *  - downgrades are not supported; the documented recovery is "Reset all data".
 *
 * WXT runs the numbered entries below when the stored `version` is lower than
 * the item's declared `version`. Each key is the *target* version.
 */

import type { Settings } from '@/types/settings';
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA_VERSION } from '@/types/settings';

/** The v1 `features` shape, kept for the migration only. */
interface SettingsV1Features {
  inlineSuggestions?: boolean;
  writingScore?: boolean;
  styleChecks?: boolean;
  toneHints?: boolean;
  ai?: boolean;
}

/**
 * v1 → v2 (§1.2.0): the single `inlineSuggestions` switch splits into four
 * per-category toggles; `styleChecks` becomes `styleWordiness`; `simpleMode`,
 * `defineOnSelect` and `synonyms` are new (default on / off as per DEFAULT).
 * Intent is preserved: a user who had inline suggestions off keeps every inline
 * category off.
 */
function migrateV1ToV2(old: unknown): Settings {
  const src = (old ?? {}) as Record<string, unknown> & { features?: unknown };
  const f = (src.features ?? {}) as SettingsV1Features;
  const inlineOn = f.inlineSuggestions !== false;
  const styleOn = inlineOn && f.styleChecks !== false;
  const carry = { ...src };
  delete (carry as { features?: unknown }).features;

  // Everything not in `features` carries through; `normalizeSettings` (run on
  // every read) then clamps and drops anything unrecognised.
  return {
    ...DEFAULT_SETTINGS,
    ...(carry as Partial<Settings>),
    schemaVersion: 2,
    simpleMode: src['simpleMode'] === true,
    features: {
      spelling: inlineOn,
      grammar: inlineOn,
      punctuation: inlineOn,
      styleWordiness: styleOn,
      writingScore: f.writingScore !== false,
      toneHints: f.toneHints !== false,
      defineOnSelect: DEFAULT_SETTINGS.features.defineOnSelect,
      synonyms: DEFAULT_SETTINGS.features.synonyms,
      ai: f.ai === true,
    },
  };
}

/** Map<targetVersion, (old) => next>. */
export const SETTINGS_MIGRATIONS: Record<number, (old: unknown) => Settings> = {
  2: migrateV1ToV2,
};

/** Sanity check used by a startup assertion and tests. */
export function migrationsAreConsistent(): boolean {
  return Object.keys(SETTINGS_MIGRATIONS).every((k) => {
    const n = Number(k);
    return Number.isInteger(n) && n > 1 && n <= SETTINGS_SCHEMA_VERSION;
  });
}
