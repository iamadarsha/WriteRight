/**
 * `AI_STREAM` — a long-lived port for streaming a generative run from the
 * background service worker to a page (§4.8, §26).
 *
 * Why a port and not the request/response bus: a rewrite can take tens of
 * seconds and we want tokens on screen as they arrive. An open
 * `runtime.connect` port plus message activity (each `delta`, plus a 20 s
 * `ping`) keeps the MV3 service worker alive for the whole generation — no
 * `chrome.alarms`, no new permission.
 *
 * Safety is unchanged from `AI_RUN`: `delta` text is display-only, and the
 * single terminal `final` carries the validated {@link AiRunResponse} that
 * `AiService.runStream` produced (§4.8, §14.6). The service worker never trusts
 * the `start` payload — it is size-capped and shape-checked here.
 */

import { browser } from '#imports';
import type { AiBackend } from '@/core/ai-backend';
import type { AiRunResponse } from '@/types/messages';
import { createLogger } from '@/utils/logger';

const log = createLogger('ai-stream');

export const AI_STREAM_PORT = 'wr-ai-stream';
const PING_MS = 20_000;
const MAX_SELECTION = 200_000;

/** client → service worker */
type ClientMessage =
  | {
      readonly type: 'start';
      readonly requestId: string;
      readonly task: string;
      readonly selection: string;
      readonly whole: boolean;
      readonly formatHint?: string;
    }
  | { readonly type: 'cancel' };

/** service worker → client */
type ServerMessage =
  | { readonly type: 'delta'; readonly text: string }
  | { readonly type: 'final'; readonly response: AiRunResponse }
  | { readonly type: 'ping' };

/** The slice of `runtime.Port` this module uses — keeps it testable. */
export interface StreamPort {
  readonly name?: string;
  postMessage(message: unknown): void;
  disconnect(): void;
  readonly onMessage: {
    addListener(cb: (message: unknown) => void): void;
  };
  readonly onDisconnect: {
    addListener(cb: () => void): void;
  };
}

function safePost(port: StreamPort, message: ServerMessage): void {
  try {
    port.postMessage(message);
  } catch {
    /* port already closed — the generation will notice via the abort */
  }
}

function blocked(message: string): AiRunResponse {
  return { status: 'blocked', mode: 'unsupported', message };
}

/* ---- service-worker side ------------------------------------------------ */

/**
 * Drive one {@link AiBackend.runStream} for the lifetime of `port`. Register
 * with `browser.runtime.onConnect` (filtered on {@link AI_STREAM_PORT}).
 */
export function handleAiStreamPort(port: StreamPort, ai: AiBackend): void {
  let requestId: string | null = null;
  let stopped = false;
  let ping: ReturnType<typeof setInterval> | undefined;

  const stopPing = (): void => {
    if (ping !== undefined) {
      clearInterval(ping);
      ping = undefined;
    }
  };
  const finish = (): void => {
    stopped = true;
    stopPing();
    if (requestId) ai.cancel(requestId);
  };

  port.onDisconnect.addListener(finish);

  port.onMessage.addListener((raw: unknown) => {
    const msg = raw as Partial<ClientMessage> | null;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'cancel') {
      finish();
      return;
    }
    if (msg.type !== 'start' || requestId !== null) return;

    const id = typeof msg.requestId === 'string' ? msg.requestId : '';
    const task = typeof msg.task === 'string' ? msg.task : '';
    if (id === '' || task === '') {
      safePost(port, {
        type: 'final',
        response: blocked('Malformed request.'),
      });
      return;
    }
    requestId = id;
    const selection =
      typeof msg.selection === 'string'
        ? msg.selection.slice(0, MAX_SELECTION)
        : '';
    const formatHint =
      typeof msg.formatHint === 'string' ? msg.formatHint : undefined;

    ping = setInterval(() => safePost(port, { type: 'ping' }), PING_MS);

    void (async () => {
      try {
        for await (const chunk of ai.runStream({
          requestId: id,
          task,
          selection,
          whole: msg.whole === true,
          formatHint,
        })) {
          if (stopped) break;
          if (chunk.type === 'delta') {
            safePost(port, { type: 'delta', text: chunk.text });
          } else {
            safePost(port, { type: 'final', response: chunk.response });
          }
        }
      } catch (err) {
        log.warn('AI stream port failed', (err as Error).message);
        if (!stopped) {
          safePost(port, {
            type: 'final',
            response: blocked(
              'Local AI failed. Your offline writing tools are still working.',
            ),
          });
        }
      } finally {
        stopPing();
        try {
          port.disconnect();
        } catch {
          /* already gone */
        }
      }
    })();
  });
}

/* ---- page side -------------------------------------------------------- */

export interface AiStreamInput {
  readonly requestId: string;
  readonly task: string;
  readonly selection: string;
  readonly whole: boolean;
  readonly formatHint?: string;
}

export interface AiStreamHandlers {
  onDelta(text: string): void;
  /** Called exactly once — with the validated response, or a synthesized
   *  blocked one if the connection dropped before a real `final`. */
  onFinal(response: AiRunResponse): void;
}

export interface AiStreamHandle {
  cancel(): void;
}

/**
 * Open an `AI_STREAM` port, start a generation, and dispatch its chunks.
 * `connect` is injectable for tests; in production it is
 * `browser.runtime.connect`.
 */
export function connectAiStream(
  input: AiStreamInput,
  handlers: AiStreamHandlers,
  connect: () => StreamPort = () =>
    browser.runtime.connect({ name: AI_STREAM_PORT }),
): AiStreamHandle {
  let settled = false;
  const settle = (response: AiRunResponse): void => {
    if (settled) return;
    settled = true;
    handlers.onFinal(response);
  };

  let port: StreamPort;
  try {
    port = connect();
  } catch {
    settle(blocked('Could not reach local AI. Offline tools still work.'));
    return { cancel: () => undefined };
  }

  port.onMessage.addListener((raw: unknown) => {
    const msg = raw as ServerMessage | null;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'delta') {
      if (!settled) handlers.onDelta(msg.text);
    } else if (msg.type === 'final') {
      settle(msg.response);
      try {
        port.disconnect();
      } catch {
        /* fine */
      }
    }
    // 'ping' is keep-alive only.
  });

  port.onDisconnect.addListener(() => {
    settle(
      blocked(
        'The local AI connection closed. Your offline writing tools are still working.',
      ),
    );
  });

  try {
    port.postMessage({ type: 'start', ...input } satisfies ClientMessage);
  } catch {
    settle(blocked('Could not start local AI. Offline tools still work.'));
  }

  return {
    cancel: () => {
      try {
        port.postMessage({ type: 'cancel' } satisfies ClientMessage);
      } catch {
        /* ignore */
      }
      try {
        port.disconnect();
      } catch {
        /* ignore */
      }
      // Chrome fires `onDisconnect` only on the *other* end when we disconnect
      // ourselves, so settle here rather than waiting for an event that won't
      // come.
      settle(blocked('Cancelled.'));
    },
  };
}
