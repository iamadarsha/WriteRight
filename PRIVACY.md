# WriteRight Privacy

WriteRight is built so that privacy is a property of the code, not a policy you
have to trust. This document is deliberately explicit.

_Applies to: WriteRight 1.2.0. Spelling and grammar analysis runs locally
(WebAssembly); readability statistics, the writing-health score and the tone
estimate are computed locally by plain deterministic functions. The dictionary /
thesaurus ("define", synonyms) is an offline dataset bundled with the extension.
Optional local AI (off by default) runs on the browser's own on-device model or a
model server you run on `localhost` — never a cloud API. None of this introduces
a WriteRight server._

---

## What WriteRight reads

- The **text content of ordinary editable fields** you interact with on a page:
  `<textarea>`, text `<input>`, and ordinary `contenteditable` elements — and
  only on sites where you have left WriteRight enabled.
- A **short text selection** you make anywhere on the page (up to six words),
  **only when "Select text to define" is on** and only to look it up in the
  bundled offline dictionary. The selected word is matched against local data
  and is never transmitted, stored, or logged. Selections inside password /
  credential fields, code editors and WriteRight's own UI are ignored.
- The **URL/origin of the current tab**, to apply your per-site settings and to
  decide whether the page is one WriteRight can run on.

## What WriteRight never reads

- **Password fields and credential-like fields** (password, OTP/2FA, CVV, PIN,
  card-number, SSN — detected by type, name, id and autocomplete hints).
- Hidden, disabled or read-only fields.
- Code editors (CodeMirror, Monaco, ACE, and `contenteditable` inside `<pre>`).
- Browser-internal pages (`chrome://`, `about:`, `edge://`, extension pages),
  browser web stores, and other privileged surfaces — the browser forbids
  extensions there and WriteRight does not try.
- Any field on a site you have disabled, any field you chose *Turn off for this
  field* on, or every field when WriteRight is globally paused.

## What leaves your device

**Nothing.** In this build:

- There are **zero network requests** in the analysis path. Spelling and
  grammar checking runs in a WebAssembly engine (Harper) bundled with the
  extension; it works with your network disconnected.
- No analytics, no telemetry, no crash reporting, no remote configuration, no
  remote code, no remote fonts or CSS.
- There is no WriteRight account, API key, quota or server.
- Text you type is sent from the page to the extension's own background worker
  for analysis (an in-browser message, never a network call) and is held only
  in memory there for the duration of that check.
- **Readability statistics, the writing-health score and the tone estimate**
  are computed from your text on your device. They produce only aggregate
  numbers and short labels (e.g. "Grade 8", "88", "Likely professional") — no
  excerpt of your text is kept. The score comes from one published formula, not
  a model, and **no writing profile is ever stored** (§12.2). The tone estimate
  always states its uncertainty and claims no accuracy figure.
- The **rewrite clean-up** runs locally, changes nothing until you confirm, and
  never edits code, URLs or template variables.
- The **dictionary and thesaurus** ("define", synonyms) is an offline dataset
  (Open English WordNet) bundled inside the extension. Looking up a word is a
  local array lookup — no request leaves the browser, and it works with your
  network disconnected.
- The popup's score ring reads the last result for the active tab from
  session storage (aggregate numbers only); it makes no network call.

## Strict privacy mode

Settings → Privacy has a single **Strict privacy mode** switch. With it on,
local AI is forced off (regardless of the AI switch) and diagnostics stay off —
WriteRight runs only its deterministic, on-device checks, with no optional code
paths active at all.

## Local AI (optional, off by default)

Local AI is a **separate switch** in Settings, and is unavailable while Strict
privacy mode is on. Until you turn it on, none of this code runs and no AI
endpoint is ever contacted.

**When you turn it on**, WriteRight can use only:

- Chrome's built-in **on-device** model (processing stays on your device
  according to the browser; the first use may trigger a browser-managed model
  download — your text is never part of that download), or
- **Ollama** / **LM Studio** / another OpenAI-compatible server **you run** on
  `localhost` — your text is sent to that local server, which you control.

There is **no cloud path**. The extension has no remote AI endpoint, the build
is scanned in CI for any non-loopback inference URL, and any endpoint you
configure is checked in code against a loopback allowlist — `localhost` /
`127.0.0.1` only, rejected before any request is made otherwise.

**When local AI receives your text:**

- Only on an **explicit action** — a rewrite button or a chat message you send.
  Never automatically, never as you type.
- Only the **text you selected** (or, if nothing is selected, the current
  field). Never the whole page, other fields, hidden content, or page metadata.
- The prompt tells the model the text is *content to edit, not instructions*,
  and the model's reply is validated (size-capped, HTML/script rejected) before
  it is shown, and a rewrite replaces only the range you selected.

**AI chat history** is kept **in memory only** and cleared when you close the
sidebar, unless you opt in to "Keep AI chat history on this device" — then the
transcript is stored locally (never synced) and cleared by "Reset all local
data".

The status line always shows which local engine is active
(`AI Ready — Chrome on-device` / `… Ollama` / `… LM Studio`) or
`AI Unavailable — local writing tools still active`. It never says "AI ready"
when no model can actually run.

---

## What is stored, and where

Everything is stored **locally on this device** using the browser's extension
storage. Nothing is synced to a WriteRight server (there isn't one).

| Data | Storage | Retained |
|---|---|---|
| Your preferences (incl. default format preset) | `storage.local` | until you change or reset them |
| Per-site enable/disable + ignored rules + preset | `storage.local` | until you change or reset them |
| Personal dictionary | `storage.local` | until you remove entries or reset |
| Local-AI settings (provider, `localhost` endpoints) | `storage.local` | until you change or reset them |
| AI chat transcript | memory only, unless you opt in | opt-in: `storage.local`, cleared by Reset |
| Current editor text | memory only | discarded when you leave the field/page |
| Suggestions | memory only | recomputed on every change; never stored |
| Page status per tab | session (in-memory) | cleared on browser restart |
| Readability / score / tone summary per tab | session (in-memory) | aggregate numbers only; cleared on browser restart |
| Diagnostic logs | off by default | — |

WriteRight does **not** persist your documents, and does not write your text to
logs — in production, tests, or error handlers (§31 Rule 5).

## Deleting your data

Settings → **Reset all local data** removes your preferences, per-site
settings, personal dictionary, local-AI settings, any opt-in AI chat history
and any diagnostic state. This works even if a data migration has failed.

---

## Permissions, explained

| Permission | Why |
|---|---|
| `storage` | Save your preferences, per-site settings and personal dictionary locally. |
| Access to `http(s)` sites (`*://*/*`) | WriteRight is a writing assistant that should work wherever you type. Access is limited to normal web pages; you can turn it off per-site or globally, and the popup always shows whether it is active on the current site. |

WriteRight requests no other permissions. It does not use `activeTab`,
`scripting`, `tabs` (beyond reading the active tab's URL for the popup),
`cookies`, `webRequest`, `history`, `bookmarks` or `downloads`.

---

## Reporting a concern

WriteRight is open source. Please open an issue on the project's GitHub
repository. Submitting anything is entirely your choice — WriteRight does not
collect feedback automatically.
