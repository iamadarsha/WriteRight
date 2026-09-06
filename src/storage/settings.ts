/**
 * Durable settings storage (§20, §20.4).
 *
 * Uses WXT's versioned storage item so schema migrations run deterministically
 * on startup. On top of that we add a last-known-good backup: if reading ever
 * throws (corrupt value, failed migration) we stash the raw payload and fall
 * back to defaults instead of crashing or losing data (§20.4).
 */

import { storage } from '#imports';
import type { AiSettings, Settings } from '@/types/settings';
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION,
} from '@/types/settings';
import type { SettingsPatch } from '@/types/messages';
import { STORAGE_KEYS } from './keys';
import { SETTINGS_MIGRATIONS } from './migrations';
import { createLogger } from '@/utils/logger';

const log = createLogger('storage:settings');

export const settingsItem = storage.defineItem<Settings>(
  STORAGE_KEYS.settings,
  {
    fallback: DEFAULT_SETTINGS,
    version: SETTINGS_SCHEMA_VERSION,
    migrations: SETTINGS_MIGRATIONS,
  },
);

/** Read settings, guaranteeing a valid object even on read failure (§20.4). */
export async function getSettings(): Promise<Settings> {
  try {
    const value = await settingsItem.getValue();
    return normalizeSettings(value);
  } catch (err) {
    log.error('settings read failed — backing up and using defaults', err);
    await backupRawSettings();
    return DEFAULT_SETTINGS;
  }
}

export async function setSettings(next: Settings): Promise<Settings> {
  const normalized = normalizeSettings(next);
  await settingsItem.setValue(normalized);
  return normalized;
}

/** Apply a shallow patch (§20.1); `features` merges key-by-key. */
export async function patchSettings(patch: SettingsPatch): Promise<Settings> {
  const current = await getSettings();
  const merged: Settings = {
    ...current,
    ...stripUndefined(patch),
    features: { ...current.features, ...stripUndefined(patch.features ?? {}) },
    ai: { ...current.ai, ...stripUndefined(patch.ai ?? {}) },
    extraIgnorePatterns:
      patch.extraIgnorePatterns ?? current.extraIgnorePatterns,
    defaultPresetId:
      patch.defaultPresetId !== undefined
        ? patch.defaultPresetId
        : current.defaultPresetId,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
  };
  return setSettings(merged);
}

export async function resetSettings(): Promise<Settings> {
  await settingsItem.setValue(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export function watchSettings(cb: (settings: Settings) => void): () => void {
  return settingsItem.watch((value) => cb(normalizeSettings(value)));
}

/* ---- internals -------------------------------------------------------- */

async function backupRawSettings(): Promise<void> {
  try {
    const raw = await storage.getItem<unknown>(STORAGE_KEYS.settings);
    if (raw != null) {
      await storage.setItem(STORAGE_KEYS.settingsBackup, {
        savedAt: Date.now(),
        raw,
      });
    }
  } catch (err) {
    log.warn('could not write settings backup', err);
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Defensive clamps so a hand-edited or migrated value can't break the UI. */
function normalizeSettings(value: Settings): Settings {
  const fontScale = clampNumber(value.fontScale, 0.85, 1.5, 1);
  const rawFeatures = (value.features ?? {}) as Record<string, unknown>;
  const features = { ...DEFAULT_SETTINGS.features };
  for (const key of Object.keys(features) as Array<keyof typeof features>) {
    if (typeof rawFeatures[key] === 'boolean') features[key] = rawFeatures[key];
  }
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    fontScale,
    simpleMode: value.simpleMode === true,
    features,
    strictPrivacy: value.strictPrivacy === true,
    ai: normalizeAiSettings(value.ai),
    extraIgnorePatterns: Array.isArray(value.extraIgnorePatterns)
      ? value.extraIgnorePatterns
          .filter((p) => typeof p === 'string')
          .slice(0, 100)
      : [],
    defaultPresetId:
      typeof value.defaultPresetId === 'string' ? value.defaultPresetId : null,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
  };
}

const AI_PROVIDERS = new Set([
  'auto',
  'chrome',
  'ollama',
  'lmstudio',
  'custom',
]);

/** Clamp the AI block so a hand-edited value can't widen network reach. */
function normalizeAiSettings(value: unknown): AiSettings {
  const v = (value ?? {}) as Partial<AiSettings>;
  const str = (x: unknown, fallback: string): string =>
    typeof x === 'string' && x.length <= 200 ? x : fallback;
  const bool = (x: unknown): boolean => x === true;
  return {
    provider:
      typeof v.provider === 'string' && AI_PROVIDERS.has(v.provider)
        ? v.provider
        : 'auto',
    ollamaEndpoint: str(v.ollamaEndpoint, DEFAULT_AI_SETTINGS.ollamaEndpoint),
    ollamaModel: str(v.ollamaModel, ''),
    lmStudioEndpoint: str(
      v.lmStudioEndpoint,
      DEFAULT_AI_SETTINGS.lmStudioEndpoint,
    ),
    lmStudioModel: str(v.lmStudioModel, ''),
    customEndpoint: str(v.customEndpoint, ''),
    customModel: str(v.customModel, ''),
    enhancedReview: bool(v.enhancedReview),
    keepChatHistory: bool(v.keepChatHistory),
    acknowledgedPrivacy: bool(v.acknowledgedPrivacy),
  };
}

function clampNumber(
  v: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.max(min, Math.min(max, n));
}
