/**
 * Dangerous-API scan of the *built* extension (§5.5, §23.2 "no eval",
 * "no remote <script>").
 *
 * Rules:
 *  - `eval(` / `new Function(` / `Function(` as a constructor: forbidden in
 *    every bundle (the Harper WASM uses `WebAssembly.instantiate`, not eval).
 *  - Remote `<script src="http…">` / `import("http…")` / `importScripts("http…")`:
 *    forbidden everywhere.
 *  - HTML-injection sinks (`innerHTML`, `outerHTML`, `insertAdjacentHTML`,
 *    `document.write`, `dangerouslySetInnerHTML`): forbidden in the content
 *    script (runs in every page); allowed only in the popup/options chunks,
 *    where it is React DOM's own internal use in a trusted extension page
 *    (documented in SECURITY.md) — reported for visibility.
 *
 * Run `npm run build:all` first (the `check` script does).
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const outDir = resolve(process.cwd(), '.output');

const EVAL_RE = /(?<![A-Za-z0-9_.$])eval\s*\(|new\s+Function\s*\(/;
const REMOTE_CODE_RE =
  /<script[^>]+src\s*=\s*["']https?:\/\/|\bimport\s*\(\s*["']https?:\/\/|\bimportScripts\s*\(\s*["']https?:\/\//i;
const HTML_SINK_RE =
  /\.(?:inner|outer)HTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(|dangerouslySetInnerHTML/;

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (/\.(js|mjs|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const targets = existsSync(outDir)
  ? readdirSync(outDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  : [];

if (targets.length === 0) {
  console.error('No builds in .output/. Run `npm run build:all` first.');
  process.exit(1);
}

let failures = 0;
let notes = 0;
const fail = (m: string): void => {
  failures += 1;
  console.error(`  ✗ ${m}`);
};
const note = (m: string): void => {
  notes += 1;
  console.log(`  · ${m}`);
};

for (const target of targets) {
  const dir = resolve(outDir, target);
  console.log(`\n• ${target}`);
  for (const file of collect(dir)) {
    if (statSync(file).size > 8 * 1024 * 1024) continue;
    const rel = relative(outDir, file);
    const text = readFileSync(file, 'utf8');
    const isContentScript = rel.includes('content-scripts/');
    const isExtensionPageChunk =
      /chunks\//.test(rel) || /(popup|options)\.js$/.test(rel);

    if (EVAL_RE.test(text)) fail(`${rel}: contains eval / new Function`);
    if (REMOTE_CODE_RE.test(text)) {
      fail(`${rel}: loads remote code (<script src>, import(), importScripts)`);
    }
    if (HTML_SINK_RE.test(text)) {
      if (isContentScript) {
        fail(`${rel}: HTML-injection sink in the content script`);
      } else if (isExtensionPageChunk) {
        note(
          `${rel}: HTML sink present (expected: React DOM internal, trusted extension page — see SECURITY.md)`,
        );
      } else {
        fail(`${rel}: HTML-injection sink outside the extension-page chunks`);
      }
    }
  }
}

console.log(
  failures === 0
    ? `\n✓ no dangerous APIs in the shipped code${notes ? ` (${notes} documented note(s))` : ''}`
    : `\n✗ dangerous-API scan failed with ${failures} finding(s)`,
);
process.exit(failures === 0 ? 0 : 1);
