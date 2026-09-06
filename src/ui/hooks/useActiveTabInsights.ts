import { useCallback, useEffect, useState } from 'react';
import type { DocumentInsights } from '@/types/insights';
import { sendToBackground } from '@/messaging';

/**
 * The active tab's last-reported writing insights (§12, §13), for the popup.
 * Cached per-tab in `storage.session` by the background, so the popup opens
 * with data even before a fresh analysis lands.
 */
export function useActiveTabInsights(): {
  insights: DocumentInsights | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [insights, setInsights] = useState<DocumentInsights | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await sendToBackground({ type: 'GET_ACTIVE_TAB_INSIGHTS' });
    if (res.ok) setInsights(res.data.insights);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await refresh();
      if (!alive) return;
    })();
    const id = setInterval(() => void refresh(), 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refresh]);

  return { insights, loading, refresh };
}
