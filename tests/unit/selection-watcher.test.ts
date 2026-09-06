import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SelectionWatcher } from '@/core/selection-watcher';

/**
 * jsdom has a minimal Selection. We drive `document.getSelection` directly and
 * assert the guard matrix (§6.4) rather than real mouse drags.
 */

function stubSelection(
  text: string,
  anchor: Node | null,
  rect: Partial<DOMRect> = { width: 20, height: 12, left: 5, bottom: 20 },
): void {
  const range = {
    getClientRects: () => [rect as DOMRect],
    getBoundingClientRect: () => rect as DOMRect,
  };
  vi.spyOn(document, 'getSelection').mockReturnValue({
    isCollapsed: text === '',
    rangeCount: text === '' ? 0 : 1,
    anchorNode: anchor,
    toString: () => text,
    getRangeAt: () => range,
  } as unknown as Selection);
}

let watcher: SelectionWatcher;
let seen: Array<{ text: string; editable: boolean }>;
let cleared: number;

beforeEach(() => {
  document.body.innerHTML = '';
  seen = [];
  cleared = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  watcher?.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function make(enabled = true): void {
  watcher = new SelectionWatcher({
    isEnabled: () => enabled,
    onSelection: (s) => seen.push({ text: s.text, editable: s.editable }),
    onCleared: () => (cleared += 1),
  });
  watcher.start();
}

function fire(): void {
  document.dispatchEvent(new Event('selectionchange'));
  vi.advanceTimersByTime(300);
}

describe('SelectionWatcher (§11.3, §6.4)', () => {
  it('reports a short word selection in ordinary text', () => {
    const p = document.createElement('p');
    p.textContent = 'serendipity in the wild';
    document.body.append(p);
    stubSelection('serendipity', p.firstChild);
    make();
    fire();
    expect(seen).toEqual([{ text: 'serendipity', editable: false }]);
  });

  it('marks a selection inside a textarea as editable', () => {
    const ta = document.createElement('textarea');
    document.body.append(ta);
    stubSelection('rewrite', ta);
    make();
    fire();
    expect(seen[0]).toEqual({ text: 'rewrite', editable: true });
  });

  it('never fires for a password field', () => {
    const input = document.createElement('input');
    input.type = 'password';
    document.body.append(input);
    stubSelection('hunter2', input);
    make();
    fire();
    expect(seen).toHaveLength(0);
  });

  it('never fires inside a code editor', () => {
    document.body.innerHTML =
      '<div class="cm-editor"><span id="c">const x</span></div>';
    stubSelection('const', document.getElementById('c')!.firstChild);
    make();
    fire();
    expect(seen).toHaveLength(0);
  });

  it('never fires inside WriteRight’s own host', () => {
    document.body.innerHTML =
      '<div data-writeright="host"><span id="w">Define</span></div>';
    stubSelection('Define', document.getElementById('w')!.firstChild);
    make();
    fire();
    expect(seen).toHaveLength(0);
  });

  it('rejects long selections, many words, and non-alphabetic runs', () => {
    const p = document.createElement('p');
    document.body.append(p);
    make();
    for (const bad of [
      'x'.repeat(70),
      'one two three four five six seven',
      '1234 5678',
      '::: === >>>',
    ]) {
      stubSelection(bad, p);
      fire();
    }
    expect(seen).toHaveLength(0);
  });

  it('does nothing while disabled', () => {
    const p = document.createElement('p');
    p.textContent = 'word';
    document.body.append(p);
    stubSelection('word', p.firstChild);
    make(false);
    fire();
    expect(seen).toHaveLength(0);
  });

  it('calls onCleared once after a real selection collapses', () => {
    const p = document.createElement('p');
    p.textContent = 'word here';
    document.body.append(p);
    stubSelection('word', p.firstChild);
    make();
    fire();
    stubSelection('', null);
    fire();
    expect(cleared).toBe(1);
  });
});
