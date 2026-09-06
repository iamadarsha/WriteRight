# WriteRight Permissions

Every permission WriteRight requests, why it needs it, and what it deliberately
does **not** request. Audited before the 1.0 release (§5.4) and enforced on
every build by `scripts/validate-manifest.ts`.

## Requested at install

| Manifest key | Value | Feature it enables | Why it is unavoidable |
|---|---|---|---|
| `permissions` | `storage` | Your preferences, per-site rules, personal dictionary, and the opt-in AI chat transcript, stored **locally** (`storage.local` / `storage.session`). | An extension cannot persist any setting without it. Nothing stored is ever synced to a server. |
| `host_permissions` | `*://*/*` (http/https only) | The content script that detects text fields and shows suggestions on the pages you type on. | A universal writing assistant has to be able to run on the sites where you write. It is limited to `http`/`https` — never `chrome:`, `about:`, extension pages, or web stores. You can turn WriteRight off per-site or globally, and the popup always shows whether it is active on the current site. This is the "always live" claim from the product spec, made **explicitly conditional** on this grant (§25). |

## Local AI network access

WriteRight does **not** request a separate runtime permission for local AI.
The `host_permissions` grant above (`*://*/*`, http/https) already covers
`localhost` and `127.0.0.1`, so there is nothing left for Chrome to prompt
for — declaring an `optional_host_permissions` entry for the same origins
would only be redundant with that grant (and Chrome's own manifest validator
flags exactly that overlap as a warning).

Local AI is still off by default and stays off until you turn on "Local AI
features" in Settings. What actually restricts it once you do:

- The endpoint you configure (Ollama / LM Studio / a custom server) is
  checked in code against a loopback allowlist (`src/ai/loopback.ts`) —
  `localhost` / `127.0.0.1` only. Anything else is rejected before any
  request is made.
- `verify:no-remote-ai` scans every build for a non-loopback inference URL
  and fails CI if one is found.
- Chrome's built-in on-device AI needs no permission at all.

## Manifest keys that are not permissions

| Key | Purpose |
|---|---|
| `commands` | Keyboard shortcuts: `Alt+Shift+E` opens the popup, `Alt+Shift+W` toggles the sidebar. The in-page `Alt+W` hotkey works even where `commands` is unsupported (some Safari builds). |
| `action` | The toolbar button and popup. |
| `browser_specific_settings.gecko.data_collection_permissions: ["none"]` | Firefox 142+ data-collection disclosure — WriteRight collects nothing, and says so. |

## Permissions WriteRight does **not** request

`activeTab`, `scripting`, `tabs` (beyond reading the active tab's URL for the
popup, which needs no permission), `cookies`, `webRequest`, `webNavigation`,
`history`, `bookmarks`, `downloads`, `clipboardRead`/`clipboardWrite`,
`nativeMessaging`, `management`, `proxy`, `debugger`, `<all_urls>`, `file://`,
`ftp://`, or any privileged scheme.

## What the broad host access is **not** used for

- No page is read except the text fields you focus. Password, credential,
  hidden, disabled and code-editor fields are excluded before any adapter is
  created (`core/field-capability-detector.ts`).
- No page content is sent anywhere. Analysis runs in the extension's own
  background worker (an in-browser message, never a network call).
- No cross-site data is combined, and browsing history is never inspected.

## Verifying this yourself

```bash
npm run build:all
npm run verify:manifest      # permission / CSP / optional-host audit
npm run verify:no-remote-ai  # no non-loopback inference URL in the build
npm run verify:safe-apis     # no eval / remote <script> / injection sinks
```
