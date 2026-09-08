/**
 * Read a UTF-8 `ReadableStream` line by line for the streaming adapters (§4.8).
 *
 * Shared by the Ollama (NDJSON) and OpenAI-compatible (SSE) readers. Yields
 * complete lines without their trailing newline, then a final non-empty
 * partial. Stops on `signal`; throws `Error('timeout')` when no bytes arrive
 * for `idleMs` — an *inactivity* limit, so a slow-but-alive model is fine while
 * a dead connection is caught quickly.
 */

export interface StreamLineOptions {
  readonly signal: AbortSignal;
  readonly idleMs: number;
}

export async function* readStreamLines(
  body: ReadableStream<Uint8Array>,
  opts: StreamLineOptions,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      if (opts.signal.aborted) return;
      const { value, done } = await readWithIdle(reader, opts);
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (line !== '') yield line;
      }
    }
    buf += decoder.decode();
    const tail = buf.trim();
    if (tail !== '') yield tail;
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

function readWithIdle(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  opts: StreamLineOptions,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const idle = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), opts.idleMs);
  });
  const aborted = new Promise<never>((_, reject) => {
    const fail = (): void =>
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    if (opts.signal.aborted) fail();
    else opts.signal.addEventListener('abort', fail, { once: true });
  });
  return Promise.race([reader.read(), idle, aborted]).finally(() =>
    clearTimeout(timer),
  );
}

/** True when an error (or the signal state) means the caller cancelled. */
export function isAbortError(err: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  return /\babort/i.test(err instanceof Error ? err.message : String(err));
}
