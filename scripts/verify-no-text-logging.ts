/**
 * "No user text in console output" scan (§6.8, §31 Rule 5, §23.2).
 *
 * Enforces the logging contract:
 *  1. Source never calls `console.*` directly — all logging goes through
 *     `utils/logger.ts` (`createLogger`), which is silent by default in
 *     production and offers `redact()`.
 *  2. No logger call passes an obviously text-bearing identifier
 *     (`text`, `content`, `selection`, `snapshot`, `document`, `.getText()`)
 *     without wrapping it in `redact(...)`.
 *
 * This is a static heuristic, not a proof — but it catches the common mistake
 * and keeps reviewers honest. Runs in `npm run check`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const ROOT = process.cwd();

/** Files allowed to call `console.*` directly. */
const CONSOLE_ALLOW = new Set(['src/utils/logger.ts']);

const CONSOLE_RE =
  /(?<![.\w])console\s*\.\s*(?:log|info|warn|error|debug|trace)\s*\(/;
const LOGGER_CALL_RE =
  /\blog(?:ger)?\s*\.\s*(?:debug|info|warn|error)\s*\(([^;]*)\)/g;
// Only bare identifiers / expressions, checked AFTER string literals are removed.
const TEXTY_ARG_RE =
  /\b(?:text|selection|snapshot|documentText|rawText|userInput|newText)\b|\.getText\s*\(\)|\bnormalizeLineEndings\s*\(/;

/** Drop string / template literals so message text can't trip the heuristic. */
function stripStringLiterals(s: string): string {
  return s
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

let failures = 0;
const fail = (m: string): void => {
  failures += 1;
  console.error(`  ✗ ${m}`);
};

const files = walk(SRC);
for (const file of files) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  if (!CONSOLE_ALLOW.has(rel)) {
    lines.forEach((line, i) => {
      if (CONSOLE_RE.test(line) && !line.includes('eslint-disable')) {
        fail(`${rel}:${i + 1}: direct console.* — use createLogger() instead`);
      }
    });
  }

  for (const m of text.matchAll(LOGGER_CALL_RE)) {
    const rawArgs = m[1] ?? '';
    const args = stripStringLiterals(rawArgs);
    if (TEXTY_ARG_RE.test(args) && !/\bredact\s*\(/.test(args)) {
      const line = text.slice(0, m.index).split('\n').length;
      fail(
        `${rel}:${line}: logger call may include user text without redact(): ${rawArgs
          .trim()
          .slice(0, 80)}`,
      );
    }
  }
}

console.log(`• scanned ${files.length} source file(s)`);
console.log(
  failures === 0
    ? '\n✓ logging contract holds — no direct console.*, no unredacted user text'
    : `\n✗ text-logging scan failed with ${failures} finding(s)`,
);
process.exit(failures === 0 ? 0 : 1);
