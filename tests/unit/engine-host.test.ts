import { describe, it, expect } from 'vitest';
import { NoopEngineHost, type EngineHost } from '@/engine/engine-host';

describe('NoopEngineHost (§5.3 boundary, Phase 1 fallback)', () => {
  it('reports readiness only after initialize', async () => {
    const host = new NoopEngineHost();
    expect(host.isReady()).toBe(false);
    await host.initialize();
    expect(host.isReady()).toBe(true);
    await host.shutdown();
    expect(host.isReady()).toBe(false);
  });

  it('returns an empty, degraded result echoing the request identity', async () => {
    const host = new NoopEngineHost();
    await host.initialize();
    const result = await host.analyze({
      requestId: 'r1',
      sessionId: 's1',
      documentVersion: 7,
      text: 'hello world',
      dialect: 'en-US',
      styleChecksEnabled: true,
      readabilityEnabled: true,
      buzzwords: [],
      disabledRuleIds: [],
      ignoredKeys: [],
      extraIgnorePatterns: [],
      presetId: null,
      withInsights: false,
    });
    expect(result).toEqual({
      requestId: 'r1',
      sessionId: 's1',
      documentVersion: 7,
      suggestions: [],
      insights: null,
      degraded: true,
    });
  });

  it('cancel() is a safe no-op', () => {
    const host: EngineHost = new NoopEngineHost();
    expect(() => host.cancel('anything')).not.toThrow();
  });
});
