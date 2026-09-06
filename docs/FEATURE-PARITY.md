# Feature parity — WriteRight vs Grammarly & QuillBot

Where WriteRight stands against the two most-used browser writing extensions, as
of **1.2.0**. The hard rule (PRD §0.3): **nothing that needs a paid token, a
hosted service, or a web crawl.** Anything in that bucket is out of scope by
design, not by omission.

Legend: ✅ done · 🟡 partial / planned · ⛔ out of scope (needs paid infra)

## In-field widget & badge

| Capability | Grammarly / QuillBot | WriteRight |
|---|---|---|
| Floating launcher near the field | ✅ / ✅ | ✅ launcher pill (issue count, "paused" state) |
| Issue-count badge | ✅ | ✅ on the pill + the toolbar icon |
| Tone emoji on the badge | ✅ | 🟡 tone is detected; not yet shown on the pill |
| Draggable / snap-to-corner widget | ✅ | 🟡 fixed bottom-right; drag planned |
| Inline "Ask AI" / generative entry point | ✅ | ✅ sidebar Assistant tab (local AI only) |

## Underlines & suggestion card

| Capability | Them | WriteRight |
|---|---|---|
| Live underlines as you type, any field | ✅ | ✅ `<input>` / `<textarea>` / `contenteditable` |
| Multi-colour categories | ✅ (4) | ✅ spelling (red) · grammar (amber) · punctuation · style (purple) · clarity (blue) |
| Inline "hard to read / long sentence" flag | ✅ Grammarly (clarity) | ✅ deterministic clarity underline + "Rephrase" (§12.3) |
| Click underline → card with explanation | ✅ | ✅ category, What/Why/Fix/Example, replacements |
| One-click accept / dismiss | ✅ | ✅ + number keys 1–4 |
| "Add to dictionary" | ✅ | ✅ |
| "Turn off this suggestion type" from the card | ✅ Grammarly | ✅ "Ignore rule here" + per-category toggles in Options/popup |
| Hover (not just click) to preview | ✅ Grammarly | ⛔ by design — hover-only fails accessibility (PRD §9.6) |
| Synonyms on double-click a word | ✅ both | ✅ select-to-define pill + "Find a better word" in the card |
| "Fix all" one-click | ✅ QuillBot | 🟡 planned (sidebar "apply all safe fixes") |

## Dictionary, thesaurus, vocabulary

| Capability | Them | WriteRight |
|---|---|---|
| Select text → definition | ✅ Grammarly | ✅ offline (Open English WordNet), also Alt+D |
| Synonyms / antonyms | ✅ both | ✅ offline, in the define panel + the card |
| Works offline / no account | ⛔ (cloud) | ✅ ~152k lemmas bundled, lazy-loaded |

## Rewriting

| Capability | Them | WriteRight |
|---|---|---|
| Mechanical clean-up (spacing, filler) as a diff | — | ✅ deterministic, preview-then-apply ("Tidy up" on the Rewrite tab) |
| Paraphrase modes (Standard/Formal/Simple/Creative/Shorten/Expand…) | ✅ QuillBot | ✅ mode **pills** on the Rewrite tab + a compact strip on Suggestions (simplify, formalize, casualize, shorter, longer, confident, persuasive, …); local-AI powered, honest "turn on local AI" when no model is ready |
| Synonyms slider (conservative → aggressive) | ✅ QuillBot | 🟡 planned |
| "Freeze words" (lock terms from rewriting) | ✅ QuillBot | 🟡 the personal dictionary already protects terms from checks; a rewrite-scoped freeze list is planned |
| Full-sentence inline rewrites | ✅ Grammarly | ✅ "Rephrase" on any clarity / no-one-click-fix card — AI when available, deterministic sentence tidy-up otherwise |

## Tone & goals

| Capability | Them | WriteRight |
|---|---|---|
| Tone detection | ✅ | ✅ 9 tones, uncertainty-aware |
| Tone rewrite (make it friendly / confident / …) | ✅ | ✅ "Adjust tone" pills on the Tone tab + the Rewrite tab (local AI) |
| Goals modal (Audience / Formality / Domain / Intent) | ✅ Grammarly | 🟡 format presets cover most of this; a richer Goals dialog is planned |
| Brand / team tone guide | ✅ Grammarly (paid) | ⛔ needs an account/team backend |

## Sidebar / editor

| Capability | Them | WriteRight |
|---|---|---|
| Slide-out review sidebar, grouped suggestions | ✅ | ✅ universal in-page sidebar (works on every browser) |
| Overall score ring (0–100) | ✅ | ✅ transparent published formula, no model |
| Readability / word count / reading time ribbon | ✅ | ✅ Statistics tab |
| Ask-AI chat box in the sidebar | ✅ | ✅ Assistant tab (local AI) |
| Standalone full-page web editor | ✅ both | 🟡 planned as a bundled extension page (local, no account) |
| Google-Docs canvas support | ✅ both | 🟡 detected by site profile → toolbar badge + launcher say "unsupported", sidebar offers "paste to analyse" with a canvas-specific note (honest degrade, §5.1) |

## Settings & controls

| Capability | Them | WriteRight |
|---|---|---|
| Per-site enable/disable | ✅ | ✅ |
| Per-field disable | — | ✅ ("Turn off for this field") |
| Dialect selector (US/UK/CA/AU/IN) | ✅ Grammarly | ✅ |
| Toggle individual rule categories | ✅ Grammarly | ✅ Spelling / Grammar / Punctuation / Style, each independent |
| Toggle definitions & synonyms on double-click | ✅ Grammarly | ✅ "Select text to define" / "Suggest synonyms" |
| Colourblind mode | ✅ Grammarly | ✅ every state carries an icon + label, never colour alone; forced-colors CSS; high-contrast tokens |
| Snooze for 1 hour | ✅ Grammarly | 🟡 global + per-site + per-field off; a timed snooze is planned |
| Movable/auto-jump toggles | ✅ Grammarly | 🟡 planned |

## Academic & integrity tools

| Capability | Them | WriteRight |
|---|---|---|
| AI-writing detector | ✅ both | ⛔ needs a trained model / API |
| AI humaniser | ✅ both | ⛔ intentionally not built (detection-evasion) |
| Web plagiarism check | ✅ both | ⛔ needs a web index; a **local similarity** check (within a doc / a corpus you supply) is a possible future feature, and must not be called "plagiarism check" (PRD §4.2) |
| Citation generator | ✅ both | 🟡 possible offline (CSL styles are local data); not started |

## Platform

| | Them | WriteRight |
|---|---|---|
| Chrome / Edge / Firefox | ✅ | ✅ |
| Safari | ✅ | ✅ (convert with `safari-web-extension-converter`, see `docs/RELEASE.md`) |
| Desktop apps, mobile | ✅ | ⛔ browser extension only |

---

### Planned next (all local, all free)

1. **Fix-all** button in the sidebar (apply every safe, high-confidence fix).
2. A **synonyms-aggressiveness slider** for the Rewrite tab.
3. **Draggable launcher** with corner snapping; a **timed snooze**.
4. **Tone emoji** on the launcher pill.
5. A bundled **full-page editor** (local, no account) for long-form drafting.
6. A richer **Goals** dialog (audience / formality / domain / intent) feeding the rule set.
7. **Local similarity** (duplicate-phrase detection within a document or a user-supplied corpus) — never named "plagiarism".
