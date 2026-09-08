/**
 * Spike 3.1 — message protocol between the service worker and an offscreen
 * document that hosts the Chrome Prompt API (`LanguageModel`), which is not
 * guaranteed available in an MV3 worker (see `prompt-api-adapter.ts` §14.3).
 */

import type { AiProbeResult, AiRawOutput } from './ai-types';

export const OFFSCREEN_MSG = 'wr-offscreen-prompt' as const;

/** `AiGenerateInput` minus the non-serialisable `AbortSignal`. */
export interface SerializableGenerateInput {
  readonly system: string;
  readonly user: string;
  readonly wantJson: boolean;
  readonly model: string | null;
  readonly maxOutputChars: number;
}

export type OffscreenRequest =
  | { kind: typeof OFFSCREEN_MSG; op: 'probe' }
  | { kind: typeof OFFSCREEN_MSG; op: 'startDownload' }
  | {
      kind: typeof OFFSCREEN_MSG;
      op: 'generate';
      input: SerializableGenerateInput;
    };

export type OffscreenResponse =
  | { ok: true; op: 'probe'; probe: AiProbeResult }
  | { ok: true; op: 'startDownload'; download: { ok: boolean; error?: string } }
  | { ok: true; op: 'generate'; raw: AiRawOutput }
  | { ok: false; error: string };

export function isOffscreenRequest(v: unknown): v is OffscreenRequest {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { kind?: unknown }).kind === OFFSCREEN_MSG
  );
}
