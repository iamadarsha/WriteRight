/**
 * Canonical text normalization (§10.3).
 *
 * The shared model works on a normalized snapshot with LF line endings. The
 * normalization must be **reversible**: given an offset in the normalized text
 * we must be able to recover the exact offset in the source the editor uses,
 * so a suggestion can be applied to the source editor precisely (§10.3, §10.4).
 *
 * All offsets are UTF-16 code units (§10.3).
 */

export interface NormalizedText {
  /** The normalized snapshot (LF line endings). */
  readonly text: string;
  /** `true` when normalization changed nothing (fast path). */
  readonly identity: boolean;
  /** Map a normalized offset back to the source string offset. */
  toSource(normalizedOffset: number): number;
  /** Map a source offset to the normalized offset. */
  fromSource(sourceOffset: number): number;
}

/**
 * Normalize `\r\n` and lone `\r` to `\n`. Every removed `\r` shifts subsequent
 * source offsets by one; we record the removal positions to invert the map.
 */
export function normalizeLineEndings(source: string): NormalizedText {
  if (!source.includes('\r')) {
    return {
      text: source,
      identity: true,
      toSource: (o) => clamp(o, source.length),
      fromSource: (o) => clamp(o, source.length),
    };
  }

  let out = '';
  // `removedBeforeSource[i]` = count of source chars dropped before source index i.
  const droppedAtSourceIndex: number[] = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '\r') {
      // `\r\n` → drop the `\r`; lone `\r` → convert to `\n`.
      if (source[i + 1] === '\n') {
        droppedAtSourceIndex.push(i);
        continue;
      }
      out += '\n';
      continue;
    }
    out += ch;
  }

  const normalizedLen = out.length;

  const toSource = (normalizedOffset: number): number => {
    const target = clamp(normalizedOffset, normalizedLen);
    // Add back one source position for every dropped `\r` at or before the
    // corresponding source location.
    let sourceOffset = target;
    for (const dropIdx of droppedAtSourceIndex) {
      if (dropIdx < sourceOffset) sourceOffset += 1;
      else break;
    }
    return clamp(sourceOffset, source.length);
  };

  const fromSource = (sourceOffset: number): number => {
    const target = clamp(sourceOffset, source.length);
    let removed = 0;
    for (const dropIdx of droppedAtSourceIndex) {
      if (dropIdx < target) removed += 1;
      else break;
    }
    return clamp(target - removed, normalizedLen);
  };

  return { text: out, identity: false, toSource, fromSource };
}

function clamp(value: number, max: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(value, max));
}
