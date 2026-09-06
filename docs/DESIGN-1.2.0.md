# WriteRight 1.2.0 — Offline vocabulary, select-to-define, granular toggles, Simple Mode

Status: **accepted, in implementation.** Builds on 1.1.0 (which stays uncommitted
on the same tree). No change to the zero-cost, local-first or privacy contracts.

---

## Understanding summary

- **What:** a complete offline vocabulary layer for WriteRight — select any text
  on any page to see its definition, synonyms and antonyms — plus a Grammarly-style
  bank of independent on/off toggles for every check, and a "Simple Mode" UI
  variant for low-literacy users and language learners.
- **Why:** WriteRight should be a full writing companion, usable across the whole
  literacy spectrum, entirely offline and free. Definitions + a thesaurus is the
  biggest remaining gap vs. Grammarly, and it is one WriteRight can close *better*
  because it runs with no network and no paywall.
- **Who:** anyone writing (or reading) in a browser — students, non-native
  speakers, low-literacy users, people with dyslexia, professionals.
- **Constraints:** zero paid cost; no remote code or data at runtime; WXT + TS
  strict + React; plain DOM in the content script; content-script bundle ≤ 300 KB;
  the lexical dataset must be a **compact, lazily-loaded, indexed** representation
  (PRD §11.3 forbids shipping raw WordNet); WordNet attribution preserved (§7.3).
- **Non-goals:** cloud dictionary/thesaurus; pronunciation audio; text-to-speech;
  translation; AI-detector evasion / "undetectable AI"; new grammar rules beyond
  Harper + the existing custom layer; proper-noun *encyclopaedia* content.

## Decisions accepted

| # | Decision | Alternatives considered | Why |
|---|----------|------------------------|-----|
| D1 | Dataset = **Open English WordNet 2025+** (LMF XML, `en-word.net/static/english-wordnet-2025-plus.xml.gz`), CC-BY-4.0 | Princeton WordNet 3.1 (frozen 2012); Wiktionary dumps (huge, messy, mixed licence) | Latest maintained WordNet; permissive; `2025-plus` keeps proper nouns. |
| D2 | Content = definitions + examples + synonyms + antonyms, **all POS** | Lean (defs+syn only); minimal (one gloss) | User chose "Full". Lazy-loaded ⇒ zero cost until first use. |
| D3 | On-disk = build script → `lemmas.bin` (sorted lemma table + block offsets) + `glosses.bin` (64 KB blocks, per-block gzip) + `VERSION.json` | Raw JSON; SQLite; single gzip blob | PRD §11.3: "compact sorted binary index with prefix lookup" + "lazy-loaded, compressed, indexed". Per-block gzip ⇒ bounded memory (one block per lookup). |
| D4 | Parser = `saxes` (dev-only, exact-pinned, ISC) in `scripts/build-lexicon.ts` | Hand-rolled scanner; `unzip` the WNDB zip | Robust streaming XML; never ships; licence already allow-listed. |
| D5 | Runtime lives in the **background service worker** (`src/engine/lexicon/`) | Content script (bundle blows the 300 KB budget); offscreen doc | Same place as Harper. Content script only renders. |
| D6 | Memory policy = lemma index (~2 MB) resident after first use; LRU of 16 decompressed blocks (~1 MB); **evict everything after 5 min idle** | Keep all in memory; re-read every lookup | Bounded, and cold-start cost paid once. |
| D7 | Lemmatisation = ported minimal **Morphy** (WordNet exception lists + suffix rules), in `morphy.ts` | `wordpos`/`natural` dep; none (exact match only) | "running"→"run", "better"→"good" without a runtime dep. |
| D8 | Toggles: split `features.inlineSuggestions` → `spelling` / `grammar` / `punctuation` / `styleWordiness`; add `defineOnSelect`, `synonyms`; add top-level `simpleMode`. **Settings schema v1 → v2** + intent-preserving migration. | Keep coarse toggle | User chose "per-category + new features". |
| D9 | Accessibility = **Simple Mode only** (no TTS) | Read-aloud; both | User chose. `data-wr-simple="true"` on the shell drives a plain-language, large-target CSS variant of every surface. |
| D10 | Natural-voice / "humanise AI" rewrite = **not built** | Build as style pass; build with detector tuning | User chose skip. (Detector-evasion tuning would not have been built regardless — §safety.) |
| D11 | Select-to-define default = **on**, one-tap off; pill only for ≤ 6-word, mostly-alphabetic selections; never in password / code / WriteRight UI | Default off | Target users benefit most from it on; guards keep it unobtrusive. |

## Architecture

```
                    ┌─────────────────────── background service worker ───────────────────────┐
 content script     │  BackgroundController                                                   │
 ┌───────────────┐  │    ├── EngineService ──── LinguisticEngine (Harper WASM)  [unchanged]   │
 │ ContentControl│  │    └── LexiconService ─── LexiconStore                                   │
 │  ├ TextField… │  │                             ├── lemma index (resident)                  │
 │  ├ Analysis…  │◄─┼─ DEFINE / LOOKUP_SYNONYMS ──┤ ├── LRU block cache (≤16, idle-evicted)   │
 │  ├ Sidebar…   │  │                             │ └── Morphy (lemmatiser)                   │
 │  └ DefineCtrl │──┼─►                           └── loads public/lexicon/*.bin (once)       │
 │     ├ Selection│  └────────────────────────────────────────────────────────────────────────┘
 │     ├ DefinePill (plain DOM, shadow uiLayer)
 │     └ DefinePanel (plain DOM, shadow uiLayer)
 └───────────────┘
```

## Data flow — select-to-define

1. `SelectionWatcher` listens for `selectionchange` (debounced 250 ms) + `mouseup`/`keyup`.
2. Guard: non-empty, ≤ 6 words / 64 chars, ≥ 60 % letters, not in a password/code
   field, not inside `#writeright-host`, `defineOnSelect` on, site + global enabled.
3. `DefinePill` shows at the selection's end rect. Click (or `Alt+D`) →
4. `DefineController` sends `DEFINE {text}` → `LexiconService.define()`:
   - normalise → try exact, then Morphy variants, then (for 2–3 words) the joined form;
   - binary-search the lemma index → block id → decompress that one block → read record.
5. Response `{ entries: LexEntry[], unavailable?: boolean }` → `DefinePanel` renders
   senses (numbered), POS chip, synonyms/antonyms as chips, one example.
6. If the selection was in an editable field, a synonym chip offers **Replace**
   (version-safe apply, same gate as a suggestion). Otherwise chips just re-define.

## Never-hang guarantees (every pipeline)

- Every `DEFINE` / `LOOKUP_SYNONYMS` call is wrapped in a 2 s timeout in the
  content script; on timeout or error the panel shows "Couldn't load — try again",
  never a spinner forever.
- `LexiconStore.ensureLoaded()` is idempotent and memoised; a failed load rejects
  fast and is retried at most once per 30 s; callers get `{ unavailable: true }`.
- The selection watcher work is O(1) per event, debounced, and never touches the
  network or the engine.
- Block decompression is synchronous `zlib`-equivalent (`DecompressionStream`)
  bounded to 64 KB; the LRU cap bounds total work.
- Idle eviction uses `setTimeout`, cleared on every lookup — no polling loop.
- Migrations are deterministic + idempotent (existing contract).

## Testing strategy ("go crazy")

- **Unit:** Morphy table cases; `LexiconStore` against a checked-in 30-word
  fixture lexicon (real binary format); block LRU + idle eviction; selection-guard
  matrix; category-filter logic; settings v1→v2 migration (all 2⁵ input combos);
  new message validators.
- **Integration:** `DEFINE`/`LOOKUP_SYNONYMS` round-trips through a real
  `BackgroundController`; define flow through `ContentController` (pill → panel →
  replace); synonyms row in the popover; `data-wr-simple` propagation; per-category
  toggle actually filters underlines.
- **Stress:** 500 rapid selections; 10 k-char selection (rejected, no work);
  lookup while the store is still loading; store-load failure → honest fallback;
  100 concurrent `DEFINE`s; idle-eviction then re-load; malformed lexicon bytes.
- **E2E (real Chromium, packaged):** select a word on a plain article → pill →
  panel with a real definition; select in a textarea → replace with a synonym;
  turn Grammar off in options → amber underlines disappear, red stay; Simple Mode
  → panel renders large-text variant.
- **Golden lexicon corpus:** ~25 words with asserted primary definition + a known
  synonym/antonym, run through the built binary every release.
- **Visual regression:** define pill, define panel (light/dark/simple),
  options page with the new toggle bank.

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Install zip grows ~8 MB → ~13–20 MB | Dedicated "lexical data" budget line; "total package" budget raised to 32 MB with a documented §0.3 rationale; data is lazy so first-run RAM/CPU is unchanged. |
| `en-word.net` unreachable at build time | `build-lexicon.ts` caches the raw download; if offline and the existing `public/lexicon` matches `VERSION.json`, it is reused; only a cold machine with no network hard-fails. Not in the `npm ci` critical path unless `sync:lexicon` is wired to `prepare` (it is, mirroring `sync:harper`, and CI already needs network for `npm ci`). |
| Define pill feels invasive | ≤ 6-word guard, instant dismiss on scroll/keydown, `defineOnSelect` one-tap off, first-run hint. |
| LMF parse is slow / memory-heavy at build | `saxes` streaming + incremental flush of completed `<LexicalEntry>`/`<Synset>` blocks; build script is dev/CI only. |
| Simple Mode drifts from the default UI | Same components, CSS-only variant keyed on one attribute; visual regression covers both. |
