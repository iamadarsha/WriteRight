# WriteRight — store listing copy

Source text for the Chrome Web Store / AMO / Safari listing. Keep it in sync
with the actual build (§5.9, §30). No screenshots are checked in — capture them
from the visual QA gallery (`npm run test:visual` baselines) at release time.

---

## Name

WriteRight — private, local writing assistant

## Summary (132 chars max)

Spelling, grammar, readability, tone and rewrites that run on your device. No
account, no subscription, no telemetry, no paid AI.

## Description

WriteRight checks your writing **on your device** and explains what it finds in
plain language. There is no WriteRight server — the default analysis path has
nowhere to send your text.

**What it does**

- Catches spelling and grammar mistakes offline, using the open-source Harper
  engine compiled to WebAssembly. Wavy underlines appear inline; click one for
  an explanation and one-click fixes.
- Shows document statistics and five readability grades (Flesch, Flesch–Kincaid,
  Gunning Fog, Coleman–Liau, SMOG), a transparent 0–100 writing-health score
  where every part carries a reason, and an uncertainty-aware tone estimate.
- A universal sidebar (Alt+W) with Suggestions, Statistics, Tone, Rewrite and
  Assistant tabs — plain, keyboard-operable, never traps focus.
- Safe, reversible clean-ups (spacing, punctuation, filler) previewed as a diff
  and applied only when you confirm. Code, URLs and template variables are never
  touched.
- Format presets (business email, academic, social post, technical docs,
  creative, résumé) that tune the guidance and rules.
- **Optional local AI** — rewrites, tone changes, explanations and a chat panel,
  powered only by Chrome's built-in on-device model or an Ollama / LM Studio
  server you run on your own machine. Off by default. Never a paid cloud API.

**What it never does**

- No account, no sign-in, no subscription.
- No telemetry, no analytics, no crash reporting, no remote configuration.
- No remote code, fonts or CSS.
- Never reads password, credential, hidden or disabled fields, or code editors.
- Never sends your text to a cloud service — the build is scanned in CI to
  prove there is no remote inference URL.

**Open source.** Clone it, read it, build it, sideload it — no paid service
required. github.com/<owner>/writeright

## Category

Productivity

## Permissions — what the listing must explain

- **Read and change data on websites you visit** — WriteRight is a writing
  assistant, so it runs on the pages where you type. It only reads text fields
  you focus, only on sites where you leave it enabled, and never password or
  hidden fields. You can turn it off per-site or globally; the toolbar popup
  always shows whether it is active.
- **Storage** — saves your preferences, per-site settings and personal
  dictionary locally on your device. Nothing is synced anywhere.
- **Access to localhost (optional, requested only when you enable local AI)** —
  so it can talk to an AI model server you run on your own computer. Loopback
  only.

## Install instructions (for the GitHub release / sideload)

**Chrome / Edge**

1. Download `writeright-<version>-chrome.zip` from the Releases page and unzip
   it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load
   unpacked**, and select the unzipped folder.

**Firefox**

1. Download `writeright-<version>-firefox.zip`.
2. Open `about:debugging` → **This Firefox** → **Load Temporary Add-on** →
   select the zip. (A signed build is provided for permanent installation where
   available.)

**Build it yourself**

```bash
git clone https://github.com/<owner>/writeright
cd writeright
npm install
npm run check      # optional: run the full verification gate
npm run build:all  # .output/chrome-mv3 and .output/firefox-mv3
```

## Support

WriteRight has no support email and collects no diagnostics. Open an issue on
GitHub: github.com/<owner>/writeright/issues. Submitting anything is entirely
your choice.

## Privacy policy

See `PRIVACY.md` in the repository (linked from the listing). It is written to
be a property of the code, not a promise: analysis is local, storage is local,
and there is no server.
