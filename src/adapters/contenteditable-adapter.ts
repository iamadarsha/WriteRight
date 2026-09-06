/**
 * Ordinary `contenteditable` adapter — §5.1 Tier A / §18.3.
 *
 * "Ordinary" = the browser edits real text nodes and standard `Range` APIs
 * work. Rich editors that virtualize or canvas-render text are *not* handled
 * here — the detector routes them to the unsupported adapter or a future
 * Tier-B/C site adapter (§5.1, §31 Rule 1).
 */

import type { EditorAdapterFactory, EditorCapabilities } from '@/types/editor';
import type { TextRange, TextSelection } from '@/types/text';
import { BaseAdapter } from './base-adapter';
import { ContentEditableModel } from './contenteditable-model';
import { normalizeLineEndings } from '@/core/text-normalize';
import {
  isContentEditableElement,
  isElementEditable,
  isElementVisible,
  looksLikeCodeEditor,
} from '@/utils/dom';
import { createLogger } from '@/utils/logger';

const log = createLogger('adapter:ce');

export class ContentEditableAdapter extends BaseAdapter {
  readonly kind = 'contenteditable';
  #model: ContentEditableModel | null = null;
  #modelVersion = -1;

  private get host(): HTMLElement {
    return this.element as HTMLElement;
  }

  private model(): ContentEditableModel {
    if (
      this.#model &&
      this.#modelVersion === this.getDocumentVersion() &&
      this.#model.isLive()
    ) {
      return this.#model;
    }
    this.#model = ContentEditableModel.build(this.host);
    this.#modelVersion = this.getDocumentVersion();
    return this.#model;
  }

  getText(): string {
    return normalizeLineEndings(this.model().text).text;
  }

  getSelection(): TextSelection | null {
    const sel = this.host.ownerDocument.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!this.host.contains(range.startContainer)) return null;

    const model = this.model();
    const start = model.fromDomPoint(range.startContainer, range.startOffset);
    const end = model.fromDomPoint(range.endContainer, range.endOffset);
    if (start === null || end === null) return null;

    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    const direction: TextSelection['direction'] =
      lo === hi ? 'none' : start <= end ? 'forward' : 'backward';
    return { start: lo, end: hi, direction };
  }

  getCapabilities(): EditorCapabilities {
    return {
      tier: 'A',
      realtime: true,
      inlineUnderlines: true,
      replace: true,
      readText: true,
    };
  }

  /**
   * Build a live DOM `Range` for a model offset span, for underline geometry
   * (§18.3). Returns `null` when the offsets can't be resolved against the
   * current DOM (e.g. the document changed since analysis).
   */
  buildRangeFor(start: number, end: number): Range | null {
    return this.model().buildRange(start, end);
  }

  protected doReplaceRange(range: TextRange, replacement: string): boolean {
    const model = this.model();
    const domRange = model.buildRange(range.start, range.end);
    if (!domRange) {
      log.debug('replaceRange: could not resolve DOM range');
      return false;
    }

    const doc = this.host.ownerDocument as Document & {
      execCommand?: (cmd: string, ui?: boolean, value?: string) => boolean;
    };
    const sel = doc.getSelection();

    // Preferred path: select the range and use execCommand('insertText'), which
    // keeps the native undo stack intact for contenteditable (§18.3). Deprecated
    // but still the most reliable when a live Selection is available.
    //
    // Focus MUST happen before the range is set, not after: the "Apply" click
    // that gets here focuses the popover's own button first, and a rich
    // editor's focus handler (ProseMirror does this) can reposition the
    // cursor as a side effect of regaining focus — silently clobbering
    // whatever Selection we'd already set, so execCommand edits the wrong
    // place (or nowhere visible) even though it reports success (§18.3).
    if (sel) {
      try {
        this.host.focus();
        sel.removeAllRanges();
        sel.addRange(domRange);
        if (doc.execCommand?.('insertText', false, replacement)) {
          this.#model = null;
          return true;
        }
      } catch {
        /* fall through to direct DOM edit */
      }
    }

    // Fallback: edit the Range directly + synthetic InputEvent. No dependency
    // on Selection, so this also works in non-browser DOM environments.
    try {
      domRange.deleteContents();
      if (replacement.length > 0) {
        const textNode = doc.createTextNode(replacement);
        domRange.insertNode(textNode);
        domRange.setStartAfter(textNode);
        domRange.collapse(true);
        if (sel) {
          try {
            sel.removeAllRanges();
            sel.addRange(domRange);
          } catch {
            /* selection is best-effort here */
          }
        }
      }
      this.host.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertReplacementText',
          data: replacement,
        }),
      );
      this.#model = null;
      return true;
    } catch (err) {
      log.warn('replaceRange failed', err);
      this.#model = null;
      return false;
    }
  }
}

export const contentEditableAdapterFactory: EditorAdapterFactory = {
  kind: 'contenteditable',
  priority: 50,
  canHandle(element) {
    if (!isContentEditableElement(element)) return false;
    // Only the editing host itself, not nested editable descendants.
    if (
      element.parentElement &&
      isContentEditableElement(element.parentElement) &&
      element.parentElement.getAttribute('contenteditable') !== 'false'
    ) {
      return false;
    }
    if (looksLikeCodeEditor(element)) return false;
    return isElementEditable(element) && isElementVisible(element);
  },
  create(element) {
    return new ContentEditableAdapter(element);
  },
};
