/**
 * Spike 3.1 — a drop-in for {@link PromptApiAdapter} that runs the model in an
 * offscreen document (see `entrypoints/offscreen/main.ts`) instead of the
 * service worker.
 *
 * Selected by {@link CapabilityDetector} when `EXPERIMENTS.offscreenPromptApi`
 * is on. Non-streaming only for the spike — `generateStream` falls back to the
 * base `generate` via the shim, and there is no cancellation across the
 * offscreen boundary yet (both noted in docs/PHASE-3-SPIKES.md).
 */

import type {
  AiAdapter,
  AiGenerateInput,
  AiProbeResult,
  AiRawOutput,
} from './ai-types';
import {
  OFFSCREEN_MSG,
  type OffscreenRequest,
  type OffscreenResponse,
} from './offscreen-protocol';

interface OffscreenApi {
  createDocument(opts: {
    url: string;
    reasons: string[];
    justification: string;
  }): Promise<void>;
  hasDocument?(): Promise<boolean>;
  closeDocument?(): Promise<void>;
}

function offscreen(): OffscreenApi | null {
  const c = (globalThis as { chrome?: { offscreen?: OffscreenApi } }).chrome;
  return c?.offscreen ?? null;
}

async function send(req: OffscreenRequest): Promise<OffscreenResponse> {
  const runtime = (
    globalThis as {
      chrome?: { runtime?: { sendMessage(m: unknown): Promise<unknown> } };
    }
  ).chrome?.runtime;
  if (!runtime) return { ok: false, error: 'no chrome.runtime' };
  const res = await runtime.sendMessage(req);
  return (
    (res as OffscreenResponse | undefined) ?? { ok: false, error: 'no reply' }
  );
}

let ensuring: Promise<void> | null = null;

async function ensureDocument(): Promise<void> {
  const api = offscreen();
  if (!api) throw new Error('this browser has no chrome.offscreen');
  if (ensuring) return ensuring;
  ensuring = (async () => {
    try {
      if (api.hasDocument && (await api.hasDocument())) return;
      await api.createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification:
          'The Chrome built-in on-device language model is not available in the extension service worker.',
      });
    } catch (err) {
      // "Only a single offscreen document may be created" — already there.
      if (!/single offscreen document/i.test(String(err))) throw err;
    } finally {
      ensuring = null;
    }
  })();
  return ensuring;
}

export class OffscreenPromptApiAdapter implements AiAdapter {
  readonly id = 'chrome' as const;

  async probe(): Promise<AiProbeResult> {
    try {
      await ensureDocument();
      const res = await send({ kind: OFFSCREEN_MSG, op: 'probe' });
      if (res.ok && res.op === 'probe') return res.probe;
      return {
        id: this.id,
        state: 'unavailable',
        detail: res.ok ? 'unexpected offscreen reply' : res.error,
      };
    } catch (err) {
      return {
        id: this.id,
        state: 'unavailable',
        detail: `offscreen: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async generate(input: AiGenerateInput): Promise<AiRawOutput> {
    await ensureDocument();
    const { system, user, wantJson, model, maxOutputChars } = input;
    const res = await send({
      kind: OFFSCREEN_MSG,
      op: 'generate',
      input: { system, user, wantJson, model, maxOutputChars },
    });
    if (res.ok && res.op === 'generate') return res.raw;
    throw new Error(res.ok ? 'unexpected offscreen reply' : res.error);
  }

  async startDownload(): Promise<{ ok: boolean; error?: string }> {
    try {
      await ensureDocument();
      const res = await send({ kind: OFFSCREEN_MSG, op: 'startDownload' });
      if (res.ok && res.op === 'startDownload') return res.download;
      return { ok: false, error: res.ok ? 'unexpected reply' : res.error };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
