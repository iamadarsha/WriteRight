# Releasing WriteRight

WriteRight's release is an **open-source, no-cost artifact first** (§5.10).
Store publication (Chrome Web Store, AMO, Safari via the App Store) is an
optional distribution channel, never an architectural dependency: anyone can
clone, `npm run check`, `npm run build:all`, and sideload.

## Toolchain of record (§24.2)

| Thing | Version | Pinned by |
|---|---|---|
| Node | see `.nvmrc` (24.14.0) | `.nvmrc`, `engines` |
| Package manager | npm (bundled with Node) | `package-lock.json` |
| Extension framework | WXT (exact) | `package-lock.json` |
| Language engine | `harper.js` (exact) + its WASM (SHA-256 pinned) | `package-lock.json`, `public/harper/VERSION.json` |
| All other deps | exact-pinned | `package-lock.json` (`save-exact`) |

No Rust/WASM toolchain is needed — the Harper WASM is consumed as a pinned
published artifact, not compiled here.

## The release checklist

1. **Green gate.** `npm run check` passes locally and in CI (they run the same
   steps).
2. **Reproducible build.** `npm run verify:reproducible` — builds twice and
   asserts byte-identical output.
3. **Security review (§5.5).**
   - `npm run audit:security` (secret scan, no-text-logging, manifest audit,
     no-remote-AI, dangerous-API scan) — all green.
   - `npm audit --omit=dev` — review; document any accepted advisory in
     `SECURITY.md`.
   - `npm run sbom` — regenerate `sbom.json`; commit if it changed.
   - Manual: content-script isolation, model-output sanitisation, storage
     review, loopback-only enforcement, no text logging (see `SECURITY.md`).
4. **Permission audit (§5.4).** `PERMISSIONS.md` still matches the built
   manifests (`npm run verify:manifest`).
5. **Browser smoke matrix (§5.1).** Run `docs/BROWSER_SUPPORT.md` on Chrome,
   Edge, Firefox and Safari; record build numbers and any Tier downgrades.
6. **Browser E2E (§5.6, §23.2).** `npm run build && npm run test:e2e`
   (Playwright, `--project=e2e`) — the packaged extension driven in a real
   Chromium: engine analysis, keyboard apply, password-field exclusion,
   sidebar, popup, options, dictionary persistence. This job also runs in CI.
7. **Visual regression (§5.6, §9.2).** `npm run test:visual`. Snapshots are
   render- and platform-specific (`e2e/__screenshots__/…-<platform>.png`), so
   they are **not** run in CI. On the release platform: regenerate with
   `npm run test:visual:update`, eyeball every diff for light / dark /
   high-contrast / reduced-motion / narrow / keyboard-focus and the in-page
   underline + sidebar shots, then commit the reviewed set.
8. **Docs truth pass (§30, release gate).** README, ARCHITECTURE, PRIVACY,
   SECURITY, PERMISSIONS, CONTRIBUTING and the store listing describe the code
   as it actually is. `PRIVACY.md` is truthful and dated to this build.
9. **Version.** Bump `package.json` `version`; update `CHANGELOG.md` and
   `RELEASE_NOTES.md`. WXT reads the version from `package.json`.
10. **Build artifacts.**
    ```bash
    npm run zip           # writeright-<v>-chrome.zip
    npm run zip:firefox   # writeright-<v>-firefox.zip + sources zip (AMO)
    ```
11. **Tag & publish.** Git tag `v<version>`, attach the zips + `sbom.json` to
    the GitHub release. Store submissions are optional and separate.

## Safari packaging (§5.3)

Kept out of the core source — it needs Apple's tooling and an Apple Developer
account, neither of which the extension itself depends on.

```bash
npm run build            # produces .output/chrome-mv3 (Safari converts from MV3)
xcrun safari-web-extension-converter .output/chrome-mv3 \
  --project-location .output/safari --app-name WriteRight --bundle-identifier app.writeright
```

Then in Xcode: build the generated project, enable the extension in
Safari → Settings → Extensions, and run the `docs/BROWSER_SUPPORT.md` smoke
list plus the Safari extras. Distribution (App Store or notarised direct
download) follows Apple's process and is documented in the generated project,
not here.

## No-cost path (§5.10)

Every check above runs locally with `npm`. There is no paid CI service, no
hosted build, and no WriteRight account. The GitHub Actions workflow is a
convenience mirror of `npm run check`, not a gate contributors can't reproduce.
