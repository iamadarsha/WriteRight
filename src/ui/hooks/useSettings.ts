import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '@/types/settings';
import type { SettingsPatch } from '@/types/messages';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { getSettings, watchSettings } from '@/storage/settings';
import { sendToBackground } from '@/messaging';

interface UseSettingsResult {
  settings: Settings;
  loading: boolean;
  /** Persist a patch through the background (so all contexts converge). */
  update: (patch: SettingsPatch) => Promise<void>;
}

/**
 * Live settings for extension pages (popup / options). Reads directly from
 * storage and stays in sync via `browser.storage.onChanged`; writes go through
 * the background so per-tab state and future side effects run in one place.
 */
export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void getSettings().then((s) => {
      if (alive) {
        setSettings(s);
        setLoading(false);
      }
    });
    const unwatch = watchSettings((s) => {
      if (alive) setSettings(s);
    });
    return () => {
      alive = false;
      unwatch();
    };
  }, []);

  const update = useCallback(async (patch: SettingsPatch) => {
    const res = await sendToBackground({ type: 'SET_SETTINGS', patch });
    if (res.ok) setSettings(res.data.settings);
  }, []);

  return { settings, loading, update };
}
