/**
 * Opaque id generation for sessions, adapters and suggestions.
 * Uses `crypto.randomUUID` where available, with a deterministic-enough fallback.
 */

let counter = 0;

export function newId(prefix: string): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return `${prefix}_${c.randomUUID()}`;
  }
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}
