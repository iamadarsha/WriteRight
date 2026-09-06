import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FieldGeometryTracker } from '@/ui/geometry/field-geometry-tracker';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(0), 0) as unknown as number;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) =>
    clearTimeout(id as unknown as NodeJS.Timeout),
  );
});
afterEach(() => vi.unstubAllGlobals());

function field(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 1));

describe('FieldGeometryTracker (§8)', () => {
  it('dispatches to a fresh subscriber once, rAF-gated', async () => {
    const t = new FieldGeometryTracker(field());
    const cb = vi.fn();
    t.subscribe(cb);
    expect(cb).not.toHaveBeenCalled(); // rAF, not sync
    await flush();
    expect(cb).toHaveBeenCalledTimes(1);
    t.dispose();
  });

  it('coalesces many triggers into one dispatch per frame', async () => {
    const t = new FieldGeometryTracker(field());
    const cb = vi.fn();
    t.subscribe(cb);
    await flush(); // initial
    cb.mockClear();

    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new Event('scroll'));
    t.notify();
    expect(cb).not.toHaveBeenCalled();
    await flush();
    expect(cb).toHaveBeenCalledTimes(1);
    t.dispose();
  });

  it('a scroll on any ancestor reaches the tracker (capture phase)', async () => {
    const outer = document.createElement('div');
    const el = document.createElement('div');
    outer.appendChild(el);
    document.body.appendChild(outer);
    const t = new FieldGeometryTracker(el);
    const cb = vi.fn();
    t.subscribe(cb);
    await flush();
    cb.mockClear();

    outer.dispatchEvent(new Event('scroll', { bubbles: false }));
    await flush();
    expect(cb).toHaveBeenCalledTimes(1);
    t.dispose();
  });

  it('unsubscribe stops future dispatches', async () => {
    const t = new FieldGeometryTracker(field());
    const cb = vi.fn();
    const off = t.subscribe(cb);
    await flush();
    cb.mockClear();
    off();
    t.notify();
    await flush();
    expect(cb).not.toHaveBeenCalled();
    t.dispose();
  });

  it('one throwing subscriber does not stop the others', async () => {
    const t = new FieldGeometryTracker(field());
    const good = vi.fn();
    t.subscribe(() => {
      throw new Error('boom');
    });
    t.subscribe(good);
    await flush();
    expect(good).toHaveBeenCalled();
    t.dispose();
  });

  it('dispose removes every listener and stops the poll', async () => {
    const addWin = vi.spyOn(window, 'addEventListener');
    const removeWin = vi.spyOn(window, 'removeEventListener');
    const removeDoc = vi.spyOn(document, 'removeEventListener');
    const t = new FieldGeometryTracker(field());
    const cb = vi.fn();
    t.subscribe(cb);
    await flush();
    cb.mockClear();

    t.dispose();
    // listeners gone
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new Event('scroll'));
    await flush();
    expect(cb).not.toHaveBeenCalled();
    expect(removeWin).toHaveBeenCalled();
    expect(removeDoc).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      true,
    );

    addWin.mockRestore();
    removeWin.mockRestore();
    removeDoc.mockRestore();
  });

  it('fieldRect() reads the live element rect', () => {
    const el = field();
    el.getBoundingClientRect = () =>
      ({ x: 5, y: 10, width: 100, height: 20 }) as DOMRect;
    const t = new FieldGeometryTracker(el);
    expect(t.fieldRect()).toMatchObject({ x: 5, width: 100 });
    expect(t.element).toBe(el);
    t.dispose();
  });
});
