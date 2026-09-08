import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { BackgroundController } from '@/core/background-controller';
import { sendToBackground } from '@/messaging';
import { DEFAULT_SETTINGS } from '@/types/settings';
import type { PageStatus } from '@/types/capability';

let controller: BackgroundController;
let fireTabReplaced: ((addedId: number, removedId: number) => void) | null =
  null;

beforeEach(async () => {
  // @webext-core/fake-browser has no tabs.onReplaced — give it a real emitter.
  const cbs: Array<(a: number, r: number) => void> = [];
  (fakeBrowser.tabs as unknown as { onReplaced: unknown }).onReplaced = {
    addListener: (cb: (a: number, r: number) => void) => cbs.push(cb),
    removeListener: () => {},
    hasListener: () => cbs.length > 0,
  };
  fireTabReplaced = (a, r) => cbs.forEach((cb) => cb(a, r));

  controller = new BackgroundController();
  await controller.start();
});

afterEach(() => controller.stop());

describe('BackgroundController message router (§26)', () => {
  it('GET_SETTINGS returns defaults initially', async () => {
    const res = await sendToBackground({ type: 'GET_SETTINGS' });
    expect(res.ok && res.data.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('SET_SETTINGS persists a patch and later reads reflect it', async () => {
    const set = await sendToBackground({
      type: 'SET_SETTINGS',
      patch: { enabled: false, features: { ai: true } },
    });
    expect(set.ok && set.data.settings.enabled).toBe(false);

    const get = await sendToBackground({ type: 'GET_SETTINGS' });
    expect(get.ok && get.data.settings.features.ai).toBe(true);
    expect(get.ok && get.data.settings.features.styleWordiness).toBe(true);
  });

  it('SET_SITE_ENABLED + GET_SITE_STATE round trip', async () => {
    const origin = 'https://mail.example.com';
    expect(
      (await sendToBackground({ type: 'GET_SITE_STATE', origin })).ok &&
        (await sendToBackground({ type: 'GET_SITE_STATE', origin })).ok,
    ).toBe(true);

    await sendToBackground({
      type: 'SET_SITE_ENABLED',
      origin,
      enabled: false,
    });
    const state = await sendToBackground({ type: 'GET_SITE_STATE', origin });
    expect(state.ok && state.data.siteEnabled).toBe(false);
  });

  it('REPORT_PAGE_STATUS is accepted and GET_ACTIVE_TAB_STATUS answers safely with no tab', async () => {
    const status: PageStatus = {
      availability: 'ready',
      detail: 'ok',
      eligibleFields: 2,
      origin: 'https://example.com',
    };
    const report = await sendToBackground({
      type: 'REPORT_PAGE_STATUS',
      status,
    });
    expect(report.ok).toBe(true);

    const active = await sendToBackground({ type: 'GET_ACTIVE_TAB_STATUS' });
    expect(active.ok && active.data.status).toBeNull();
  });

  it('RESET_ALL_DATA restores defaults', async () => {
    await sendToBackground({ type: 'SET_SETTINGS', patch: { enabled: false } });
    const reset = await sendToBackground({ type: 'RESET_ALL_DATA' });
    expect(reset.ok && reset.data.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('GET_DIAGNOSTICS returns version + schema info, engine not ready in Phase 1', async () => {
    const res = await sendToBackground({ type: 'GET_DIAGNOSTICS' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.settingsSchemaVersion).toBe(
        DEFAULT_SETTINGS.schemaVersion,
      );
      expect(res.data.engineReady).toBe(false);
    }
  });

  it('rejects an unknown message type', async () => {
    const reply = (await fakeBrowser.runtime.sendMessage({
      __wr: 1,
      kind: 'request',
      message: { type: 'NOT_A_REAL_TYPE' },
    })) as { ok: boolean };
    expect(reply.ok).toBe(false);
  });

  it('rejects an ANALYZE_TEXT payload over the size cap', async () => {
    const reply = (await fakeBrowser.runtime.sendMessage({
      __wr: 1,
      kind: 'request',
      message: {
        type: 'ANALYZE_TEXT',
        requestId: 'r',
        sessionId: 's',
        documentVersion: 1,
        origin: 'https://a',
        text: 'x'.repeat(200_001),
      },
    })) as { ok: boolean };
    expect(reply.ok).toBe(false);
  });

  it('clears stranded tab state when a prerender swaps in under a new id (§5.3)', async () => {
    const { setTabStatus, getTabStatus } = await import(
      '@/storage/session-state'
    );
    await setTabStatus(5, {
      availability: 'ready',
      detail: 'ok',
      eligibleFields: 1,
      origin: 'https://example.com',
    });
    expect(await getTabStatus(5)).not.toBeNull();

    fireTabReplaced!(9, 5);
    await new Promise((r) => setTimeout(r, 0));

    expect(await getTabStatus(5)).toBeNull();
  });
});
