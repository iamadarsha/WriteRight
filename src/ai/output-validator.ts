/**
 * Validation of raw model output before it is shown or applied (§4.8, §14.6).
 *
 * Model output is untrusted. We:
 *  - parse the expected JSON shape (with a tolerant fallback to plain text),
 *  - enforce a maximum output size,
 *  - reject HTML / script-looking payloads (§14.6 "never trust model output as
 *    HTML" — the UI also only ever uses `textContent`),
 *  - for rewrites, sanity-check the replacement against the original selection.
 *
 * The caller is responsible for splicing ONLY the selection range, so content
 * outside the selection is unchanged by construction (§4.8).
 */

import type { AiChange, AiRawOutput, AiRunResult } from './ai-types';

export interface ValidateOptions {
  readonly kind: 'rewrite' | 'explanation';
  /** The exact text the rewrite will replace (for rewrites). */
  readonly selection: string;
  readonly maxOutputChars: number;
}

export type ValidateResult =
  { ok: true; value: AiRunResult } | { ok: false; error: string };

const HTML_TAG_RE = /<\s*\/?\s*[a-z][\s\S]*?>/i;
const SCRIPT_URI_RE = /\b(?:javascript|data|vbscript)\s*:/i;

export function validateAiOutput(
  raw: AiRawOutput,
  opts: ValidateOptions,
): ValidateResult {
  const trimmed = raw.raw.trim();
  if (trimmed.length === 0) return { ok: false, error: 'empty response' };
  if (trimmed.length > opts.maxOutputChars * 4 + 8000) {
    return { ok: false, error: 'response far larger than allowed' };
  }

  const parsed = extractJson(trimmed);

  if (opts.kind === 'explanation') {
    const explanation =
      typeof parsed?.['explanation'] === 'string'
        ? parsed['explanation']
        : stripJsonNoise(trimmed);
    const clean = sanitizePlainText(explanation);
    if (!clean) return { ok: false, error: 'no usable explanation text' };
    if (clean.length > opts.maxOutputChars) {
      return { ok: false, error: 'explanation exceeds size limit' };
    }
    return {
      ok: true,
      value: {
        kind: 'explanation',
        text: clean,
        changes: [],
        provider: raw.provider,
        model: raw.model,
      },
    };
  }

  // rewrite
  let rewritten =
    typeof parsed?.['rewrittenText'] === 'string'
      ? parsed['rewrittenText']
      : stripJsonNoise(trimmed);
  rewritten = sanitizePlainText(rewritten);

  if (!rewritten) return { ok: false, error: 'no rewritten text' };
  if (rewritten.length > opts.maxOutputChars) {
    return { ok: false, error: 'rewrite exceeds size limit' };
  }
  if (HTML_TAG_RE.test(rewritten) && !HTML_TAG_RE.test(opts.selection)) {
    return { ok: false, error: 'rewrite introduced HTML markup' };
  }
  if (SCRIPT_URI_RE.test(rewritten) && !SCRIPT_URI_RE.test(opts.selection)) {
    return { ok: false, error: 'rewrite introduced a script URI' };
  }
  // Guard against the model returning something wildly unrelated / truncated.
  const ratio = rewritten.length / Math.max(1, opts.selection.length);
  if (ratio < 0.15 || ratio > 6) {
    return {
      ok: false,
      error: 'rewrite length is implausible for the selection',
    };
  }

  return {
    ok: true,
    value: {
      kind: 'rewrite',
      text: rewritten,
      changes: readChanges(parsed?.['changes']),
      provider: raw.provider,
      model: raw.model,
    },
  };
}

/** Validate one free-form chat reply (§4.7). */
export function validateChatReply(
  raw: string,
  maxChars: number,
): { ok: true; text: string } | { ok: false; error: string } {
  const clean = sanitizePlainText(raw);
  if (!clean) return { ok: false, error: 'empty reply' };
  return {
    ok: true,
    text: clean.length > maxChars ? clean.slice(0, maxChars) : clean,
  };
}

/* ---- internals ------------------------------------------------------- */

function extractJson(text: string): Record<string, unknown> | null {
  // Try the whole string, then the first {...} block (models often wrap it).
  for (const candidate of [text, firstBraceBlock(text)]) {
    if (!candidate) continue;
    try {
      const v: unknown = JSON.parse(candidate);
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return v as Record<string, unknown>;
      }
    } catch {
      /* fall through */
    }
  }
  return null;
}

function firstBraceBlock(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function stripJsonNoise(text: string): string {
  // The model returned prose instead of JSON — drop an accidental leading
  // ```lang fence and trailing fence if present.
  return text
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

/** Strip C0 controls + DEL (keep \n and \t), normalise newlines; never HTML. */
function sanitizePlainText(text: string): string {
  let out = '';
  for (const ch of text.replace(/\r\n?/g, '\n')) {
    const code = ch.codePointAt(0) ?? 0;
    const printable =
      ch === '\n' || ch === '\t' || (code >= 0x20 && code !== 0x7f);
    if (printable) out += ch;
  }
  return out.trim();
}

function readChanges(value: unknown): readonly AiChange[] {
  if (!Array.isArray(value)) return [];
  const out: AiChange[] = [];
  for (const item of value.slice(0, 4)) {
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const type = typeof rec['type'] === 'string' ? rec['type'] : 'edit';
      const reason = typeof rec['reason'] === 'string' ? rec['reason'] : '';
      if (reason) {
        out.push({ type: type.slice(0, 40), reason: reason.slice(0, 200) });
      }
    }
  }
  return out;
}
