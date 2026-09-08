/**
 * Keyed in-process serialisation (§20.4).
 *
 * `storage.defineItem` has no compare-and-swap, so a read-modify-write cycle
 * (`getSettings()` → merge a patch → `setValue()`) run twice in quick
 * succession — two rapid toggles, or two tabs sharing one service worker —
 * loses the first write. `runExclusive(key, fn)` chains all calls for a given
 * key so each sees the previous one's result.
 *
 * Scope is this JS context only. Cross-process races (two browser windows, each
 * with its own SW) are out of scope — the storage layer already falls back to
 * last-known-good on a corrupt read (§20.4).
 */

const tails = new Map<string, Promise<unknown>>();

/** Run `fn` after every earlier `runExclusive` call with the same `key` settles. */
export function runExclusive<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prior = tails.get(key) ?? Promise.resolve();
  // Run `fn` whether `prior` fulfilled or rejected — one failed write must not
  // block every later write on that key.
  const result = prior.then(fn, fn);
  const tail = result.catch(() => undefined);
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return result;
}
