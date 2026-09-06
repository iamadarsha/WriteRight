import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';

type Events = { ping: { n: number }; pong: Record<string, never> };

describe('EventBus', () => {
  it('delivers typed payloads to subscribers', () => {
    const bus = new EventBus<Events>();
    const seen: number[] = [];
    bus.on('ping', (p) => seen.push(p.n));
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(seen).toEqual([1, 2]);
  });

  it('unsubscribe stops delivery', () => {
    const bus = new EventBus<Events>();
    const fn = vi.fn();
    const off = bus.on('ping', fn);
    off();
    bus.emit('ping', { n: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('a listener can unsubscribe a peer mid-dispatch without skipping others', () => {
    const bus = new EventBus<Events>();
    const calls: string[] = [];
    let offB = (): void => {};
    bus.on('ping', () => {
      calls.push('a');
      offB();
    });
    offB = bus.on('ping', () => calls.push('b'));
    bus.on('ping', () => calls.push('c'));
    bus.emit('ping', { n: 0 });
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('clear() removes everything', () => {
    const bus = new EventBus<Events>();
    const fn = vi.fn();
    bus.on('ping', fn);
    bus.clear();
    bus.emit('ping', { n: 1 });
    expect(fn).not.toHaveBeenCalled();
  });
});
