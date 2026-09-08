import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ContentEditableHighlightRenderer,
  highlightApiAvailable,
} from '@/ui/underline/contenteditable-highlight-renderer';
import { ContentEditableAdapter } from '@/adapters/contenteditable-adapter';
import type { Suggestion } from '@/types/suggestion';

function sug(
  start: number,
  end: number,
  over: Partial<Suggestion> = {},
): Suggestion {
  return {
    id: `s${start}-${end}`,
    sessionId: 's',
    documentVersion: 1,
    source: 'spell',
    start,
    end,
    original: 'x',
    originalHash: 'h',
    message: 'm',
    suggestions: ['y'],
    severity: 'error',
    confidence: 0.9,
    canAutoApply: true,
    ...over,
  };
}

/** Minimal stand-in for the CSS Custom Highlight API (jsdom has none). */
class FakeHighlight {
  ranges: Range[];
  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}
function installHighlightApi(): Map<string, FakeHighlight> {
  const reg = new Map<string, FakeHighlight>();
  vi.stubGlobal('Highlight', FakeHighlight);
  vi.stubGlobal('CSS', {
    highlights: {
      set: (n: string, h: FakeHighlight) => reg.set(n, h),
      delete: (n: string) => reg.delete(n),
    },
    escape: (s: string) => s,
  });
  return reg;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.head
    .querySelectorAll('style[data-writeright]')
    .forEach((s) => s.remove());
});
afterEach(() => vi.unstubAllGlobals());

describe('ContentEditableHighlightRenderer (spike 3.2)', () => {
  it('highlightApiAvailable() is false without the API (jsdom)', () => {
    expect(highlightApiAvailable()).toBe(false);
  });

  it('registers one Highlight per severity/source bucket and injects a host <style>', () => {
    const reg = installHighlightApi();
    const ce = document.createElement('div');
    ce.setAttribute('contenteditable', 'true');
    ce.textContent = 'one two three four';
    document.body.appendChild(ce);
    const layer = document.createElement('div');

    const r = new ContentEditableHighlightRenderer(
      new ContentEditableAdapter(ce) as never,
      layer,
    );
    r.render([
      sug(0, 3, { severity: 'error' }),
      sug(4, 7, { severity: 'warning' }),
      sug(8, 13, { source: 'readability', severity: 'info' }),
    ]);

    expect([...reg.keys()].sort()).toEqual([
      'wr-hl-error',
      'wr-hl-readability',
      'wr-hl-warning',
    ]);
    expect(reg.get('wr-hl-error')!.ranges).toHaveLength(1);

    const style = document.head.querySelector(
      'style[data-writeright="ce-highlights"]',
    );
    expect(style?.textContent).toContain('::highlight(wr-hl-error)');
    expect(style?.textContent).toContain('text-decoration-line:underline');
    expect(style?.textContent).toContain('prefers-color-scheme:dark');

    r.destroy();
    expect(reg.size).toBe(0);
    expect(
      document.head.querySelector('style[data-writeright="ce-highlights"]'),
    ).toBeNull();
  });

  it('re-injects the <style> if an SPA rebuilds <head> (fallback path)', () => {
    installHighlightApi();
    const ce = document.createElement('div');
    ce.setAttribute('contenteditable', 'true');
    ce.textContent = 'one two three';
    document.body.appendChild(ce);
    const r = new ContentEditableHighlightRenderer(
      new ContentEditableAdapter(ce) as never,
      document.createElement('div'),
    );
    r.render([sug(0, 3)]);
    expect(
      document.head.querySelector('style[data-writeright="ce-highlights"]'),
    ).not.toBeNull();

    document.head.innerHTML = ''; // the SPA nukes <head>
    r.render([sug(0, 3)]); // next analysis pass → #ensureStyle re-adds it
    expect(
      document.head.querySelector('style[data-writeright="ce-highlights"]'),
    ).not.toBeNull();
    r.destroy();
  });

  it('adopts a constructable stylesheet onto document when available (CSP-safe)', () => {
    installHighlightApi();
    // Give jsdom's document a settable adoptedStyleSheets array.
    let adopted: object[] = [];
    Object.defineProperty(document, 'adoptedStyleSheets', {
      configurable: true,
      get: () => adopted,
      set: (v: object[]) => {
        adopted = v;
      },
    });
    try {
      const ce = document.createElement('div');
      ce.setAttribute('contenteditable', 'true');
      ce.textContent = 'one two three';
      document.body.appendChild(ce);
      const r = new ContentEditableHighlightRenderer(
        new ContentEditableAdapter(ce) as never,
        document.createElement('div'),
      );
      r.render([sug(0, 3)]);

      expect(adopted).toHaveLength(1);
      expect((adopted[0] as CSSStyleSheet).cssRules.length).toBeGreaterThan(0);
      // no page <style> when the constructable path is taken
      expect(
        document.head.querySelector('style[data-writeright="ce-highlights"]'),
      ).toBeNull();

      r.destroy();
      expect(adopted).toHaveLength(0);
    } finally {
      // @ts-expect-error restore
      delete document.adoptedStyleSheets;
    }
  });

  it('clear() drops every highlight; anchorRectFor uses the range', () => {
    const reg = installHighlightApi();
    const ce = document.createElement('div');
    ce.setAttribute('contenteditable', 'true');
    ce.textContent = 'hello world';
    document.body.appendChild(ce);

    const r = new ContentEditableHighlightRenderer(
      new ContentEditableAdapter(ce) as never,
      document.createElement('div'),
    );
    r.render([sug(0, 5)]);
    expect(reg.size).toBe(1);
    // jsdom range.getBoundingClientRect is 0×0 → treated as no anchor.
    expect(r.anchorRectFor('s0-5')).toBeNull();
    r.clear();
    expect(reg.size).toBe(0);
    r.destroy();
  });
});
