/**
 * Manifest & permission audit (§5.4, §6.4, §25, Phase 1 regression gate).
 *
 * Runs against the built `.output/<target>/manifest.json` files. Fails CI if:
 *  - a permission outside the allowlist appears,
 *  - host permissions or content-script matches reach beyond http/https,
 *  - an optional host permission is anything other than a loopback address
 *    (the only extra reach local AI may ever request, §6.3),
 *  - a privileged scheme is targeted,
 *  - the CSP contains `unsafe-eval` or a remote source,
 *  - required keys are missing.
 *
 * Run `wxt build` / `wxt build -b firefox` first (the `check` script does).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

interface Manifest {
  manifest_version?: number;
  name?: string;
  version?: string;
  permissions?: string[];
  optional_permissions?: string[];
  host_permissions?: string[];
  optional_host_permissions?: string[];
  content_scripts?: Array<{ matches?: string[] }>;
  content_security_policy?:
    string | { extension_pages?: string; sandbox?: string };
  web_accessible_resources?: unknown;
}

const ALLOWED_PERMISSIONS = new Set([
  'storage',
  'activeTab',
  'scripting',
  'contextMenus',
  'sidePanel',
  'alarms',
]);

const ALLOWED_HOST_PATTERNS = [/^\*:\/\/\*\/\*$/, /^https?:\/\//];

/** The ONLY patterns permitted in `optional_host_permissions` (§6.3). */
const ALLOWED_OPTIONAL_HOST_PATTERNS = [
  /^http:\/\/localhost\/\*$/,
  /^http:\/\/127\.0\.0\.1\/\*$/,
];

const FORBIDDEN_MATCH_SUBSTRINGS = [
  '<all_urls>',
  'file://',
  'ftp://',
  'chrome://',
  'about:',
  'moz-extension://',
  'chrome-extension://',
];

const TARGETS = ['chrome-mv3', 'firefox-mv3', 'firefox-mv2', 'edge-mv3'];

let failures = 0;
const fail = (target: string, msg: string): void => {
  failures += 1;
  console.error(`  ✗ [${target}] ${msg}`);
};

function auditManifest(target: string, manifest: Manifest): void {
  console.log(`\n• ${target}`);

  if (manifest.manifest_version !== 3 && manifest.manifest_version !== 2) {
    fail(target, `unexpected manifest_version: ${manifest.manifest_version}`);
  }
  for (const key of ['name', 'version'] as const) {
    if (!manifest[key]) fail(target, `missing required key: ${key}`);
  }

  for (const perm of [
    ...(manifest.permissions ?? []),
    ...(manifest.optional_permissions ?? []),
  ]) {
    if (!ALLOWED_PERMISSIONS.has(perm)) {
      fail(target, `permission not in allowlist: "${perm}"`);
    }
  }

  for (const host of manifest.host_permissions ?? []) {
    if (!ALLOWED_HOST_PATTERNS.some((re) => re.test(host))) {
      fail(target, `host_permission beyond http/https: "${host}"`);
    }
  }

  for (const host of manifest.optional_host_permissions ?? []) {
    if (!ALLOWED_OPTIONAL_HOST_PATTERNS.some((re) => re.test(host))) {
      fail(
        target,
        `optional_host_permission is not a loopback address: "${host}" (§6.3)`,
      );
    }
  }

  for (const cs of manifest.content_scripts ?? []) {
    for (const match of cs.matches ?? []) {
      if (FORBIDDEN_MATCH_SUBSTRINGS.some((s) => match.includes(s))) {
        fail(
          target,
          `content_script match reaches a forbidden scheme: "${match}"`,
        );
      }
      if (!ALLOWED_HOST_PATTERNS.some((re) => re.test(match))) {
        fail(target, `content_script match not http/https: "${match}"`);
      }
    }
  }

  const csp = manifest.content_security_policy;
  const cspText = typeof csp === 'string' ? csp : (csp?.extension_pages ?? '');
  // Bare `unsafe-eval` is forbidden (§6.5). `wasm-unsafe-eval` is the minimal
  // keyword needed to run the bundled, local Harper WASM and is explicitly
  // sanctioned by §6.5 — do not let its "unsafe-eval" substring trip the check.
  if (/(?<!wasm-)unsafe-eval/.test(cspText)) {
    fail(target, 'CSP contains unsafe-eval (§6.5)');
  }
  if (/'unsafe-inline'/.test(cspText)) {
    fail(target, "CSP contains 'unsafe-inline' (§6.5)");
  }
  if (/https?:\/\/(?!localhost|127\.0\.0\.1)/.test(cspText)) {
    fail(target, `CSP allows a remote source: "${cspText}"`);
  }
  // The local engine is WebAssembly. Without an explicit CSP the browser's
  // MV3 default (`script-src 'self'`) blocks WASM compilation and the whole
  // engine silently fails to start (§6.5, §11.1). Require the keyword.
  if (!/'wasm-unsafe-eval'/.test(cspText)) {
    fail(
      target,
      "CSP is missing 'wasm-unsafe-eval' — the Harper WASM engine cannot load (§6.5)",
    );
  }

  if (failures === 0) console.log('  ✓ permissions, hosts and CSP look clean');
}

const outDir = resolve(process.cwd(), '.output');
let audited = 0;
for (const target of TARGETS) {
  const path = resolve(outDir, target, 'manifest.json');
  if (!existsSync(path)) continue;
  audited += 1;
  auditManifest(target, JSON.parse(readFileSync(path, 'utf8')) as Manifest);
}

if (audited === 0) {
  console.error(
    'No built manifests found in .output/. Run `npm run build:all` first.',
  );
  process.exit(1);
}

console.log(
  failures === 0
    ? `\n✓ manifest audit passed for ${audited} target(s)`
    : `\n✗ manifest audit failed with ${failures} issue(s)`,
);
process.exit(failures === 0 ? 0 : 1);
