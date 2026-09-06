/**
 * Reproducible-build check (§5.10, §24.2).
 *
 * Builds the extension twice from the same source + lockfile and asserts the
 * output is byte-identical. A contributor can verify a published artifact was
 * built from the committed source without any paid service.
 *
 * Not part of `npm run check` (it runs two full builds); run it before cutting
 * a release: `npm run verify:reproducible`.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';

const ROOT = process.cwd();
const OUT = resolve(ROOT, '.output');
const TARGETS = ['chrome-mv3', 'firefox-mv3'];

function hashTree(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = resolve(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const h = createHash('sha256').update(readFileSync(full)).digest('hex');
        map.set(relative(OUT, full), h);
      }
    }
  };
  if (existsSync(dir)) walk(dir);
  return map;
}

function build(): void {
  execFileSync('npm', ['run', 'build:all'], { stdio: 'inherit', cwd: ROOT });
}

function snapshot(): Map<string, string> {
  const all = new Map<string, string>();
  for (const t of TARGETS) {
    for (const [k, v] of hashTree(resolve(OUT, t))) all.set(k, v);
  }
  return all;
}

console.log('• build 1 of 2');
build();
const first = snapshot();

console.log('\n• build 2 of 2');
build();
const second = snapshot();

let diffs = 0;
const keys = new Set([...first.keys(), ...second.keys()]);
for (const k of [...keys].sort()) {
  const a = first.get(k);
  const b = second.get(k);
  if (a !== b) {
    diffs += 1;
    console.error(
      `  ✗ ${k}: ${a ? a.slice(0, 12) : '(missing)'} → ${b ? b.slice(0, 12) : '(missing)'}`,
    );
  }
}

const totalBytes = [...TARGETS].reduce((sum, t) => {
  const dir = resolve(OUT, t);
  let s = 0;
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = resolve(d, e.name);
      if (e.isDirectory()) walk(f);
      else s += statSync(f).size;
    }
  };
  if (existsSync(dir)) walk(dir);
  return sum + s;
}, 0);

console.log(
  diffs === 0
    ? `\n✓ build is reproducible — ${first.size} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MB, identical across two runs`
    : `\n✗ build is NOT reproducible — ${diffs} file(s) differ`,
);
process.exit(diffs === 0 ? 0 : 1);
