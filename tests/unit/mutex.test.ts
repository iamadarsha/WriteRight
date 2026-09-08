import { describe, it, expect } from 'vitest';
import { runExclusive } from '@/utils/mutex';

const tick = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

describe('runExclusive (§20.4 — no lost writes)', () => {
  it('serialises concurrent tasks on the same key', async () => {
    let counter = 0;
    const inc = (): Promise<void> =>
      runExclusive('k', async () => {
        const v = counter;
        await tick(1);
        counter = v + 1;
      });
    await Promise.all(Array.from({ length: 50 }, inc));
    expect(counter).toBe(50);
  });

  it('lets different keys run in parallel', async () => {
    const order: string[] = [];
    await Promise.all([
      runExclusive('a', async () => {
        await tick(15);
        order.push('a');
      }),
      runExclusive('b', async () => {
        order.push('b');
      }),
    ]);
    expect(order).toEqual(['b', 'a']);
  });

  it('a rejected task does not stall the next one on the same key', async () => {
    await expect(
      runExclusive('k', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(runExclusive('k', async () => 'ok')).resolves.toBe('ok');
  });

  it('returns the task result', async () => {
    expect(await runExclusive('k', async () => 42)).toBe(42);
  });
});
