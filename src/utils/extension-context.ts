/**
 * "Extension context invalidated" detection (§5.3).
 *
 * A content script keeps running after its extension is reloaded, updated or
 * disabled — but from that moment every `browser.*` call throws "Extension
 * context invalidated". This is expected (the fix is to reload the tab), not a
 * WriteRight bug, so the storage and messaging layers use this to go quiet and
 * return safe defaults instead of flooding the extension error console.
 */

interface MaybeChrome {
  runtime?: { id?: string };
}

/**
 * True once this content script's extension context is gone. Pass the caught
 * error for the message-based signal; the `runtime.id` check catches the case
 * where nothing has thrown yet.
 */
export function extensionContextGone(err?: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/context (?:invalidated|was invalidated)/i.test(msg)) return true;

  try {
    const rt = (globalThis as { chrome?: MaybeChrome }).chrome?.runtime;
    // `chrome.runtime` present but its `id` gone is the invalidation signature.
    // If `chrome` itself is absent (tests, non-extension context) we can't
    // tell — treat it as "not gone" and rely on the message check above.
    return rt !== undefined && rt.id === undefined;
  } catch {
    // Touching `chrome.runtime` threw — the context is gone.
    return true;
  }
}
