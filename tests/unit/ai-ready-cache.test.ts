import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  aiReadyCached,
  invalidateAiReady,
  AI_READY_TTL_MS,
} from '@/core/ai-ready-cache';

beforeEach(() => invalidateAiReady());

describe('aiReadyCached (§12.3 — popover-open cheapness)', () => {
  it('probes once, then serves the cached value inside the TTL', async () => {
    const probe = vi.fn(async () => true);
    const t0 = 1_000_000;

    expect(await aiReadyCached(probe, t0)).toBe(true);
    expect(await aiReadyCached(probe, t0 + 100)).toBe(true);
    expect(await aiReadyCached(probe, t0 + AI_READY_TTL_MS - 1)).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('re-probes once the TTL has passed', async () => {
    const probe = vi.fn(async () => false);
    const t0 = 2_000_000;
    await aiReadyCached(probe, t0);
    await aiReadyCached(probe, t0 + AI_READY_TTL_MS + 1);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('invalidateAiReady() forces the next call to re-probe', async () => {
    const probe = vi.fn(async () => true);
    const t0 = 3_000_000;
    await aiReadyCached(probe, t0);
    invalidateAiReady();
    await aiReadyCached(probe, t0 + 10);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('a rejected probe is not cached (stays falsy, retries next time)', async () => {
    const probe = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('bg asleep'))
      .mockResolvedValue(true);
    const t0 = 4_000_000;
    expect(await aiReadyCached(probe, t0)).toBe(false);
    expect(await aiReadyCached(probe, t0 + 5)).toBe(true);
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
