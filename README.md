# WriteRight

**A privacy-first, local-first writing assistant for your browser. No account,
no subscription, no telemetry, no paid AI.**

WriteRight catches mistakes on your device, explains them clearly, and helps you
rewrite naturally — using local analysis and, optionally, on-device or local AI
that you control. There is no WriteRight server. The default code path has
nowhere to upload your text.

> **Status: Phase 5 of 5 — Hardening, cross-browser quality & release (v1.0).**
> All five phases are complete. WriteRight checks spelling, grammar,
> readability, tone and a transparent writing-health score locally, in a
> universal sidebar, with optional on-device / local-model AI. Phase 5 adds the
> platform abstraction, the security-audit suite, the golden-corpus regression,
> stress and accessibility QA, and the release process. See
> [CHANGELOG.md](CHANGELOG.md), [docs/BROWSER_SUPPORT.md](docs/BROWSER_SUPPORT.md)
> and [docs/RELEASE.md](docs/RELEASE.md).

---

## What works today (all phases)

**Foundation (Phase 1)**

- Loads on Chrome, Edge and Firefox (MV3) as an unpacked / signed build.
- Detects ordinary editing surfaces — `<textarea>`, text `<input>`, and
  ordinary `contenteditable` — and **explicitly ignores** password and
  credential fields, hidden/disabled fields, and code editors.
- An `EditorAdapter` layer with capability tiers (A–D) so complex editors get
  an honest "unsupported" state instead of broken results.
- Survives single-page-app navigation, editor re-mounts, bfcache restore and
  tab visibility changes without duplicate listeners or overlays.
- Popup capability indicator, per-site toggle, global pause; settings page with
  appearance, dialect, feature toggles, per-site controls, diagnostics, and
  **Reset all local data**.

**Local language engine (Phase 2)**

- **Spelling & grammar** via [Harper](https://github.com/Automattic/harper)
  running as WebAssembly in the extension's background worker — fully offline,
  ~7 ms for a 500-word document.
- A thin **custom rule layer**: repeated spaces / punctuation, duplicate words,
  sentence capitalization, wordy phrases, and a configurable buzzword list.
- **Inline wavy underlines** that add no layout box and survive scroll / resize
  / zoom — a style-matched mirror for `<textarea>`/`<input>`, positioned marks
  for `contenteditable`.
- An accessible **suggestion popover** (click an underline or press
  <kbd>Ctrl/Cmd</kbd>+<kbd>.</kbd>): category, explanation with a What / Why /
  Fix / Example breakdown, one-click replacements, *Ignore*, *Ignore this rule
  here*, *Add to dictionary*, *Turn off for this field*, *Explain more*.
- **Version-safe apply**: a fix is only applied when the exact original text
  (and its hash) still match — otherwise WriteRight re-analyses instead of
  guessing. Fixes go through a normal `input` event, so the page's own undo
  still works.
- **Personal dictionary** — managed from Options → Dictionary (add, remove,
  import a `.txt` list, export, clear all) or *Add to dictionary* on any
  suggestion — and **English dialects** (US / GB / CA / AU / IN).
- **Field-level disable** — *Turn off for this field* pauses WriteRight for one
  editor; the launcher pill flips to *Turn on for this field* to undo it. This
  sits alongside per-site and global disable.
- Still zero network requests during analysis. No analytics. No remote code.

**Readability, tone & score (Phase 3)**

- **Document statistics** and five **readability grades** (Flesch Reading Ease,
  Flesch–Kincaid, Gunning Fog, Coleman–Liau, SMOG), plus reading/speaking time,
  passive-voice and filler counts — hidden below ~30 words rather than shown as
  noise.
- A **Writing Health Score** (0–100) from one published, fully transparent
  formula — `0.40·correctness + 0.20·clarity + 0.15·readability +
  0.15·concision + 0.10·consistency` — where every component carries a
  plain-language reason. No hidden profile, no AI, no taste judgement.
- An **uncertainty-aware tone estimate** across nine tones: "Likely
  professional", "Possibly formal", "Tone unclear or mixed" — never a
  confident claim WriteRight can't back up.
- A conservative, reversible **rewrite clean-up** (repeated spaces, spacing
  around punctuation, optional contraction formalising) that never touches code,
  URLs or template variables, previewed as a word-level diff and applied only on
  confirmation.
- **Format presets** (business email, academic, social post, technical docs,
  creative, résumé) that set a target tone and relax rules that don't fit.
- A **universal sidebar** (open with <kbd>Alt</kbd>+<kbd>W</kbd>, the launcher
  pill, or the popup) with Suggestions / Statistics / Tone / Rewrite tabs —
  plain DOM, keyboard-operable, never traps focus.
- Every number is computed **locally**; the popup's score ring and summary come
  from per-tab session state, not a network call.

**Optional local AI (Phase 4)**

- Turned **off by default**. When you turn it on, WriteRight uses **only**:
  Chrome's built-in **on-device** model, or a local **Ollama** / **LM Studio**
  server you run, or another local OpenAI-compatible endpoint. Never a paid
  cloud API, never a WriteRight server.
- An **Assistant** tab in the sidebar: rewrite shorter / longer, simplify,
  formalize, casualize, friendlier, more confident, more persuasive, improve
  clarity, improve the conclusion, rewrite for the current format, explain a
  sentence — plus a **chat** panel. Every rewrite is previewed and only applied
  to the selected text on confirm.
- Local model servers are reached on **loopback only** (`localhost` /
  `127.0.0.1`); the host permission for that is requested the moment you test a
  connection, not up front. The build is scanned in CI for any non-loopback
  inference URL.
- The status line always tells the truth: `AI Ready — Chrome on-device` /
  `… Ollama` / `… LM Studio`, or `AI Unavailable — local writing tools still
  active`. With AI off or unavailable, every feature above is unchanged.

**Hardening & release (Phase 5)**

- A **platform abstraction** (`src/platform/`) so every browser difference —
  storage, native sidebars, commands, permissions — is a runtime feature check,
  never a `browser === 'x'` branch.
- Keyboard **commands**: `Alt+Shift+E` opens the popup, `Alt+Shift+W` toggles
  the sidebar (the in-page `Alt+W` always works too).
- A **security-audit suite** in the release gate: secret scan, dangerous-API
  scan of the built code (no `eval`, no remote `<script>`, no injection sinks
  in the content script), no-user-text-in-logs scan, loopback-only AI
  enforcement, an SBOM (`sbom.json`), and a reproducible-build check.
- A **golden English corpus** (`tests/fixtures/golden-corpus.ts`) run through
  the engine every release — spelling / grammar / style hits and, crucially,
  false-positive traps (names, URLs, code, contractions, units).
- **Stress and accessibility** tests: 10k-word documents, 100+ suggestions,
  heavy mount/unmount and SPA churn, and structural a11y checks for every
  surface.

**Offline vocabulary & granular control (1.2.0)**

- **Select-to-define** — select any word on any page (or press `Alt+D`) for its
  meaning, part of speech, an example, **synonyms and antonyms** — entirely
  offline, from a bundled copy of **Open English WordNet** (~152 k words) that
  loads on first use and is dropped from memory when idle. In a text field, a
  synonym chip swaps the word in. A **"Find a better word"** row appears in the
  suggestion card too.
- **A working toggle for every check** — Spelling, Grammar, Punctuation, Style,
  the writing-health score, tone, and the two vocabulary features are each
  switchable independently (Options → **Checks** / **Vocabulary**, plus a quick
  strip in the popup). Turning a category off hides that underline colour live.
- **Simple Mode** — one switch for larger text, larger targets and
  plain-language labels on every WriteRight surface, for new readers and
  language learners.
- See **[docs/FEATURE-PARITY.md](docs/FEATURE-PARITY.md)** for the full
  comparison against Grammarly and QuillBot.

**Conformance & polish (1.1.0)**

- A settings page with every section the PRD calls for: **General**,
  **Appearance** (theme, text size, reduce motion, **Simple Mode**), **Checks**,
  **Vocabulary**, **Dictionary**, **Local AI**, **Privacy** (incl. **Strict
  privacy mode**), **Sites**, **Diagnostics**.
- A **browser E2E + visual-regression** suite (Playwright): the packaged
  extension driven in a real Chromium — engine analysis, keyboard apply,
  password-field exclusion, sidebar, dictionary persistence — plus snapshots
  for light / dark / high-contrast / reduced-motion / narrow / focus states.
  Run with `npx playwright test`; it is a separate CI job, not part of
  `npm run check`.
- The manifest ships the minimal `wasm-unsafe-eval` CSP keyword the local
  engine needs (WebAssembly only — never `eval` or remote code), enforced by
  the manifest audit.

---

## Supported browsers

Full matrix and the manual smoke checklist:
**[docs/BROWSER_SUPPORT.md](docs/BROWSER_SUPPORT.md)**.

| Browser | Universal features | Notes |
|---|---|---|
| Chrome (stable) | ✓ | + optional on-device AI, native side panel |
| Edge (stable) | ✓ | Chromium build |
| Firefox (stable desktop) | ✓ | + local (Ollama/LM Studio) AI |
| Safari (macOS) | ✓ | packaged via `safari-web-extension-converter` (see [docs/RELEASE.md](docs/RELEASE.md)); some `contenteditable` cases degrade to the sidebar |

"Universal features" = field detection, the local Harper engine, readability /
tone / score, the Shadow-DOM sidebar and safe rewrites — no optional API
required. Compatible Chromium browsers (Brave, Vivaldi, Opera, Arc) run the
Chrome build; confirm against the smoke checklist.

---

## Install (development build)

Requirements: **Node ≥ 22.13**, npm.

```bash
npm install            # also syncs the pinned Harper WASM into public/harper/
npm run dev            # Chrome, with live reload
npm run dev:firefox    # Firefox
```

`npm run dev` opens a browser with the extension loaded. To produce unpacked
builds:

```bash
npm run build:all      # .output/chrome-mv3 and .output/firefox-mv3
```

Then load `.output/chrome-mv3` via `chrome://extensions` → *Load unpacked*, or
`.output/firefox-mv3` via `about:debugging` → *Load Temporary Add-on*.

You never need a paid service to build or use a local build.

---

## Development

```bash
npm run sync:harper      # copy the pinned Harper WASM into public/harper/
npm run typecheck        # wxt prepare + tsc --noEmit (strict)
npm run lint             # eslint
npm run test             # vitest (unit + integration, incl. real Harper WASM)
npm run test:coverage    # with coverage thresholds
npm run build:all        # chrome + firefox
npm run verify:no-secrets      # secret / credential scan (source + build)
npm run verify:no-text-logging # no console.* / no unredacted user text in logs
npm run verify:manifest        # permission / CSP / optional-host audit
npm run verify:licenses        # dependency license audit
npm run verify:no-remote-ai    # no non-loopback inference URL in any build
npm run verify:safe-apis       # no eval / remote <script> / injection sinks
npm run verify:sbom            # sbom.json is up to date
npm run bundle:report          # bundle size + budgets (per surface)

npm run check                  # everything above, in order — the release gate

npm run sbom                   # regenerate sbom.json
npm run verify:reproducible    # build twice, assert byte-identical (pre-release)
npm run test:e2e               # Playwright browser E2E (needs `npx playwright install`)
```

`npm run check` is reproducible locally and is exactly what CI runs
([.github/workflows/ci.yml](.github/workflows/ci.yml)). No paid CI service is
required.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add an adapter, a rule, or a
browser-specific enhancement.

---

## Privacy

WriteRight's privacy comes from its architecture, not a promise:

- Spelling, grammar, readability, tone and score all run entirely on your
  device. No network step, no server.
- No account, no telemetry, no crash reporting, no remote config.
- Password and credential fields are never read.
- Editor text lives in memory only; nothing is persisted unless you explicitly
  save it. Your personal dictionary stays on this device.
- **Local AI** (optional, off by default) sends the selected text only to
  Chrome's on-device model or to a model server you run on `localhost` — never
  to a cloud API and never to a WriteRight server. The whole page, unrelated
  fields and hidden content are never sent.

Full details: [PRIVACY.md](PRIVACY.md). Security model: [SECURITY.md](SECURITY.md).

---

## Architecture

High-level design and the engine pipeline: [ARCHITECTURE.md](ARCHITECTURE.md).

---

## License

MIT — see [LICENSE](LICENSE). Third-party components and their licenses:
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
