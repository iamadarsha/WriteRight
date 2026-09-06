/**
 * URL / origin helpers and privileged-surface detection (§0.4, §6.4).
 *
 * "Always live" never means "runs on every browser-owned URL". Browser-internal
 * pages, extension pages, web stores and other privileged schemes are explicit
 * non-targets. We detect them so the UI can say "Unavailable on this page"
 * instead of pretending (§31 Rule 1, §27).
 */

/** Schemes an extension content script is forbidden from (or pointless on). */
const PRIVILEGED_SCHEMES = new Set([
  'chrome:',
  'chrome-extension:',
  'moz-extension:',
  'safari-web-extension:',
  'edge:',
  'about:',
  'devtools:',
  'view-source:',
  'data:',
  'blob:',
  'filesystem:',
  'resource:',
]);

/** Host suffixes that are browser web stores / add-on galleries. */
const STORE_HOST_SUFFIXES = [
  'chromewebstore.google.com',
  'chrome.google.com', // legacy webstore path
  'addons.mozilla.org',
  'microsoftedge.microsoft.com',
  'addons.opera.com',
];

export interface PageEligibility {
  readonly eligible: boolean;
  readonly reason?: 'privileged-scheme' | 'browser-store' | 'not-web-page';
}

/** True only for normal `http:` / `https:` web pages we may attach to. */
export function isEligibleWebPage(rawUrl: string): PageEligibility {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { eligible: false, reason: 'not-web-page' };
  }
  if (PRIVILEGED_SCHEMES.has(url.protocol)) {
    return { eligible: false, reason: 'privileged-scheme' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { eligible: false, reason: 'not-web-page' };
  }
  const host = url.hostname.toLowerCase();
  if (STORE_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) {
    return { eligible: false, reason: 'browser-store' };
  }
  return { eligible: true };
}

/**
 * Registrable-ish origin key for per-site rules. We key on `protocol//host`
 * (host includes port). This is not PSL-aware; subdomains are distinct sites,
 * which is the safe default for a privacy control.
 */
export function originKey(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'unknown://invalid';
  }
}

/** Human label for an origin, e.g. `mail.google.com`. */
export function originLabel(originOrUrl: string): string {
  try {
    return new URL(originOrUrl).host || originOrUrl;
  } catch {
    return originOrUrl;
  }
}
