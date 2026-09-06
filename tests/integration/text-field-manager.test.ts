import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TextFieldManager, type PolicyState } from '@/core/text-field-manager';
import { createDefaultRegistry } from '@/adapters/adapter-registry';
import type { PageStatus } from '@/types/capability';

const ENABLED: PolicyState = {
  globallyEnabled: true,
  siteEnabled: true,
  pageInjectable: true,
};

function focus(el: HTMLElement): void {
  el.focus();
  // jsdom does not always emit focusin from .focus(); dispatch to be safe.
  el.dispatchEvent(
    new FocusEvent('focusin', { bubbles: true, composed: true }),
  );
}

function blurActive(): void {
  const active = document.activeElement as HTMLElement | null;
  active?.blur();
  document.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

let manager: TextFieldManager;
let statuses: PageStatus[];
let policy: PolicyState;

function makeManager(over: Partial<PolicyState> = {}): TextFieldManager {
  policy = { ...ENABLED, ...over };
  statuses = [];
  return new TextFieldManager({
    registry: createDefaultRegistry(),
    origin: 'https://example.com',
    getPolicy: () => policy,
    onStatusChange: (s) => statuses.push(s),
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  manager?.stop();
  vi.useRealTimers();
});

describe('TextFieldManager (§1.5, §17.4, §19)', () => {
  it('attaches a session when an eligible field is focused', () => {
    document.body.innerHTML = '<textarea id="t">hello</textarea>';
    manager = makeManager();
    manager.start();
    expect(manager.trackedCount).toBe(0);

    focus(document.getElementById('t')!);
    expect(manager.trackedCount).toBe(1);
    expect(manager.activeSession?.adapter.kind).toBe('textarea');
  });

  it('does not attach to a password field (§6.4)', () => {
    document.body.innerHTML = '<input type="password" id="p">';
    manager = makeManager();
    manager.start();
    focus(document.getElementById('p')!);
    expect(manager.trackedCount).toBe(0);
  });

  it('deactivates the session on blur but keeps it lightweight', async () => {
    document.body.innerHTML = '<textarea id="t"></textarea>';
    manager = makeManager();
    manager.start();
    const t = document.getElementById('t') as HTMLTextAreaElement;
    focus(t);
    expect(manager.activeSession).not.toBeNull();
    blurActive();
    await Promise.resolve(); // flush the deferred focus-settle microtask
    expect(manager.activeSession).toBeNull();
    // The session object is retained (tracked) — only deactivated.
    expect(manager.trackedCount).toBe(1);
  });

  it('tears down a session when its element leaves the DOM (§1.5)', async () => {
    document.body.innerHTML =
      '<div id="wrap"><textarea id="t"></textarea></div>';
    manager = makeManager();
    manager.start();
    focus(document.getElementById('t')!);
    expect(manager.trackedCount).toBe(1);

    document.getElementById('wrap')!.remove();
    await vi.advanceTimersByTimeAsync(1200);
    expect(manager.trackedCount).toBe(0);
  });

  it('reports "ready" when a Tier-A editor exists and "disabled-site" when turned off', () => {
    document.body.innerHTML = '<textarea></textarea>';
    manager = makeManager();
    manager.start();
    expect(manager.getStatus().availability).toBe('ready');

    policy = { ...policy, siteEnabled: false };
    manager.refreshPolicy();
    expect(manager.getStatus().availability).toBe('disabled-site');
  });

  it('reports "unavailable-privileged" when the page is not injectable', () => {
    manager = makeManager({ pageInjectable: false });
    manager.start();
    expect(manager.getStatus().availability).toBe('unavailable-privileged');
  });

  it('tears down all sessions when policy flips to disabled', () => {
    document.body.innerHTML = '<textarea id="t"></textarea>';
    manager = makeManager();
    manager.start();
    focus(document.getElementById('t')!);
    expect(manager.trackedCount).toBe(1);

    policy = { ...policy, globallyEnabled: false };
    manager.refreshPolicy();
    expect(manager.trackedCount).toBe(0);
    expect(manager.getStatus().availability).toBe('disabled-global');
  });

  it('does not create duplicate sessions when the same field is re-focused (§5.3)', () => {
    document.body.innerHTML =
      '<textarea id="t"></textarea><input id="i" type="text">';
    manager = makeManager();
    manager.start();
    const t = document.getElementById('t')!;
    focus(t);
    focus(document.getElementById('i')!);
    focus(t);
    expect(manager.trackedCount).toBe(2);
  });

  it('stop() destroys every session and detaches observers', () => {
    document.body.innerHTML = '<textarea id="t"></textarea>';
    manager = makeManager();
    manager.start();
    focus(document.getElementById('t')!);
    manager.stop();
    expect(manager.trackedCount).toBe(0);
  });

  it('keeps the session alive when focus moves into WriteRight’s own UI (§5.3)', () => {
    document.body.innerHTML =
      '<textarea id="t">hi</textarea>' +
      '<div id="writeright-host" data-writeright="host"><button id="wr-btn">x</button></div>';
    manager = makeManager();
    manager.start();
    const t = document.getElementById('t') as HTMLTextAreaElement;
    focus(t);
    expect(manager.activeSession).not.toBeNull();

    // Opening the suggestion popover moves focus to a control inside the host.
    document.getElementById('wr-btn')!.focus();
    document.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    expect(manager.activeSession?.adapter.element).toBe(t);
  });

  it('does not clear the session on relatedTarget alone, even before activeElement settles (§8, launcher click race)', async () => {
    // A mousedown on WriteRight's own anchored launcher blurs the field
    // *before* the browser finishes moving focus to the button, so
    // `document.activeElement` is still mid-transition at focusout time.
    // The browser has already decided the next focus target by then, though,
    // and reports it synchronously via `relatedTarget` — checking that first
    // (instead of only the deferred, settled `activeElement`) is what keeps
    // the session alive without the race. Without this, clearing the session
    // un-anchors and hides the launcher itself mid-click, so the click that
    // was supposed to open the sidebar silently does nothing.
    document.body.innerHTML =
      '<textarea id="t">hi</textarea>' +
      '<div id="writeright-host" data-writeright="host"><button id="wr-btn">x</button></div>';
    manager = makeManager();
    manager.start();
    const t = document.getElementById('t') as HTMLTextAreaElement;
    focus(t);
    expect(manager.activeSession).not.toBeNull();

    const btn = document.getElementById('wr-btn')!;
    document.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: btn }),
    );

    // Correct even synchronously — relatedTarget resolves this before any
    // microtask would otherwise fire, unlike the deferred settle-check.
    expect(manager.activeSession?.adapter.element).toBe(t);
    await Promise.resolve();
    expect(manager.activeSession?.adapter.element).toBe(t);
  });

  it('field-level disable pauses the focused field and resume brings it back (§4.1 #23)', () => {
    document.body.innerHTML = '<textarea id="t">hello</textarea>';
    manager = makeManager();
    manager.start();
    const t = document.getElementById('t') as HTMLTextAreaElement;
    focus(t);
    expect(manager.trackedCount).toBe(1);

    const paused = manager.pauseActiveField();
    expect(paused).toBe(t);
    expect(manager.trackedCount).toBe(0);
    expect(manager.activeSession).toBeNull();
    expect(manager.isActiveFieldPaused()).toBe(true);
    expect(manager.getStatus().availability).toBe('disabled-field');

    // Re-focusing a paused field must not re-attach.
    focus(t);
    expect(manager.trackedCount).toBe(0);

    manager.resumeField(t);
    expect(manager.isActiveFieldPaused()).toBe(false);
    expect(manager.trackedCount).toBe(1);
    expect(manager.getStatus().availability).toBe('ready');
  });

  it('a second field is unaffected when the first is paused (§4.1 #23)', () => {
    document.body.innerHTML =
      '<textarea id="a">one</textarea><textarea id="b">two</textarea>';
    manager = makeManager();
    manager.start();
    const a = document.getElementById('a') as HTMLTextAreaElement;
    const b = document.getElementById('b') as HTMLTextAreaElement;
    focus(a);
    manager.pauseActiveField();

    focus(b);
    expect(manager.activeSession?.adapter.element).toBe(b);
    expect(manager.getStatus().availability).toBe('ready');
  });
});
