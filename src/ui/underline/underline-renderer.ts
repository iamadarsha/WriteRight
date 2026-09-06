/**
 * Inline underline rendering (§18, §2.6).
 *
 * Strategies:
 *  - {@link TextareaOverlayRenderer} — a style-matched mirror element behind a
 *    `<textarea>` / `<input>` (§18.2),
 *  - {@link ContentEditableRangeRenderer} — absolutely-positioned marks from
 *    `Range.getClientRects()` for ordinary `contenteditable` (§18.3),
 *  - {@link FallbackNoInlineRenderer} — no inline UI; the popover is still
 *    reachable from the sidebar/popup (§18.4, §5.1 Tier C/D).
 *
 * Underlines must not alter document layout, must survive scroll/resize/zoom,
 * and must disappear the instant a suggestion is resolved (§9.6).
 */

import type { Suggestion, SuggestionSeverity } from '@/types/suggestion';

export interface UnderlineRenderer {
  /** Draw underlines for the given suggestions (replaces any previous set). */
  render(suggestions: readonly Suggestion[]): void;
  /** Re-measure and re-place after scroll / resize / zoom / font change. */
  reposition(): void;
  /** Remove all underlines. */
  clear(): void;
  /** Full teardown — safe to call more than once. */
  destroy(): void;
  /**
   * Which suggestion (if any) sits at UTF-16 offset `offset` in the current
   * text. Used to open the popover from a click / keyboard caret.
   */
  suggestionAtOffset(offset: number): Suggestion | null;
  /** Client-rect anchor for a suggestion, for popover positioning. */
  anchorRectFor(id: string): DOMRect | null;
}

export const SEVERITY_COLOR_VAR: Record<SuggestionSeverity, string> = {
  error: '--wr-spelling',
  warning: '--wr-grammar',
  info: '--wr-style',
};

/** Sort + de-overlap so marks never visually stack (merger already did most). */
export function orderSuggestions(
  suggestions: readonly Suggestion[],
): Suggestion[] {
  return [...suggestions].sort((a, b) => a.start - b.start || a.end - b.end);
}

export function suggestionContaining(
  suggestions: readonly Suggestion[],
  offset: number,
): Suggestion | null {
  // Prefer the tightest span that contains the caret; include the right edge so
  // a caret just after the word still opens it.
  let best: Suggestion | null = null;
  for (const s of suggestions) {
    if (offset >= s.start && offset <= s.end) {
      if (!best || s.end - s.start < best.end - best.start) best = s;
    }
  }
  return best;
}
