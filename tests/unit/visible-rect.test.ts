import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { visibleClipRect, intersectRect } from '@/ui/geometry/visible-rect';

beforeEach(() => {
  document.body.innerHTML = '';
  // jsdom has no layout — give the viewport a size.
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 800);
});
afterEach(() => vi.unstubAllGlobals());

function rect(
  el: Element,
  r: { left: number; top: number; width: number; height: number },
): void {
  el.getBoundingClientRect = () =>
    ({
      left: r.left,
      top: r.top,
      right: r.left + r.width,
      bottom: r.top + r.height,
      width: r.width,
      height: r.height,
      x: r.left,
      y: r.top,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('visibleClipRect (§18.3)', () => {
  it('returns the viewport when nothing between el and body clips', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    expect(visibleClipRect(el)).toEqual({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
    });
  });

  it('intersects with a scrollable ancestor (the ChatGPT composer shape)', () => {
    // A tall editable inside a short overflow:auto parent that scrolls it.
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    scroller.style.maxHeight = '90px';
    const ed = document.createElement('div');
    ed.setAttribute('contenteditable', 'true');
    scroller.appendChild(ed);
    document.body.appendChild(scroller);

    rect(scroller, { left: 20, top: 500, width: 600, height: 90 });
    rect(ed, { left: 20, top: 380, width: 600, height: 900 }); // full, un-clipped

    expect(visibleClipRect(ed)).toEqual({
      left: 20,
      top: 500,
      right: 620,
      bottom: 590,
    });
  });

  it('takes the tightest of several nested clippers', () => {
    const outer = document.createElement('div');
    outer.style.overflow = 'hidden';
    const inner = document.createElement('div');
    inner.style.overflow = 'scroll';
    const ed = document.createElement('div');
    inner.appendChild(ed);
    outer.appendChild(inner);
    document.body.appendChild(outer);

    rect(outer, { left: 0, top: 100, width: 800, height: 400 });
    rect(inner, { left: 50, top: 150, width: 400, height: 200 });
    rect(ed, { left: 50, top: 150, width: 400, height: 2000 });

    expect(visibleClipRect(ed)).toEqual({
      left: 50,
      top: 150,
      right: 450,
      bottom: 350,
    });
  });

  it('ignores a 0×0 clipper (mid-layout) instead of collapsing to nothing', () => {
    const scroller = document.createElement('div');
    scroller.style.overflow = 'auto';
    const ed = document.createElement('div');
    scroller.appendChild(ed);
    document.body.appendChild(scroller);
    rect(scroller, { left: 0, top: 0, width: 0, height: 0 });

    expect(visibleClipRect(ed)).toEqual({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
    });
  });

  it('intersectRect clamps and reports non-overlap', () => {
    const clip = { left: 0, top: 100, right: 500, bottom: 200 };
    const inside = { left: 10, top: 120, right: 60, bottom: 140 } as DOMRect;
    expect(intersectRect(inside, clip)).toEqual({
      left: 10,
      top: 120,
      right: 60,
      bottom: 140,
    });
    const below = { left: 10, top: 900, right: 60, bottom: 920 } as DOMRect;
    expect(intersectRect(below, clip)).toBeNull();
  });
});
