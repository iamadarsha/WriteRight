/**
 * Watches for a short text selection anywhere on the page and reports it, so the
 * select-to-define pill can appear (§11.3). Everything here is O(1) per event,
 * debounced, and never touches the network or the engine.
 *
 * Guards (§6.4): never fires for a selection inside a password / credential
 * field, a code editor, or WriteRight's own Shadow DOM host.
 */

import { createLogger } from '@/utils/logger';

const log = createLogger('selection');

const DEBOUNCE_MS = 220;
const MAX_CHARS = 64;
const MAX_WORDS = 6;
const MIN_LETTER_RATIO = 0.55;

const CODE_EDITOR_SELECTOR =
  '.cm-editor, .CodeMirror, .monaco-editor, .ace_editor, pre, code, [role="code"]';

export interface PageSelection {
  /** The selected text, trimmed and single-spaced. */
  readonly text: string;
  /** Viewport rect of the selection's end, to anchor the pill. */
  readonly rect: DOMRect;
  /** True when the selection sits inside an editable control (enables "replace"). */
  readonly editable: boolean;
}

export interface SelectionWatcherOptions {
  readonly document?: Document;
  /** Whether select-to-define is currently on (global + site + feature toggle). */
  readonly isEnabled: () => boolean;
  readonly onSelection: (sel: PageSelection) => void;
  /** Called when the selection clears or becomes invalid. */
  readonly onCleared: () => void;
}

export class SelectionWatcher {
  readonly #doc: Document;
  readonly #opts: SelectionWatcherOptions;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #started = false;
  #lastText = '';

  constructor(opts: SelectionWatcherOptions) {
    this.#opts = opts;
    this.#doc = opts.document ?? document;
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#doc.addEventListener('selectionchange', this.#onChange);
    this.#doc.addEventListener('mouseup', this.#onChange, true);
    this.#doc.addEventListener('keyup', this.#onKeyUp, true);
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;
    this.#doc.removeEventListener('selectionchange', this.#onChange);
    this.#doc.removeEventListener('mouseup', this.#onChange, true);
    this.#doc.removeEventListener('keyup', this.#onKeyUp, true);
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  /** Force an immediate re-check (used by the Alt+D shortcut). */
  evaluateNow(): PageSelection | null {
    return this.#evaluate();
  }

  #onKeyUp = (e: KeyboardEvent): void => {
    // Only shift+arrows / shift+home/end extend a selection by keyboard.
    if (e.shiftKey || e.key === 'Shift') this.#onChange();
  };

  #onChange = (): void => {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      const sel = this.#evaluate();
      if (sel) {
        this.#lastText = sel.text;
        this.#opts.onSelection(sel);
      } else if (this.#lastText) {
        this.#lastText = '';
        this.#opts.onCleared();
      }
    }, DEBOUNCE_MS);
  };

  #evaluate(): PageSelection | null {
    if (!this.#opts.isEnabled()) return null;
    const selection = this.#doc.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }

    const text = selection.toString().trim().replace(/\s+/g, ' ');
    if (!text || text.length > MAX_CHARS) return null;
    if (text.split(' ').length > MAX_WORDS) return null;

    const letters = (text.match(/\p{L}/gu) ?? []).length;
    if (letters / text.length < MIN_LETTER_RATIO) return null;
    if (!/\p{L}{2,}/u.test(text)) return null;

    const anchor = nearestElement(selection.anchorNode);
    if (!anchor) return null;
    if (anchor.closest('[data-writeright]')) return null;
    if (isSensitiveField(anchor)) return null;
    if (anchor.closest(CODE_EDITOR_SELECTOR)) return null;

    let rect: DOMRect;
    try {
      const range = selection.getRangeAt(0);
      const rects = range.getClientRects();
      rect =
        rects.length > 0
          ? rects[rects.length - 1]!
          : range.getBoundingClientRect();
    } catch (err) {
      log.debug('selection rect failed', err);
      return null;
    }
    if (rect.width === 0 && rect.height === 0) return null;

    return { text, rect, editable: isEditable(anchor) };
  }
}

/* ---- helpers -------------------------------------------------------- */

function nearestElement(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

function isEditable(el: Element): boolean {
  if (el.closest('input, textarea')) return true;
  const ce = el.closest('[contenteditable]');
  return !!ce && ce.getAttribute('contenteditable') !== 'false';
}

const SENSITIVE_TYPES = new Set([
  'password',
  'email',
  'tel',
  'number',
  'search',
  'url',
]);
const SENSITIVE_HINT = /pass|pwd|otp|pin|cvv|cvc|secret|card|ssn|social/i;

function isSensitiveField(el: Element): boolean {
  const input = el.closest('input');
  if (!input) return false;
  const type = (input.getAttribute('type') ?? 'text').toLowerCase();
  if (SENSITIVE_TYPES.has(type)) return true;
  const hay = `${input.name} ${input.id} ${input.getAttribute('autocomplete') ?? ''}`;
  return SENSITIVE_HINT.test(hay);
}
