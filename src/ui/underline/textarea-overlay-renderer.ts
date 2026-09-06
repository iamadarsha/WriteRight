/**
 * Textarea / input underline renderer — the "mirror" technique (§18.2).
 *
 * A hidden element is positioned exactly over the control and styled to match
 * its text box (font, wrapping, padding, border, scroll). We render the text
 * with `<span class="wr-u">` around each suggestion range; a wavy
 * `text-decoration` underline adds no layout box, so wrapping is identical to
 * the real control. The mirror is `pointer-events: none` — clicks fall through
 * to the control so editing stays natural; the popover opens from the caret
 * offset instead (§9.6, §9.7).
 */

import type { Suggestion } from '@/types/suggestion';
import type { UnderlineRenderer } from './underline-renderer';
import { orderSuggestions, suggestionContaining } from './underline-renderer';

const COPIED_STYLES = [
  'boxSizing',
  'width',
  'height',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textTransform',
  'textIndent',
  'textAlign',
  'whiteSpace',
  'wordWrap',
  'overflowWrap',
  'wordBreak',
  'tabSize',
  'direction',
] as const;

export class TextareaOverlayRenderer implements UnderlineRenderer {
  readonly #control: HTMLInputElement | HTMLTextAreaElement;
  readonly #mirror: HTMLElement;
  #suggestions: Suggestion[] = [];
  #destroyed = false;

  constructor(
    control: HTMLInputElement | HTMLTextAreaElement,
    layer: HTMLElement,
  ) {
    this.#control = control;
    this.#mirror = layer.ownerDocument.createElement('div');
    this.#mirror.className = 'wr-ta-mirror';
    this.#mirror.setAttribute('aria-hidden', 'true');
    layer.appendChild(this.#mirror);
    // Scroll / resize / observer / poll tracking is owned by
    // FieldGeometryTracker (via AnalysisCoordinator), which calls reposition().
  }

  render(suggestions: readonly Suggestion[]): void {
    if (this.#destroyed) return;
    this.#suggestions = orderSuggestions(suggestions);
    this.#paint();
  }

  clear(): void {
    this.#suggestions = [];
    this.#mirror.textContent = '';
  }

  reposition(): void {
    if (this.#destroyed) return;
    this.#syncBox();
    this.#syncScroll();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#mirror.remove();
  }

  suggestionAtOffset(offset: number): Suggestion | null {
    return suggestionContaining(this.#suggestions, offset);
  }

  anchorRectFor(id: string): DOMRect | null {
    const span = this.#mirror.querySelector<HTMLElement>(
      `[data-wr-id="${cssEscape(id)}"]`,
    );
    return span ? span.getBoundingClientRect() : null;
  }

  /* ---- internals ---------------------------------------------------- */

  #paint(): void {
    this.#syncBox();

    const text = this.#control.value;
    const frag = this.#mirror.ownerDocument.createDocumentFragment();
    let cursor = 0;
    for (const s of this.#suggestions) {
      const start = clamp(s.start, 0, text.length);
      const end = clamp(s.end, start, text.length);
      if (start > cursor) frag.append(text.slice(cursor, start));
      const span = this.#mirror.ownerDocument.createElement('span');
      span.className = `wr-u wr-u-${s.severity} wr-u-src-${s.source}`;
      span.dataset['wrId'] = s.id;
      span.textContent = text.slice(start, end);
      frag.append(span);
      cursor = end;
    }
    if (cursor < text.length) frag.append(text.slice(cursor));
    // A trailing newline needs a trailing space so the mirror height matches.
    if (text.endsWith('\n')) frag.append(' ');

    this.#mirror.textContent = '';
    this.#mirror.appendChild(frag);
    this.#syncScroll();
  }

  #syncBox(): void {
    const control = this.#control;
    const win = control.ownerDocument.defaultView;
    if (!win) return;
    const rect = control.getBoundingClientRect();
    const cs = win.getComputedStyle(control);

    const style = this.#mirror.style;
    style.left = `${rect.left}px`;
    style.top = `${rect.top}px`;
    for (const prop of COPIED_STYLES) {
      style[prop] = cs[prop];
    }
    // Single-line inputs never wrap.
    if (control instanceof HTMLInputElement) {
      style.whiteSpace = 'pre';
      style.overflow = 'hidden';
      // An <input> vertically centres its single line of text within the
      // content box; a top-aligned <div> mirror does not. Left unmatched, the
      // mirror's text sits higher than the real text, so its underline lands
      // in the middle of the real glyphs and reads as a strike-through
      // (magsafe-search-box repro). Make the mirror's one line box fill the
      // content height so it centres the same way.
      const px = (v: string): number => parseFloat(v) || 0;
      const contentH =
        rect.height -
        px(cs.borderTopWidth) -
        px(cs.borderBottomWidth) -
        px(cs.paddingTop) -
        px(cs.paddingBottom);
      style.lineHeight = contentH > 0 ? `${contentH}px` : cs.lineHeight;
    }
  }

  #syncScroll(): void {
    this.#mirror.scrollTop = this.#control.scrollTop;
    this.#mirror.scrollLeft = this.#control.scrollLeft;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi));
}

function cssEscape(value: string): string {
  const w = globalThis as { CSS?: { escape?: (v: string) => string } };
  return w.CSS?.escape ? w.CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}
