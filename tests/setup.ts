import { beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { __resetBrowserCapabilities } from '@/platform/browser-capabilities';
import { invalidateAiReady } from '@/core/ai-ready-cache';

// §23.2 — isolate every test: reset the in-memory browser (storage, runtime,
// tabs), memoised capability detection, process-local caches, and any fake
// timers between tests.
beforeEach(() => {
  fakeBrowser.reset();
  __resetBrowserCapabilities();
  invalidateAiReady();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
