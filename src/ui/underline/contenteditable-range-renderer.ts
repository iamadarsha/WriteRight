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
import { visibleClipRect } from '@/ui/geometry/visible-rect';

interface RangeBuilder {
  buildRange(start: number, end: number): Range | null;
}

export class ContentEditableRangeRenderer implements UnderlineRenderer {
  readonly #model: RangeBuilder;
  readonly #field: Element;
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
    this.#field = adapter.element;
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

    // The marks live in a fixed, full-viewport layer, but the field's text may
    // be clipped by a scrollable ancestor (chatgpt.com's composer grows tall
    // inside a small `overflow:auto` parent). Only draw a mark where the text
    // it underlines is actually visible in that window — otherwise rects for
    // scrolled-away lines scatter marks across the page (§18.3).
    const clip = visibleClipRect(this.#field);

    for (const s of this.#suggestions) {
      const range = this.#model.buildRange(s.start, s.end);
      if (!range) continue;
      const rects = range.getClientRects();
      for (const rect of rects) {
        if (rect.width === 0 && rect.height === 0) continue;
        const y = rect.bottom - 1;
        // The underline sits on the text baseline; require that baseline to be
        // inside the visible window, and clip the mark's width to it.
        if (y < clip.top || y > clip.bottom) continue;
        const left = Math.max(rect.left, clip.left);
        const right = Math.min(rect.right, clip.right);
        if (right - left < 1) continue;
        const mark = doc.createElement('div');
        mark.className = `wr-ce-mark wr-u-${s.severity} wr-u-src-${s.source}`;
        mark.dataset['wrId'] = s.id;
        mark.style.left = `${left}px`;
        mark.style.top = `${y}px`;
        mark.style.width = `${right - left}px`;
        this.#container.appendChild(mark);
      }
    }
  }
}

function cssEscape(value: string): string {
  const w = globalThis as { CSS?: { escape?: (v: string) => string } };
  return w.CSS?.escape ? w.CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}
