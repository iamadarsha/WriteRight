/**
 * Non-streaming fallback for the streaming orchestrator (§4.8).
 *
 * Wraps an adapter that only implements {@link AiAdapter.generate} so the rest
 * of WriteRight can treat every provider as a stream: one `delta` with the
 * whole answer, then `done`. A thrown error becomes a single terminal `error`
 * — never a `done` — so a failed call can't be mistaken for a usable result.
 */

import type { AiAdapter, AiGenerateInput, AiStreamChunk } from './ai-types';

export async function* streamViaGenerate(
  adapter: Pick<AiAdapter, 'generate'>,
  input: AiGenerateInput,
): AsyncIterable<AiStreamChunk> {
  let raw;
  try {
    raw = await adapter.generate(input);
  } catch (err) {
    yield {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
    return;
  }
  yield { type: 'delta', text: raw.raw };
  yield { type: 'done', raw };
}
