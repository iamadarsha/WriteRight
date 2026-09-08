# Phase 3 — architecture spikes

Three time-boxed experiments. The rule: **adopt only if the spike clearly beats
what exists and passes the full gate** — otherwise keep the current
implementation and keep this write-up. 3.2 and 3.3 were adopted (default on
`main`, feature-detected). 3.1 stays on branch `phase-3-spikes` behind
`EXPERIMENTS.offscreenPromptApi` (`WXT_EXP_OFFSCREEN_AI=1`) pending a manual run.

| Spike | Verdict |
|---|---|
| 3.1 Offscreen document for the Prompt API | **Pending a manual measurement** — kept on branch `phase-3-spikes`, off `main` |
| 3.2 CSS Custom Highlight API underlines | **ADOPTED** — default on `main`, feature-detected |
| 3.3 Native `popover` for the suggestion card | **ADOPTED** — default on `main`, feature-detected |

3.2 and 3.3 landed on `main`: default where the browser supports the API, with
the previous implementation kept as the feature-detected fallback.
`src/experiments.ts` and the `WXT_EXP_*` flags are gone. 3.1's scaffolding
(`entrypoints/offscreen/`, `offscreen-prompt-adapter.ts`, `offscreen-protocol.ts`,
the conditional `offscreen` permission) lives on the `phase-3-spikes` branch —
`git checkout phase-3-spikes` to run the manual test in §3.1 below.

---

## 3.2 — `contenteditable` underlines via the CSS Custom Highlight API — ADOPTED

**What shipped.** `ContentEditableHighlightRenderer` — registers the flagged
`Range`s with `CSS.highlights` and paints a `text-decoration` via `::highlight()`
rules, instead of one-absolutely-positioned-`<div>`-per-client-rect
(`ContentEditableRangeRenderer`, kept as the fallback). The factory picks it
whenever `CSS.highlights` / `Highlight` exist.

**Measured** — full Playwright suite against the highlight renderer:

- ✅ Renders real, straight, solid-colour underlines, one per word, tracking the
  text with the browser's own metrics (a touch crisper than the 3 px bar).
- ✅ **Clipped to a scrollable composer by the browser, for free.** The §18.3
  chatgpt.com "scatter" regression test passes at `maxDiffPixelRatio: 0.004`
  with **no `visibleClipRect` in this path** — the entire bug class becomes
  structurally impossible.
- ✅ No layout / caret / IME impact — highlights are paint-only.
- ✅ Popover still opens from a CE underline (`anchorRectFor` → `Range.getBoundingClientRect()`).
- ✅ All 44 e2e + visual green, including the tight CE-underline baseline.

**Cost / caveat.** `::highlight()` rules must live in a stylesheet **in the
highlighted text's document** — so one small `<style data-writeright="ce-highlights">`
is injected into the host page (a departure from strict "no host-page CSS,"
though scoped to our own `wr-hl-*` highlight names and ~4 short rules). The state
colours are **inlined** (light + dark hex from `tokens.css`) rather than bound to
the shadow `--wr-*` custom properties — a mid-session theme toggle needs a page
reload to re-colour these underlines. Support: Chrome 105+, Firefox 140+,
Safari 17.2+ (older engines fall back to the current renderer).

**Outcome: adopted.** Makes the class of bug that produced `3d7067a` impossible
in that path; the range renderer stays for older engines. The one thing signed
off: a small `::highlight()` `<style>` in the host page.

---

## 3.3 — the suggestion card as a native `popover` — ADOPTED

**What shipped.** Feature-detected on `showPopover`: `popover="auto"` +
`showPopover()` / `hidePopover()`, so the card is in the browser **top layer**
(no `z-index: 2147483647`) with **native light-dismiss and Escape** (→ `toggle`
event → `onClose`). The hand-rolled document `pointerdown` dismisser — and the
closed-shadow-root retarget special-case from `da26e7b` — are **skipped** for it;
the browser already knows the popover's flat-tree subtree, shadow content
included. `#position()` still places the card (CSS anchor positioning is
Chrome-125+ only). Older engines keep the manual path.

**Measured** — full Playwright suite against the native popover:

- ✅ **The `da26e7b` regression test passes with the manual dismisser removed** —
  "a pointer inside the closed-shadow card does not dismiss it before Apply."
  Native light-dismiss handles the closed-shadow-root case correctly.
- ✅ Escape closes it (native), full type → underline → popover → apply →
  re-analyse flow works, sidebar Esc unaffected.
- ✅ All 44 e2e + visual green.

**Cost / caveat.** `aria-modal="true"` is dropped (a native `auto` popover is
non-modal — the page stays interactive); the Tab-trap in `#attachDismissers`
still keeps keyboard focus in the card while it's open. Support: Chrome 114+,
Firefox 125+, Safari 17+ (older engines fall back to the current path).

**Outcome: adopted.** Removes a fragile hand-rolled dismisser and its
closed-shadow-root workaround from the supported path, drops the max-`z-index`
hack, and the browser's implementation is strictly more correct.

---

## 3.1 — offscreen document for the Chrome Prompt API

**What was built.** `entrypoints/offscreen/main.ts` hosts a `PromptApiAdapter`
in a DOM context; `OffscreenPromptApiAdapter` (worker side) ensures the document
exists (`chrome.offscreen.createDocument({ reasons: ['WORKERS'], … })`) and
proxies `probe` / `generate` / `startDownload` over `runtime` messages.
`CapabilityDetector` selects it for the `chrome` provider when the flag is on.
The `offscreen` permission (no user-facing warning) is added to the manifest
**only** in a `WXT_EXP_OFFSCREEN_AI=1` build. Non-streaming only for the spike;
no cancellation across the boundary yet.

**Why there's no verdict yet.** The core questions are:

1. Does `LanguageModel` resolve in an offscreen document on a machine where
   `resolveFactory()` returns `null` in the service worker?
2. Does an in-flight generation survive the ~30 s worker idle timeout (the
   offscreen document persists independently of the worker)?

Both need a **real Chrome with the built-in model downloaded, on capable
hardware** — the unit/CI environment has no `LanguageModel`. The message
protocol is unit-tested with a fake `chrome.offscreen`; that's as far as an
automated measurement goes.

### Manual test procedure

1. `WXT_EXP_OFFSCREEN_AI=1 npm run build`, load `.output/chrome-mv3` unpacked in
   a Chrome that has the on-device model (`chrome://on-device-internals` shows it
   downloaded).
2. Open the popup / sidebar on a normal page. Note the AI status line.
   - **Baseline** (default build): if it says the Chrome model is unavailable
     here even though `chrome://on-device-internals` shows it ready → the worker
     can't see it. This is the situation the spike targets.
3. With the experiment build: does the sidebar now report the Chrome provider as
   **ready**, and does a Rephrase produce a real rewrite?
   - **If yes** → spike 3.1 is a GO: offscreen unlocks built-in AI where the
     worker couldn't. Next step: proxy `generateStream` through the offscreen
     doc (a port, not one-shot `sendMessage`) and thread cancellation.
   - **If no** (still unavailable, or errors) → NO-GO: document that Chrome's
     built-in AI isn't reachable from an extension offscreen document in this
     version either; delete the entrypoint, adapter, protocol and the flag.
4. Leave a generation running and don't touch the extension for 40 s; confirm it
   still completes (worker may suspend; the offscreen doc should not).
