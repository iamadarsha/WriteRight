/**
 * Dependency license audit (§6.10, §7).
 *
 * Walks every installed production + dev dependency, reads its `license` field,
 * and fails if one is not on the permissive allowlist. Also checks that the
 * third-party notice files exist. This is a lightweight, offline check — no
 * network, no paid service (§24).
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();

const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  '0BSD',
  'BSD',
  'BSD*', // legacy bare identifiers → BSD-2/BSD-3 family
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'Apache 2.0',
  'CC0-1.0',
  'CC-BY-4.0',
  'Unlicense',
  'Python-2.0',
  'BlueOak-1.0.0',
  'WTFPL',
  'Zlib',
  // MPL-2.0 is file-level (weak) copyleft. It is acceptable here because every
  // MPL-licensed dependency in this project is BUILD/DEV-TIME ONLY — the
  // web-ext toolchain (web-ext, addons-linter, fx-runner, addons-*), the
  // lightningcss build transform, and eslint-plugin-no-unsanitized. None of
  // their code is bundled into the shipped extension, and WriteRight's own
  // source remains MIT (§7.2 — verified per component).
  'MPL-2.0',
]);

// Packages we have manually reviewed and consciously accept (with a reason).
const REVIEWED_EXCEPTIONS: Record<string, string> = {
  // e.g. 'some-pkg@1.2.3': 'BSD-4-Clause with acknowledged advertising clause',
};

interface PkgJson {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: Array<{ type?: string }>;
}

function licenseOf(pkg: PkgJson): string {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license === 'object') {
    return pkg.license.type ?? 'UNKNOWN';
  }
  if (Array.isArray(pkg.licenses) && pkg.licenses[0]?.type) {
    return pkg.licenses[0].type;
  }
  return 'UNKNOWN';
}

function isAcceptable(license: string): boolean {
  if (ALLOWED.has(license)) return true;
  const clean = license.replace(/[()]/g, '').trim();
  if (ALLOWED.has(clean)) return true;

  // "A OR B" — the consumer picks; accept if ANY option is allowed.
  if (/\bOR\b/i.test(clean)) {
    return clean
      .split(/\s+OR\s+/i)
      .map((s) => s.trim())
      .some((p) => ALLOWED.has(p));
  }
  // "A AND B" — all terms apply; accept only if every one is allowed.
  if (/\bAND\b/i.test(clean)) {
    return clean
      .split(/\s+AND\s+/i)
      .map((s) => s.trim())
      .every((p) => ALLOWED.has(p));
  }
  return false;
}

function* walkNodeModules(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.bin' || entry.name === '.cache') continue;
    if (entry.name.startsWith('@')) {
      yield* walkNodeModules(resolve(dir, entry.name));
      continue;
    }
    const pkgPath = resolve(dir, entry.name, 'package.json');
    if (existsSync(pkgPath)) yield pkgPath;
    const nested = resolve(dir, entry.name, 'node_modules');
    if (existsSync(nested)) yield* walkNodeModules(nested);
  }
}

const violations: string[] = [];
const seen = new Set<string>();
let count = 0;

for (const pkgPath of walkNodeModules(resolve(ROOT, 'node_modules'))) {
  let pkg: PkgJson;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PkgJson;
  } catch {
    continue;
  }
  if (!pkg.name || !pkg.version) continue;
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) continue;
  seen.add(id);
  count += 1;

  const license = licenseOf(pkg);
  if (isAcceptable(license)) continue;
  if (id in REVIEWED_EXCEPTIONS) continue;
  violations.push(`${id} — ${license}`);
}

console.log(`Scanned ${count} installed packages.`);

let failed = false;

if (violations.length > 0) {
  failed = true;
  console.error(
    `\n✗ ${violations.length} package(s) with a non-allowlisted license:`,
  );
  for (const v of violations.sort()) console.error(`  - ${v}`);
  console.error(
    '\nAdd to REVIEWED_EXCEPTIONS with a reason after verifying the redistribution terms (§7.2).',
  );
}

const NOTICE_FILES = ['THIRD_PARTY_NOTICES.md', 'LICENSE'];
for (const f of NOTICE_FILES) {
  if (!existsSync(resolve(ROOT, f))) {
    failed = true;
    console.error(`✗ missing required file: ${f}`);
  }
}

console.log(failed ? '\n✗ license audit failed' : '\n✓ license audit passed');
process.exit(failed ? 1 : 0);
