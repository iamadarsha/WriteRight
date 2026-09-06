/**
 * Software Bill of Materials generator (§6.10, §24.1).
 *
 * Emits `sbom.json` (CycloneDX 1.5, minimal) from `package-lock.json` — one
 * component per resolved dependency, with version and (best-effort) license.
 * Deterministic: components are sorted, and the timestamp is pinned to the
 * lockfile's own mtime so re-running on an unchanged tree yields an identical
 * file (§24.2 reproducibility).
 *
 * `npm run sbom` writes it; `npm run check` verifies it is up to date.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const LOCK = resolve(ROOT, 'package-lock.json');
const OUT = resolve(ROOT, 'sbom.json');

if (!existsSync(LOCK)) {
  console.error('package-lock.json not found — run `npm install` first.');
  process.exit(1);
}

interface LockPkg {
  version?: string;
  license?: string;
  licenses?: Array<{ type?: string }>;
  dev?: boolean;
  resolved?: string;
  integrity?: string;
}
interface Lock {
  name?: string;
  version?: string;
  packages?: Record<string, LockPkg>;
}

const lock = JSON.parse(readFileSync(LOCK, 'utf8')) as Lock;
const pkgs = lock.packages ?? {};

function licenseOf(p: LockPkg): string {
  if (typeof p.license === 'string') return p.license;
  if (Array.isArray(p.licenses) && p.licenses[0]?.type)
    return p.licenses[0].type;
  return 'UNKNOWN';
}

interface Component {
  type: 'library';
  name: string;
  version: string;
  scope: 'required' | 'optional';
  purl: string;
  licenses: Array<{ license: { id: string } }>;
  properties: Array<{ name: string; value: string }>;
}

const components: Component[] = [];
for (const [path, meta] of Object.entries(pkgs)) {
  if (path === '') continue; // the root package
  const name = path.split('node_modules/').pop() ?? path;
  if (!meta.version) continue;
  components.push({
    type: 'library',
    name,
    version: meta.version,
    scope: meta.dev ? 'optional' : 'required',
    purl: `pkg:npm/${name.replace('/', '%2F')}@${meta.version}`,
    licenses: [{ license: { id: licenseOf(meta) } }],
    properties: [
      { name: 'cdx:npm:dev', value: String(Boolean(meta.dev)) },
      ...(meta.integrity
        ? [{ name: 'cdx:npm:integrity', value: meta.integrity }]
        : []),
    ],
  });
}
components.sort((a, b) =>
  `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
);

const runtimeCount = components.filter((c) => c.scope === 'required').length;

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  version: 1,
  metadata: {
    // Pinned to the lockfile mtime so the output is reproducible.
    timestamp: new Date(statSync(LOCK).mtime).toISOString(),
    component: {
      type: 'application',
      name: lock.name ?? 'writeright',
      version: lock.version ?? '0.0.0',
    },
    tools: [{ name: 'writeright/generate-sbom', version: '1' }],
  },
  components,
};

const serialized = JSON.stringify(sbom, null, 2) + '\n';

const mode = process.argv.includes('--check') ? 'check' : 'write';
if (mode === 'check') {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== serialized) {
    console.error(
      '✗ sbom.json is out of date — run `npm run sbom` and commit the result.',
    );
    process.exit(1);
  }
  console.log(
    `✓ sbom.json up to date (${components.length} components, ${runtimeCount} runtime)`,
  );
} else {
  writeFileSync(OUT, serialized);
  console.log(
    `✓ wrote sbom.json — ${components.length} components (${runtimeCount} runtime, ${
      components.length - runtimeCount
    } dev)`,
  );
}
