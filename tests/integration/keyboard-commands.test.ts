import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BackgroundController } from '@/core/background-controller';

/**
 * §5.2 — the `toggle-sidebar` keyboard command reaches the active tab's
 * in-page sidebar. `_execute_action` is handled by the browser itself.
 */
describe('keyboard commands (§5.2)', () => {
  let listeners: Array<(cmd: string) => void>;
  let controller: BackgroundController;

  beforeEach(() => {
    listeners = [];
    // The fake browser has no in-memory `commands` impl — provide a minimal one.
    (fakeBrowser as unknown as { commands: unknown }).commands = {
      onCommand: {
        addListener: (fn: (cmd: string) => void) => listeners.push(fn),
        removeListener: () => {},
      },
    };
  });

  afterEach(() => {
    controller?.stop();
    delete (fakeBrowser as unknown as { commands?: unknown }).commands;
  });

  it('registers a command listener and forwards toggle-sidebar to the active tab', async () => {
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([
      { id: 7, url: 'https://example.com', active: true },
    ] as never);
    const sendMessage = vi
      .spyOn(fakeBrowser.tabs, 'sendMessage')
      .mockResolvedValue(undefined);

    controller = new BackgroundController();
    await controller.start();
    expect(listeners).toHaveLength(1);

    listeners[0]!('toggle-sidebar');
    await new Promise((r) => setTimeout(r, 0));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [tabId, envelope] = sendMessage.mock.calls[0]!;
    expect(tabId).toBe(7);
    expect(envelope).toMatchObject({
      __wr: 1,
      kind: 'broadcast',
      message: { type: 'TOGGLE_SIDEBAR' },
    });
  });

  it('ignores unrelated commands', async () => {
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([
      { id: 7, url: 'https://example.com', active: true },
    ] as never);
    const sendMessage = vi
      .spyOn(fakeBrowser.tabs, 'sendMessage')
      .mockResolvedValue(undefined);
    controller = new BackgroundController();
    await controller.start();

    listeners[0]!('some-other-command');
    await new Promise((r) => setTimeout(r, 0));
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
