# Third-Party Notices

WriteRight is MIT-licensed (see `LICENSE`). It bundles and depends on the
third-party software listed below. Only components whose code is **shipped in
the extension** are given full notices here (§7.4); build- and test-time tools
are listed separately for transparency.

The `npm run verify:licenses` check enforces that every installed dependency
carries a permissive license from the approved list (§6.10, §7.1).

---

## Shipped in the extension

### Harper — local grammar & spelling engine

- Package: `harper.js` 2.7.0 (pinned exactly); WebAssembly binary
  `harper_wasm_bg.wasm` synced from that package by
  `scripts/sync-harper-assets.ts` (SHA-256 recorded in
  `public/harper/VERSION.json`).
- License: **Apache-2.0** — full text in `licenses/harper.apache-2.0.txt`.
- Copyright © Automattic, Inc. and Harper contributors.
- Source: https://github.com/Automattic/harper
- Transitive: `fflate` (MIT) — WASM stream decompression.

Harper's WASM binary is shipped as a plain `.wasm` file (streamed and
browser-cached), loaded by the background service worker. WriteRight uses
Harper's supported `harper.js` API and does **not** reimplement or fork its
grammar logic (§35).

### React and React DOM

- Version: 19.2.8 (pinned)
- License: MIT
- Copyright (c) Meta Platforms, Inc. and affiliates.
- Source: https://github.com/facebook/react

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Open English WordNet — offline dictionary & thesaurus (§11.3)

- Data: **Open English WordNet 2025+** (`english-wordnet-2025-plus.xml.gz`),
  downloaded from `https://en-word.net/` and pinned by SHA-256 in
  `scripts/build-lexicon.ts`. Only the subset WriteRight uses — lemma, part of
  speech, definition, one example, synset co-members (synonyms), direct
  antonyms — is extracted into the compact block-compressed binaries
  `public/lexicon/lemmas.bin` and `public/lexicon/glosses.bin` (provenance and
  hashes in `public/lexicon/VERSION.json`). Raw WordNet is never shipped.
- License: **CC-BY-4.0** — full text in `licenses/oewn.cc-by-4.0.txt`.
- Attribution: “Open English WordNet” by the Open English WordNet contributors,
  https://github.com/globalwordnet/english-wordnet. Derived from Princeton
  WordNet 3.0, Copyright © 2006 Princeton University.
- Source: https://en-word.net/ · https://github.com/globalwordnet/english-wordnet

WordNet 3.0 is used under Princeton University’s permissive WordNet license,
which allows use, copying, modification and distribution without fee subject to
its notice requirements; the Open English WordNet re-licenses the combined work
under CC-BY-4.0.

---

## Build & development tooling (not shipped)

These run only during development, build, lint and test. Their code is **not**
present in the packaged extension.

| Tool | License | Purpose |
|---|---|---|
| [WXT](https://github.com/wxt-dev/wxt) | MIT | Cross-browser extension framework & build |
| [`@wxt-dev/module-react`](https://github.com/wxt-dev/wxt) | MIT | React integration for WXT |
| [Vite](https://github.com/vitejs/vite) | MIT | Bundler used by WXT |
| [lightningcss](https://github.com/parcel-bundler/lightningcss) | MPL-2.0 | CSS transform at build time (output is plain CSS) |
| [web-ext](https://github.com/mozilla/web-ext) & `addons-linter` | MPL-2.0 | Firefox packaging / linting CLI |
| [Vitest](https://github.com/vitest-dev/vitest) | MIT | Unit / integration test runner |
| [jsdom](https://github.com/jsdom/jsdom) | MIT | DOM environment for tests |
| [ESLint](https://github.com/eslint/eslint) + `typescript-eslint` | MIT / BSD-2-Clause | Static analysis |
| [Prettier](https://github.com/prettier/prettier) | MIT | Formatting |
| [Playwright](https://github.com/microsoft/playwright) | Apache-2.0 | Browser E2E (from Phase 2) |
| [`saxes`](https://github.com/lddubeau/saxes) + `xmlchars` | ISC / MIT | Streaming XML parse of the WordNet source in `scripts/build-lexicon.ts` |

MPL-2.0 is a file-level (weak) copyleft license. It is acceptable here because
none of the MPL-licensed code is redistributed as part of WriteRight, and
WriteRight's own source remains MIT (§7.2).

---

## Planned for later phases

The following will be added with full notices when integrated:

- **English dictionary data** (`wooorm/dictionaries`) — `(MIT AND BSD)` —
  supplemental definitions/lookup beyond Harper's built-in dictionary
  (Phase 3, §7.3)
- **WordNet 3.0** — Princeton WordNet License — definitions/relations, subset
  only (Phase 3, §7.3)

`licenses/` holds the verbatim upstream license text for shipped components.
