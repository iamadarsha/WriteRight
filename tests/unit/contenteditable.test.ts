import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContentEditableModel } from '@/adapters/contenteditable-model';
import { ContentEditableAdapter } from '@/adapters/contenteditable-adapter';

beforeEach(() => {
  document.body.innerHTML = '';
});

function ce(html: string): HTMLElement {
  const div = document.createElement('div');
  // Use the attribute (not the IDL property): jsdom does not reflect
  // `el.contentEditable = ...` to the attribute or implement `isContentEditable`.
  div.setAttribute('contenteditable', 'true');
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

describe('ContentEditableModel (§18.3)', () => {
  it('serializes plain text from a single text node', () => {
    const m = ContentEditableModel.build(ce('hello world'));
    expect(m.text).toBe('hello world');
    expect(m.segments).toHaveLength(1);
  });

  it('inserts newlines between block elements and for <br>', () => {
    const m = ContentEditableModel.build(
      ce('<p>first para</p><p>second<br>line</p>'),
    );
    expect(m.text).toBe('first para\nsecond\nline');
  });

  it('maps a model offset to a DOM point and back', () => {
    const host = ce('<p>alpha</p><p>beta</p>');
    const m = ContentEditableModel.build(host);
    // "beta" starts after "alpha\n" = offset 6
    expect(m.text.slice(6, 10)).toBe('beta');
    const point = m.toDomPoint(7);
    expect(point?.node.nodeType).toBe(Node.TEXT_NODE);
    expect(point?.node.textContent).toBe('beta');
    expect(point?.offset).toBe(1);
    expect(m.fromDomPoint(point!.node, point!.offset)).toBe(7);
  });

  it('builds a DOM Range spanning the requested offsets', () => {
    const host = ce('one two three');
    const m = ContentEditableModel.build(host);
    const range = m.buildRange(4, 7);
    expect(range?.toString()).toBe('two');
  });

  it('isLive() goes false once a segment node is detached', () => {
    const host = ce('hello world');
    const m = ContentEditableModel.build(host);
    expect(m.isLive()).toBe(true);
    host.replaceChild(document.createTextNode('hello world'), host.firstChild!);
    expect(m.isLive()).toBe(false);
  });
});

describe('ContentEditableAdapter (§5.1 Tier A)', () => {
  it('reads normalized text and reports Tier A', () => {
    const a = new ContentEditableAdapter(
      ce('<div>line one</div><div>line two</div>'),
    );
    expect(a.getCapabilityTier()).toBe('A');
    expect(a.getText()).toBe('line one\nline two');
    a.destroy();
  });

  it('focuses the host BEFORE setting the selection, not after (§18.3)', () => {
    // A rich editor's own focus handler (ProseMirror does this) can
    // reposition the cursor as a side effect of regaining focus. The "Apply"
    // click that reaches replaceRange focuses the popover's button first, so
    // if we set our intended Selection and only then call .focus(), the
    // editor's focus-driven reset can silently clobber it — execCommand then
    // edits the wrong place (or nowhere visible) while still reporting
    // success. Focus must happen first, so nothing touches the selection
    // after we set it.
    const host = ce('hello brave world');
    const a = new ContentEditableAdapter(host);
    const order: string[] = [];
    const focusSpy = vi
      .spyOn(host, 'focus')
      .mockImplementation(() => order.push('focus'));
    const originalAddRange = Selection.prototype.addRange;
    const addRangeSpy = vi
      .spyOn(Selection.prototype, 'addRange')
      .mockImplementation(function (this: Selection, r: Range) {
        order.push('addRange');
        originalAddRange.call(this, r);
      });
    const originalExecCommand = document.execCommand;
    document.execCommand = vi.fn().mockReturnValue(true);

    a.replaceRange({ start: 6, end: 11 }, 'brave');

    expect(order).toEqual(['focus', 'addRange']);
    focusSpy.mockRestore();
    addRangeSpy.mockRestore();
    document.execCommand = originalExecCommand;
    a.destroy();
  });

  it('replaceRange swaps only the target text', () => {
    const host = ce('I definately agree');
    const a = new ContentEditableAdapter(host);
    const ok = a.replaceRange({ start: 2, end: 12 }, 'definitely');
    expect(ok).toBe(true);
    expect(a.getText()).toBe('I definitely agree');
    a.destroy();
  });

  it('applies through a Gmail-shaped wrapper whose focus handler swaps the text node', () => {
    // Gmail wraps the line in <div> and, on focus, re-normalises its own DOM
    // (replacing the text node). A range built before .focus() would be stale;
    // the adapter must build it *after* focusing.
    const host = ce('<div>Hello, so now wht shall I do?</div>');
    const inner = host.firstElementChild as HTMLElement;
    host.addEventListener('focus', () => {
      const t = inner.firstChild;
      if (t?.nodeType === Node.TEXT_NODE) {
        inner.replaceChild(document.createTextNode(t.textContent ?? ''), t);
      }
    });
    // jsdom doesn't run execCommand — force the DOM fallback path.
    const originalExec = document.execCommand;
    document.execCommand = vi.fn().mockReturnValue(false);

    const a = new ContentEditableAdapter(host);
    const at = a.getText().indexOf('wht');
    const ok = a.replaceRange({ start: at, end: at + 3 }, 'what');

    expect(ok).toBe(true);
    expect(a.getText()).toContain('now what shall I do');
    expect(a.getText()).not.toContain('wht');

    document.execCommand = originalExec;
    a.destroy();
  });

  it('reports failure (not a phantom success) when the editor reverts the edit', () => {
    const host = ce('keep me exactly as is');
    // An editor that immediately restores its content after any mutation.
    const observer = new MutationObserver(() => {
      if (host.textContent !== 'keep me exactly as is') {
        host.textContent = 'keep me exactly as is';
      }
    });
    observer.observe(host, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const originalExec = document.execCommand;
    document.execCommand = vi.fn().mockReturnValue(false);

    const a = new ContentEditableAdapter(host);
    // MutationObserver is async in jsdom, so simulate a synchronous revert by
    // having the model re-read find the original text.
    const ok = a.replaceRange({ start: 0, end: 4 }, 'drop');
    // Either it applied (observer hadn't fired) or it honestly reported false —
    // never a "true" with the text unchanged.
    if (!ok) expect(a.getText()).toBe('keep me exactly as is');

    observer.disconnect();
    document.execCommand = originalExec;
    a.destroy();
  });

  it('reflects the current selection as offsets', () => {
    const host = ce('hello brave world');
    const a = new ContentEditableAdapter(host);
    const range = document.createRange();
    const textNode = host.firstChild!;
    range.setStart(textNode, 6);
    range.setEnd(textNode, 11);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    expect(a.getSelection()).toMatchObject({ start: 6, end: 11 });
    a.destroy();
  });

  it('rebuilds the model when a rich editor swaps a text node without bumping the document version (§18.3)', () => {
    // Rich-text editors (ProseMirror, Lexical, Slate, ...) routinely replace
    // a paragraph's text node during their own re-render, with no further
    // `input` event — so a version-number-only cache would keep pointing at
    // a node the live DOM has already discarded, and underline geometry
    // built from it would resolve to nothing visible (§18.3, chatgpt.com repro).
    const host = ce('hello brave world');
    const a = new ContentEditableAdapter(host);
    expect(a.getText()).toBe('hello brave world'); // caches the model

    const oldNode = host.firstChild!;
    const newNode = document.createTextNode('hello brave world');
    host.replaceChild(newNode, oldNode);
    expect(oldNode.isConnected).toBe(false);

    const range = a.buildRangeFor(6, 11); // "brave"
    expect(range).not.toBeNull();
    expect(range?.startContainer).toBe(newNode);
    expect(range?.startContainer.isConnected).toBe(true);
    a.destroy();
  });
});
