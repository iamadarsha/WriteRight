import { useCallback, useEffect, useState } from 'react';
import type { AiCapability } from '@/ai/ai-types';
import { sendToBackground } from '@/messaging';

/**
 * The current local-AI capability (§14.4). Used by the popup status line and
 * the options AI section. Cheap and cached in the background; a manual
 * `refresh(true)` forces a fresh probe.
 */
export function useAiCapability(): {
  capability: AiCapability | null;
  loading: boolean;
  refresh: (force?: boolean) => Promise<void>;
} {
  const [capability, setCapability] = useState<AiCapability | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (force = false) => {
    const res = await sendToBackground({ type: 'AI_GET_CAPABILITY', force });
    if (res.ok) setCapability(res.data.capability);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await sendToBackground({
        type: 'AI_GET_CAPABILITY',
        force: false,
      });
      if (alive && res.ok) {
        setCapability(res.data.capability);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { capability, loading, refresh };
}
