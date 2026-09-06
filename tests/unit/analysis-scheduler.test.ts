import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnalysisScheduler } from '@/core/analysis-scheduler';
import type { AnalyzeInput, AnalyzeOutput } from '@/core/analysis-scheduler';

let now = { text: 'hello', version: 1 };

function makeScheduler(
  analyze: (i: AnalyzeInput) => Promise<AnalyzeOutput>,
  onResult: (o: AnalyzeOutput) => void,
  composing = false,
) {
  return new AnalysisScheduler({
    snapshot: () => now,
    isComposing: () => composing,
    analyze,
    onResult,
    debounceMs: 100,
    maxWaitMs: 500,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  now = { text: 'hello', version: 1 };
});
afterEach(() => vi.useRealTimers());

describe('AnalysisScheduler (§17.2, §17.3)', () => {
  it('debounces rapid schedule() calls into one analysis', async () => {
    const analyze = vi.fn(async (i: AnalyzeInput) => ({
      requestId: i.requestId,
      documentVersion: i.documentVersion,
      suggestions: [],
      insights: null,
      degraded: false,
    }));
    const s = makeScheduler(analyze, () => {});
    now = { text: 'hello world', version: 2 };
    s.schedule();
    s.schedule();
    s.schedule();
    expect(analyze).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(120);
    expect(analyze).toHaveBeenCalledTimes(1);
    s.dispose();
  });

  it('drops a result whose document version is stale (§17.3)', async () => {
    let resolveAnalyze!: (o: AnalyzeOutput) => void;
    const analyze = (i: AnalyzeInput) =>
      new Promise<AnalyzeOutput>((res) => {
        resolveAnalyze = res;
        void i;
      });
    const onResult = vi.fn();
    const s = makeScheduler(analyze, onResult);

    now = { text: 'v2', version: 2 };
    s.schedule();
    await vi.advanceTimersByTimeAsync(120);
    // The document moved on while analysis was in flight.
    now = { text: 'v3', version: 3 };
    resolveAnalyze({
      requestId: 'x',
      documentVersion: 2,
      suggestions: [],
      insights: null,
      degraded: false,
    });
    await Promise.resolve();
    expect(onResult).not.toHaveBeenCalled();
    s.dispose();
  });

  it('does not analyze while composing, retrying afterward', async () => {
    const analyze = vi.fn(async (i: AnalyzeInput) => ({
      requestId: i.requestId,
      documentVersion: i.documentVersion,
      suggestions: [],
      insights: null,
      degraded: false,
    }));
    let composing = true;
    const s = new AnalysisScheduler({
      snapshot: () => now,
      isComposing: () => composing,
      analyze,
      onResult: () => {},
      debounceMs: 50,
    });
    now = { text: 'x', version: 2 };
    s.schedule();
    await vi.advanceTimersByTimeAsync(80);
    expect(analyze).not.toHaveBeenCalled();
    composing = false;
    await vi.advanceTimersByTimeAsync(80);
    expect(analyze).toHaveBeenCalledTimes(1);
    s.dispose();
  });

  it('skips analysis when the text is unchanged since the last run', async () => {
    const analyze = vi.fn(async (i: AnalyzeInput) => ({
      requestId: i.requestId,
      documentVersion: i.documentVersion,
      suggestions: [],
      insights: null,
      degraded: false,
    }));
    const s = makeScheduler(analyze, () => {});
    now = { text: 'stable', version: 2 };
    s.flushNow();
    await Promise.resolve();
    await Promise.resolve();
    s.flushNow(); // same text, same version
    await Promise.resolve();
    expect(analyze).toHaveBeenCalledTimes(1);
    s.dispose();
  });

  it('delivers a fresh result to onResult', async () => {
    const analyze = async (i: AnalyzeInput): Promise<AnalyzeOutput> => ({
      requestId: i.requestId,
      documentVersion: i.documentVersion,
      suggestions: [],
      insights: null,
      degraded: false,
    });
    const onResult = vi.fn();
    const s = makeScheduler(analyze, onResult);
    now = { text: 'fresh', version: 2 };
    s.flushNow();
    await Promise.resolve();
    await Promise.resolve();
    expect(onResult).toHaveBeenCalledTimes(1);
    s.dispose();
  });
});
