/**
 * `contenteditable` underlines via the CSS Custom Highlight API (§18.3).
 *
 * Instead of one absolutely-positioned `<div>` bar per client rect (which the
 * browser does not clip to a scrollable composer — hence `visibleClipRect` and
 * the chatgpt.com scatter fix in {@link ContentEditableRangeRenderer}), register
 * the flagged `Range`s with `CSS.highlights` and let the browser paint a
 * `text-decoration` on them as part of normal text rendering. Highlights are
 * clipped by `overflow` ancestors for free and cannot alter layout or the caret.
 *
 * The factory picks this when `CSS.highlights` / `Highlight` exist (Chrome 105+,
 * Firefox 140+, Safari 17.2+); older engines fall back to the range renderer.
 *
 * Cost: `::highlight()` rules must live in a stylesheet in the *highlighted
 * text's* document — not our shadow root. We adopt a constructable
 * `CSSStyleSheet` onto `document` (CSSOM, so a strict `style-src` CSP does not
 * block it, and it survives an SPA rebuilding `<head>`); a `<style>` element is
 * the fallback where constructable sheets are unavailable. The state colours are
 * inlined (no live binding to the shadow `--wr-*` tokens).
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
  #sheet: CSSStyleSheet | null = null;
  #destroyed = false;

  constructor(
    adapter: Pick<ContentEditableAdapter, 'element'> & {
      buildRangeFor(start: number, end: number): Range | null;
    },
    _layer: HTMLElement,
  ) {
    this.#model = { buildRange: (s, e) => adapter.buildRangeFor(s, e) };
    this.#doc = adapter.element.ownerDocument;
    this.#ensureStyle();
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
    if (this.#sheet) {
      try {
        this.#doc.adoptedStyleSheets = this.#doc.adoptedStyleSheets.filter(
          (s) => s !== this.#sheet,
        );
      } catch {
        /* frozen adoptedStyleSheets — nothing we can do, and it's harmless */
      }
      this.#sheet = null;
    }
    this.#ranges.clear();
  }

  suggestionAtOffset(offset: number): Suggestion | null {
    return suggestionContaining(this.#suggestions, offset);
  }

  anchorRectFor(id: string): DOMRect | null {
    const range = this.#ranges.get(id);
    if (!range) return null;
    try {
      // The first client rect = the suggestion's first line. Anchoring the
      // popover to the whole multi-line bounding box would place it oddly for a
      // suggestion that wraps.
      const first = range.getClientRects()[0];
      if (first && (first.width > 0 || first.height > 0)) return first;
      const box = range.getBoundingClientRect();
      return box.width > 0 || box.height > 0 ? box : null;
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
    // An SPA may have rebuilt <head> (dropping the fallback <style>) or a frame
    // reset adoptedStyleSheets — re-assert our rules before repainting.
    this.#ensureStyle();

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

  /** Make sure our `::highlight()` rules are on `document`, re-adding if lost. */
  #ensureStyle(): void {
    const doc = this.#doc;
    const win = doc.defaultView;

    // Preferred: a constructable stylesheet adopted onto the document. CSSOM, so
    // `style-src` CSP doesn't touch it, and it isn't lost when <head> is rebuilt.
    const canAdopt =
      !!win &&
      typeof win.CSSStyleSheet === 'function' &&
      'replaceSync' in win.CSSStyleSheet.prototype &&
      Array.isArray(doc.adoptedStyleSheets);
    if (canAdopt && win) {
      if (this.#sheet && doc.adoptedStyleSheets.includes(this.#sheet)) return;
      try {
        this.#sheet ??= (() => {
          const s = new win.CSSStyleSheet();
          s.replaceSync(styleSheetText());
          return s;
        })();
        doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, this.#sheet];
        return;
      } catch {
        /* fall through to a <style> element */
      }
    }

    // Fallback: a <style> element (blocked by a strict `style-src` CSP — the
    // constructable path above is what covers those sites).
    if (this.#styleEl?.isConnected) return;
    const existing = doc.querySelector<HTMLStyleElement>(
      'style[data-writeright="ce-highlights"]',
    );
    if (existing) {
      this.#styleEl = existing;
      return;
    }
    const el = doc.createElement('style');
    el.setAttribute('data-writeright', 'ce-highlights');
    el.textContent = styleSheetText();
    (doc.head ?? doc.documentElement).appendChild(el);
    this.#styleEl = el;
  }
}
