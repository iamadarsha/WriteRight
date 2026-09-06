# Browser support & the cross-browser smoke matrix

WriteRight's architecture is shared across Chromium, Firefox and Safari; only
the edges differ, and every difference is behind a runtime feature check
(`src/platform/browser-capabilities.ts`), never a `browser === 'x'` branch in
feature code.

The universal experience — field detection, the local Harper engine,
readability / tone / score, the Shadow-DOM sidebar, and safe deterministic
rewrites — works on **every** target with none of the optional APIs.

## Capability matrix (§5.2)

`*` = conditional; detected at runtime. Tiers `A`–`D` are the editor
capability tiers from `types/editor.ts`.

| Feature | Chrome | Edge | Firefox | Safari |
|---|:--:|:--:|:--:|:--:|
| Inline `textarea` / `input` | A | A | A | A |
| Ordinary `contenteditable` | A | A | A | A\* |
| Local grammar / spelling (Harper WASM) | ✓ | ✓ | ✓ | ✓ |
| Readability / tone / writing-health score | ✓ | ✓ | ✓ | ✓ |
| Universal in-page sidebar (Shadow DOM) | ✓ | ✓ | ✓ | ✓ |
| Native side panel host | ✓\* | ✓\* | — | — |
| Keyboard commands (`browser.commands`) | ✓ | ✓ | ✓ | ✓\* |
| In-page `Alt+W` sidebar hotkey | ✓ | ✓ | ✓ | ✓ |
| Chrome on-device AI (Prompt API) | ✓\* | ✓\* | — | — |
| Local Ollama / LM Studio AI (loopback) | ✓ | ✓ | ✓ | ✓\* |

Notes:

- **Safari `contenteditable`** — selection APIs in some nested / shadow cases
  are weaker; those surfaces degrade to Tier C (sidebar / on-demand), never a
  silent edit.
- **Native side panel** — `chrome.sidePanel` is a *progressive enhancement*
  only; the in-page sidebar is the product and the fallback (§15.1). Firefox's
  `sidebarAction` and Safari's mechanisms are not wired in 1.0.
- **Safari + loopback AI** — Safari's extension network policy may block
  `localhost`; the connection test reports this honestly rather than hanging.

The matrix is also encoded as data in `CAPABILITY_MATRIX` and a unit test
asserts the two stay in sync.

## Manual smoke matrix (§5.1, §23.1)

Automated unit + integration tests (jsdom + WXT fake browser) cover logic.
Real rendering, real editor quirks and real browser lifecycle need a human at
a keyboard. Run this list on each target before a release; record pass/fail and
the browser build number.

### Per target: Chrome stable · Edge stable · Firefox stable · Safari (macOS)

1. **Install** the unpacked / signed build. Toolbar icon appears.
2. **Typing** — open a plain page with a `<textarea>` (e.g. a GitHub comment
   box or `about:blank` with a textarea). Type `I havve teh reciept.` — three
   wavy underlines appear within ~1s and do not shift the layout.
3. **Correction & apply** — click an underline → popover opens at the word →
   click the top replacement → the word is fixed, the page's own undo (Ctrl/Cmd
   +Z) reverts it.
4. **Ignore** — reopen a popover → *Ignore* → the underline disappears and does
   not return on the next keystroke.
5. **Add to dictionary** — misspell a name, *Add to dictionary*, retype it → no
   longer flagged.
6. **Disable / re-enable site** — popup → turn WriteRight off for the site →
   underlines vanish, badge shows "off" → turn it back on → underlines return.
7. **Popup** — score ring + readability/tone summary render in light and dark
   theme; open and close cleanly.
8. **Sidebar** — `Alt+W` (and the `Alt+Shift+W` command, and the popup button)
   opens the sidebar → all five tabs render → `Esc` closes it and focus returns
   to the editor (no focus trap).
9. **Rewrite tab** — *Preview a clean-up* on messy spacing → word-level diff →
   *Apply* changes the field; *Discard* leaves it untouched.
10. **Contenteditable** — repeat 2–4 in a rich editor (e.g. a Gmail compose
    body or a Notion page). If it is a Tier C/D editor, confirm the sidebar
    still works and the status says so honestly — no fake underlines.
11. **Unsupported editors** — open a CodeMirror / Monaco playground → no
    underlines, status is "unsupported", nothing attached to the hidden input.
12. **SPA navigation** — on a single-page app, navigate between views several
    times → no duplicate overlays, no leaked listeners, the sidebar still works.
13. **Sleep / wake & tab churn** — lock the screen or suspend, come back, keep
    typing → analysis resumes; open ~20 tabs, switch rapidly → no runaway CPU.
14. **Service-worker restart** — in `chrome://serviceworker-internals` (or wait
    ~30s idle) stop the worker, then type → the engine re-initialises and
    suggestions come back; typing is never blocked.
15. **Local AI (optional)** — if you run Ollama: Settings → enable Local AI →
    Test connection → grant the localhost permission → Assistant tab → select a
    sentence → *Make it shorter* → preview → *Replace selection*. Disable Local
    AI → everything else still works.
16. **Privileged pages** — open `chrome://extensions`, the web store, a PDF
    viewer → popup says "can't run on this page", nothing is injected.
17. **Reset** — Settings → *Reset all local data* → preferences, dictionary,
    per-site rules and any AI chat history are gone.
18. **Accessibility** — tab through the popup, options and sidebar with the
    keyboard only; run a screen-reader (VoiceOver / NVDA) over each and confirm
    controls are announced with names and roles; toggle "reduce motion" and
    confirm transitions stop.

### Safari extras (§5.3)

- Package with `xcrun safari-web-extension-converter` (see `docs/RELEASE.md`).
- Confirm the app-extension toggle in Safari → Settings → Extensions.
- Note any Tier downgrades and loopback-AI restrictions in the release record.
