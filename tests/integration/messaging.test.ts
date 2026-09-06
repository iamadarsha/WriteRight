import { describe, it, expect, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  handleBackgroundRequests,
  sendToBackground,
  type RequestHandlers,
} from '@/messaging';

function stubHandlers(over: Partial<RequestHandlers> = {}): RequestHandlers {
  const notImpl = () => {
    throw new Error('not implemented in this test');
  };
  return {
    GET_SETTINGS: notImpl,
    SET_SETTINGS: notImpl,
    RESET_ALL_DATA: notImpl,
    GET_SITE_STATE: notImpl,
    SET_SITE_ENABLED: notImpl,
    SET_GLOBAL_ENABLED: notImpl,
    GET_ACTIVE_TAB_STATUS: notImpl,
    REPORT_PAGE_STATUS: notImpl,
    GET_DIAGNOSTICS: notImpl,
    ...over,
  } as RequestHandlers;
}

let detach: (() => void) | undefined;
afterEach(() => detach?.());

describe('messaging round trip (§26)', () => {
  it('delivers a typed request and returns the handler result', async () => {
    detach = handleBackgroundRequests(
      stubHandlers({
        GET_SITE_STATE: (msg) => ({
          origin: msg.origin,
          siteEnabled: true,
          globallyEnabled: true,
        }),
      }),
    );

    const res = await sendToBackground({
      type: 'GET_SITE_STATE',
      origin: 'https://example.com',
    });
    expect(res).toEqual({
      ok: true,
      data: {
        origin: 'https://example.com',
        siteEnabled: true,
        globallyEnabled: true,
      },
    });
  });

  it('surfaces handler errors as { ok: false }', async () => {
    detach = handleBackgroundRequests(
      stubHandlers({
        GET_DIAGNOSTICS: () => {
          throw new Error('boom');
        },
      }),
    );
    const res = await sendToBackground({ type: 'GET_DIAGNOSTICS' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('boom');
  });

  it('recovers from a transient service-worker wake-up race (§26)', async () => {
    const spy = vi
      .spyOn(fakeBrowser.runtime, 'sendMessage')
      .mockRejectedValueOnce(
        new Error(
          'Could not establish connection. Receiving end does not exist.',
        ),
      )
      .mockResolvedValueOnce({
        ok: true,
        data: {
          version: '0.0.0-test',
          settingsSchemaVersion: 1,
          browser: 'test',
          engineReady: true,
          trackedTabs: 0,
        },
      } as never);

    const res = await sendToBackground({ type: 'GET_DIAGNOSTICS' });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res.ok).toBe(true);
  });

  it('gives up after exhausting retries instead of hanging', async () => {
    detach = handleBackgroundRequests(stubHandlers());
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockRejectedValue(
      new Error('Receiving end does not exist.'),
    );

    const res = await sendToBackground({ type: 'GET_DIAGNOSTICS' });
    expect(res.ok).toBe(false);
  });

  it('does not retry a non-connection error', async () => {
    detach = handleBackgroundRequests(stubHandlers());
    const spy = vi
      .spyOn(fakeBrowser.runtime, 'sendMessage')
      .mockRejectedValue(new Error('Extension context invalidated.'));

    const res = await sendToBackground({ type: 'GET_DIAGNOSTICS' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(false);
  });

  it('rejects an unknown / malformed message without invoking a handler', async () => {
    detach = handleBackgroundRequests(stubHandlers());
    // Bypass the typed helper to send a hostile payload.
    const reply = (await fakeBrowser.runtime.sendMessage({
      __wr: 1,
      kind: 'request',
      message: { type: 'DROP_ALL' },
    })) as { ok: boolean; error?: string };
    expect(reply.ok).toBe(false);
  });
});
