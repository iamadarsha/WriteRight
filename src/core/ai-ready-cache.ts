/**
 * Tiny process-local cache for "is a local AI model ready" (§12.3).
 *
 * The readiness probe is a background message round-trip. It is cheap, but a
 * clarity card runs it on every open to decide whether to auto-generate a
 * rewrite — so opening five cards fires five messages for an answer that does
 * not change between keystrokes. Cache the result for a few seconds; a real
 * change (AI toggled, provider/endpoint edited) calls {@link invalidateAiReady}.
 */

export const AI_READY_TTL_MS = 8_000;

let cache: { value: boolean; at: number } | null = null;

/**
 * Return the cached readiness within the TTL, else run `probe` and cache it.
 * A rejected probe resolves `false` and is NOT cached (so it retries).
 */
export async function aiReadyCached(
  probe: () => Promise<boolean>,
  now: number = Date.now(),
): Promise<boolean> {
  if (cache && now - cache.at < AI_READY_TTL_MS) return cache.value;
  try {
    const value = await probe();
    cache = { value, at: now };
    return value;
  } catch {
    return false;
  }
}

/** Drop the cache — call when AI settings change. */
export function invalidateAiReady(): void {
  cache = null;
}
