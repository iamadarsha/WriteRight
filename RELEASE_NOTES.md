# WriteRight 1.2.0

A private, **local-first writing assistant** for Chrome, Edge, Firefox and
Safari. No account, no subscription, no telemetry, no paid AI, no WriteRight
server.

1.2.0 adds a complete **offline dictionary and thesaurus** (select any word to
define it, with synonyms and antonyms — no network, no account), a
Grammarly-style bank of **independent on/off toggles** for every check, and a
large-target **Simple Mode** for new readers and language learners. See
`docs/FEATURE-PARITY.md` for a full comparison against Grammarly and QuillBot.

## New in 1.2.0

- **Select-to-define** — select text on any page → a **Define** button → a panel
  with meaning(s), part of speech, an example, synonyms and antonyms. Also
  **Alt+D**. In a text field, a synonym chip swaps the word in. Powered by a
  bundled copy of **Open English WordNet** (~152 k words); it loads on first use
  and drops out of memory when idle, so it costs nothing until you use it.
- **A toggle for every check** — Spelling, Grammar, Punctuation & spacing, Style
  & wordiness, Writing-health score, Tone, plus the new Define / Synonyms — each
  switchable independently in Options, with a quick strip in the popup. (The old
  "Inline suggestions" / "Writing score" / "Tone hints" switches did nothing;
  now they work.)
- **Simple Mode** — one switch for bigger text, bigger buttons and
  plain-language labels across every WriteRight surface.

## What carried over from 1.1.0

- The local engine now runs in a packaged build (MV3 CSP fix).
- Field-level disable ("Turn off for this field").
- Personal-dictionary manager, Strict privacy mode, the visual refresh.

## Fixed in 1.1.0

- **The local engine did not run in a packaged build.** MV3's default content
  security policy blocks WebAssembly, so the Harper engine failed to start in
  the service worker and every check silently returned nothing. The manifest
  now ships the minimal `wasm-unsafe-eval` keyword (WebAssembly only — not
  `eval`, not remote code), a manifest-audit rule enforces it, and a browser
  E2E test proves analysis works end-to-end in a real Chromium.
- **Opening the suggestion card could tear down analysis.** Focus moving into
  WriteRight's own in-page UI is no longer mistaken for the user leaving the
  editor.

## New in 1.1.0

- **Field-level disable** — "Turn off for this field" in the suggestion card
  pauses WriteRight for that one editor; the launcher pill offers a one-click
  "Turn on for this field" to undo it.
- **Personal dictionary manager** — Options → Dictionary: add, remove, import a
  `.txt` list, export, clear all.
- **Appearance settings** — theme (System / Light / Dark), a text-size slider,
  reduce-motion.
- **Strict privacy mode** — one switch forces local AI off and diagnostics off;
  WriteRight stays fully deterministic and offline.
- **Sidebar paste-and-analyse** — on a page whose editor can't be checked
  inline, paste text into the sidebar for a read-only analysis.
- **Redesigned surfaces** — new design tokens, a single-stroke icon set, an
  animated writing-health ring, and refreshed popup, sidebar, suggestion card
  and options page. Content-script bundle stays well under budget (~117 KB of
  300 KB).

## What it does

- **Spelling & grammar**, offline, via the open-source Harper engine (WASM).
- **Readability** — statistics and five grade formulas.
- **Writing-health score** — one transparent 0–100 number from a published
  formula; every component carries a plain-language reason. No AI, no profile.
- **Tone** — an uncertainty-aware estimate across nine tones.
- **Universal sidebar** (`Alt+W`) — Suggestions, Statistics, Tone, Rewrite,
  Assistant. Plain DOM, keyboard-operable, never traps focus.
- **Safe rewrites** — mechanical clean-ups previewed as a diff, applied only on
  confirm. Code, URLs and template variables are never touched.
- **Format presets** — business email, academic, social post, technical docs,
  creative, résumé.
- **Optional local AI** (off by default) — Chrome's built-in on-device model or
  a local Ollama / LM Studio server you run yourself. Loopback only.

## Privacy

Analysis runs on your device. Storage is on your device. There is no server.
Password, credential, hidden and code-editor fields are never read. The build
is scanned in CI to prove there is no remote inference URL. Full detail in
`PRIVACY.md`; permissions in `PERMISSIONS.md`.

## Install

- **Chrome / Edge** — unzip `writeright-1.2.0-chrome.zip`, open
  `chrome://extensions`, enable Developer mode, **Load unpacked**.
- **Firefox** — `about:debugging` → **This Firefox** → **Load Temporary
  Add-on** → `writeright-1.2.0-firefox.zip`.
- **Build it yourself** — `npm install && npm run build:all`.
- **Safari** — package with `safari-web-extension-converter` (see
  `docs/RELEASE.md`).

## Verify this build

```bash
npm run check                # full gate: types, lint, tests, security scans, budgets
npm run verify:reproducible  # builds twice, asserts byte-identical output
npx playwright test          # browser E2E + visual regression (needs `npx playwright install chromium`)
```

`sbom.json` (CycloneDX) is attached to the release.

## Known limitations

- A local dictionary engine flags uncommon or non-English personal names it
  doesn't know — add them to your personal dictionary.
- Harper does not catch every subject–verb agreement or its/it's error; high
  precision is preferred over high recall (§1.3).
- Some Safari `contenteditable` cases degrade to the sidebar rather than inline
  underlines (reported honestly, never faked).
- Native side panels (`chrome.sidePanel`, `sidebarAction`) are not wired in —
  the in-page sidebar is the product on every browser.

Full detail: `CHANGELOG.md`.
