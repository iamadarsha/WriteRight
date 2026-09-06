import { describe, it, expect } from 'vitest';
import {
  getSettings,
  setSettings,
  patchSettings,
  resetSettings,
} from '@/storage/settings';
import { DEFAULT_SETTINGS } from '@/types/settings';

describe('settings storage (§20)', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists and reloads settings', async () => {
    await setSettings({ ...DEFAULT_SETTINGS, enabled: false, fontScale: 1.25 });
    const s = await getSettings();
    expect(s.enabled).toBe(false);
    expect(s.fontScale).toBe(1.25);
  });

  it('patch merges features key-by-key without dropping others', async () => {
    await patchSettings({ features: { ai: true } });
    const s = await getSettings();
    expect(s.features.ai).toBe(true);
    expect(s.features.styleWordiness).toBe(true); // untouched
  });

  it('normalizes/clamps hostile values on read', async () => {
    await setSettings({
      ...DEFAULT_SETTINGS,
      fontScale: 99,
      extraIgnorePatterns: Array.from({ length: 500 }, (_, i) => `p${i}`),
    });
    const s = await getSettings();
    expect(s.fontScale).toBeLessThanOrEqual(1.5);
    expect(s.extraIgnorePatterns.length).toBeLessThanOrEqual(100);
    expect(s.schemaVersion).toBe(DEFAULT_SETTINGS.schemaVersion);
  });

  it('strictPrivacy defaults off and only a real `true` turns it on (§10.2)', async () => {
    expect(DEFAULT_SETTINGS.strictPrivacy).toBe(false);
    await setSettings({
      ...DEFAULT_SETTINGS,
      strictPrivacy: 'yes' as unknown as boolean,
    });
    expect((await getSettings()).strictPrivacy).toBe(false);
    await patchSettings({ strictPrivacy: true });
    expect((await getSettings()).strictPrivacy).toBe(true);
  });

  it('resetSettings restores defaults', async () => {
    await patchSettings({ enabled: false });
    await resetSettings();
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
