/**
 * Shared text-geometry primitives.
 *
 * §10.3: every offset in the shared model is a **UTF-16 code-unit offset**
 * against the canonical normalized document snapshot, matching JavaScript
 * string semantics (`String.prototype.length`, `slice`, DOM range offsets).
 * Engine-specific byte / code-point / grapheme indexes are converted at the
 * engine boundary and must never reach these types.
 */

/** A half-open range `[start, end)` in UTF-16 code units. */
export interface TextRange {
  readonly start: number;
  readonly end: number;
}

/** The user's current selection within an editor, in UTF-16 code units. */
export interface TextSelection {
  readonly start: number;
  readonly end: number;
  /**
   * Direction the selection was extended. `forward` means the focus/caret is at
   * `end`; `backward` means it is at `start`; `none` for a collapsed caret.
   */
  readonly direction: 'forward' | 'backward' | 'none';
}

/** Create a normalized {@link TextRange}, clamped to `[0, length]` and ordered. */
export function makeRange(a: number, b: number, length: number): TextRange {
  const lo = Math.max(0, Math.min(a, b));
  const hi = Math.min(length, Math.max(a, b));
  return { start: Math.min(lo, hi), end: hi };
}

/** True when the two ranges share at least one code-unit position. */
export function rangesOverlap(a: TextRange, b: TextRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Length of a range in UTF-16 code units (never negative). */
export function rangeLength(r: TextRange): number {
  return Math.max(0, r.end - r.start);
}
