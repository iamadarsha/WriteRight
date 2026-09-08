/**
 * Spike 3.2 — `contenteditable` underlines via the CSS Custom Highlight API.
 *
 * Instead of one absolutely-positioned `<div>` bar per client rect (which the
 * browser does not clip to a scrollable composer, hence `visibleClipRect` and
 * the chatgpt.com scatter fix), register the flagged `Range`s with
 * `CSS.highlights` and let the browser paint a `text-decoration` on them as
 * part of normal text rendering. Highlights are clipped by `overflow` ancestors
 * for free and cannot alter layout or the caret.
 *
 * Cost: `::highlight()` rules must live in a stylesheet in the *highlighted
 * text's* document — i.e. one small `<style>` injected into the host page, with
 * the state colours inlined (no live binding to the shadow `--wr-*` tokens).
 *
 * Gated by {@link EXPERIMENTS.cssHighlightUnderlines}; the factory only picks
 * this when the flag is on AND `CSS.highlights` exists.
 */

import type { Suggestion } from '@/types/suggestion';
import type { ContentEditableAdapter } from '@/adapters/contenteditable-adapter';
import type { UnderlineRenderer } from './underline-renderer';
import { orderSuggestions, suggestionContaining } from './underline-renderer';

interface RangeBuilder {
  buildRange(start: number, end: number): Range | null;
}

type HighlightName =
  'wr-hl-error' | 'wr-hl-warning' | 'wr-hl-info' | 'wr-hl-readability';
const HIGHLIGHT_NAMES: readonly HighlightName[] = [
  'wr-hl-error',
  'wr-hl-warning',
  'wr-hl-info',
  'wr-hl-readability',
];

interface HighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}
function registry(): HighlightRegistry | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  return css?.highlights ?? null;
}
export function highlightApiAvailable(): boolean {
  return (
    registry() !== null &&
    typeof (globalThis as { Highlight?: unknown }).Highlight === 'function'
  );
}

function nameFor(s: Suggestion): HighlightName {
  if (s.source === 'readability') return 'wr-hl-readability';
  if (s.severity === 'error') return 'wr-hl-error';
  if (s.severity === 'warning') return 'wr-hl-warning';
  return 'wr-hl-info';
}

/** Inlined from tokens.css — `::highlight()` can't see the shadow `--wr-*` vars. */
const COLOR: Record<HighlightName, { light: string; dark: string }> = {
  'wr-hl-error': { light: '#d1453b', dark: '#ff6f6f' },
  'wr-hl-warning': { light: '#b5730f', dark: '#e3a746' },
  'wr-hl-info': { light: '#6a5acd', dark: '#ad9fff' },
  'wr-hl-readability': { light: '#1a86b8', dark: '#57bde0' },
};

function styleSheetText(): string {
  const rule = (n: HighlightName, c: string): string =>
    `::highlight(${n}){text-decoration-line:underline;text-decoration-style:solid;` +
    `text-decoration-skip-ink:none;text-underline-offset:2px;` +
    `text-decoration-thickness:2px;text-decoration-color:${c};}`;
  const light = HIGHLIGHT_NAMES.map((n) => rule(n, COLOR[n].light)).join('');
  const dark = HIGHLIGHT_NAMES.map((n) => rule(n, COLOR[n].dark)).join('');
  return `${light}@media (prefers-color-scheme:dark){${dark}}`;
}

export class ContentEditableHighlightRenderer implements UnderlineRenderer {
  readonly #model: RangeBuilder;
  readonly #doc: Document;
  readonly #ranges = new Map<string, Range>();
  #suggestions: Suggestion[] = [];
  #styleEl: HTMLStyleElement | null = null;
  #destroyed = false;

  constructor(
    adapter: Pick<ContentEditableAdapter, 'element'> & {
      buildRangeFor(start: number, end: number): Range | null;
    },
    _layer: HTMLElement,
  ) {
    this.#model = { buildRange: (s, e) => adapter.buildRangeFor(s, e) };
    this.#doc = adapter.element.ownerDocument;
    this.#injectStyle();
  }

  render(suggestions: readonly Suggestion[]): void {
    if (this.#destroyed) return;
    this.#suggestions = orderSuggestions(suggestions);
    this.#paint();
  }

  reposition(): void {
    // Highlights follow the text on their own; still rebuild the ranges so a
    // stale range (editor node swap, §18.3) is re-resolved.
    if (!this.#destroyed) this.#paint();
  }

  clear(): void {
    this.#suggestions = [];
    this.#paint();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    const reg = registry();
    for (const n of HIGHLIGHT_NAMES) reg?.delete(n);
    this.#styleEl?.remove();
    this.#styleEl = null;
    this.#ranges.clear();
  }

  suggestionAtOffset(offset: number): Suggestion | null {
    return suggestionContaining(this.#suggestions, offset);
  }

  anchorRectFor(id: string): DOMRect | null {
    const range = this.#ranges.get(id);
    if (!range) return null;
    try {
      const rect = range.getBoundingClientRect();
      return rect.width > 0 || rect.height > 0 ? rect : null;
    } catch {
      return null;
    }
  }

  #paint(): void {
    const reg = registry();
    const HighlightCtor = (
      globalThis as { Highlight?: new (...r: Range[]) => unknown }
    ).Highlight;
    if (!reg || !HighlightCtor) return;

    const buckets = new Map<HighlightName, Range[]>();
    this.#ranges.clear();
    for (const s of this.#suggestions) {
      const range = this.#model.buildRange(s.start, s.end);
      if (!range) continue;
      this.#ranges.set(s.id, range);
      const name = nameFor(s);
      const list = buckets.get(name) ?? [];
      list.push(range);
      buckets.set(name, list);
    }
    for (const name of HIGHLIGHT_NAMES) {
      const ranges = buckets.get(name);
      if (ranges && ranges.length > 0) {
        reg.set(name, new HighlightCtor(...ranges));
      } else {
        reg.delete(name);
      }
    }
  }

  #injectStyle(): void {
    const existing = this.#doc.querySelector(
      'style[data-writeright="ce-highlights"]',
    );
    if (existing) {
      this.#styleEl = existing as HTMLStyleElement;
      return;
    }
    const el = this.#doc.createElement('style');
    el.setAttribute('data-writeright', 'ce-highlights');
    el.textContent = styleSheetText();
    (this.#doc.head ?? this.#doc.documentElement).appendChild(el);
    this.#styleEl = el;
  }
}
