import { useEffect } from 'react';
import type { Settings } from '@/types/settings';
import { applyTheme, watchSystemTheme } from '@/ui/theme';

/**
 * Apply the user's theme / motion / font-scale preferences to the current
 * document's root element, keeping `system` live against OS changes (§9.1).
 */
export function useAppliedTheme(settings: Settings): void {
  useEffect(() => {
    const root = document.documentElement;
    applyTheme(root, settings);
    if (settings.theme !== 'system') return;
    return watchSystemTheme(() => applyTheme(root, settings));
  }, [settings]);
}
