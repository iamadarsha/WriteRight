import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TextFieldManager, type PolicyState } from '@/core/text-field-manager';
import { createDefaultRegistry } from '@/adapters/adapter-registry';
import { detectField } from '@/core/field-capability-detector';

const ENABLED: PolicyState = {
  globallyEnabled: true,
  siteEnabled: true,
  pageInjectable: true,
};

function loadFixtureBody(name: string): void {
  const path = resolve(process.cwd(), 'tests/fixtures', name);
  const html = readFileSync(path, 'utf8');
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  document.body.innerHTML = bodyMatch?.[1] ?? html;
  // Execute inline <script> content (jsdom does not run them from innerHTML).
  for (const script of document.body.querySelectorAll('script')) {
    if (!script.src) {
      const run = new Function(script.textContent ?? '');
      run();
    }
  }
}

function makeManager(): {
  manager: TextFieldManager;
  statuses: () => number;
} {
  let count = 0;
  const manager = new TextFieldManager({
    registry: createDefaultRegistry(),
    origin: 'https://fixture.test',
    getPolicy: () => ENABLED,
    onStatusChange: () => {
      count += 1;
    },
  });
  return { manager, statuses: () => count };
}

function focus(el: HTMLElement): void {
  el.focus();
  el.dispatchEvent(
    new FocusEvent('focusin', { bubbles: true, composed: true }),
  );
}

let manager: TextFieldManager;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});
afterEach(() => {
  manager?.stop();
  vi.useRealTimers();
});

describe('editor fixtures (§1.8)', () => {
  it('vanilla.html: attaches to text/textarea/contenteditable, skips password & email', () => {
    loadFixtureBody('vanilla.html');
    ({ manager } = makeManager());
    manager.start();

    expect(
      detectField(document.querySelector('input[name="name"]')!).eligible,
    ).toBe(true);
    expect(
      detectField(document.querySelector('input[name="password"]')!).rejection,
    ).toBe('password-or-credential');
    expect(
      detectField(document.querySelector('input[name="email"]')!).rejection,
    ).toBe('excluded-input-type');
    expect(detectField(document.querySelector('textarea')!).eligible).toBe(
      true,
    );
    expect(
      detectField(document.querySelector('[contenteditable]')!).eligible,
    ).toBe(true);

    expect(manager.getStatus().availability).toBe('ready');
  });

  it('dynamic-content.html: picks up an editor injected after load (§1.5)', async () => {
    loadFixtureBody('dynamic-content.html');
    ({ manager } = makeManager());
    manager.start();
    expect(manager.trackedCount).toBe(0);

    (document.getElementById('add-field') as HTMLButtonElement).click();
    const ta = document.querySelector(
      'textarea.comment',
    ) as HTMLTextAreaElement;
    focus(ta);
    expect(manager.trackedCount).toBe(1);

    ta.remove();
    await vi.advanceTimersByTimeAsync(1200);
    expect(manager.trackedCount).toBe(0);
  });

  it('react-rerender.html: recovers after the editor subtree is replaced (§0.4)', async () => {
    loadFixtureBody('react-rerender.html');
    ({ manager } = makeManager());
    manager.start();
    focus(document.querySelector('textarea')!);
    expect(manager.trackedCount).toBe(1);

    const fresh = (
      window as unknown as { rerender: () => HTMLTextAreaElement }
    ).rerender();
    await vi.advanceTimersByTimeAsync(1200);
    // Old session pruned once its element left the DOM.
    expect(manager.trackedCount).toBe(0);

    focus(fresh);
    expect(manager.trackedCount).toBe(1);
    expect(manager.activeSession?.adapter.element).toBe(fresh);
  });

  it('shadow-dom.html: an editor inside an open shadow root is detected on focus', () => {
    loadFixtureBody('shadow-dom.html');
    ({ manager } = makeManager());
    manager.start();

    const widget = document.querySelector('comment-widget')!;
    const ta = widget.shadowRoot!.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    focus(ta);
    expect(manager.trackedCount).toBe(1);
  });

  it('code-editor-mock.html: CodeMirror / Monaco surfaces are rejected (§1.3)', () => {
    loadFixtureBody('code-editor-mock.html');
    ({ manager } = makeManager());
    manager.start();

    const cm = document.querySelector('.cm-content') as HTMLElement;
    expect(detectField(cm).rejection).toBe('likely-code-editor');

    focus(cm);
    expect(manager.trackedCount).toBe(0);
    expect(manager.getStatus().availability).not.toBe('ready');
  });

  it('nested-contenteditable.html: the editing host is adapted, not its children (§18.3)', () => {
    loadFixtureBody('nested-contenteditable.html');
    ({ manager } = makeManager());
    manager.start();

    const host = document.querySelector('.editor') as HTMLElement;
    expect(detectField(host).eligible).toBe(true);
    focus(host);
    expect(manager.trackedCount).toBe(1);
    expect(manager.activeSession?.adapter.element).toBe(host);
    expect(manager.activeSession?.adapter.getText()).toContain(
      'First paragraph',
    );
  });

  it('virtualized-editor.html: a virtualized editor is not treated as ordinary prose (§3.9)', () => {
    loadFixtureBody('virtualized-editor.html');
    ({ manager } = makeManager());
    manager.start();

    const editor = document.querySelector('.virt-editor') as HTMLElement;
    // The `.cm-editor` marker class → the code-editor heuristic rejects it.
    expect(detectField(editor).rejection).toBe('likely-code-editor');
    focus(editor);
    expect(manager.trackedCount).toBe(0);
  });

  it('canvas-editor.html: the hidden capture textarea is excluded (§6.4, §3.9)', () => {
    loadFixtureBody('canvas-editor.html');
    ({ manager } = makeManager());
    manager.start();

    const hidden = document.querySelector('.inputarea') as HTMLTextAreaElement;
    const d = detectField(hidden);
    expect(d.eligible).toBe(false);
    focus(hidden);
    expect(manager.trackedCount).toBe(0);
  });
});
