import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { AiCapability, AiProbeResult } from '@/ai/ai-types';
import type { AiSettings } from '@/types/settings';

/**
 * §14.5 — the options page must let the user actually *start* Chrome's
 * on-device model download, not just "check availability" (which never
 * downloads anything). Regression guard for the dead-end a user hit: the
 * page said "Chrome can download the model now" with no button to do it.
 */

const sendToBackground = vi.fn();
let capability: AiCapability | null = null;
const refresh = vi.fn(async () => {});

vi.mock('@/messaging', () => ({
  sendToBackground: (...args: unknown[]) => sendToBackground(...args),
}));
vi.mock('@/ui/hooks/useAiCapability', () => ({
  useAiCapability: () => ({ capability, loading: false, refresh }),
}));

// Imported after the mocks are registered.
const { AiSettingsSection } = await import('@/ui/components/AiSettingsSection');

const AI: AiSettings = {
  provider: 'chrome',
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: '',
  lmStudioEndpoint: 'http://localhost:1234',
  lmStudioModel: '',
  customEndpoint: '',
  customModel: '',
  enhancedReview: false,
  keepChatHistory: false,
  acknowledgedPrivacy: true,
};

const probe = (over: Partial<AiProbeResult> = {}): AiProbeResult => ({
  id: 'chrome',
  state: 'downloadable',
  detail: 'Chrome can download the on-device model now.',
  ...over,
});

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  sendToBackground.mockReset();
  refresh.mockClear();
  capability = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const btnByText = (t: string): HTMLButtonElement | undefined =>
  [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === t,
  ) as HTMLButtonElement | undefined;

describe('AiSettingsSection — Chrome model download (§14.5)', () => {
  it('shows a real Download button once the probe says "downloadable"', async () => {
    sendToBackground.mockResolvedValue({
      ok: true,
      data: { probe: probe() },
    });

    await act(async () => {
      root.render(<AiSettingsSection ai={AI} aiEnabled update={() => {}} />);
    });
    // No probe yet → only "Check availability".
    expect(btnByText('Download the on-device model')).toBeUndefined();

    await act(async () => {
      btnByText('Check availability')!.click();
      await Promise.resolve();
    });

    expect(btnByText('Download the on-device model')).toBeDefined();
  });

  it('the Download button starts the download and shows progress', async () => {
    vi.useFakeTimers();
    capability = {
      enabled: true,
      active: null,
      label: 'AI Unavailable',
      acknowledged: true,
      enhancedReview: false,
      providers: [probe()],
    };
    // AI_START_DOWNLOAD ok, then AI_TEST_CONNECTION returns downloading→ready.
    sendToBackground.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'AI_START_DOWNLOAD')
        return { ok: true, data: { ok: true } };
      if (msg.type === 'AI_TEST_CONNECTION')
        return {
          ok: true,
          data: { probe: probe({ state: 'downloading', progress: 0.5 }) },
        };
      return { ok: true, data: {} };
    });

    await act(async () => {
      root.render(<AiSettingsSection ai={AI} aiEnabled update={() => {}} />);
    });
    await act(async () => {
      btnByText('Download the on-device model')!.click();
      await Promise.resolve();
    });

    expect(sendToBackground).toHaveBeenCalledWith({
      type: 'AI_START_DOWNLOAD',
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(container.textContent).toMatch(
      /Downloading Chrome.s on-device model/,
    );
    expect(container.textContent).toMatch(/50%/);
    vi.useRealTimers();
  });

  it('surfaces an error when the download will not start', async () => {
    capability = {
      enabled: true,
      active: null,
      label: 'AI Unavailable',
      acknowledged: true,
      enhancedReview: false,
      providers: [probe()],
    };
    sendToBackground.mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'AI_START_DOWNLOAD')
        return {
          ok: true,
          data: { ok: false, error: 'Not enough disk space.' },
        };
      return { ok: true, data: { probe: probe() } };
    });

    await act(async () => {
      root.render(<AiSettingsSection ai={AI} aiEnabled update={() => {}} />);
    });
    await act(async () => {
      btnByText('Download the on-device model')!.click();
      await Promise.resolve();
    });

    expect(container.textContent).toMatch(/Not enough disk space/);
  });
});
