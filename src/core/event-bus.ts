/**
 * A tiny typed, synchronous event bus for in-process (content-script world)
 * coordination between the text-field manager, adapters and the UI layer.
 *
 * This is **not** the cross-context messaging layer — that is `messaging/`
 * (§26). This bus never crosses the isolated-world boundary.
 */

export type Listener<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  #listeners = new Map<keyof Events, Set<Listener<unknown>>>();

  on<K extends keyof Events>(
    type: K,
    listener: Listener<Events[K]>,
  ): () => void {
    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(listener as Listener<unknown>);
    return () => {
      this.#listeners.get(type)?.delete(listener as Listener<unknown>);
    };
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.#listeners.get(type);
    if (!set) return;
    // Copy so listeners can unsubscribe during dispatch without skipping peers.
    for (const listener of [...set]) {
      (listener as Listener<Events[K]>)(payload);
    }
  }

  /** Remove every listener — used on teardown (§5.3 idempotent lifecycle). */
  clear(): void {
    this.#listeners.clear();
  }
}
