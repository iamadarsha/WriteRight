/**
 * Suggestion safety gate (§10.4, §2.8, §31 Rule 9 & 12).
 *
 * A correction is applied to user content ONLY when every check passes:
 *  - the session id matches the active editor session,
 *  - the adapter is still editable and not composing (IME),
 *  - the range is in bounds for the *current* text,
 *  - the current text at that range still equals the suggestion's `original`,
 *  - the original-text hash still matches.
 *
 * Otherwise we refuse and ask for a fresh analysis — never "best effort" an
 * uncertain replacement into user content.
 */

import type { EditorAdapter } from '@/types/editor';
import type { Suggestion } from '@/types/suggestion';
import { normalizeLineEndings } from './text-normalize';
import { shortHash } from '@/utils/hash';

export type ApplyOutcome =
  | { ok: true; replacement: string }
  | {
      ok: false;
      reason:
        | 'wrong-session'
        | 'not-editable'
        | 'composing'
        | 'out-of-bounds'
        | 'text-changed'
        | 'no-replacement'
        | 'replace-failed';
    };

export function applySuggestion(
  adapter: EditorAdapter,
  activeSessionId: string,
  suggestion: Suggestion,
  replacementIndex = 0,
): ApplyOutcome {
  if (suggestion.sessionId !== activeSessionId) {
    return { ok: false, reason: 'wrong-session' };
  }
  if (!adapter.isEditable()) return { ok: false, reason: 'not-editable' };
  if (adapter.isComposing()) return { ok: false, reason: 'composing' };

  const replacement = suggestion.suggestions[replacementIndex];
  if (replacement === undefined) return { ok: false, reason: 'no-replacement' };

  const current = normalizeLineEndings(adapter.getText()).text;
  if (suggestion.start < 0 || suggestion.end > current.length) {
    return { ok: false, reason: 'out-of-bounds' };
  }

  const slice = current.slice(suggestion.start, suggestion.end);
  if (slice !== suggestion.original)
    return { ok: false, reason: 'text-changed' };
  if (shortHash(slice) !== suggestion.originalHash) {
    return { ok: false, reason: 'text-changed' };
  }

  const applied = adapter.replaceRange(
    { start: suggestion.start, end: suggestion.end },
    replacement,
  );
  return applied
    ? { ok: true, replacement }
    : { ok: false, reason: 'replace-failed' };
}
