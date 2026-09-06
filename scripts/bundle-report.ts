/**
 * Bundle size report + budgets (§17.6, §0.3 "measured budgets").
 *
 * The PRD rejects a single hard "<2MB" cap; instead we track measured budgets
 * per surface and fail only on a regression past a generous Phase 1 ceiling.
 * The content script is the one that runs on every page, so it is the tightest.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

interface Budget {
  label: string;
  match: (path: string) => boolean;
  maxBytes: number;
}

const KB = 1024;

// §17.6 / §0.3 — measured budgets by surface. The content script runs on every
// page so it stays tight; the engine WASM is large by nature (the PRD rejects a
// blanket "<2MB" for exactly this reason) but is a separate streamed + cached
// file, not shipped code.
const BUDGETS: Budget[] = [
  {
    label: 'content script (runs on every page)',
    match: (p) => /content-scripts\/.*\.js$/.test(p),
    maxBytes: 300 * KB,
  },
  {
    label: 'background service worker (engine glue, no WASM inlined)',
    match: (p) => /(^|\/)background\.js$/.test(p),
    maxBytes: 400 * KB,
  },
  {
    label: 'extension-page code (popup + options, shared React)',
    match: (p) => /(chunks|assets)\/.*\.js$/.test(p),
    maxBytes: 320 * KB,
  },
  {
    label: 'local engine WASM (Harper, streamed + cached)',
    match: (p) => /\.wasm$/.test(p),
    maxBytes: 24 * 1024 * KB,
  },
  {
    // §11.3 — the offline dictionary/thesaurus (Open English WordNet, compact
    // block-compressed binary). Loaded lazily on the first "define" and evicted
    // after 5 min idle, so a user who never uses it pays zero runtime cost.
    label: 'offline lexicon (Open English WordNet, lazy)',
    match: (p) => /lexicon\/.*\.bin$/.test(p),
    maxBytes: 14 * 1024 * KB,
  },
  {
    // §0.3 — a measured budget, not a blanket cap. Harper WASM (~15 MB) plus the
    // lexicon (~8.5 MB) dominate; both are lazy/streamed, not parsed at startup.
    label: 'total extension package',
    match: () => true,
    maxBytes: 28 * 1024 * KB,
  },
];

function collectFiles(dir: string, base: string): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full, base));
    else out.push([relative(base, full), statSync(full).size]);
  }
  return out;
}

const fmt = (n: number): string =>
  n >= KB * KB ? `${(n / KB / KB).toFixed(2)} MB` : `${(n / KB).toFixed(1)} kB`;

const outDir = resolve(process.cwd(), '.output');
const targets = existsSync(outDir)
  ? readdirSync(outDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  : [];

if (targets.length === 0) {
  console.error('No builds in .output/. Run `npm run build:all` first.');
  process.exit(1);
}

let failed = false;

for (const target of targets) {
  const targetDir = resolve(outDir, target);
  const files = collectFiles(targetDir, targetDir).sort((a, b) => b[1] - a[1]);
  const total = files.reduce((s, [, n]) => s + n, 0);

  console.log(`\n═══ ${target} ═══  (${fmt(total)} total)`);
  for (const [path, size] of files.slice(0, 12)) {
    console.log(`  ${fmt(size).padStart(10)}  ${path}`);
  }

  for (const budget of BUDGETS) {
    const matched = budget.label.startsWith('total')
      ? total
      : files.filter(([p]) => budget.match(p)).reduce((s, [, n]) => s + n, 0);
    const ok = matched <= budget.maxBytes;
    if (!ok) failed = true;
    console.log(
      `  ${ok ? '✓' : '✗'} ${budget.label}: ${fmt(matched)} / ${fmt(
        budget.maxBytes,
      )}`,
    );
  }
}

console.log(
  failed ? '\n✗ a bundle budget was exceeded' : '\n✓ all bundle budgets met',
);
process.exit(failed ? 1 : 0);
