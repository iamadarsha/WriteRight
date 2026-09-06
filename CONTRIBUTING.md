# Contributing to WriteRight

Thank you for helping build a genuinely free, private writing assistant.

## Ground rules

WriteRight has a product contract that PRs must respect (see the PRD, §31):

1. **No cloud dependencies.** No WriteRight backend, no paid API, no account.
2. **No telemetry.** Ever.
3. **Never log user text** — not in code, tests, or error handlers.
4. **Don't fake support.** An editor/browser is "supported" only when it
   genuinely works; otherwise report an honest limited/unsupported state.
5. **Prefer reversible changes** to user content; version-check every edit.
6. **TypeScript strict, no `any`** (isolate and narrow unavoidable API
   boundaries immediately).
7. **Don't cargo-cult dependencies.** New deps need a permissive license and a
   real justification.

## Setup

```bash
npm install
npm run check   # must pass before you push
```

Node ≥ 22.13. Use `.nvmrc`.

## The gate

`npm run check` runs, in order: `typecheck → lint → format:check →
verify:no-secrets → verify:no-text-logging → test:coverage → build:all →
verify:manifest → verify:licenses → verify:no-remote-ai → verify:safe-apis →
verify:sbom → bundle:report`. CI runs the same thing. If a test fails, fix the
defect — don't weaken the test (§31, §23.4).

Before a release also run `npm run verify:reproducible`, `npm run test:e2e`
(Playwright — needs `npx playwright install chromium` and `npm run build`), and
the manual browser smoke matrix in [docs/BROWSER_SUPPORT.md](docs/BROWSER_SUPPORT.md).
Full release process: [docs/RELEASE.md](docs/RELEASE.md).

## Adding an editor adapter

1. Implement `EditorAdapter` (see `types/editor.ts`). Extend `BaseAdapter` for
   the shared lifecycle.
2. Export an `EditorAdapterFactory` with a `canHandle` and a `priority`
   (site adapters: high; generic: 50–100; unsupported: negative).
3. Register it in `adapters/adapter-registry.ts` (or, for a site adapter, keep
   it in `adapters/sites/` and register conditionally).
4. Tests: capability tier, `getText`, `getSelection` → UTF-16 offsets,
   `replaceRange` (target-only, version bump), IME deferral, idempotent
   `destroy`. Add a fixture under `tests/fixtures/` if it needs a page shape.
5. **Site adapters that touch page internals** must be feature-detected,
   version-gated, isolated, and have a fallback path (§5.1). Never put
   site-specific code in the core engine.

## Adding a rule (Phase 2+)

Custom rules live in `engine/rules/`. Every rule needs positive **and**
negative test cases (false-positive traps). High precision beats high recall.

## Adding a browser-specific enhancement

Put manifest differences in `wxt.config.ts`'s `manifest` function, guarded by
`browser`. Put runtime capability differences behind a feature detector, never
a `browser === 'x'` check in feature code. Keep the shared architecture shared.

## Adding tests

- Unit + integration: Vitest, under `tests/unit` / `tests/integration`
  (`.ts` or `.tsx`). The WXT fake browser (`wxt/testing/fake-browser`) and the
  memoised capability detector are reset before each test by `tests/setup.ts`.
- Browser E2E + visual regression: Playwright, under `e2e/`. Needs
  `npm run build` and `npx playwright install chromium`. Not in `npm run check`
  (kept `npm`-only and reproducible); runs in its own CI job.
- Engine behaviour changes: add or update entries in
  `tests/fixtures/golden-corpus.ts` (§23.3). A new false positive means
  investigating rule precision / dictionary / protected spans — not deleting
  the trap (§23.4).
- Anything touching browser differences: put the difference behind
  `src/platform/browser-capabilities.ts` and add a case to its test + the
  matrix in `docs/BROWSER_SUPPORT.md`.

## Commits & PRs

- Conventional-ish commit subjects are appreciated (`feat:`, `fix:`, `docs:`).
- Reference the PRD section your change relates to where relevant.
- One logical change per PR.

## License

By contributing you agree your contributions are licensed under the MIT
License (`LICENSE`). Don't paste code from incompatibly-licensed projects;
reuse only permissively-licensed components and preserve their notices
(`THIRD_PARTY_NOTICES.md`).
