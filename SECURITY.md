# WriteRight Security

## Reporting a vulnerability

Please report suspected security issues privately by opening a
[GitHub Security Advisory](https://docs.github.com/en/code-security/security-advisories)
on the repository, or by emailing the maintainers listed in the repository
metadata. Do not open a public issue for an exploitable vulnerability.

We aim to acknowledge within 72 hours.

---

## Threat model

WriteRight runs untrusted web content through its detection and (from Phase 2)
analysis code. The main threats:

1. **A malicious page tricking WriteRight into reading sensitive input** —
   password managers, banking forms, hidden token fields.
2. **A malicious page injecting instructions** that WriteRight or a local model
   acts on (prompt injection, Phase 4).
3. **A compromised dependency** pulling in remote code or exfiltration.
4. **WriteRight corrupting a page** or leaking document text into logs.

### Mitigations

| Threat | Mitigation |
|---|---|
| Reading sensitive input | Password/credential/hidden/disabled fields are excluded by the capability detector before any adapter is created (`core/field-capability-detector.ts`, §6.4). Code editors are excluded too. |
| Prompt injection (Phase 4) | AI is user-invoked, receives **selected text only**, never the whole page or unrelated fields. Prompt templates delimit the document as *content to edit, not instructions* (§14.7). |
| Supply chain | All dependencies pinned (`save-exact`), lockfile-committed. `verify:licenses` enforces a permissive-license allowlist; `verify:sbom` keeps `sbom.json` (CycloneDX) current; `verify:no-secrets` scans source + build; `npm audit` runs in CI. No `postinstall` scripts of our own. |
| Model output (Phase 4) | Every response is size-capped, control-char-stripped, and **rejected if it introduces an HTML tag or a script URI** (`ai/output-validator.ts`). The UI renders model text only as `textContent`. A rewrite replaces **only** the selected range, so content outside the selection is unchanged by construction. Local model servers are loopback-only, enforced before any `fetch` (`ai/loopback.ts`) and re-checked in the build by `verify:no-remote-ai`. |
| Page corruption | The content script never mutates the page except through an adapter's explicit, version-checked `replaceRange`; large replacements are previewable (§31 Rule 9). Lifecycle handlers are idempotent — no duplicate observers/overlays, verified by the stress suite (`tests/integration/stress.test.ts`). |
| Text in logs | `utils/logger.ts` is silent by default in production and provides `redact()`. No user text, credentials or page source is logged in production, tests or error handlers (§6.8, §31 Rule 5), enforced by `verify:no-text-logging`. |

---

## Content-script isolation (§6.5)

- Content scripts run in the **isolated world**. WriteRight does not execute
  page-context (`MAIN` world) code.
- **No** `eval`, **no** `new Function`, **no** remote `<script>`, remote CSS or
  remote fonts. Enforced by ESLint rules (`no-eval`, `no-new-func`,
  `no-restricted-syntax`) on `src/`.
- Model output (Phase 4) is rendered as text or sanitized structured content —
  never as HTML.
- The Harper WASM engine needs `'wasm-unsafe-eval'`. `wxt.config.ts` sets
  `content_security_policy.extension_pages` to
  `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'` — the minimal
  keyword that permits WebAssembly compilation and **nothing else** (it is not
  `unsafe-eval`: no JS `eval`, no `new Function`, no remote code). Without it,
  the browser's default MV3 CSP blocks WASM and the engine cannot start;
  `verify:manifest` fails the build if the keyword is missing or if bare
  `unsafe-eval` / `unsafe-inline` appears. The `.wasm` is pinned (exact
  `harper.js` version, SHA-256 in `public/harper/VERSION.json`), shipped
  locally, and fetched same-origin by the service worker (no
  `web_accessible_resources`, no remote fetch).
- The suggestion popover is built with plain DOM (`textContent`, `createElement`)
  — no `innerHTML`, no React, on the page.

## Automated security regression (§5.5, §23.2)

Every one of these runs in `npm run check` (and CI):

| Check | Script | Asserts |
|---|---|---|
| Manifest / permission audit | `verify:manifest` | no permission outside the allowlist; host & content-script matches are `http`/`https` only; `optional_host_permissions` is loopback-only; no privileged scheme; CSP has no bare `unsafe-eval` / `unsafe-inline` and no non-localhost remote source, and **does** carry `wasm-unsafe-eval` (the engine needs it). |
| Remote-code / dangerous-API scan | `verify:safe-apis` | the **built** code contains no `eval` / `new Function`, no remote `<script>` / `import()` / `importScripts`, and no HTML-injection sink (`innerHTML`, `insertAdjacentHTML`, `document.write`, `dangerouslySetInnerHTML`) in the content script. React DOM's internal `innerHTML` in the popup/options chunks is the only documented exception. |
| Local-only AI enforcement | `verify:no-remote-ai` | no built file references a known cloud-AI host or any non-loopback inference-shaped URL (§6.3). |
| Secret scan | `verify:no-secrets` | no credential-shaped strings or secret files in source or build (WriteRight has no cloud keys by design, §6.6). |
| No user text in logs | `verify:no-text-logging` | no direct `console.*` in `src/` (all logging goes through `utils/logger.ts`); no logger call passes an un-`redact()`ed text-bearing identifier. |
| License audit | `verify:licenses` | every dependency is under the permissive allowlist. |
| SBOM | `verify:sbom` | `sbom.json` (CycloneDX) matches the lockfile. |

ESLint additionally forbids `eval`, `new Function`, `document.write`,
`innerHTML`/`outerHTML` assignment, `insertAdjacentHTML` and
`dangerouslySetInnerHTML` across `src/`.

Before a release: `npm run verify:reproducible` (byte-identical build twice),
`npm audit --omit=dev`, and the manual review in [docs/RELEASE.md](docs/RELEASE.md)
— content-script isolation, model-output sanitisation, storage review,
loopback restrictions, no text logging.

## API keys

WriteRight has **no built-in cloud API keys** and no "encrypted key storage".
For local model endpoints it stores only non-secret settings (endpoint URL,
model label, enabled flag) (§6.6).

---

## Dependency policy

- Exact-pinned versions, lockfile committed.
- License review via `npm run verify:licenses` (allowlist: MIT, Apache-2.0,
  BSD, ISC, 0BSD, CC0, MPL-2.0 for build-only tooling — see
  `THIRD_PARTY_NOTICES.md`).
- `npm audit` in CI. Known, dev-only advisories are documented; see below.

### Known accepted advisories

| Advisory | Package | Why accepted |
|---|---|---|
| GHSA-w3rx-r6r6-pgpr, GHSA-5p2g-fcmc-qvqq (`image-size` DoS) | transitive via `web-ext` → `addons-linter` | **Dev-only**. Used to lint Firefox packages; not in the shipped extension and never fed untrusted images in our workflow. Upstream (`web-ext`) fix pending; do not `audit fix --force` (it downgrades `web-ext` and breaks the toolchain). |

### Known `web-ext lint` warnings (0 errors)

| Warning | Where | Why accepted |
|---|---|---|
| `UNSAFE_VAR_ASSIGNMENT` (innerHTML) | `chunks/*.js` (React DOM) | React's own internal `innerHTML` use, in the **popup/options pages only** (trusted extension context). The content script bundle contains no React and no such assignment. WriteRight never assigns model/page-derived HTML. |

