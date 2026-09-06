/**
 * Tiny fetch helper for local AI adapters.
 *
 * Every request goes through {@link requireLoopback} first (§6.3) and carries
 * a caller-supplied `AbortSignal` plus an independent timeout, so a hung or
 * missing local server can never freeze the UI (§4.9 "local endpoint failures
 * do not hang the UI").
 */

import { requireLoopback } from './loopback';

export interface LocalFetchOptions {
  readonly method?: 'GET' | 'POST';
  readonly body?: unknown;
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
}

export async function localFetch(
  rawUrl: string,
  opts: LocalFetchOptions,
): Promise<Response> {
  // Throws if the URL is not loopback — the single network chokepoint.
  requireLoopback(rawUrl);

  const timeout = new AbortController();
  const timer = setTimeout(
    () => timeout.abort(new Error('timeout')),
    opts.timeoutMs,
  );
  const composite = anySignal([opts.signal, timeout.signal]);

  try {
    return await fetch(rawUrl, {
      method: opts.method ?? 'GET',
      headers:
        opts.body != null ? { 'content-type': 'application/json' } : undefined,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
      signal: composite,
      // No credentials, no cache — this is a local tool call.
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Combine abort signals (native `AbortSignal.any` where available). */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const withAny = AbortSignal as unknown as {
    any?: (s: AbortSignal[]) => AbortSignal;
  };
  if (typeof withAny.any === 'function') return withAny.any(signals);
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => controller.abort(s.reason), {
      once: true,
    });
  }
  return controller.signal;
}
