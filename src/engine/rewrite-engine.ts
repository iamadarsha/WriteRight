/**
 * Safe deterministic rewrites (§14.2, §3.5).
 *
 * ONLY low-semantic-risk transforms: collapse repeated whitespace / punctuation,
 * strip leading filler, drop empty intensifiers, trim blank lines, and — under
 * a formal preset — expand common contractions. No synonym substitution, no
 * "make it longer", no sentence joining (§14.2).
 *
 * Protected spans (URLs, code, identifiers — §10.2) are sliced out first and
 * left byte-for-byte untouched; passes only run on the prose between them, so
 * there is no offset-remapping to get wrong. The apply path is a single
 * full-range replacement guarded by a visual diff + explicit confirmation in
 * the UI (§3.5) — nothing is rewritten silently.
 */

import { findProtectedSpans } from '@/core/protected-spans';

export interface RewriteChangeSummary {
  readonly reason: string;
  readonly count: number;
  /** A couple of representative before→after examples for the UI. */
  readonly examples: ReadonlyArray<{ before: string; after: string }>;
}

export interface RewriteResult {
  readonly original: string;
  readonly text: string;
  readonly changed: boolean;
  readonly changes: readonly RewriteChangeSummary[];
}

export interface RewriteOptions {
  /** Expand "don't" → "do not" etc. (formal presets only). */
  readonly formalizeContractions?: boolean;
  readonly extraIgnorePatterns?: readonly string[];
}

const CONTRACTIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bcan't\b/i, 'cannot'],
  [/\bwon't\b/i, 'will not'],
  [/\bshan't\b/i, 'shall not'],
  [/\b(I)'m\b/, '$1 am'],
  [/\b(you|we|they)'re\b/i, '$1 are'],
  [/\b(he|she|it)'s\b/i, '$1 is'],
  [/\b(I|you|we|they)'ve\b/i, '$1 have'],
  [/\b(I|you|we|they|he|she|it)'ll\b/i, '$1 will'],
  [/\b(I|you|we|they|he|she|it)'d\b/i, '$1 would'],
  [/\blet's\b/i, 'let us'],
  [/\b([a-z]+)n't\b/i, '$1 not'],
];

interface Pass {
  readonly reason: string;
  readonly re: RegExp;
  replace(match: RegExpExecArray): string;
}

function passes(options: RewriteOptions): Pass[] {
  const list: Pass[] = [
    {
      reason: 'Removed a leading filler word',
      re: /(^|\n)([ \t]*)(?:basically|actually|honestly|essentially|needless to say|as a matter of fact|to be honest)[,]?\s+/gi,
      replace: (m) => (m[1] ?? '') + (m[2] ?? ''),
    },
    {
      reason: 'Removed a filler intensifier',
      re: /\b(?:really|very|quite|extremely|just|simply|totally)\s+/gi,
      replace: () => '',
    },
    {
      reason: 'Collapsed repeated spaces',
      re: / {2,}/g,
      replace: () => ' ',
    },
    {
      reason: 'Removed a space before punctuation',
      re: /[ \t]+([,.;:!?])/g,
      replace: (m) => m[1] ?? '',
    },
    {
      reason: 'Collapsed repeated punctuation',
      re: /([,;:])\1+|([!?])\2{2,}|(?<!\.)\.\.(?!\.)/g,
      replace: (m) => m[0][0] ?? '',
    },
  ];

  if (options.formalizeContractions) {
    for (const [re, to] of CONTRACTIONS) {
      list.push({
        reason: 'Expanded a contraction',
        re: new RegExp(re.source, 'gi'),
        replace: (m) => m[0].replace(new RegExp(re.source, 'i'), to),
      });
    }
  }
  return list;
}

/** Split into protected / unprotected chunks (protected are never rewritten). */
function segments(
  text: string,
  extra: readonly string[] | undefined,
): Array<{ text: string; frozen: boolean }> {
  const spans = findProtectedSpans(text, { extraPatterns: extra });
  if (spans.length === 0) return [{ text, frozen: false }];

  const out: Array<{ text: string; frozen: boolean }> = [];
  let cursor = 0;
  for (const span of spans.sort((a, b) => a.start - b.start)) {
    if (span.start < cursor) continue; // already covered by an earlier span
    if (span.start > cursor) {
      out.push({ text: text.slice(cursor, span.start), frozen: false });
    }
    out.push({ text: text.slice(span.start, span.end), frozen: true });
    cursor = span.end;
  }
  if (cursor < text.length)
    out.push({ text: text.slice(cursor), frozen: false });
  return out;
}

export function rewriteText(
  text: string,
  options: RewriteOptions = {},
): RewriteResult {
  const byReason = new Map<string, RewriteChangeSummary>();
  const record = (reason: string, before: string, after: string): void => {
    const prev = byReason.get(reason) ?? { reason, count: 0, examples: [] };
    byReason.set(reason, {
      reason,
      count: prev.count + 1,
      examples:
        prev.examples.length < 2
          ? [
              ...prev.examples,
              { before: before.trim() || before, after: after.trim() },
            ]
          : prev.examples,
    });
  };

  const applyPasses = (chunk: string): string => {
    let s = chunk;
    for (const pass of passes(options)) {
      const rx = new RegExp(pass.re.source, pass.re.flags);
      let result = '';
      let cursor = 0;
      for (let m = rx.exec(s); m !== null; m = rx.exec(s)) {
        const replacement = pass.replace(m);
        if (replacement === m[0]) {
          if (m[0].length === 0) rx.lastIndex += 1;
          continue;
        }
        result += s.slice(cursor, m.index) + replacement;
        cursor = m.index + m[0].length;
        record(pass.reason, m[0], replacement);
        if (m[0].length === 0) rx.lastIndex += 1;
      }
      result += s.slice(cursor);
      s = result;
    }
    return s;
  };

  let out = segments(text, options.extraIgnorePatterns)
    .map((seg) => (seg.frozen ? seg.text : applyPasses(seg.text)))
    .join('');

  const trimmed = out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  if (trimmed !== out)
    record('Trimmed trailing spaces and blank lines', out, trimmed);
  out = trimmed;

  return {
    original: text,
    text: out,
    changed: out !== text,
    changes: [...byReason.values()],
  };
}
