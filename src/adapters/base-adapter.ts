/**
 * Common lifecycle machinery for every {@link EditorAdapter} (§5.2, §5.3).
 *
 * Handles: id, monotonic document version, IME composition tracking, listener
 * fan-out, and idempotent teardown. Concrete adapters implement the small set
 * of element-specific operations.
 */

import type {
  CapabilityTier,
  EditorAdapter,
  EditorCapabilities,
  EditorChange,
  EditorChangeListener,
} from '@/types/editor';
import type { TextRange, TextSelection } from '@/types/text';
import { DocumentVersion } from '@/core/document-version';
import { newId } from '@/utils/id';
import { isContentEditableElement } from '@/utils/dom';
import { createLogger } from '@/utils/logger';

const log = createLogger('adapter');

export abstract class BaseAdapter implements EditorAdapter {
  readonly id: string;
  abstract readonly kind: string;
  readonly element: Element;

  protected readonly version = new DocumentVersion();
  readonly #listeners = new Set<EditorChangeListener>();
  readonly #cleanups: Array<() => void> = [];
  #composing = false;
  #destroyed = false;

  constructor(element: Element) {
    this.element = element;
    this.id = newId('ed');
    this.#installCompositionTracking();
  }

  /* ---- element-specific operations, implemented by subclasses ------------- */

  abstract getText(): string;
  abstract getSelection(): TextSelection | null;
  abstract getCapabilities(): EditorCapabilities;
  /** Perform the replacement. Return `false` to signal "not applied" (§10.4). */
  protected abstract doReplaceRange(
    range: TextRange,
    replacement: string,
  ): boolean;

  /* ---- shared implementation -------------------------------------------- */

  getCapabilityTier(): CapabilityTier {
    return this.getCapabilities().tier;
  }

  getDocumentVersion(): number {
    return this.version.value;
  }

  isComposing(): boolean {
    return this.#composing;
  }

  isEditable(): boolean {
    const el = this.element;
    if (!el.isConnected) return false;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return !el.disabled && !el.readOnly;
    }
    return isContentEditableElement(el);
  }

  focus(): void {
    if (this.element instanceof HTMLElement) this.element.focus();
  }

  replaceRange(range: TextRange, replacement: string): boolean {
    if (this.#destroyed) return false;
    if (!this.isEditable()) {
      log.debug('replaceRange skipped: not editable', this.kind);
      return false;
    }
    if (this.#composing) {
      log.debug('replaceRange skipped: IME composing', this.kind);
      return false;
    }
    const text = this.getText();
    if (range.start < 0 || range.end > text.length || range.start > range.end) {
      log.debug('replaceRange skipped: range out of bounds', this.kind);
      return false;
    }
    const applied = this.doReplaceRange(range, replacement);
    if (applied) this.notifyChange('programmatic');
    return applied;
  }

  subscribe(listener: EditorChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    while (this.#cleanups.length > 0) {
      const fn = this.#cleanups.pop();
      try {
        fn?.();
      } catch (err) {
        log.warn('adapter cleanup threw', err);
      }
    }
    this.#listeners.clear();
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  /* ---- protected helpers for subclasses --------------------------------- */

  /** Register a teardown callback run exactly once on {@link destroy}. */
  protected addCleanup(fn: () => void): void {
    this.#cleanups.push(fn);
  }

  /** Attach a DOM listener that is auto-removed on {@link destroy}. */
  protected listen<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K | string,
    handler: (ev: Event) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.addCleanup(() => target.removeEventListener(type, handler, options));
  }

  /** Bump the document version and notify subscribers. */
  protected notifyChange(reason: EditorChange['reason']): void {
    const change: EditorChange = { version: this.version.bump(), reason };
    for (const listener of [...this.#listeners]) {
      try {
        listener(change);
      } catch (err) {
        log.warn('adapter change listener threw', err);
      }
    }
  }

  #installCompositionTracking(): void {
    const el = this.element;
    this.listen(el, 'compositionstart', () => {
      this.#composing = true;
    });
    this.listen(el, 'compositionend', () => {
      this.#composing = false;
      // Composition finished — treat as a real change (§5.3).
      this.notifyChange('composition');
    });
    this.listen(el, 'input', (ev) => {
      if (this.#composing) return; // defer until compositionend
      const inputType = (ev as InputEvent).inputType ?? '';
      const reason = inputType.startsWith('insertFromPaste')
        ? 'paste'
        : 'input';
      this.notifyChange(reason);
    });
  }
}
