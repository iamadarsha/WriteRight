import { useCallback, useEffect, useState } from 'react';
import type { SiteRule } from '@/types/settings';
import {
  getSiteRules,
  watchSiteRules,
  setSiteEnabled as persistSiteEnabled,
  removeSiteRule,
} from '@/storage/site-rules';

interface UseSiteRulesResult {
  rules: SiteRule[];
  setEnabled: (origin: string, enabled: boolean) => Promise<void>;
  forget: (origin: string) => Promise<void>;
}

export function useSiteRules(): UseSiteRulesResult {
  const [rules, setRules] = useState<SiteRule[]>([]);

  useEffect(() => {
    let alive = true;
    const sort = (r: Record<string, SiteRule>): SiteRule[] =>
      Object.values(r).sort((a, b) => a.origin.localeCompare(b.origin));
    void getSiteRules().then((s) => {
      if (alive) setRules(sort(s.rules));
    });
    const unwatch = watchSiteRules((s) => {
      if (alive) setRules(sort(s.rules));
    });
    return () => {
      alive = false;
      unwatch();
    };
  }, []);

  const setEnabled = useCallback(async (origin: string, enabled: boolean) => {
    await persistSiteEnabled(origin, enabled);
  }, []);

  const forget = useCallback(async (origin: string) => {
    await removeSiteRule(origin);
  }, []);

  return { rules, setEnabled, forget };
}
