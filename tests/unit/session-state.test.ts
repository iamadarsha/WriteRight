import { describe, it, expect, beforeEach } from 'vitest';
import {
  setTabStatus,
  getTabStatus,
  clearTabStatus,
  __resetSessionStateForTests,
} from '@/storage/session-state';
import type { PageStatus } from '@/types/capability';

const status: PageStatus = {
  availability: 'ready',
  detail: 'ok',
  eligibleFields: 1,
  origin: 'https://example.com',
};

beforeEach(() => __resetSessionStateForTests());

describe('session state (§6.7)', () => {
  it('stores and retrieves per-tab status', async () => {
    await setTabStatus(42, status);
    expect(await getTabStatus(42)).toEqual(status);
  });

  it('returns null for an unknown tab', async () => {
    expect(await getTabStatus(999)).toBeNull();
  });

  it('clears a tab', async () => {
    await setTabStatus(7, status);
    await clearTabStatus(7);
    expect(await getTabStatus(7)).toBeNull();
  });
});
