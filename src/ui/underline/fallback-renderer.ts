/**
 * No-inline-UI renderer (§18.4) for Tier C/D editors where reliable inline
 * positioning is not available. Suggestions are still tracked so the popup and
 * (Phase 3) sidebar can list them; nothing is drawn on the page.
 */

import type { Suggestion } from '@/types/suggestion';
import type { UnderlineRenderer } from './underline-renderer';
import { suggestionContaining } from './underline-renderer';

export class FallbackNoInlineRenderer implements UnderlineRenderer {
  #suggestions: readonly Suggestion[] = [];

  render(suggestions: readonly Suggestion[]): void {
    this.#suggestions = suggestions;
  }
  reposition(): void {
    /* nothing on the page */
  }
  clear(): void {
    this.#suggestions = [];
  }
  destroy(): void {
    this.#suggestions = [];
  }
  suggestionAtOffset(offset: number): Suggestion | null {
    return suggestionContaining(this.#suggestions, offset);
  }
  anchorRectFor(): DOMRect | null {
    return null;
  }
}
