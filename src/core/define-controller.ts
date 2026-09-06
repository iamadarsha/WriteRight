/**
 * Select-to-define orchestration (§11.3).
 *
 * Ties the {@link SelectionWatcher} to the in-page {@link DefinePill} and
 * {@link DefinePanel}, and to the background `DEFINE` message. Nothing here can
 * hang: every lookup is wrapped in a short timeout and failures render an
 * honest "try again" note.
 */

import type { ShadowHost } from '@/ui/shadow-host';
import { SelectionWatcher, type PageSelection } from './selection-watcher';
import { DefinePill } from '@/ui/define/define-pill';
import { DefinePanel } from '@/ui/define/define-panel';
import { replaceSelectionText } from './replace-selection';
import { sendToBackground } from '@/messaging';
import type { DefineResult } from '@/engine/lexicon/types';
import { createLogger } from '@/utils/logger';

const log = createLogger('define');

const LOOKUP_TIMEOUT_MS = 2500;

export interface DefineControllerOptions {
  readonly host: ShadowHost;
  readonly document?: Document;
  /** Whether select-to-define is on right now (global + site + feature toggle). */
  readonly isEnabled: () => boolean;
}

export class DefineController {
  readonly #doc: Document;
  readonly #isEnabled: () => boolean;
  readonly #hostEl: HTMLElement;
  readonly #watcher: SelectionWatcher;
  readonly #pill: DefinePill;
  readonly #panel: DefinePanel;
  #cleanups: Array<() => void> = [];

  constructor(opts: DefineControllerOptions) {
    this.#doc = opts.document ?? document;
    this.#isEnabled = opts.isEnabled;
    this.#hostEl = opts.host.host;
    this.#pill = new DefinePill(opts.host.uiLayer);
    this.#panel = new DefinePanel(opts.host.uiLayer);
    this.#watcher = new SelectionWatcher({
      document: this.#doc,
      isEnabled: () => this.#isEnabled() && !this.#panel.isOpen,
      onSelection: (sel) => this.#onSelection(sel),
      onCleared: () => {
        if (!this.#panel.isOpen) this.#pill.hide();
      },
    });
  }

  start(): void {
    this.#watcher.start();
    const dismiss = (): void => {
      if (this.#pill.visible) this.#pill.hide();
      if (this.#panel.isOpen) this.#closePanel();
    };
    const win = this.#doc.defaultView;
    win?.addEventListener('scroll', dismiss, { passive: true, capture: true });
    win?.addEventListener('resize', dismiss, { passive: true });
    this.#cleanups.push(
      () => win?.removeEventListener('scroll', dismiss, true),
      () => win?.removeEventListener('resize', dismiss),
    );
  }

  stop(): void {
    this.#watcher.stop();
    for (const fn of this.#cleanups.splice(0)) fn();
    this.#pill.destroy();
    this.#panel.destroy();
  }

  /** Alt+D: define the current selection now, skipping the pill. */
  triggerFromShortcut(): void {
    if (!this.#isEnabled()) return;
    const sel = this.#watcher.evaluateNow();
    if (sel) this.#openPanel(sel);
  }

  /* ---- internals ------------------------------------------------- */

  #onSelection(sel: PageSelection): void {
    this.#pill.show(sel.rect, firstWord(sel.text), () => this.#openPanel(sel));
  }

  /**
   * Reflect the current define word onto the light-DOM host — no definitions,
   * just the queried word — so E2E can observe the closed-shadow panel (§6.8).
   */
  #reflect(word: string | null): void {
    if (word) this.#hostEl.setAttribute('data-wr-define', word);
    else this.#hostEl.removeAttribute('data-wr-define');
  }

  #openPanel(sel: PageSelection): void {
    this.#pill.hide();
    this.#reflect(sel.text);
    this.#panel.open(
      sel.rect,
      { kind: 'loading', word: sel.text },
      {
        onClose: () => this.#closePanel(),
        onLookup: (w) => void this.#lookup(w),
        onReplace: sel.editable
          ? (w) => {
              replaceSelectionText(this.#doc, w);
              this.#closePanel();
            }
          : undefined,
      },
      sel.editable,
    );
    void this.#lookup(sel.text);
  }

  async #lookup(text: string): Promise<void> {
    let result: DefineResult;
    try {
      result = await withTimeout(
        sendToBackground({ type: 'DEFINE', text: text.slice(0, 64) }).then(
          (r) => (r.ok ? r.data : { entries: [], unavailable: true }),
        ),
        LOOKUP_TIMEOUT_MS,
      );
    } catch (err) {
      log.debug('define lookup failed', err);
      if (this.#panel.isOpen) {
        this.#panel.render({ kind: 'error' });
        this.#reflect(`${text}|error`);
      }
      return;
    }
    if (this.#panel.isOpen) {
      this.#panel.render({ kind: 'result', result });
      this.#reflect(
        `${text}|${
          result.unavailable
            ? 'unavailable'
            : result.entries.length > 0
              ? `senses:${result.entries.reduce((n, e) => n + e.senses.length, 0)}`
              : 'none'
        }`,
      );
    }
  }

  #closePanel(): void {
    this.#panel.close();
    this.#pill.hide();
    this.#reflect(null);
  }
}

/* ---- helpers ------------------------------------------------------ */

function firstWord(text: string): string {
  return text.split(' ')[0] ?? text;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('lookup timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}
