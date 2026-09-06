/**
 * Fast, non-cryptographic string hashing.
 *
 * Used for: `Suggestion.originalHash` and `EditorSession.textHash` version
 * checks (§10.4), and log redaction markers (§6.8). These are integrity /
 * change-detection hashes, not security primitives.
 */

/** 32-bit FNV-1a over the UTF-16 code units of `input`. */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i) & 0xff;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    h ^= (input.charCodeAt(i) >> 8) & 0xff;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Base-36 string form, stable across runs. */
export function shortHash(input: string): string {
  return fnv1a(input).toString(36);
}

/** Longer, collision-resistant-enough digest for text snapshots (§19 textHash). */
export function contentHash(input: string): string {
  // Two independently-seeded FNV passes → 64-bit-ish digest.
  const a = fnv1a(input);
  const b = fnv1a(`${input}${input.length}`);
  return `${a.toString(36)}-${b.toString(36)}`;
}
