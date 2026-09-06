/**
 * Analysis scheduling primitives (§17.2).
 *
 * WriteRight never runs expensive work synchronously on every keystroke. These
 * helpers provide: trailing debounce, cancellation, and idle coalescing.
 */

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Cancel a pending call. */
  cancel(): void;
  /** Invoke immediately with the latest args if a call is pending. */
  flush(): void;
}

/**
 * Trailing-edge debounce. The wrapped function runs `waitMs` after the last
 * call. `maxWaitMs`, when set, guarantees it runs at least that often under a
 * sustained call stream.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
  maxWaitMs?: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstCallAt = 0;
  let lastArgs: A | undefined;

  const run = (): void => {
    timer = undefined;
    firstCallAt = 0;
    const args = lastArgs;
    lastArgs = undefined;
    if (args) fn(...args);
  };

  const debounced = ((...args: A): void => {
    lastArgs = args;
    const now = Date.now();
    if (firstCallAt === 0) firstCallAt = now;
    if (timer !== undefined) clearTimeout(timer);

    const remainingToMax =
      maxWaitMs === undefined
        ? Number.POSITIVE_INFINITY
        : Math.max(0, maxWaitMs - (now - firstCallAt));
    timer = setTimeout(run, Math.min(waitMs, remainingToMax));
  }) as Debounced<A>;

  debounced.cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    firstCallAt = 0;
    lastArgs = undefined;
  };

  debounced.flush = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      run();
    }
  };

  return debounced;
}

/**
 * Run `fn` on the next idle slice, coalescing multiple requests into one.
 * Falls back to a short timeout where `requestIdleCallback` is unavailable.
 */
export function coalesceIdle(fn: () => void, timeoutMs = 250): () => void {
  let scheduled = false;
  const ric = (
    globalThis as {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number },
      ) => number;
    }
  ).requestIdleCallback;

  return () => {
    if (scheduled) return;
    scheduled = true;
    const invoke = (): void => {
      scheduled = false;
      fn();
    };
    if (typeof ric === 'function') ric(invoke, { timeout: timeoutMs });
    else setTimeout(invoke, 0);
  };
}
