/**
 * Protected spans (§10.2).
 *
 * Ranges of text that must not be analyzed or rewritten as ordinary prose:
 * URLs, email addresses, @-mentions, #hashtags, inline/backtick code, fenced
 * code blocks, file paths and obvious identifiers. Users may add patterns via
 * `Settings.extraIgnorePatterns`.
 *
 * Phase 1 ships the detector + tests; Phase 2 engines consume it.
 * All offsets are UTF-16 code units against the normalized snapshot (§10.3).
 */

import type { TextRange } from '@/types/text';
import { rangesOverlap } from '@/types/text';

export type ProtectedSpanKind =
  | 'url'
  | 'email'
  | 'mention'
  | 'hashtag'
  | 'inline-code'
  | 'code-fence'
  | 'file-path'
  | 'identifier'
  | 'custom';

export interface ProtectedSpan extends TextRange {
  readonly kind: ProtectedSpanKind;
  readonly text: string;
}

// Order matters: fenced code first (it can contain everything else).
const PATTERNS: ReadonlyArray<{ kind: ProtectedSpanKind; re: RegExp }> = [
  { kind: 'code-fence', re: /```[\s\S]*?```|~~~[\s\S]*?~~~/g },
  { kind: 'inline-code', re: /`[^`\n]+`/g },
  { kind: 'url', re: /\b(?:https?:\/\/|www\.)[^\s<>()[\]{}"']+/gi },
  {
    kind: 'email',
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  { kind: 'mention', re: /(?<![\w@])@[A-Za-z0-9_](?:[A-Za-z0-9_.-]{0,38})/g },
  { kind: 'hashtag', re: /(?<![\w#])#[A-Za-z][A-Za-z0-9_]{0,138}/g },
  {
    kind: 'file-path',
    re: /(?:[A-Za-z]:\\|\.{0,2}\/)[\w./\\-]+\.\w{1,8}\b|\b\/(?:[\w.-]+\/){1,}[\w.-]+/g,
  },
  // A called function or method: `commit()`, `getUserById(id)`, `conn.commit()`.
  {
    kind: 'identifier',
    re: /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\((?:\)|[^)\s][^)]*\))/g,
  },
  // A dotted member path of 3+ segments — unambiguously code: `a.b.c`.
  {
    kind: 'identifier',
    re: /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*){2,}\b/g,
  },
  // Token-shaped identifiers: snake_case, internal caps (`getUser`, `OOMKilled`,
  // `IPv4`), SCREAMING_CASE. Internal-caps needs a case transition, so ordinary
  // Title-case words ("Their", "Monday") are NOT matched.
  {
    kind: 'identifier',
    re: /\b(?:[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+|[A-Za-z][a-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z]{3,})\b/g,
  },
];

export interface ProtectedSpanOptions {
  /** Extra user patterns (§10.2). Invalid regexes are ignored, not fatal. */
  readonly extraPatterns?: readonly string[];
}

export function findProtectedSpans(
  text: string,
  options: ProtectedSpanOptions = {},
): ProtectedSpan[] {
  const spans: ProtectedSpan[] = [];

  const push = (kind: ProtectedSpanKind, re: RegExp): void => {
    re.lastIndex = 0;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const start = m.index;
      const end = start + m[0].length;
      const candidate: ProtectedSpan = { kind, start, end, text: m[0] };
      // Skip if fully contained in an already-claimed span (e.g. url in fence).
      if (spans.some((s) => s.start <= start && end <= s.end)) continue;
      spans.push(candidate);
      if (m[0].length === 0) re.lastIndex++;
    }
  };

  for (const { kind, re } of PATTERNS)
    push(kind, new RegExp(re.source, re.flags));

  for (const raw of options.extraPatterns ?? []) {
    let re: RegExp;
    try {
      re = new RegExp(raw, 'g');
    } catch {
      continue;
    }
    push('custom', re);
  }

  return spans.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** True when `range` intersects any protected span. */
export function isRangeProtected(
  range: TextRange,
  spans: readonly ProtectedSpan[],
): boolean {
  return spans.some((s) => rangesOverlap(range, s));
}
