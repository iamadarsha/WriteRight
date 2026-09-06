import { beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { __resetBrowserCapabilities } from '@/platform/browser-capabilities';

// §23.2 — isolate every test: reset the in-memory browser (storage, runtime,
// tabs), memoised capability detection, and any fake timers between tests.
beforeEach(() => {
  fakeBrowser.reset();
  __resetBrowserCapabilities();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
