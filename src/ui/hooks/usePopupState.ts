import { useCallback, useEffect, useState } from 'react';
import { browser } from '#imports';
import type { PageStatus } from '@/types/capability';
import type { SiteState } from '@/types/messages';
import { sendToBackground } from '@/messaging';
import { originKey, isEligibleWebPage } from '@/utils/url';

export interface PopupState {
  loading: boolean;
  /** The active tab's URL, or null when not a normal web page. */
  tabUrl: string | null;
  origin: string | null;
  pageEligible: boolean;
  status: PageStatus | null;
  site: SiteState | null;
  setSiteEnabled: (enabled: boolean) => Promise<void>;
  setGlobalEnabled: (enabled: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

/** Everything the popup needs about the current tab, loaded on open. */
export function usePopupState(): PopupState {
  const [loading, setLoading] = useState(true);
  const [tabUrl, setTabUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<PageStatus | null>(null);
  const [site, setSite] = useState<SiteState | null>(null);

  const load = useCallback(async () => {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const url = tab?.url ?? null;
    const eligible = url ? isEligibleWebPage(url).eligible : false;
    const origin = url && eligible ? originKey(url) : null;

    const [statusRes, siteRes] = await Promise.all([
      sendToBackground({ type: 'GET_ACTIVE_TAB_STATUS' }),
      origin
        ? sendToBackground({ type: 'GET_SITE_STATE', origin })
        : Promise.resolve(null),
    ]);

    setTabUrl(url);
    setStatus(statusRes.ok ? statusRes.data.status : null);
    setSite(siteRes && siteRes.ok ? siteRes.data : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await load();
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const url = tabUrl;
  const eligible = url ? isEligibleWebPage(url).eligible : false;
  const origin = url && eligible ? originKey(url) : null;

  const setSiteEnabled = useCallback(
    async (enabled: boolean) => {
      if (!origin) return;
      const res = await sendToBackground({
        type: 'SET_SITE_ENABLED',
        origin,
        enabled,
      });
      if (res.ok) setSite(res.data);
      await load();
    },
    [origin, load],
  );

  const setGlobalEnabled = useCallback(
    async (enabled: boolean) => {
      await sendToBackground({ type: 'SET_GLOBAL_ENABLED', enabled });
      await load();
    },
    [load],
  );

  return {
    loading,
    tabUrl: url,
    origin,
    pageEligible: eligible,
    status,
    site,
    setSiteEnabled,
    setGlobalEnabled,
    refresh: load,
  };
}
