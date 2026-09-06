/**
 * The cross-context messaging bus (§26).
 *
 * - `sendToBackground` — request/response from content, popup or options.
 * - `handleBackgroundRequests` — the single background listener; validates,
 *   dispatches, and always replies with a `MessageResult` envelope.
 * - `broadcastToContent` / `onBroadcast` — fire-and-forget background→content.
 *
 * Envelope shape on the wire: `{ __wr: 1, kind: 'request'|'broadcast', message }`.
 * The `__wr` tag lets us ignore unrelated extension messages cheaply.
 */

import { browser } from '#imports';
import type {
  BroadcastMessage,
  MessageResult,
  RequestMessage,
  RequestType,
  ResponseFor,
} from '@/types/messages';
import { isBroadcastMessage, isRequestMessage } from './validate';
import { createLogger } from '@/utils/logger';
import { isEligibleWebPage } from '@/utils/url';

const log = createLogger('messaging');
const TAG = 1 as const;

/**
 * MV3 service workers suspend after ~30s idle and must spin back up on the
 * next message. Chrome sometimes rejects the message that wakes them with
 * "Receiving end does not exist" / "message port closed" instead of queuing
 * it — a known, transient race, not a real absence of a listener. Retrying
 * briefly recovers these silently instead of dropping the request (and
 * whatever it was for — analysis, a setting change) on the floor (§26).
 */
const RETRYABLE_ERROR = /receiving end does not exist|message port closed/i;
const RETRY_DELAYS_MS = [80, 250, 600];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RequestEnvelope {
  __wr: typeof TAG;
  kind: 'request';
  message: RequestMessage;
}
interface BroadcastEnvelope {
  __wr: typeof TAG;
  kind: 'broadcast';
  message: BroadcastMessage;
}
type Envelope = RequestEnvelope | BroadcastEnvelope;

function isEnvelope(v: unknown): v is Envelope {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { __wr?: unknown }).__wr === TAG &&
    ((v as { kind?: unknown }).kind === 'request' ||
      (v as { kind?: unknown }).kind === 'broadcast')
  );
}

/* ---- sender side (content / popup / options) ------------------------- */

export async function sendToBackground<T extends RequestType>(
  message: Extract<RequestMessage, { type: T }>,
): Promise<MessageResult<T>> {
  const envelope: RequestEnvelope = { __wr: TAG, kind: 'request', message };

  for (let attempt = 0; ; attempt++) {
    try {
      const reply: unknown = await browser.runtime.sendMessage(envelope);
      if (
        typeof reply !== 'object' ||
        reply === null ||
        typeof (reply as { ok?: unknown }).ok !== 'boolean'
      ) {
        return { ok: false, error: 'no response from background' };
      }
      return reply as MessageResult<T>;
    } catch (err) {
      const errMessage = (err as Error).message;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay !== undefined && RETRYABLE_ERROR.test(errMessage)) {
        log.debug('sendToBackground retrying after wake-up race', {
          attempt,
          type: message.type,
        });
        await sleep(delay);
        continue;
      }
      log.warn('sendToBackground failed', errMessage);
      return { ok: false, error: errMessage };
    }
  }
}

/* ---- background side ------------------------------------------------- */

/** Minimal structural view of the parts of a message sender we use (§26). */
export interface MessageSender {
  readonly tab?: { readonly id?: number; readonly url?: string };
  readonly url?: string;
  readonly id?: string;
  readonly origin?: string;
}

export type RequestHandlers = {
  [T in RequestType]: (
    message: Extract<RequestMessage, { type: T }>,
    sender: MessageSender,
  ) => Promise<ResponseFor<T>> | ResponseFor<T>;
};

export function handleBackgroundRequests(
  handlers: RequestHandlers,
): () => void {
  // `sendResponse` + `return true` is the portable pattern: it is the canonical
  // Chrome contract and is understood by every polyfill and by WXT's test
  // fake browser. Returning `false` leaves the message for other listeners
  // (e.g. the broadcast listener).
  const listener = (
    raw: unknown,
    sender: MessageSender,
    sendResponse: (response: MessageResult<RequestType>) => void,
  ): boolean => {
    if (!isEnvelope(raw) || raw.kind !== 'request') return false;

    if (!isRequestMessage(raw.message)) {
      log.warn(
        'rejected malformed request',
        (raw.message as { type?: string })?.type,
      );
      sendResponse({ ok: false, error: 'invalid or unknown message' });
      return true;
    }

    const message = raw.message;
    void (async (): Promise<void> => {
      try {
        const handler = handlers[message.type] as (
          m: RequestMessage,
          s: MessageSender,
        ) => unknown;
        const data = await handler(message, sender);
        sendResponse({ ok: true, data } as MessageResult<RequestType>);
      } catch (err) {
        log.error('handler threw', message.type, err);
        sendResponse({ ok: false, error: (err as Error).message });
      }
    })();
    return true; // response will be sent asynchronously
  };

  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}

/** Send a broadcast to every eligible http/https tab (§26, §6.3). */
export async function broadcastToContent(
  message: BroadcastMessage,
): Promise<void> {
  const envelope: BroadcastEnvelope = { __wr: TAG, kind: 'broadcast', message };
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null || !tab.url || !isEligibleWebPage(tab.url).eligible) {
        return;
      }
      try {
        await browser.tabs.sendMessage(tab.id, envelope);
      } catch {
        // No content script in that tab yet — expected, ignore.
      }
    }),
  );
}

/** Deliver a broadcast to the active tab's content script (popup/options → page). */
export async function sendToActiveTabContent(
  message: BroadcastMessage,
): Promise<void> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab?.id == null || !tab.url || !isEligibleWebPage(tab.url).eligible)
    return;
  const envelope: BroadcastEnvelope = { __wr: TAG, kind: 'broadcast', message };
  try {
    await browser.tabs.sendMessage(tab.id, envelope);
  } catch {
    /* no content script in that tab */
  }
}

/* ---- content side -------------------------------------------------- */

export function onBroadcast(
  callback: (message: BroadcastMessage) => void,
): () => void {
  const listener = (raw: unknown): void => {
    if (!isEnvelope(raw) || raw.kind !== 'broadcast') return;
    if (!isBroadcastMessage(raw.message)) return;
    callback(raw.message);
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
