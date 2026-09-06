/**
 * Replace the current selection's text inside an editable field with `newText`
 * (§11.3 — the "swap in a synonym" convenience from the define panel).
 *
 * This is a best-effort convenience, not the safety-critical suggestion-apply
 * path: it goes through a normal `input` event / `execCommand` so the page's own
 * undo still works, and it silently no-ops when the selection is not editable.
 */

export function replaceSelectionText(doc: Document, newText: string): boolean {
  const selection = doc.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return false;
  }
  const anchor =
    selection.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? (selection.anchorNode as Element)
      : (selection.anchorNode?.parentElement ?? null);
  if (!anchor) return false;

  const field = anchor.closest<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea',
  );
  if (field) {
    const start = field.selectionStart;
    const end = field.selectionEnd;
    if (start == null || end == null || start === end) return false;
    const value = field.value;
    field.value = value.slice(0, start) + newText + value.slice(end);
    const caret = start + newText.length;
    field.setSelectionRange(caret, caret);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  const editable = anchor.closest('[contenteditable]');
  if (editable && editable.getAttribute('contenteditable') !== 'false') {
    try {
      const ok = doc.execCommand('insertText', false, newText);
      if (ok) return true;
    } catch {
      /* fall through */
    }
    // Manual range replacement as a fallback.
    try {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(doc.createTextNode(newText));
      selection.collapseToEnd();
      editable.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
