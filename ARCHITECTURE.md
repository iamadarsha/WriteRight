# WriteRight Architecture

This document describes how WriteRight 1.0 is put together. `_(Phase N)_`
markers record when a piece landed during the build; every phase is complete.
Browser-support details and the manual smoke matrix live in
[BROWSER_SUPPORT.md](docs/BROWSER_SUPPORT.md); the release process in
[RELEASE.md](docs/RELEASE.md).

---

## 1. Contexts

A browser extension runs code in several isolated contexts. WriteRight keeps a
thin shim at each entrypoint and puts the logic in testable controller classes.

```
┌──────────────┐   typed request/response    ┌──────────────────┐
│  content     │  ───────────────────────▶   │  background /    │
│  script      │   (messaging/bus.ts, §26)   │  service worker  │
│  (isolated   │  ◀───────────────────────   │                  │
│   world)     │                             │  Background       │
│              │        browser.storage.onChanged  Controller    │
│ ContentController │ ◀───────────────────── │  (settings, site  │
└──────┬───────┘   (state propagation)       │   rules, badge)   │
       │                                     └────────┬─────────┘
       │ mounts                                       │ storage
┌──────▼────────────────┐                    ┌────────▼─────────┐
│ Shadow DOM UI host    │                    │  popup / options │
│ (ui/shadow-host.ts)   │                    │  React apps      │
│  overlay + ui layers  │                    │  (useSettings…)  │
└───────────────────────┘                    └──────────────────┘
```

- **State propagation** rides `browser.storage.onChanged`, which fires in every
  context including content scripts. It survives service-worker suspension, so
  a settings or per-site change reaches the page with no messaging round-trip.
- **The typed messaging channel** (`messaging/`) is request/response only:
  `GET_SETTINGS`, `SET_SITE_ENABLED`, `REPORT_PAGE_STATUS`, `GET_DIAGNOSTICS`, …
  Every payload is validated at the boundary; unknown types are rejected (§26).

---

## 2. Content-script world

### `TextFieldManager` (`core/text-field-manager.ts`)

The coordinator. It:

1. discovers editing surfaces — focus-driven, plus a debounced
   `MutationObserver` for SPA churn (§1.5);
2. attaches exactly one `EditorSession` per surface, idempotently (§5.3);
3. keeps only the **focused** surface active for real-time work (§17.4) —
   focus moving into WriteRight's own closed-shadow host does **not** count as
   leaving the editor, so opening the popover never disposes the session;
4. tears down sessions when their element leaves the DOM;
5. holds a session-scoped `pausedFields` set for **field-level disable**
   (§4.1 #23): `pauseActiveField()` / `resumeField()` drive the
   `disabled-field` status and the launcher's "turn back on" affordance;
6. reacts to `PageLifecycle` events (SPA nav, bfcache, visibility);
7. computes the page availability status shown in the popup.

It performs **no** linguistic analysis and never mutates the page except
through an adapter's explicit `replaceRange`. The content controller mirrors
coarse runtime state (`availability`, `active`, `analyzing`, suggestion count,
popover open) onto the light-DOM host as `data-wr-*` attributes — counts and
states only, never text (§6.8) — for E2E and debugging.

### `EditorAdapter` (`types/editor.ts`, `adapters/`)

All browser/editor interaction is isolated behind this interface. Capability
tiers (§5.1):

| Tier | Meaning | Phase 1 adapters |
|---|---|---|
| A | Full inline support | `textarea`, `input`, ordinary `contenteditable` |
| B | Rich editor, text accessible, inline optional | _(Phase 4/5)_ |
| C | Canvas/virtualized — sidebar/on-demand only | _(Phase 4/5)_ |
| D | Unsupported — say so honestly | `unsupported` |

`AdapterRegistry` picks the best adapter by priority. Site-specific adapters
register with high priority and live under `adapters/sites/` — never in the
core engine (§31 Rule 14). Virtualized and canvas editors (CodeMirror 6,
Monaco) are still rejected outright rather than adapted (fixture tests in
`tests/integration/fixtures.test.ts`).

`adapters/sites/site-profiles.ts` is the complementary allowlist: sites whose
primary editor is a `<canvas>` that _cannot_ be adapted inline (Google Docs).
A match forces page availability to `unsupported` with an honest, site-specific
explanation, so `TextFieldManager` steers the user to the sidebar's
paste-and-analyse fallback instead of failing silently or latching onto a
stray title `<input>`. Per-field attachment (a focused Docs comment box, say)
is unaffected.

`BaseAdapter` provides the shared lifecycle: monotonic document version, IME
composition tracking (deferring destructive edits), listener fan-out, and
idempotent teardown.

### `EditorSession` (`core/editor-session.ts`)

One per active surface (§19). Owns the adapter, a content hash, the document
version, and — from Phase 2 — the suggestion list. Suggestions never cross
sessions and stale-version suggestions are dropped (§31 Rule 12).

### `PageLifecycle` (`core/page-lifecycle.ts`)

Normalizes `pageshow`/`pagehide`/`visibilitychange`/`popstate`/`hashchange` and
the Navigation API into `url-changed` / `page-shown` / `page-hidden` /
`dom-replaced` events. Lightweight observation only — no monkey-patching of
page globals (§5.3).

### Shadow DOM host (`ui/shadow-host.ts`)

A single closed shadow root that owns every injected UI element — the underline
overlay layer and the suggestion popover (Phase 2), the sidebar and its
launcher pill (Phase 3). Isolated styles, `pointer-events: none` on the host,
idempotent mount/unmount.

### Analysis coordinator (`core/analysis-coordinator.ts`) _(Phase 2–3)_

Created per focused editor session. Wires:

- `AnalysisScheduler` — 250 ms trailing debounce, `maxWait` 1.2 s, request-id +
  document-version tagging, stale-result rejection, IME deferral (§17.2–3);
- an `UnderlineRenderer` chosen by adapter tier (`ui/underline/`):
  `TextareaOverlayRenderer` (style-matched mirror element, §18.2),
  `ContentEditableRangeRenderer` (`Range.getClientRects()` marks, §18.3),
  `FallbackNoInlineRenderer` (Tier C/D, §18.4);
- the shared plain-DOM `SuggestionPopoverElement` (`ui/popover/`) — no React on
  the page (§17);
- `applySuggestion` (`core/apply-suggestion.ts`) — the §10.4 safety gate:
  session match, editable, not composing, in-bounds, exact original text +
  hash still match, before any `adapter.replaceRange`.

Ignore-once is content-local; "ignore this rule here" persists to the site
rule; "add to dictionary" goes to the background and the personal dictionary.

From Phase 3 the coordinator also carries the `DocumentInsights` for the current
version (requested via `withInsights: true`), exposes an `onUpdate` fan-out, a
by-id suggestion API for the sidebar, `revealSuggestion(id)` (selects the span
and opens the popover), `requestRewrite()` and a version-safe `applyFullText()`
(full-range replace through the adapter).

### Sidebar (`ui/sidebar/`, `core/sidebar-controller.ts`) _(Phase 3–4, §15)_

`SidebarController` owns a plain-DOM `SidebarElement` and a `SidebarLauncher`
pill, both living in the shadow host's UI layer and both persisting across
editor focus changes — only the `SidebarDataSource` binding follows the active
coordinator. The element has five tabs (Suggestions, Statistics, Tone, Rewrite,
Assistant), is fully keyboard-operable, closes on <kbd>Esc</kbd>/button
**without trapping focus**, and returns focus to the editor on close. The
Rewrite tab shows a word-level diff (`word-diff.ts`, LCS over tokens) and calls
`applyFullText` only on explicit confirmation. The **Assistant** tab (Phase 4)
shows the AI status line, a first-run local-only privacy note that must be
acknowledged, the generative rewrite actions and a chat panel — each routed
through the background `AiService`; every AI rewrite is previewed and applied
only to the selection range on confirm. Opened from the launcher, the popup's
`OPEN_SIDEBAR` broadcast, or <kbd>Alt</kbd>+<kbd>W</kbd>.

---

### Select-to-define (`core/define-controller.ts`, `ui/define/`, `engine/lexicon/`) _(1.2.0, §11.3)_

A `SelectionWatcher` (debounced `selectionchange` + `mouseup`/`keyup`) reports a
short, mostly-alphabetic selection that is **not** in a password field, code
editor or WriteRight's own host. `DefineController` shows a `DefinePill` at the
selection; a click (or `Alt+D`) opens the `DefinePanel`, which sends `DEFINE` to
the background and renders senses / part of speech / example / synonym +
antonym chips. In an editable field a synonym chip calls `replaceSelectionText`
(a normal `input` event, so the page's own undo works).

The background `LexiconService` wraps `LexiconStore` (`engine/lexicon/`):

- `scripts/build-lexicon.ts` turns **Open English WordNet 2025+** (LMF XML,
  pinned SHA-256) into `public/lexicon/lemmas.bin` (a ~20 KB block index) and
  `glosses.bin` (~8.5 MB of 256-lemma, per-block-gzipped records). Format in
  `engine/lexicon/codec.ts`, isomorphic (`DataView` + `TextEncoder` only).
- `LexiconStore` loads both on the first lookup, binary-searches the resident
  index to a block, decompresses just that block (`DecompressionStream`), and
  keeps a 16-block LRU. **Everything is dropped after 5 min idle.** A failed load
  → `{ unavailable: true }`, retried at most once per 30 s. `morphy.ts`
  (curated irregulars + detachment rules) supplies inflected-form candidates;
  the store keeps the first that the index contains.

## 3. Linguistic engine (`engine/`) _(Phase 2–3)_

```
normalized snapshot (UTF-16, LF)
  → protected spans        (core/protected-spans.ts, §10.2)
  → format preset          (engine/format-presets.ts — relaxes ill-fitting rules)
  → Harper (spelling + grammar)   ┐  engine/harper/ — harper.js LocalLinter
  → custom WriteRight rules        ├→ normalize → rule/ignore filter → merge (§21)
       (engine/rules/, §2.4)       ┘
  → Suggestion[]
  → DocumentInsights       (engine/insights-engine.ts — only when requested)
```

- **Harper** (`engine/harper/`) wraps `harper.js`'s `LocalLinter`. Every WASM
  `Lint` handle is projected to a plain `HarperFinding` and freed immediately.
  A mandatory **startup smoke test** (`smoke-test.ts`, §2.1) proves the engine
  loaded, the default lint config is populated, a known spelling and grammar
  error are caught, a clean sentence is clean, and offsets are UTF-16 (emoji
  regression) — a silent zero-result engine is a release blocker.
- **Custom rules** (`engine/rules/`) are a thin high-precision layer for what
  Harper does not cover / WriteRight configures differently: repeated spaces &
  punctuation, duplicate words, sentence capitalization, wordy phrases, and a
  configurable buzzword list. Each rule has positive **and** negative tests.
- **Merger** (`suggestion-merger.ts`, §21): drop exact duplicates, group
  overlapping findings, keep one winner per span (source rank → severity →
  confidence → specificity). The user never sees three competing fixes.
- Confidence & auto-apply eligibility live in `confidence.ts` — only spelling
  with an unambiguous top replacement is one-click-safe (§10.4).

### Where it runs

The engine runs in the **background service worker** (`core/engine-service.ts`)
so no page main thread is ever blocked (§17.1, §2.2) — one implementation
across Chromium and Firefox. The content script sends `ANALYZE_TEXT`
(normalized snapshot + version + origin); the background assembles the full
request from settings + per-site rules + the personal dictionary and returns
`Suggestion[]`. The Harper WASM (~15 MB) is a separate streamed, browser-cached
`.wasm` file synced into `public/harper/` from the pinned `harper.js`
(`scripts/sync-harper-assets.ts`) — never inlined into the service worker.

On an MV3 cold wake the engine re-initializes (~sub-second); the content layer
shows an "analyzing" affordance and typing is never blocked (§5.3). The
`EngineHost` / `EngineBackend` abstractions keep an offscreen-document or
dedicated-worker host swappable if wake latency ever needs it.

All shared offsets are **UTF-16 code units** against the normalized snapshot
(§10.3) — Harper 2.7 reports these natively (verified with a surrogate-pair
regression test).

### Insight engines (`engine/`, `core/segmenter.ts`) _(Phase 3, §12–§13)_

All pure, deterministic, and independent of Harper — plain functions over the
normalized snapshot. `computeInsights()` runs them after suggestion merging
(the score needs the final counts) and only when the request asks for it
(`withInsights`), adding ≈ 1 ms on a 500-word document.

| Module | Produces | Notes |
|---|---|---|
| `core/segmenter.ts` | word / sentence / paragraph spans, syllables | UTF-16 offsets; `...` is never a boundary |
| `readability-engine.ts` | `DocumentStats` + `ReadabilityScores` | Flesch RE, Flesch–Kincaid, Gunning Fog, Coleman–Liau, SMOG; `sufficientText` gate below ~30 w / 3 sentences |
| `tone-engine.ts` | `ToneEstimate` over 9 tones | signal-scored; label always carries uncertainty ("Likely" / "Possibly" / "unclear or mixed"); no accuracy claim |
| `score-engine.ts` | `HealthScore` (0–100) | published weighted formula; each component has a plain-language note; no stored profile |
| `rewrite-engine.ts` | `RewriteResult` | conservative, reversible; segments on protected spans and only rewrites prose; nothing generative |
| `format-presets.ts` | `FormatPreset` | target tone + guidance + which custom rules stay on (§3.4) |

`DocumentInsights` carries only aggregate numbers and labels — never an excerpt
of the user's text — so it is safe to hold in `storage.session` for the popup
(§4) and to pass across the message boundary.

---

## 3a. Local-AI layer (`ai/`) _(Phase 4, §4, §14)_

Entirely optional and off by default (`features.ai`). It lives in the
background service worker (`ai/ai-service.ts`, wired into `BackgroundController`
as an optional `ai` backend) so the page never talks to a model. With no AI
backend, or with AI disabled, every `AI_*` message returns an honest disabled
response and nothing else changes.

```
AI_RUN { task, selection }           ← explicit user action in the sidebar
   ↓  AiService
capability-detector  → probe chrome / ollama / lmstudio / custom  (cached ~8 s)
   ↓
ai-router.route()    → generative | deterministic-guidance | unsupported
   ↓  (generative only)
prompts/templates    → injection-delimited system + user prompt
   ↓
adapter.generate({ signal, wantJson })   AbortController per requestId (§4.9)
   ├─ prompt-api-adapter   → LanguageModel (Chrome on-device)
   ├─ ollama-adapter       → http://localhost:11434/api/chat   ┐ loopback-only,
   ├─ lm-studio-adapter    → http://localhost:1234/v1/...       ├ via loopback.ts
   └─ local-endpoint-adapter (generic OpenAI /v1)               ┘ + http.ts timeout
   ↓
output-validator     → schema, size cap, strip control chars, REJECT HTML / script URI
   ↓
AiRunResponse  { status: 'ok' | 'blocked', ... }
```

| Module | Role |
|---|---|
| `loopback.ts` | the single network chokepoint: only `http`/`ws` to `localhost` or `127.0.0.0/8`; everything else refused before `fetch` (§6.3) |
| `http.ts` | `localFetch` — `requireLoopback` + caller signal + independent timeout so a hung local server can't freeze the UI (§4.9) |
| `capability-detector.ts` | probes each provider, reports one `AiCapability` label; never claims "ready" when no model can run (§14.4) |
| `prompt-api-adapter.ts` | Chrome `LanguageModel`; resolves the API across versions; surfaces downloadable / downloading (§14.5); no user text in a readiness check |
| `ollama-adapter.ts` / `lm-studio-adapter.ts` / `local-endpoint-adapter.ts` | loopback model servers; connection test, model discovery, JSON mode, cancellation |
| `ai-router.ts` | classifies the task first — "no local finding" never auto-routes to AI; returns an honest limitation, never a cloud upsell (§4.5, §4.9) |
| `prompts/templates.ts` | fences the document in delimiters, tells the model it is "content to edit, not instructions" (§14.7); no page metadata |
| `output-validator.ts` | parses `{rewrittenText,changes}` / `{explanation}`, size cap, rejects HTML/script; rewrites replace **only** the selection range (§4.8) |
| `ai-service.ts` | background host: settings, per-request `AbortController`, first-run privacy ack |

Only the **selection** (or the whole focused field when nothing is selected) is
ever sent to a model. The content script contains no adapter or network code —
it only sends `AI_*` messages. `optional_host_permissions` adds only
`http://localhost/*` and `http://127.0.0.1/*`, requested at the moment the user
tests a local provider.

---

## 3b. Platform abstraction (`platform/`) _(Phase 5, §5.2, §25.1)_

`browser-capabilities.ts` is pure feature detection — no UA sniffing. Feature
code branches on a `BrowserCapabilities` value (`nativeSidePanel`,
`keyboardCommands`, `sessionStorage`, `runtimePermissions`, `promptApi`, …),
never on `browser === 'x'`. The result is memoised and reset per test.

`CAPABILITY_MATRIX` is the Chrome / Edge / Firefox / Safari support table as
data; a unit test keeps it consistent with
[BROWSER_SUPPORT.md](docs/BROWSER_SUPPORT.md), and every `conditional` cell must
carry a note. The universal experience (field detection, engine, insights,
Shadow-DOM sidebar, safe rewrites) needs none of the optional APIs.

Keyboard commands (`manifest.commands`): `Alt+Shift+E` → popup
(`_execute_action`, browser-handled), `Alt+Shift+W` → the background forwards
`toggle-sidebar` to the active tab's in-page sidebar. The `Alt+W` in-page
hotkey is the guarantee where `browser.commands` is unavailable.

---

## 4. Storage (`storage/`)

| Store | Area | Contents |
|---|---|---|
| `settings` | `storage.local` | global preferences (§20.1) incl. `defaultPresetId`, versioned |
| `siteRules` | `storage.local` | per-origin enable/disable + ignored rules + optional `presetId` |
| `dictionary` | `storage.local` | personal dictionary (§11.4) |
| `settings.ai` | `storage.local` | local-AI provider prefs + loopback endpoints; inert unless `features.ai` |
| `aiChat` | `storage.local` | opt-in AI chat transcript (§4.7); absent unless the user enables it |
| per-tab status | `storage.session` (in-memory fallback) | last page status for a fast popup open |
| per-tab insights | `storage.session` (in-memory fallback) | last `DocumentInsights` (aggregate numbers only) for the popup's score ring |

Every durable store carries a `schemaVersion`. WXT's versioned items run
migrations deterministically on first read; `storage/migrations.ts` holds the
migration table and a last-known-good backup guards against a failed migration
(§20.4). "Reset all local data" clears everything WriteRight owns, regardless
of migration state (§28).

---

## 5. Message security (§26)

`messaging/validate.ts` contains hand-written structural guards (no schema
library — keeps the content bundle tiny). `messaging/bus.ts` wraps every reply
in a `{ ok, data | error }` envelope and tags messages with `__wr` so unrelated
extension traffic is ignored cheaply. Analysis requests are capped at 200 KB of
text. Phase 3 adds `REWRITE_TEXT`, `SET_SITE_PRESET`, `REPORT_PAGE_INSIGHTS`,
`GET_ACTIVE_TAB_INSIGHTS` and the `OPEN_SIDEBAR` / `TOGGLE_SIDEBAR` broadcasts,
each with a validator; `sendToActiveTabContent()` is the popup → content path.
Phase 4 adds `AI_GET_CAPABILITY`, `AI_TEST_CONNECTION`, `AI_LIST_MODELS`,
`AI_RUN`, `AI_CHAT`, `AI_CANCEL`, `AI_ACK_PRIVACY`, `AI_GET_CHAT_HISTORY`,
`AI_SAVE_CHAT_HISTORY` — `AI_RUN` selection capped at 16 KB (plus a required
`whole` flag), chat at 8 KB, task names allowlisted, and `SettingsPatch.ai`
only accepts known keys with loopback-length strings.

---

## 6. Build & manifests (`wxt.config.ts`)

WXT produces per-browser builds. Manifest differences (Firefox `gecko`
settings + data-collection disclosure, background type) are isolated in the
config's `manifest` function. Permissions: `storage` +
`host_permissions: ["*://*/*"]` for universal writing assistance on ordinary
web pages, which the user can revoke per-site or globally, plus
`optional_host_permissions` limited to `http://localhost/*` and
`http://127.0.0.1/*` — requested at runtime only when a local AI provider is
tested (§6.3). Chrome's on-device AI needs no permission.

`scripts/validate-manifest.ts` audits every built manifest against a permission
allowlist, rejects remote CSP sources, bare `unsafe-eval` / `unsafe-inline`,
**and a CSP missing `wasm-unsafe-eval`**, and fails on any non-loopback
`optional_host_permission`. `scripts/verify-no-remote-ai.ts` scans every built
JS/HTML file for a cloud-AI host denylist and for any non-loopback
endpoint-shaped URL. Both run in `npm run check`.

`wxt.config.ts` explicitly sets `content_security_policy.extension_pages` to
`script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. This is required:
WXT only injects `wasm-unsafe-eval` in `wxt dev`, so a production build would
otherwise fall back to the browser's default MV3 CSP (`script-src 'self'`),
which blocks WebAssembly compilation and stops the Harper engine from starting
at all. `wasm-unsafe-eval` permits WebAssembly only — it is **not**
`unsafe-eval` (§6.5). The `.wasm` is fetched same-origin by the worker, so it
needs no `web_accessible_resources` entry.

`manifest.commands` declares two keyboard shortcuts (§5.2). It is a top-level
manifest key, not a permission.

---

## 7. Verification (`scripts/`, `tests/`, `e2e/`)

| Layer | Where | What |
|---|---|---|
| Unit + integration | `tests/` (Vitest, jsdom, WXT fake browser) | adapters, normalization, protected spans, UTF-16 offsets, engines, merging, storage, lifecycle, messaging, the sidebar/popover, the AI layer, stress and a11y |
| Golden corpus | `tests/fixtures/golden-corpus.ts` | curated sentences → expected *result classes* + false-positive traps (§23.3–4) |
| Browser E2E + visual | `e2e/` (Playwright) | real Chromium with the built extension; typing → correction → apply, password-field exclusion, popup/options, screenshot baselines. Needs `npx playwright install`; own CI job |
| Security regression | `scripts/verify-*` | secrets, dangerous APIs in the build, no-remote-AI, no-text-logging, manifest, licenses, SBOM |
| Reproducibility | `scripts/verify-reproducible-build.ts` | two builds → byte-identical (§5.10, §24.2) |
| Performance | `tests/integration/engine-performance.test.ts` | latency budgets per document size; fails on a material regression |

`npm run check` runs everything except the Playwright job and the reproducible
build; it is exactly what CI runs and needs only `npm`.
