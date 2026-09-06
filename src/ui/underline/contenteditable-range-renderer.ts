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
  readonly #host: HTMLElement;
  readonly #model: RangeBuilder;
  readonly #container: HTMLElement;
  #suggestions: Suggestion[] = [];
  #cleanups: Array<() => void> = [];
  #rafId = 0;
  #destroyed = false;

  constructor(
    adapter: Pick<ContentEditableAdapter, 'element'> & {
      buildRangeFor(start: number, end: number): Range | null;
    },
    layer: HTMLElement,
  ) {
    this.#host = adapter.element as HTMLElement;
    this.#model = { buildRange: (s, e) => adapter.buildRangeFor(s, e) };
    this.#container = layer.ownerDocument.createElement('div');
    this.#container.setAttribute('data-wr-ce-marks', '');
    this.#container.style.cssText =
      'position:absolute;inset:0;pointer-events:none;';
    layer.appendChild(this.#container);

    const schedule = (): void => this.#scheduleReposition();
    const win = this.#host.ownerDocument.defaultView;
    for (const [t, ev] of [
      [win, 'resize'],
      [win, 'scroll'],
    ] as const) {
      t?.addEventListener(ev, schedule, { passive: true });
      this.#cleanups.push(() => t?.removeEventListener(ev, schedule));
    }
    // Scroll can happen on any ancestor; capture-phase catches them all.
    this.#host.ownerDocument.addEventListener('scroll', schedule, {
      passive: true,
      capture: true,
    });
    this.#cleanups.push(() =>
      this.#host.ownerDocument.removeEventListener('scroll', schedule, true),
    );
    if (win && 'ResizeObserver' in win) {
      const ro = new win.ResizeObserver(schedule);
      ro.observe(this.#host);
      this.#cleanups.push(() => ro.disconnect());
    }
    // Defensive poll (§18.3): rich-text editors (ProseMirror, Lexical, ...)
    // can replace their own DOM nodes as part of a re-render that fires none
    // of the events above — Grammarly's own engineering blog documents the
    // same ~1s polling fallback for exactly this reason. `reposition()` is
    // cheap (rAF-gated, and `buildRangeFor` already rebuilds the model when
    // its cached nodes are no longer connected), so this just self-heals any
    // marks that silently went stale between real triggers.
    if (win) {
      const pollId = win.setInterval(schedule, 1000);
      this.#cleanups.push(() => win.clearInterval(pollId));
    }
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
    if (this.#rafId) cancelAnimationFrame(this.#rafId);
    for (const fn of this.#cleanups.splice(0)) fn();
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

  #scheduleReposition(): void {
    if (this.#rafId || this.#destroyed) return;
    this.#rafId = requestAnimationFrame(() => {
      this.#rafId = 0;
      this.reposition();
    });
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
