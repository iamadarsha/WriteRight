# Changelog

All notable changes to WriteRight are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The 0.x releases
followed the five-phase build roadmap (see the PRD); **1.0.0 was the first
release-ready build** and from there the project follows semantic versioning.

## [Unreleased]

Post-1.2.0 hardening. No change to the zero-cost, local-first or privacy
contracts (all still CI-enforced).

### Added

- **Streaming local AI (§4.8).** "Rephrase" (on a clarity card) and the
  Rewrite-tab modes now fill in token-by-token as the on-device model produces
  them — a blinking caret, live text — instead of a 2–5 s freeze on a spinner.
  It runs over a dedicated keep-alive `runtime.connect` port whose own message
  activity holds the MV3 service worker open for the whole generation, so
  **`permissions` stays `["storage"]`** — no `alarms`, no new permission prompt
  for existing users. Every safety property is unchanged: streamed text is
  display-only, `validateAiOutput` still runs once on the *complete* text, and
  "Use this rewrite" / apply stays disabled until that passes. Ollama (NDJSON),
  LM Studio / custom OpenAI-compatible (SSE) and the Chrome Prompt API
  (`promptStreaming`) all stream; a provider that can't falls back to a single
  chunk. Cancel disconnects the port and aborts the run. Chat is a follow-up.
- **Real Consistency score (§12.2).** The Writing Health breakdown's fifth
  component was a hardcoded `100`. It now runs deterministic local checks over
  the text — mixed straight/curly quotes, a US⇄GB spelling mix within one
  document (`color`/`colour`, `organise`/`organize`, …), inconsistent
  sentence spacing, and a word used both hyphenated and closed (`e-mail`/
  `email`) — and names the first inconsistency it finds. No Harper call, no
  network.
- **Text scale up to 2.0×** in Options (was capped at 1.5×) for low-vision
  users; every in-page and extension surface scales with it.
- **Inline clarity check (§12.3)** — over-long (34+ word) or multi-clause
  sentences now get a blue **Clarity** underline and a card explaining why,
  instead of readability being only a number in the sidebar. Deterministic,
  conservative (100% precision on the eval set), never an auto-fix. New
  **Clarity** toggle in the popup checks strip and options.
- **Tone / rewrite modes on the main view** — the rewrite modes (Make it
  shorter, Simplify, More formal, More casual, Friendlier, More confident, More
  persuasive, Improve clarity, …) moved out of the Assistant tab: the **Rewrite**
  tab is now their home (pills at the top, then the deterministic "Tidy up"),
  and the **Suggestions** tab carries a compact "Rewrite:" strip so they're one
  tap from the main view. The **Tone** tab gains an "Adjust tone" row. Assistant
  is now free-form chat only.
- **"Rephrase" action (§3.5, §12.3)** — on clarity cards and any card without a
  one-click fix (wordy phrasing, buzzwords, passive voice): rewrites the whole
  sentence the flag sits in. Local AI does a real rewrite; without it the
  deterministic engine tidies just that sentence and says so. Apply is
  range-scoped — nothing outside the sentence moves.
- **Honest Google Docs handling (§5.1)** — `adapters/sites/site-profiles.ts`, a
  small data-driven allowlist of editors that render to a `<canvas>` and so
  cannot be checked inline. On a Google Doc (`docs.google.com/document/d/…`)
  WriteRight now reports the page as **unsupported** — toolbar badge, popup and
  launcher all say so — and opens straight to the sidebar's **paste-and-analyse**
  fallback with a canvas-specific note, instead of sitting silently or latching
  onto the stray document-title `<input>`. Focusing an ordinary field on the
  same page (a Docs comment box) still gets full inline help.
- **Grammar-recall rules + eval harness** — a data-driven `confusables-rule`
  (to/too, your/you're, its/it's, loose/lose, then/than, their/they're, "he
  don't" → "he doesn't", …) and `npm run eval:engine` (`--check` gates
  precision ≥ 0.85 per error class in CI). Recall on the eval set 64% → 98% at
  100% precision, zero false positives.

### Changed

- **Define is now <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>** (was
  <kbd>Alt</kbd>+<kbd>D</kbd>, which is the browser's address-bar shortcut on
  Windows/Linux). <kbd>Alt</kbd>+<kbd>W</kbd> for the sidebar is unchanged.
- **Coleman-Liau readability counts Unicode letters**, not just ASCII `A–Z`
  — accented and non-Latin prose (`Café`, `Zürich`, `naïve`) is no longer
  scored as if those glyphs weren't letters.
- **On-device-AI readiness probe is cached for 8 s** instead of a
  round-trip to the background worker on every clarity-card open; a settings
  change still invalidates it immediately.
- **Constructable stylesheets in the in-page Shadow host** where the engine
  supports them (`adoptedStyleSheets` + `replaceSync`), with the `<style>`
  element kept as the fallback — one shared sheet across roots, no per-mount
  `<style>` parse.
- **Popover / sidebar / define panel polished to the README design
  language** — the define panel now floats at the popover's elevation (not
  the sidebar's heavier drawer weight); spacing, radii and the rephrase
  preview's tint snap to the token scale. No layout or behaviour change.
- **One `FieldGeometryTracker` per focused field** — the launcher icon, the
  underline renderer and the suggestion popover shared three near-identical
  scroll/resize/observer/poll loops against third-party DOM (and were the source
  of three positioning bugs). Consolidated into one tracked source; −82 LOC,
  behaviour unchanged.
- **Chrome Prompt API adapter** aligned with the current API — `availability()`
  / `create()` with `expectedInputs` / `expectedOutputs`, `monitor`
  download-progress, `DOMException` names surfaced. The legacy
  `systemPrompt` / origin-trial permission is gone.
- The AI toggle formerly labelled "Enhanced local review" is now **"Allow
  whole-field AI edits"** (the storage key is unchanged) — the old name
  oversold a setting that only gates whole-field rewrites.

### Fixed

- **Rapid site on/off toggles could drop a setting.** `patchSettings` and the
  per-site rule writers did a read-modify-write with no serialization, so two
  quick toggles (or one in each of two tabs) raced and the last writer
  clobbered the other's change. Writes per storage key are now serialized
  through a small keyed mutex.
- **Stranded per-tab state on prerender activation (§5.3).** When Chrome
  swaps a prerendered page in under a new tab id, `tabs.onReplaced` now
  clears the old tab's session status instead of leaving it orphaned.
- **Clicking a suggestion in the popover did nothing (§9.7).** WriteRight's UI
  is a *closed* shadow root, so a `pointerdown` on one of the card's own buttons
  is retargeted to the shadow host by the time the card's outside-click
  dismisser (a document-level listener) sees it. The dismisser read that as a
  click *outside* the card and tore it down before the button's `click` could
  fire — so a mouse click on a replacement, "Explain more", "Rephrase", etc.
  just closed the card. It now recognises events that resolve to WriteRight's
  own host and leaves the card open; only a pointer on the page dismisses it.
  The keyboard path (1–4, Esc) was unaffected.
- **A silently-reverted edit is now owned up to.** If a rich editor (ProseMirror,
  Lexical — Notion, Gamma) accepts the applied DOM edit and then restores its
  own model a tick later, WriteRight notices the snap-back, tells the user the
  editor wouldn't take the change, and re-runs analysis so the underline
  returns — instead of a click that seemed to do nothing.
- **Underline marks scattered across the page on chatgpt.com and other
  scrollable editors (§18.3).** The `contenteditable` renderer drew a mark for
  every `Range.getClientRects()` rect at its raw viewport position. ChatGPT's
  composer lays its full multi-line text into a tall element that a small
  `max-height; overflow:auto` parent clips and scrolls — so marks for lines
  scrolled out of that little window rendered wherever the geometry put them,
  strewn over the message history. Marks are now clipped to the field's
  actually-visible box (`visibleClipRect` — the intersection of the viewport
  with every scroll/clip ancestor); a line whose baseline is outside that
  window gets no underline, and the popover's fallback anchor is clamped the
  same way so it can't fly off-screen. The `<textarea>`/`<input>` mirror
  renderer already clipped and is unchanged.

## [1.2.0] — Offline vocabulary, select-to-define, granular check toggles, Simple Mode

Adds a complete offline dictionary and thesaurus, a Grammarly-style bank of
independent on/off toggles for every check, and a large-target "Simple Mode" UI
variant. No change to the zero-cost, local-first or privacy contracts — the new
data ships inside the extension and loads only on first use.

### Added

- **Offline dictionary & thesaurus (§11.3)** — select any text on any page and a
  small **Define** button appears; it opens a panel with the word's meaning(s),
  part of speech, an example, synonyms and antonyms. Also on **Alt+D**. In an
  editable field a synonym chip offers to swap the word in. Works with no
  network and no account.
  - Data: **Open English WordNet 2025+** (CC-BY-4.0), pinned by SHA-256.
    `scripts/build-lexicon.ts` extracts only the needed subset (lemma, POS,
    definition, one example, synonyms, antonyms) into a compact
    block-compressed binary — `public/lexicon/{lemmas.bin,glosses.bin}`, ~8.5 MB
    — never raw WordNet (§11.3). ~152 k lemmas / ~210 k senses.
  - Runtime: `LexiconStore` in the background worker loads it lazily on the
    first lookup, keeps a ~20 KB block index resident with a 16-block LRU, and
    **evicts everything after 5 min idle** — a user who never uses "define" pays
    zero steady-state memory. Every lookup has a 2.5 s timeout; a failed data
    load reports "unavailable" and is retried at most once per 30 s. It cannot
    hang.
  - Lemmatiser: a ported minimal **Morphy** (curated irregulars + detachment
    rules) resolves "running" → "run", "mice" → "mouse", "better" → "good".
  - New messages: `DEFINE`, `LOOKUP_SYNONYMS` (80-char cap, no text logged).
  - A **"Find a better word"** row in the suggestion popover for any single
    flagged word, using the same version-safe apply gate.
- **Granular check toggles (§20.1)** — the single "Inline suggestions" switch
  (which previously did nothing) splits into independent **Spelling**,
  **Grammar**, **Punctuation & spacing** and **Style & wordiness** toggles;
  turning one off hides that underline colour live, with no re-analysis. The
  **Writing health score** and **Tone hints** toggles now actually gate their
  panels. New: **Select text to define** and **Suggest synonyms**. The popup
  gets a compact checks strip for quick on/off.
- **Simple Mode (§9.5)** — one switch (Appearance) that gives every WriteRight
  surface larger text, larger targets and plain-language labels, via a single
  `data-wr-simple` attribute. For new readers and language learners.
- Settings **schema v1 → v2** with an intent-preserving migration (a user who
  had inline suggestions off keeps every inline category off).
- `data-wr-define` on the light-DOM host reflects the current lookup word +
  sense count (no definitions) so E2E can observe the closed-shadow panel.
- E2E: select-to-define against the packaged extension with the real WordNet
  data loaded; toggling Grammar off in Options removes amber underlines in a
  live editor tab with no reload. Visual snapshot of the define panel.

### Changed

- `SuggestionSource` gains `'punctuation'`; the whitespace/punctuation rules
  emit it (was `'style'`), so they can be toggled separately.
- Options page: the "Writing" section becomes **Checks**; a new **Vocabulary**
  section is added.
- Content-script bundle 117 KB → 135 KB (still well under the 300 KB budget) for
  the selection watcher + define UI. Total package 15.7 MB → 24.2 MB (of a
  raised-and-documented 28 MB budget) for the lexicon data.

### Fixed (found in the 1.2.0 QA pass)

- **Options-page control labels were garbled for screen readers.** The Theme
  segmented control, the text-size slider, the Dialect select and the
  format-preset select were each wrapped in a `<label>` that also contained the
  help text, so assistive tech announced names like "Theme Theme" or
  "Dialect Which English the local engine checks against". Each is now a plain
  `<div>` with a correctly-associated `<label>` (`htmlFor`) and
  `aria-describedby` for the help text. Same fix in the Local AI section.
- **Simple Mode barely changed the in-page UI.** Only one rule (synonym chips)
  had a `[data-wr-simple]` variant. The define panel, the suggestion popover and
  the sidebar now all scale up meaningfully (e.g. the define panel 340 → 420 px,
  the headword 18 → 26 px, 40 px minimum tap targets).

### Dev

- New dev-only dependency `saxes` (ISC) — streaming XML parse of the WordNet
  source in `scripts/build-lexicon.ts`. Never shipped.
- `e2e/qa.spec.ts` — a permanent 14-test human-QA suite that drives every flow
  (typing → card → apply, sidebar, select-to-define incl. password / code
  guards, every Options toggle across a reload, dictionary CRUD, Strict privacy,
  Simple Mode, a 10 k-word document, 30 rapid selections, master-switch on/off)
  and **fails on any unexpected console error**.
- `data-wr-sidebar` / `data-wr-sidebar-tab` / `data-wr-simple` /
  `data-wr-reduced-motion` are mirrored onto the light-DOM host (flags only) for
  E2E observability of the closed shadow root.

## [1.1.0] — PRD conformance pass: field-level disable, dictionary UI, engine fix, redesign

A full end-to-end audit against the PRD. Two shipping-blocker bugs fixed, the
last missing public-release capability added, several settings surfaces
completed, and a ground-up visual refresh of every WriteRight surface. No change
to the privacy model, the zero-cost contract, or the local-first architecture.

### Fixed

- **The local engine did not run in the built extension (§6.5, §11.1).** MV3's
  default CSP (`script-src 'self'`) blocks WebAssembly compilation, so Harper
  failed to instantiate in the service worker and every analysis returned an
  error — spelling, grammar, readability, tone and score were all silently
  dead in a packaged build (unit/integration tests use a direct linter and did
  not catch it). The manifest now sets
  `content_security_policy.extension_pages` to
  `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'` — the minimal
  keyword sanctioned by §6.5, which permits WebAssembly only (not `eval`, not
  remote code). `scripts/validate-manifest.ts` now **requires** the keyword and
  a new E2E test asserts the engine actually produces suggestions in a real
  Chromium with the packaged extension loaded.
- **Opening the suggestion popover tore down the analysis session.** WriteRight's
  UI lives in a closed shadow root, which reports its host as
  `document.activeElement`. When the popover (or sidebar) took focus, the
  `TextFieldManager` read that as the user leaving every editor and disposed the
  active `AnalysisCoordinator`, so the popover flashed open and shut and the
  fix never applied. Focus moving into WriteRight's own host is now ignored
  (§5.3).

### Added

- **Field-level disable (§4.1 #23)** — the last unimplemented public-release
  capability. "Turn off for this field" in the suggestion popover pauses
  WriteRight for that one editor (session-scoped, since a field has no stable
  identity across reloads); the launcher pill switches to a "Turn on for this
  field" affordance to bring it back. Page status reports `disabled-field`,
  the popup pill shows "Off for this field".
- **Personal dictionary management UI (§11.4)** — the Options → Dictionary
  section: add, remove (per-word chips), import from a `.txt` list, export, and
  clear-all with confirmation. Backed by new `GET_DICTIONARY` /
  `REMOVE_DICTIONARY_WORD` / `IMPORT_DICTIONARY` / `CLEAR_DICTIONARY` messages.
- **Appearance settings (§9.1)** — theme segmented control (System / Light /
  Dark), a text-size slider (85–150 %, drives `--wr-font-scale` across every
  WriteRight surface), and a reduce-motion switch.
- **Strict privacy mode (§4.1 #26)** — one switch that forces local AI off and
  keeps diagnostics off; WriteRight stays fully deterministic and offline. The
  AI settings section shows as locked while it is on.
- **Sidebar paste-and-analyse fallback (§3.9, §5.1)** — on a page whose editor
  WriteRight cannot check inline, the sidebar offers a text box to paste into
  for a read-only analysis, instead of just saying "unsupported".
- **"Explain more" detail (§3.7)** — the popover's explanation panel now shows
  a structured What / Why / Fix / Example for the built-in rules.
- **Browser E2E + visual regression (§5.6, §9.2, §23.2)** — Playwright drives
  the packaged extension in a real Chromium: engine analysis, keyboard apply,
  password-field exclusion, sidebar, popup, options, dictionary persistence,
  plus visual snapshots for light, dark, high-contrast, reduced-motion, narrow
  and keyboard-focus states. A separate CI job; still not part of
  `npm run check` (which stays `npm`-only and reproducible).
- `data-wr-*` status attributes on the light-DOM host (availability, active,
  analyzing, suggestion count, popover open) — counts and states only, never
  user text (§6.8) — so automation and debugging can observe WriteRight without
  piercing the closed shadow root.
- `@media (forced-colors: active)` rules for the toggle, segmented control,
  range slider and sidebar cues, so Windows High Contrast stays legible (§9.5).

### Changed

- **Full visual refresh of every surface (§9).** Design-token v2 (elevation
  scale, motion tokens, hover/active/selected surfaces); a single-stroke icon
  set replacing ad-hoc glyphs; an animated writing-health `ScoreRing`;
  redesigned popup (insight summary), sidebar (compact icon tabs with a sliding
  indicator, severity-grouped suggestions, skeleton loaders), suggestion
  popover (category chip, number-keyed replacements, accent actions) and
  options page (sticky scroll-spy nav, segmented controls). Content-script
  bundle 90 KB → ~117 KB, well under the 300 KB budget.
- `ShadowHost.applyPreferences()` applies theme / reduced-motion / font-scale to
  the in-page host, kept in sync with settings changes.

## [1.0.0] — Phase 5: Hardening, cross-browser quality, documentation & release

All five phases are complete. Phase 5 adds no new user-facing capability by
design — it turns WriteRight into a maintainable, auditable, releasable
open-source extension. Everything from Phases 1–4 is unchanged.

### Added

**Platform abstraction (`src/platform/`, §5.2, §25.1)**

- `browser-capabilities.ts` — pure feature detection for the native side panel
  (`chrome.sidePanel`), `sidebarAction`, `browser.commands`, `storage.session`,
  runtime `permissions`, and the on-device Prompt API. Feature code branches on
  capabilities, never on `browser === 'x'`. `session-state.ts` now uses it as a
  fast path before its runtime probe.
- `CAPABILITY_MATRIX` — the Chrome / Edge / Firefox / Safari support matrix as
  data, kept in sync with `docs/BROWSER_SUPPORT.md` by a unit test; every
  `conditional` cell must carry a note (§5.2).

**Keyboard commands (§5.2)**

- `manifest.commands`: `Alt+Shift+E` opens the popup (`_execute_action`),
  `Alt+Shift+W` toggles the sidebar. The background forwards the custom command
  to the active tab's in-page sidebar; the `Alt+W` in-page hotkey still works
  everywhere (the guarantee where `browser.commands` is absent, e.g. some
  Safari builds).

**Security-audit suite (§5.5, §23.2) — all wired into `npm run check`**

- `scripts/verify-no-secrets.ts` — credential-shaped strings and stray secret
  files in source and build.
- `scripts/verify-safe-apis.ts` — the **built** code has no `eval` /
  `new Function`, no remote `<script>` / `import()` / `importScripts`, and no
  HTML-injection sink in the content script (React DOM's internal `innerHTML`
  in the popup/options chunks is the one documented exception).
- `scripts/verify-no-text-logging.ts` — no direct `console.*` in `src/`; no
  logger call passes an un-`redact()`ed text-bearing identifier.
- `scripts/generate-sbom.ts` → `sbom.json` (CycloneDX 1.5, deterministic);
  `verify:sbom` fails the gate if it drifts from the lockfile.
- `scripts/verify-reproducible-build.ts` — builds twice, asserts byte-identical
  output (§5.10, §24.2). Pre-release, not in the default gate.
- ESLint now forbids `innerHTML`/`outerHTML` assignment, `insertAdjacentHTML`
  and `dangerouslySetInnerHTML` across `src/`. (Removed the one `innerHTML = ''`
  in the sidebar launcher — it now uses `replaceChildren` semantics.)

**Golden corpus & regression (§23.3, §23.4)**

- `tests/fixtures/golden-corpus.ts` + `tests/integration/golden-corpus.test.ts`
  — a curated English corpus run through the real pipeline every release,
  checking *result classes* (spelling / grammar / style hit, or clean), plus
  false-positive traps: names, URLs, emails, code identifiers, technical terms,
  contractions, acronyms, units, hyphenated compounds, and GB/US variants.

**Engine precision (from the false-positive gate, §23.4)**

- Protected spans now cover called functions and methods (`commit()`,
  `getUserById(id)`, `conn.commit()`), dotted member paths of 3+ segments, and
  mixed-case / acronym-case identifiers (`OOMKilled`, `IPv4`, `API`) — without
  matching ordinary Title-case words. Fixes real false positives on code-in-prose
  and technical terminology; the suggestion popover's `aria-modal` was added
  alongside.

**Stress & accessibility QA (§5.7, §5.8)**

- `tests/integration/stress.test.ts` — 10,000-word documents, 100+ suggestions,
  200 focus/blur cycles, 100 mount/remove cycles, repeated SPA subtree
  replacement, 25 simultaneous editor surfaces, 50 back-to-back analyses, and
  adversarial input (punctuation / whitespace / emoji / 20k chars).
- `tests/integration/a11y.test.tsx` — landmark roles, `role="tablist"` /
  `aria-selected`, a labelled modal popover, an accessible-name check across
  every control on every surface (popup and options rendered with React), and
  a `prefers-reduced-motion` guard assertion on every injected stylesheet.
- `tests/unit/utf16-offsets.test.ts` — offset round-trips for astral emoji, ZWJ
  sequences, skin-tone modifiers, flags, combining marks, CJK (no spaces) and
  RTL Arabic.

**Browser E2E + visual regression scaffold (§23.2, §5.6)**

- Playwright (`playwright.config.ts`, `e2e/`): a persistent-context fixture that
  loads the built extension, smoke specs (typing → correction → apply, password
  fields never attached, popup, options, site disable), and visual snapshot
  specs (popup/options light + dark, unsupported editor). Needs
  `npx playwright install chromium` + `npm run build`; it is **not** in
  `npm run check` (kept `npm`-only and reproducible) and runs in its own CI job.

**Documentation (§30, §5.9)**

- `PERMISSIONS.md` — every permission mapped to a concrete feature, and the long
  list of permissions WriteRight does not request.
- `docs/BROWSER_SUPPORT.md` — the capability matrix and an 18-step manual smoke
  checklist per target, plus the Safari extras.
- `docs/RELEASE.md` — toolchain of record, the release checklist, the Safari
  `safari-web-extension-converter` path, and the no-cost release guarantee.
- `STORE_LISTING.md` — product description, permissions explanation, install and
  support instructions.
- README, SECURITY, CONTRIBUTING refreshed to match the code exactly.

### Changed

- `npm run check` now runs `verify:no-secrets`, `verify:no-text-logging`,
  `test:coverage` (was `test`), `verify:no-remote-ai`, `verify:safe-apis` and
  `verify:sbom` in addition to the previous steps. CI runs `npm run check`
  directly (was a hand-maintained step list) plus a separate `e2e` job.
- `SidebarController` exposes `isOpen`; `ContentController` exposes
  `sidebarOpen`; `AnalysisCoordinator` coverage raised with tests for the
  sidebar-facing and AI-target APIs.

### Phase 5 release gate (§5)

Unit + integration + regression tests pass (**411**, coverage thresholds met) ·
golden corpus passes including every false-positive trap · security scans pass
(secrets, dangerous APIs, no-remote-AI, text-logging, manifest, licenses) ·
`sbom.json` current · **build is byte-identical across two runs**
(`verify:reproducible`) · bundle budgets met (content 90 kB, background 231 kB)
· documentation matches actual behaviour · no remote AI service is silently
required · `PRIVACY.md` is truthful. The live cross-browser smoke matrix, real
screen-reader passes, screenshot baselines and Safari packaging are the manual
release steps in `docs/RELEASE.md` — the harnesses and checklists ship here.

## [0.4.0] — Phase 4: Zero-token local AI power-up

Optional generative help — rewrites, transformations, explanations and a chat
panel — that runs **only** on the browser's own on-device model or a model
server the user runs on loopback. There is still no WriteRight server, no paid
API, and no account. AI is **off by default**; with it off (or unavailable),
every Phase 1–3 feature is unchanged.

### Added

**Local-AI layer (`src/ai/`, §4, §14)**

- **Capability detection** (`capability-detector.ts`, §4.1/§14.4) probes, on
  demand and cheaply, for: Chrome's built-in Prompt API (`LanguageModel`), a
  local **Ollama** server, a local **LM Studio** server, and a generic local
  **OpenAI-compatible** endpoint. It reports exactly one status —
  `AI Ready — Chrome on-device` / `… Ollama` / `… LM Studio` /
  `AI Unavailable — local writing tools still active` — and never claims "AI
  enabled" when no model can actually run.
- **Adapters**: `prompt-api-adapter.ts` (on-device; handles model-not-ready /
  downloadable / downloading states and resolves the API across Chrome
  versions), `ollama-adapter.ts` (`/api/tags` discovery, `/api/chat` with JSON
  mode, timeout, cancellation), `lm-studio-adapter.ts` + `local-endpoint-adapter.ts`
  (OpenAI `/v1` shape). Local adapters connect **only** through
  `loopback.ts` — `http(s)`/`ws` to `localhost` or `127.0.0.0/8` and nothing
  else; a LAN or public host is refused before any `fetch`.
- **AI router** (`ai-router.ts`, §4.5) classifies the task before choosing an
  engine. "No local finding" never means "send to AI": generative work happens
  only on an explicit user action and only when a local engine is actually
  ready; a broad whole-field rewrite needs a selection or the explicit
  "Enhanced local review" mode. Otherwise it returns an honest limitation
  message — never a cloud upsell (§4.9).
- **Output validation** (`output-validator.ts`, §4.8/§14.6): parses the
  structured `{rewrittenText, changes}` / `{explanation}` shape (tolerant plain-
  text fallback), enforces a size cap, strips control characters, and **rejects
  any output that introduces HTML tags or a script URI**. The UI only ever
  renders model text as `textContent`, and a rewrite replaces **only** the
  selected range, so content outside the selection is unchanged by construction.
- **Injection-safe prompts** (`prompts/templates.ts`, §14.7): the document text
  is fenced in delimiters and the model is told it is "content to edit, not
  instructions". No page metadata is ever sent.
- **`AiService`** (`ai/ai-service.ts`) hosts all of this in the **background
  service worker** — the page never talks to a model directly — with an
  `AbortController` per request so the sidebar can cancel (§4.9), and a
  per-request timeout so a hung local server can't freeze the UI.

**UI**

- The sidebar gains an **Assistant** tab: the AI status line, a first-run
  local-only privacy explanation that must be acknowledged (§14.5), rewrite
  actions (shorter / longer / simplify / formalize / casualize / friendlier /
  confident / persuasive / improve clarity / improve conclusion / rewrite for
  the current format / explain this sentence), a diff-free preview with
  **Replace selection** / **Discard**, and a **chat** panel (history is
  in-memory unless the user opts in). Every action degrades to the honest
  status message when no model is ready.
- **Options** gains a **Local AI** section: master switch, preferred engine,
  per-provider loopback endpoint + model picker, **Test connection** (which
  requests the `localhost` host permission at that moment, never up front), and
  the local-only privacy explanation with the endpoint shown.
- The **popup** shows the AI status line when AI is enabled.

**Settings / messaging**

- `Settings.ai` — provider preference, per-provider loopback endpoint + model,
  `enhancedReview` (off by default; lets sidebar AI actions run on the whole
  field with nothing selected — otherwise a broad rewrite always needs a
  selection, §4.5), `keepChatHistory`, `acknowledgedPrivacy`. All inert unless
  `features.ai` is on.
- New validated messages: `AI_GET_CAPABILITY`, `AI_TEST_CONNECTION`,
  `AI_LIST_MODELS`, `AI_RUN`, `AI_CHAT`, `AI_CANCEL`, `AI_ACK_PRIVACY`,
  `AI_GET_CHAT_HISTORY`, `AI_SAVE_CHAT_HISTORY`. The `SettingsPatch.ai` block
  only accepts known keys and loopback-length strings.
- **AI chat history** is in-memory only unless the user turns on "Keep AI chat
  history on this device"; then it is stored in `storage.local`
  (`storage/ai-chat.ts`, capped, never synced) and removed by "Reset all local
  data" (§4.7, §28). Turning the setting back off clears any stored transcript.

**Permissions / build gate**

- `optional_host_permissions` adds **only** `http://localhost/*` and
  `http://127.0.0.1/*` — requested at runtime the first time the user tests a
  local provider, never a broad HTTP grant (§6.3). Chrome's on-device AI needs
  no permission. `scripts/validate-manifest.ts` now fails on any non-loopback
  optional host permission.
- New `scripts/verify-no-remote-ai.ts` scans every built JS/HTML file for a
  cloud-AI host denylist and for any non-loopback endpoint-shaped URL; wired
  into `npm run check`.

### Changed

- `BackgroundController` takes an optional `ai` backend alongside `engine`; with
  no AI backend, every `AI_*` message returns an honest disabled response.
- `AnalysisCoordinator` gains `aiTarget()` (selection, or whole field) and
  `applyRange(start, end, text)` — a range-scoped, version-safe replace reusing
  the §10.4 edit gate.

### Measurements

Content-script bundle 89 kB (budget 300 kB) · background 229 kB (budget 400 kB)
· extension-page code 222 kB (budget 320 kB). No AI adapter or network code is
in the content script — it only sends messages. Capability probes are cached
~8 s. AI calls are user-invoked, so there is no typing-path cost.

### Phase 4 regression gate

All Phase 1–3 tests green · **zero paid API endpoints** and **no remote
inference URL** in either production build (`verify:no-remote-ai`) · local-only
network enforcement holds (loopback guard + tests for LAN / public / `https`-to-
loopback rejection) · AI is fully disableable and **off by default** · the core
extension works with AI unavailable (asserted with no AI backend) · AI output
**cannot inject HTML or a script URI** (asserted) · only the selection (or
whole field) is ever sent — no page metadata, no unrelated fields · request
**cancellation works** (asserted) · a hung / missing local endpoint **times out
instead of hanging** (asserted) · `npm run check` green — typecheck, lint,
format, **347 tests**, Chrome + Firefox builds, manifest / permission audit,
license audit, no-remote-AI scan, bundle budgets.

## [0.3.0] — Phase 3: Readability, tone, writing-health score & universal sidebar

### Added

**Deterministic insight engines (§12, §13, §3.8)**

- **Segmenter** (`core/segmenter.ts`): sentence / word / paragraph spans and a
  heuristic syllable estimator, all returning UTF-16 code-unit offsets. `...`
  is never a sentence boundary; abbreviations and decimals are handled.
- **Readability** (`engine/readability-engine.ts`): document statistics (word /
  sentence / paragraph counts, average & longest sentence, long-sentence share,
  reading & speaking time, passive-voice and filler counts) plus five grade
  formulas — Flesch Reading Ease, Flesch–Kincaid, Gunning Fog, Coleman–Liau,
  SMOG — with a `sufficientText` guardrail (formulas are hidden below ~30 words
  / 3 sentences rather than shown as noise).
- **Tone** (`engine/tone-engine.ts`): scores nine tones (neutral, professional,
  formal, friendly, casual, confident, empathetic, urgent, persuasive) from
  local lexical/structural signals and reports the winner with **explicit
  uncertainty** — "Likely professional", "Possibly formal", "Tone unclear or
  mixed", or "Leaning X (short text — low confidence)". No accuracy figure is
  claimed and no evaluation dataset is implied (§13.2).
- **Writing Health Score** (`engine/score-engine.ts`): one original, fully
  transparent 0–100 number —
  `0.40·correctness + 0.20·clarity + 0.15·readability + 0.15·concision + 0.10·consistency`.
  Every component is derived only from the deterministic metrics above and
  carries a plain-language note, so the UI can always say *why*. No hidden user
  profile is stored (§12.2). `explainScoreChange()` narrates a delta.
- **Safe rewrite** (`engine/rewrite-engine.ts`): a conservative, reversible
  clean-up pass (collapses repeated spaces, fixes spacing around punctuation,
  optional contraction formalisation). It splits the text on protected spans
  (code, URLs, @mentions, `{{vars}}`) and only ever touches prose between them —
  no offset remapping, nothing generative.
- **`DocumentInsights`** (`types/insights.ts`) assembled by
  `engine/insights-engine.ts` after suggestion merging; carries only aggregate
  numbers and labels — never any excerpt of your text.
- **Format presets** (`engine/format-presets.ts`): Business email, Academic
  writing, Social post, Technical documentation, Creative writing,
  Résumé / cover letter. A preset sets a target tone for comparison, tailors the
  guidance shown, and relaxes custom rules that do not fit the format (§3.4).

**Universal sidebar (§15)**

- A plain-DOM, keyboard-operable **sidebar** (`ui/sidebar/`) in the existing
  closed Shadow DOM host — no React on the page. Four tabs: **Suggestions**
  (grouped, with the same apply / ignore / dictionary actions and a "Show in
  text" jump), **Statistics**, **Tone** (uncertainty-aware label + the format
  preset picker), **Rewrite** (word-level diff preview; nothing changes until
  you click *Apply clean-up*, and the result goes through the same version-safe
  full-text replace).
- A small **launcher pill** that shows the current issue count; open the sidebar
  from it, from the popup's **Open sidebar** button, or with <kbd>Alt</kbd>+<kbd>W</kbd>.
  <kbd>Esc</kbd> or the close button dismisses it and returns focus to the
  editor — focus is never trapped.
- The sidebar and launcher persist across editor focus changes; only the data
  binding follows the active `AnalysisCoordinator`.

**Popup & options**

- The popup shows a live **health-score ring** and a readability / tone / word /
  reading-time summary for the active tab (polled from per-tab session state; no
  text crosses the boundary).
- Options gains a **Default format preset** selector; per-site preset overrides
  are stored in the existing site-rules record.

### Changed

- `EngineHost.AnalysisRequest` gains `presetId` and `withInsights`;
  `AnalysisResult` gains `insights` (null unless requested). The content
  coordinator requests insights; the Phase-2 no-engine fallback returns `null`.
- `LinguisticEngine` applies the active preset by disabling non-preset custom
  rules before analysis, then attaches `DocumentInsights`.
- New typed, validated messages: `REWRITE_TEXT`, `SET_SITE_PRESET`,
  `REPORT_PAGE_INSIGHTS`, `GET_ACTIVE_TAB_INSIGHTS`, and the `TOGGLE_SIDEBAR` /
  `OPEN_SIDEBAR` broadcasts. `Settings` gains `defaultPresetId`; `SiteRule`
  gains an optional `presetId`.
- `messaging/bus.ts` gains `sendToActiveTabContent()` for popup → content
  broadcasts.

### Measurements

Engine latency (Node reference pipeline; target P95 ≤ 120 ms incremental /
500 words): 100 w ≈ 2 ms · 500 w ≈ 7 ms · 2,000 w ≈ 25 ms · 10,000 w ≈ 135 ms.
**Computing all of `DocumentInsights` adds ≈ 1 ms** on a 500-word document —
stats, readability, tone and score are linear regex/arithmetic passes.
Content-script bundle 79 kB (budget 300 kB) · background 206 kB (budget 400 kB)
· extension-page code 215 kB (budget 320 kB) · Harper WASM 15.1 MB (separate
file). All budgets met.

### Phase 3 regression gate

All Phase 1–2 tests green · spelling & grammar still offline and version-safe ·
underline hit-testing unaffected · **every statistic, the score and the tone
label are computed locally** — no network in any path · the score and tone are
**deterministic** for identical text (asserted) · the score reflects the
suggestion count (asserted) · **no rewrite is applied without explicit
confirmation** (asserted) · the sidebar is dismissable with <kbd>Esc</kbd> and
does not trap focus (asserted) · virtualized / canvas editors are still
reported as unsupported rather than faked (fixture tests) · `npm run check`
green — typecheck, lint, format, **289 tests**, Chrome + Firefox builds,
manifest / permission audit, license audit, bundle budgets.

## [0.2.0] — Phase 2: Local language engine, underlines & correction UX

### Added

**Local linguistic engine (§2, §11)**

- **Harper** integrated via the pinned `harper.js` 2.7.0 `LocalLinter` behind a
  `HarperLinter` wrapper (`engine/harper/`); WASM binary synced from the
  package into `public/harper/` by `scripts/sync-harper-assets.ts` and shipped
  as a streamed, browser-cached `.wasm` (never inlined). Runs in the background
  service worker so no page thread is blocked (§2.2, §17.1).
- **Mandatory startup smoke test** (§2.1): proves the engine loads, default
  lint config is populated, known spelling + grammar errors are caught, a clean
  sentence is clean, and offsets are UTF-16 (surrogate-pair regression). A
  degraded engine is surfaced, not hidden.
- **Custom rule layer** (§2.4): repeated spaces, repeated punctuation, space
  before punctuation, duplicate words, sentence-start capitalization, wordy
  phrases, configurable buzzwords — each with positive and negative tests.
- **Pipeline**: protected spans → Harper + custom rules → normalize →
  rule/ignore filter → confidence → overlap merge (one winner per span, §21).
- Suggestion offsets pass through as UTF-16 code units (§10.3), regression-tested.

**Correction UX (§2.6–§2.8, §9.7, §18)**

- Inline **wavy underlines** with zero layout impact:
  `TextareaOverlayRenderer` (style-matched mirror), `ContentEditableRangeRenderer`
  (client-rect marks), `FallbackNoInlineRenderer` (Tier C/D). Survive scroll /
  resize / zoom; disappear the instant a suggestion resolves.
- Accessible plain-DOM **suggestion popover** (no React on the page): category,
  message, ranked replacements, Ignore, Ignore-rule-here, Add-to-dictionary,
  Explain more. Keyboard operable (open with <kbd>Ctrl/Cmd</kbd>+<kbd>.</kbd>,
  Tab-trapped, Esc / outside-click to close).
- **`AnalysisScheduler`**: 250 ms debounce, `maxWait` 1.2 s, request-id +
  document-version tagging, stale-result rejection, IME deferral (§17.2–3).
- **`applySuggestion` safety gate** (§10.4): session match, editable, not
  composing, in-bounds, exact original text + hash still match — otherwise
  refuse and re-analyse. Fixes fire a real `input` event (page undo works).
- **Personal dictionary** wired to Harper (`importWords`); **English dialects**
  (US/GB/CA/AU/IN) switch Harper's dialect live.
- New typed messages: `ANALYZE_TEXT`, `CANCEL_ANALYSIS`, `ADD_DICTIONARY_WORD`,
  `SET_SITE_IGNORED_RULE`, `GET_RULE_DESCRIPTION`, `GET_ENGINE_STATUS` — all
  validated, with a 200 KB text cap on analysis requests.

### Changed

- `EngineHost.AnalysisRequest` carries dialect / style-checks / buzzwords /
  disabled-rule / ignore-key / ignore-pattern context.
- `wxt.config.ts`: `build.assetsInlineLimit: 0` so the WASM is emitted as a
  file, not a ~21 MB base64 string in the worker.
- Bundle budgets split by surface (content ≤ 300 KB, background ≤ 400 KB,
  extension-page code ≤ 320 KB, engine WASM ≤ 24 MB).
- `GET_DIAGNOSTICS.engineReady` now reflects the real engine state.

### Measurements

Engine latency (Node, reference pipeline; target P95 ≤ 120 ms incremental /
500 words): 100 w ≈ 2 ms · 500 w ≈ 7 ms · 2,000 w ≈ 25 ms · 10,000 w ≈ 140 ms.
Content-script bundle 56 KB · background 187 KB · Harper WASM 15.1 MB (separate
file).

### Phase 2 regression gate

All Phase 1 tests green · spelling works offline · grammar works offline ·
underline strategy selection + hit-testing tested · corrections are
version-safe and reversible · personal dictionary works · no network in the
analysis path · P95 latency target met with wide margin · 234 tests green ·
`web-ext lint` 0 errors.

## [0.1.0] — Phase 1: Foundation, editor detection & safe UX

### Added

**Scaffold & tooling**
- WXT + TypeScript (strict) + React project, exact-pinned dependencies.
- Chrome (MV3) and Firefox (MV3) build targets, with browser-specific manifest
  handling isolated in `wxt.config.ts` (Firefox `gecko` id + `data_collection_permissions: none`).
- Vitest unit + integration suite (jsdom + WXT fake browser); 150+ tests.
- ESLint (strict, `no-eval` / `no-new-func` / no-`any`), Prettier.
- `scripts/validate-manifest.ts`, `scripts/verify-licenses.ts`,
  `scripts/bundle-report.ts`.
- `npm run check` — the release-critical gate, reproducible locally; GitHub
  Actions CI running the same steps.

**Editor detection & adapters (§1.3–§1.5, §5)**
- Input Capability Detector: `<textarea>`, text `<input>`, ordinary
  `contenteditable`; excludes password/credential/hidden/disabled fields, code
  editors, and non-prose input types.
- `EditorAdapter` contract with capability tiers A–D; `AdapterRegistry` with
  priority-based selection.
- Adapters: `textarea`, `input`, `contenteditable` (Tier A, with a stable text
  model and UTF-16 offset mapping), `unsupported` (Tier D — honest fallback).
- `EditorSession` per surface; monotonic document versions; IME-composition
  aware; idempotent teardown.
- `TextFieldManager`: focus-driven attach, debounced `MutationObserver`,
  DOM-removal teardown, `PageLifecycle` recovery (SPA nav, bfcache, visibility).

**UI & privacy controls (§1.6–§1.7, §9)**
- Universal closed Shadow DOM host (`ui/shadow-host.ts`) — infrastructure only
  in Phase 1.
- Popup: Ready / Limited / Unsupported indicator, per-site toggle, global
  pause, link to settings.
- Options page: appearance (theme/reduced-motion), dialect, feature toggles,
  per-site controls, diagnostics, **Reset all local data**.
- Apple-HIG-inspired design tokens (`ui/styles/tokens.css`), system font stack,
  light/dark/high-contrast/reduced-motion support.

**Storage & messaging (§20, §26, §28)**
- Versioned `storage.local` items for settings, site rules and personal
  dictionary; deterministic migrations with a last-known-good backup.
- `storage.session` per-tab state with an in-memory fallback.
- Typed, validated request/response messaging; unknown message types rejected.

**Engine boundary (§5.3)**
- `EngineHost` interface + `NoopEngineHost` (also the graceful-degradation
  fallback). No linguistic analysis yet.
- `core/protected-spans.ts` and `core/text-normalize.ts` implemented and tested
  ahead of Phase 2 consumption.

**Docs**
- README, ARCHITECTURE, PRIVACY, SECURITY, CONTRIBUTING, THIRD_PARTY_NOTICES.

### Not included (by design)

- Spelling, grammar, style, readability, tone, scoring — Phase 2–3.
- Inline underlines and the suggestion popover — Phase 2.
- Any AI — Phase 4.
- Safari packaging — Phase 5.

### Phase 1 regression gate

TypeScript strict build ✓ · lint ✓ · format ✓ · unit + integration tests ✓ ·
Chrome + Firefox builds ✓ · manifest/permission audit ✓ · license audit ✓ ·
no console errors on the fixture suite ✓ · no unexpected persistence ✓.
