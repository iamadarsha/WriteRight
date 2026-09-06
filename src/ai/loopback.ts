/**
 * Loopback-only network guard for local AI (§6.3).
 *
 * WriteRight must never reach a public inference endpoint. Every local-model
 * connection is checked here first: only `http://` (or `ws://`) to `localhost`,
 * `127.0.0.0/8` or `[::1]` is allowed. No LAN ranges, no public hosts, no
 * `https` to a remote host masquerading as local. This function is the single
 * chokepoint every adapter calls before `fetch`.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface LoopbackCheck {
  readonly ok: boolean;
  /** Normalised `origin` (`http://localhost:11434`) when ok. */
  readonly origin?: string;
  /** `host:port` for display (§14.5). */
  readonly endpoint?: string;
  readonly reason?: string;
}

/** True only for a loopback `http(s)`/`ws(s)` URL. */
export function checkLoopback(rawUrl: string): LoopbackCheck {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'not a valid URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'ws:') {
    // `https`/`wss` to loopback is pointless and usually indicates a remote
    // host with a loopback-looking name — refuse it.
    return {
      ok: false,
      reason: `scheme ${url.protocol} is not allowed for local AI`,
    };
  }

  const host = url.hostname.toLowerCase();
  const isLoopback =
    LOOPBACK_HOSTNAMES.has(host) ||
    // 127.0.0.0/8
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  if (!isLoopback) {
    return {
      ok: false,
      reason: `${host || '(no host)'} is not a loopback address`,
    };
  }

  return {
    ok: true,
    origin: url.origin,
    endpoint: url.host,
  };
}

/** Assert-style helper: returns the normalised origin or throws. */
export function requireLoopback(rawUrl: string): string {
  const c = checkLoopback(rawUrl);
  if (!c.ok || !c.origin) {
    throw new Error(
      `refusing non-loopback AI endpoint: ${c.reason ?? 'unknown'}`,
    );
  }
  return c.origin;
}

/** The match-pattern host permissions local providers may ever need (§6.3). */
export const LOOPBACK_HOST_PERMISSIONS = [
  'http://localhost/*',
  'http://127.0.0.1/*',
] as const;
