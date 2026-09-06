/**
 * Secret scan (§5.5, §23.2 "no plaintext secrets").
 *
 * Scans committed source, config and (if present) the built output for
 * credential-shaped strings and stray secret files. WriteRight has no cloud
 * API keys by design (§6.6) — this guards against one being introduced by
 * accident or a bad merge. Runs in `npm run check`.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, basename } from 'node:path';

const ROOT = process.cwd();

/** Directories to walk for source scanning. */
const SOURCE_DIRS = ['src', 'scripts', '.github'];
const SOURCE_FILES = [
  'wxt.config.ts',
  'vitest.config.ts',
  'package.json',
  'eslint.config.js',
];
const OUTPUT_DIR = resolve(ROOT, '.output');

const SCAN_EXT = /\.(ts|tsx|js|mjs|cjs|json|yml|yaml|html|css|md)$/;

interface Rule {
  name: string;
  re: RegExp;
}

const RULES: Rule[] = [
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: 'private key block',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  },
  { name: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/ },
  { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Stripe live key', re: /\bsk_live_[0-9A-Za-z]{24,}\b/ },
  { name: 'OpenAI key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/ },
  { name: 'Anthropic key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  {
    name: 'generic assigned secret',
    re: /\b(?:api[_-]?key|secret|token|passwd|password|client[_-]?secret)\b["']?\s*[:=]\s*["'][A-Za-z0-9+/_-]{20,}["']/i,
  },
  {
    name: 'JWT',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
];

/** Substrings that make a match a known false positive. */
const ALLOW_LINE = [
  'sha256',
  'sha-256',
  'integrity',
  'writeright@writeright.app', // the Firefox gecko id
  'example',
  'placeholder',
  'your-',
  'xxxx',
  'redacted',
  '// secret scan:',
];

const STRAY_SECRET_FILES =
  /^\.env(\..+)?$|^.*\.pem$|^.*\.p12$|^id_(rsa|ed25519)$/;

let findings = 0;
const flag = (msg: string): void => {
  findings += 1;
  console.error(`  ✗ ${msg}`);
};

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function scanFile(path: string): void {
  const rel = relative(ROOT, path);
  const name = basename(path);

  if (STRAY_SECRET_FILES.test(name)) {
    flag(`${rel}: a secret-bearing file must not be committed`);
    return;
  }
  if (!SCAN_EXT.test(name)) return;
  if (rel.includes('package-lock.json')) return; // hashes only, huge

  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const lower = line.toLowerCase();
    if (ALLOW_LINE.some((a) => lower.includes(a))) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        flag(`${rel}:${i + 1}: possible ${rule.name}`);
      }
    }
  });
}

console.log('• scanning source');
const sourceFiles = [
  ...SOURCE_DIRS.flatMap((d) => walk(resolve(ROOT, d))),
  ...SOURCE_FILES.map((f) => resolve(ROOT, f)).filter(existsSync),
];
for (const f of sourceFiles) scanFile(f);
console.log(`  scanned ${sourceFiles.length} file(s)`);

if (existsSync(OUTPUT_DIR)) {
  console.log('• scanning built output');
  const built = walk(OUTPUT_DIR).filter(
    (f) => /\.(js|mjs|html|json)$/.test(f) && !f.endsWith('.map'),
  );
  for (const f of built) {
    // Only the credential-shaped rules on built code; skip the noisy generic one.
    const rel = relative(ROOT, f);
    if (statSync(f).size > 8 * 1024 * 1024) continue; // skip the WASM-adjacent
    const text = readFileSync(f, 'utf8');
    for (const rule of RULES.slice(0, 9)) {
      if (rule.re.test(text)) flag(`${rel}: possible ${rule.name} in build`);
    }
  }
  console.log(`  scanned ${built.length} file(s)`);
}

console.log(
  findings === 0
    ? '\n✓ no plaintext secrets found'
    : `\n✗ secret scan failed with ${findings} finding(s)`,
);
process.exit(findings === 0 ? 0 : 1);
