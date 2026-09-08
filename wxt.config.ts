import { defineConfig } from 'wxt';

// WriteRight extension build configuration.
// See https://wxt.dev/api/config.html
//
// Universal content script on ordinary web pages only, popup + options
// entrypoints, shared Shadow DOM UI host, background engine + optional local
// AI. Manifest differences between browsers are isolated here (§25.1, §5.2);
// the source architecture stays shared.
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'WriteRight',
    description:
      'Privacy-first, local-first writing assistant. Spelling, grammar, ' +
      'readability, tone and style checks that run on your device — plus ' +
      'optional on-device / local AI. No account, no subscription, no telemetry.',
    // §6.5 — the local Harper engine is WebAssembly. MV3's default CSP
    // (`script-src 'self'`) blocks WASM compilation, so add the minimal
    // `wasm-unsafe-eval` keyword and nothing else. This is NOT `unsafe-eval`:
    // it permits WebAssembly only, no JS eval, no remote code. WASM binaries
    // stay local and pinned (see scripts/sync-harper-assets.ts).
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    // §6.4 / §25 Permissions minimization — request only what the build uses.
    //  - storage: durable preferences, personal dictionary, per-site rules,
    //    opt-in AI chat transcript.
    permissions: ['storage'],
    // §0.4 / §25 "Always live" is permission-conditional. We request broad
    // host access for universal writing assistance, limited to normal
    // http/https pages. Users can disable WriteRight per-site or globally.
    //
    // This already covers localhost/127.0.0.1, so §4.3/§6.3 local-AI
    // connectivity has no separate optional_host_permissions entry — one
    // would be redundant with this grant (Chrome's manifest validator flags
    // exactly that overlap as a warning). The loopback-only restriction is
    // enforced in code instead (src/ai/loopback.ts), not by a narrower
    // permission scope.
    host_permissions: ['*://*/*'],
    action: {
      default_title: 'WriteRight',
    },
    // §5.2 Keyboard commands. `_execute_action` opens the popup on every
    // Chromium/Firefox build; `toggle-sidebar` mirrors the in-page Alt+W
    // hotkey through the browser's own shortcut system. Safari support for
    // browser.commands varies, so the in-page hotkey remains the guarantee.
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+E' },
        description: 'Open the WriteRight popup',
      },
      'toggle-sidebar': {
        suggested_key: { default: 'Alt+Shift+W' },
        description: 'Toggle the WriteRight sidebar',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'writeright@writeright.app',
              // `data_collection_permissions` is a Firefox 142+ manifest key.
              strict_min_version: '142.0',
              // §6.9 — WriteRight collects nothing. Declare that honestly for
              // Firefox's built-in data-consent requirement.
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
  // Keep our own modules out of WXT auto-import magic: we import explicitly so
  // the code is testable in isolation and greppable. WXT still auto-imports
  // its own APIs (defineBackground, defineContentScript, browser, storage).
  imports: {
    eslintrc: {
      enabled: 9,
    },
  },
  vite: () => ({
    build: {
      // Never inline binary assets (§17.6). The Harper WASM (~16 MB) must be an
      // emitted `.wasm` file so the browser streams + caches it, rather than a
      // multi-MB base64 string re-parsed on every service-worker cold start.
      assetsInlineLimit: 0,
      // The popup / options pages are tiny and load instantly; the injected
      // `<link rel="modulepreload" crossorigin>` hints buy nothing and Chrome
      // logs a "cross-world extension resource mismatch" warning for the
      // `crossorigin` attribute on a same-origin extension URL. Drop them.
      modulePreload: false,
    },
  }),
});
