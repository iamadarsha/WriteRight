/**
 * Contenteditable underline renderer (§18.3).
 *
 * For each suggestion we build a DOM `Range` from the adapter's text model and
 * draw one absolutely-positioned mark per client rect (multi-line spans produce
 * several). Marks are `pointer-events: none` and carry no layout box, so the
 * host page is untouched (§9.6, §31 Rule 13). The popover opens from the
 * caret / selection offset, not a click on the mark.
 */

import type { Suggestion } from '@/types/suggestion';
import type { ContentEditableAdapter } from '@/adapters/contenteditable-adapter';
import type { UnderlineRenderer } from './underline-renderer';
import { orderSuggestions, suggestionContaining } from './underline-renderer';

interface RangeBuilder {
  buildRange(start: number, end: number): Range | null;
}

export class ContentEditableRangeRenderer implements UnderlineRenderer {
  readonly #model: RangeBuilder;
  readonly #container: HTMLElement;
  #suggestions: Suggestion[] = [];
  #destroyed = false;

  constructor(
    adapter: Pick<ContentEditableAdapter, 'element'> & {
      buildRangeFor(start: number, end: number): Range | null;
    },
    layer: HTMLElement,
  ) {
    this.#model = { buildRange: (s, e) => adapter.buildRangeFor(s, e) };
    this.#container = layer.ownerDocument.createElement('div');
    this.#container.setAttribute('data-wr-ce-marks', '');
    this.#container.style.cssText =
      'position:absolute;inset:0;pointer-events:none;';
    layer.appendChild(this.#container);
    // Scroll / resize / observer / poll tracking (incl. the §18.3 rich-editor
    // node-swap poll) is owned by FieldGeometryTracker, which calls
    // reposition(). `buildRangeFor` still rebuilds the model when its cached
    // nodes are stale, so a poll tick self-heals the marks.
  }

  render(suggestions: readonly Suggestion[]): void {
    if (this.#destroyed) return;
    this.#suggestions = orderSuggestions(suggestions);
    this.#paint();
  }

  clear(): void {
    this.#suggestions = [];
    this.#container.textContent = '';
  }

  reposition(): void {
    if (!this.#destroyed) this.#paint();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#container.remove();
  }

  suggestionAtOffset(offset: number): Suggestion | null {
    return suggestionContaining(this.#suggestions, offset);
  }

  anchorRectFor(id: string): DOMRect | null {
    const first = this.#container.querySelector<HTMLElement>(
      `[data-wr-id="${cssEscape(id)}"]`,
    );
    return first ? first.getBoundingClientRect() : null;
  }

  #paint(): void {
    const doc = this.#container.ownerDocument;
    this.#container.textContent = '';

    for (const s of this.#suggestions) {
      const range = this.#model.buildRange(s.start, s.end);
      if (!range) continue;
      const rects = range.getClientRects();
      for (const rect of rects) {
        if (rect.width === 0 && rect.height === 0) continue;
        const mark = doc.createElement('div');
        mark.className = `wr-ce-mark wr-u-${s.severity}`;
        mark.dataset['wrId'] = s.id;
        mark.style.left = `${rect.left}px`;
        mark.style.top = `${rect.bottom - 1}px`;
        mark.style.width = `${rect.width}px`;
        this.#container.appendChild(mark);
      }
    }
  }
}

function cssEscape(value: string): string {
  const w = globalThis as { CSS?: { escape?: (v: string) => string } };
  return w.CSS?.escape ? w.CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}
