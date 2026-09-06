/**
 * Local-only AI network enforcement (Phase 4 regression gate).
 *
 * Scans every built JS file for:
 *   - known paid / cloud inference hosts (hard denylist),
 *   - any `http(s)://` or `ws(s)://` URL literal that is neither a loopback
 *     address nor an obviously-harmless asset host.
 *
 * The production runtime must never contain a hidden remote inference URL
 * (§4 gate: "production bundle contains no hidden remote inference URL",
 * "local-only network enforcement passes"). Run `npm run build:all` first.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

/** Hosts that would mean a paid / remote model call — never allowed. */
const DENY_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'anthropic.com',
  'generativelanguage.googleapis.com',
  'api.cohere.ai',
  'api.mistral.ai',
  'openrouter.ai',
  'api.groq.com',
  'api.together.xyz',
  'api.perplexity.ai',
  'api.deepseek.com',
  'huggingface.co',
  'api-inference.huggingface.co',
  '.hf.space',
  'replicate.com',
  'bedrock',
  'azure.com',
];

/** URL literals that are fine to ship (build tooling, docs links, schemas). */
const ALLOW_URL_SUBSTRINGS = [
  'http://localhost',
  'http://127.0.0.1',
  'https://localhost',
  'ws://localhost',
  'ws://127.0.0.1',
  // Well-known non-network identifiers / spec URLs.
  'http://www.w3.org/',
  'https://www.w3.org/',
  'http://schemas.',
  'https://schema.org',
  'https://wxt.dev',
  'https://github.com/',
  'https://developer.chrome.com',
  'https://developer.mozilla.org',
  'https://writeright',
  'http://writeright',
];

const URL_RE = /\b(?:https?|wss?):\/\/[^\s"'`)\]}<>]+/gi;

function collectJs(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJs(full, base));
    else if (/\.(?:js|mjs|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}

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

let failures = 0;
const fail = (msg: string): void => {
  failures += 1;
  console.error(`  ✗ ${msg}`);
};

for (const target of targets) {
  const targetDir = resolve(outDir, target);
  console.log(`\n• ${target}`);
  let scanned = 0;
  for (const file of collectJs(targetDir, targetDir)) {
    scanned += 1;
    const text = readFileSync(file, 'utf8');
    const rel = relative(outDir, file);

    const lower = text.toLowerCase();
    for (const host of DENY_HOSTS) {
      if (lower.includes(host)) {
        fail(`${rel}: contains a denied AI host substring "${host}"`);
      }
    }

    for (const match of text.match(URL_RE) ?? []) {
      const url = match.toLowerCase();
      if (ALLOW_URL_SUBSTRINGS.some((s) => url.startsWith(s.toLowerCase()))) {
        continue;
      }
      // Anything else that looks like an API endpoint is a finding.
      if (
        /\/v1\/|\/chat\/completions|\/api\/(?:chat|generate)|\/completions|inference|\/messages\b/.test(
          url,
        )
      ) {
        fail(`${rel}: non-loopback endpoint-looking URL "${match}"`);
      }
    }
  }
  console.log(`  scanned ${scanned} file(s)`);
}

console.log(
  failures === 0
    ? '\n✓ no remote / paid AI endpoint found in any build'
    : `\n✗ local-only AI enforcement failed with ${failures} finding(s)`,
);
process.exit(failures === 0 ? 0 : 1);
