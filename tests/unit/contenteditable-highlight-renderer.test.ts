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
