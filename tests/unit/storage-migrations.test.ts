import { describe, it, expect } from 'vitest';
import { storage } from '#imports';
import { migrationsAreConsistent } from '@/storage/migrations';
import { initStorage, resetAllData, getSettings } from '@/storage';
import { DEFAULT_SETTINGS } from '@/types/settings';

describe('migrations (§20.4)', () => {
  it('the settings migration table is internally consistent', () => {
    expect(migrationsAreConsistent()).toBe(true);
  });

  it('a versioned item runs its 1→2 migration exactly once and is idempotent', async () => {
    interface V1 {
      count: string;
    }
    interface V2 {
      count: number;
      note: string;
    }

    // Seed a v1-shaped value with v1 metadata, as an older build would leave it.
    await storage.setItem('local:wr-test-migrate', { count: '3' } satisfies V1);
    await storage.setMeta('local:wr-test-migrate', { v: 1 });

    let migrationRuns = 0;
    const item = storage.defineItem<V2>('local:wr-test-migrate', {
      fallback: { count: 0, note: '' },
      version: 2,
      migrations: {
        2: (old: unknown): V2 => {
          migrationRuns += 1;
          const v1 = old as V1;
          return { count: Number(v1.count), note: 'migrated' };
        },
      },
    });

    const first = await item.getValue();
    expect(first).toEqual({ count: 3, note: 'migrated' });

    // Reading again must not re-run the migration.
    const second = await item.getValue();
    expect(second).toEqual({ count: 3, note: 'migrated' });
    expect(migrationRuns).toBe(1);
  });

  it('initStorage returns effective settings and reset restores defaults', async () => {
    const settings = await initStorage();
    expect(settings.schemaVersion).toBe(DEFAULT_SETTINGS.schemaVersion);

    await storage.setItem('local:writeright.settings', {
      ...DEFAULT_SETTINGS,
      enabled: false,
    });
    expect((await getSettings()).enabled).toBe(false);
    await storage.setItem('local:writeright.aiChat', [
      { role: 'user', content: 'note' },
    ]);

    await resetAllData();
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    // §28 — opt-in AI chat transcript is removed too.
    expect(await storage.getItem('local:writeright.aiChat')).toBeNull();
  });
});
