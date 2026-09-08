/**
 * Spike 3.1 — the offscreen document that runs the Chrome Prompt API.
 *
 * A plain DOM context where `LanguageModel` is expected to be available even
 * when it is not in the service worker. It owns one {@link PromptApiAdapter}
 * and answers `probe` / `generate` / `startDownload` from the worker over
 * `runtime` messages. Loaded only in a build made with `WXT_EXP_OFFSCREEN_AI=1`
 * (which also adds the `offscreen` permission).
 */

import { browser } from '#imports';
import { PromptApiAdapter } from '@/ai/prompt-api-adapter';
import {
  isOffscreenRequest,
  type OffscreenResponse,
} from '@/ai/offscreen-protocol';

const adapter = new PromptApiAdapter();

browser.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse: (r: OffscreenResponse) => void) => {
    if (!isOffscreenRequest(message)) return false;
    void (async () => {
      try {
        if (message.op === 'probe') {
          sendResponse({ ok: true, op: 'probe', probe: await adapter.probe() });
        } else if (message.op === 'startDownload') {
          sendResponse({
            ok: true,
            op: 'startDownload',
            download: await adapter.startDownload(),
          });
        } else {
          const raw = await adapter.generate({
            ...message.input,
            signal: new AbortController().signal,
          });
          sendResponse({ ok: true, op: 'generate', raw });
        }
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return true; // async response
  },
);
