import { describe, it, expect, vi, beforeEach } from 'vitest';
import { debounce, coalesceIdle } from '@/utils/scheduler';

describe('debounce (§17.2)', () => {
  beforeEach(() => vi.useFakeTimers());

  it('runs once on the trailing edge with the latest args', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a');
    d('b');
    d('c');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('cancel() prevents a pending call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d();
    d.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it('flush() invokes immediately if pending', () => {
    const fn = vi.fn();
    const d = debounce(fn, 500);
    d('x');
    d.flush();
    expect(fn).toHaveBeenCalledWith('x');
  });

  it('maxWait guarantees execution under a sustained call stream', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100, 250);
    for (let i = 0; i < 10; i++) {
      d(i);
      vi.advanceTimersByTime(60); // never lets the 100ms timer fire
    }
    expect(fn).toHaveBeenCalled();
  });
});

describe('coalesceIdle', () => {
  beforeEach(() => vi.useFakeTimers());
  it('collapses multiple requests into a single call', () => {
    const fn = vi.fn();
    const run = coalesceIdle(fn, 50);
    run();
    run();
    run();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    run();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
