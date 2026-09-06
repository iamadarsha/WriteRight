import { describe, it, expect, beforeEach, vi } from 'vitest';
import { replaceSelectionText } from '@/core/replace-selection';

function selectIn(node: Node, text: string, anchor: Node): void {
  void node;
  vi.spyOn(document, 'getSelection').mockReturnValue({
    isCollapsed: false,
    rangeCount: 1,
    anchorNode: anchor,
    toString: () => text,
    getRangeAt: () => ({
      deleteContents: () => {},
      insertNode: () => {},
    }),
    collapseToEnd: () => {},
  } as unknown as Selection);
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('replaceSelectionText (§11.3)', () => {
  it('splices a textarea value at the current selection range and fires input', () => {
    const ta = document.createElement('textarea');
    ta.value = 'the happy cat';
    document.body.append(ta);
    ta.setSelectionRange(4, 9); // "happy"
    selectIn(document, 'happy', ta);
    const events: string[] = [];
    ta.addEventListener('input', () => events.push('input'));

    expect(replaceSelectionText(document, 'glad')).toBe(true);
    expect(ta.value).toBe('the glad cat');
    expect(events).toEqual(['input']);
  });

  it('returns false when the selection is not in an editable field', () => {
    const p = document.createElement('p');
    p.textContent = 'plain text';
    document.body.append(p);
    selectIn(document, 'plain', p.firstChild!);
    expect(replaceSelectionText(document, 'simple')).toBe(false);
  });

  it('returns false for a collapsed selection', () => {
    vi.spyOn(document, 'getSelection').mockReturnValue({
      isCollapsed: true,
      rangeCount: 0,
    } as unknown as Selection);
    expect(replaceSelectionText(document, 'x')).toBe(false);
  });
});
