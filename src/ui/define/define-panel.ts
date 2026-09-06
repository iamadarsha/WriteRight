/**
 * The offline definition panel (§11.3). Renders senses, part of speech,
 * synonyms and antonyms for a selected word. Plain DOM; keyboard operable
 * (Esc closes, an outside pointer-down closes).
 */

import { createIcon } from '@/ui/icons';
import type { DefineResult, LexEntry } from '@/engine/lexicon/types';

export interface DefinePanelCallbacks {
  /** A synonym chip was clicked — offered as a replacement when editable. */
  readonly onReplace?: (word: string) => void;
  /** A related-word chip was clicked to look it up instead. */
  readonly onLookup: (word: string) => void;
  readonly onClose: () => void;
}

type PanelState =
  | { kind: 'loading'; word: string }
  | { kind: 'result'; result: DefineResult }
  | { kind: 'error' };

export class DefinePanel {
  readonly #el: HTMLElement;
  readonly #doc: Document;
  #cb: DefinePanelCallbacks | null = null;
  #cleanups: Array<() => void> = [];
  #canReplace = false;
  #anchor: DOMRect | null = null;
  /** Collapsed by default (§8) — one sense, no chips, until expanded. */
  #expanded = false;
  #lastState: PanelState | null = null;

  constructor(uiLayer: HTMLElement) {
    this.#doc = uiLayer.ownerDocument;
    this.#el = this.#doc.createElement('div');
    this.#el.className = 'wr-def-panel';
    this.#el.setAttribute('role', 'dialog');
    this.#el.setAttribute('aria-label', 'Definition');
    this.#el.hidden = true;
    uiLayer.appendChild(this.#el);
  }

  get isOpen(): boolean {
    return !this.#el.hidden;
  }

  open(
    anchorRect: DOMRect,
    state: PanelState,
    cb: DefinePanelCallbacks,
    canReplace: boolean,
  ): void {
    this.#cb = cb;
    this.#canReplace = canReplace;
    this.#anchor = anchorRect;
    this.#expanded = false;
    this.#el.hidden = false;
    this.render(state);
    this.#attach();
  }

  render(state: PanelState): void {
    this.#lastState = state;
    this.#renderContent(state);
    this.reposition();
  }

  #renderContent(state: PanelState): void {
    this.#el.textContent = '';
    if (state.kind === 'loading') {
      this.#el.append(
        this.#header(state.word),
        skel(this.#doc),
        skel(this.#doc),
        skel(this.#doc),
      );
      return;
    }
    if (state.kind === 'error') {
      this.#el.append(
        this.#header('—'),
        note(this.#doc, 'Couldn’t load the dictionary. Try again in a moment.'),
      );
      return;
    }

    const { entries, unavailable } = state.result;
    if (unavailable) {
      this.#el.append(
        this.#header('—'),
        note(
          this.#doc,
          'The offline dictionary isn’t ready yet. It loads on first use — try again shortly.',
        ),
      );
      return;
    }
    if (entries.length === 0) {
      this.#el.append(
        this.#header('—'),
        note(this.#doc, 'No definition found for that selection.'),
      );
      return;
    }

    const primary = entries[0]!;
    const firstSense = primary.senses[0];
    const totalSenses = entries.reduce((n, e) => n + e.senses.length, 0);
    const moreSenses = totalSenses - 1;
    const firstHasExtra =
      !!firstSense &&
      (!!firstSense.example ||
        firstSense.synonyms.length > 0 ||
        firstSense.antonyms.length > 0);
    const canExpand = moreSenses > 0 || firstHasExtra;

    this.#el.classList.toggle('expanded', this.#expanded);
    this.#el.append(this.#header(primary.word, primary.resolvedFrom));
    const body = el(this.#doc, 'div', 'wr-def-body');
    const maxSenses = this.#expanded ? 8 : 1;
    let senseCount = 0;
    outer: for (const entry of entries) {
      for (const sense of entry.senses) {
        if (senseCount >= maxSenses) break outer;
        body.append(
          this.#senseBlock(entry, sense, senseCount === 0, this.#expanded),
        );
        senseCount += 1;
      }
    }
    this.#el.append(body);
    if (!this.#expanded && canExpand) {
      body.append(this.#expandToggle(moreSenses));
    }
  }

  #expandToggle(moreSenses: number): HTMLElement {
    const btn = el(this.#doc, 'button', 'wr-def-expand') as HTMLButtonElement;
    btn.type = 'button';
    const label =
      moreSenses > 0
        ? `${moreSenses} more sense${moreSenses === 1 ? '' : 's'}`
        : 'More';
    btn.append(
      text(this.#doc, label),
      createIcon(this.#doc, 'chevron-down', { size: 14 }),
    );
    btn.addEventListener('click', () => {
      this.#expanded = true;
      if (this.#lastState) this.render(this.#lastState);
    });
    return btn;
  }

  /** Re-anchor to the stored selection rect (after an async content swap). */
  reposition(): void {
    if (this.#anchor) this.#position(this.#anchor);
  }

  close(): void {
    this.#el.hidden = true;
    this.#el.textContent = '';
    this.#anchor = null;
    for (const fn of this.#cleanups.splice(0)) fn();
    this.#cb = null;
  }

  destroy(): void {
    this.close();
    this.#el.remove();
  }

  /* ---- rendering ------------------------------------------------- */

  #header(word: string, resolvedFrom?: string): HTMLElement {
    const head = el(this.#doc, 'div', 'wr-def-head');
    const w = el(this.#doc, 'span', 'wr-def-word');
    w.textContent = word;
    head.append(w);
    if (resolvedFrom) {
      const from = el(this.#doc, 'span', 'wr-def-from');
      from.textContent = `· from “${resolvedFrom}”`;
      head.append(from);
    }
    const close = el(this.#doc, 'button', 'wr-def-close') as HTMLButtonElement;
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.append(createIcon(this.#doc, 'close', { size: 15 }));
    close.addEventListener('click', () => this.#cb?.onClose());
    head.append(close);
    return head;
  }

  #senseBlock(
    entry: LexEntry,
    sense: LexEntry['senses'][number],
    first: boolean,
    expanded: boolean,
  ): HTMLElement {
    const block = el(this.#doc, 'div', 'wr-def-sense');
    const pos = el(this.#doc, 'span', 'wr-def-pos');
    pos.textContent = sense.pos;
    block.append(pos);
    const gloss = el(this.#doc, 'p', 'wr-def-gloss');
    gloss.textContent = sense.definition;
    block.append(gloss);
    // Collapsed view (§8): headword + one sense's part-of-speech and gloss
    // only — no example, no chips — a small box you can expand, not a
    // dialog that dumps everything at once.
    if (!expanded) return block;
    if (sense.example) {
      const ex = el(this.#doc, 'p', 'wr-def-example');
      ex.textContent = `“${sense.example}”`;
      block.append(ex);
    }
    if (first && sense.synonyms.length > 0) {
      block.append(this.#chipRow('Similar', sense.synonyms.slice(0, 8), false));
    }
    if (first && sense.antonyms.length > 0) {
      block.append(this.#chipRow('Opposite', sense.antonyms.slice(0, 5), true));
    }
    return block;
  }

  #chipRow(
    label: string,
    words: readonly string[],
    antonym: boolean,
  ): HTMLElement {
    const row = el(this.#doc, 'div', 'wr-def-rel');
    const lbl = el(this.#doc, 'span', 'wr-def-rel-label');
    lbl.textContent = label;
    row.append(lbl);
    for (const word of words) {
      const chip = el(
        this.#doc,
        'button',
        antonym ? 'wr-def-chip ant' : 'wr-def-chip',
      ) as HTMLButtonElement;
      chip.type = 'button';
      chip.textContent = word;
      chip.addEventListener('click', () => {
        if (!antonym && this.#canReplace && this.#cb?.onReplace) {
          this.#cb.onReplace(word);
        } else {
          this.#cb?.onLookup(word);
        }
      });
      row.append(chip);
    }
    return row;
  }

  /* ---- position + dismiss -------------------------------------- */

  #position(anchor: DOMRect): void {
    const win = this.#doc.defaultView;
    if (!win) return;
    const box = this.#el.getBoundingClientRect();
    const gap = 8;
    let left = anchor.left;
    let top = anchor.bottom + gap;
    let originY = 'top';
    if (left + box.width > win.innerWidth - gap) {
      left = Math.max(gap, win.innerWidth - gap - box.width);
    }
    if (top + box.height > win.innerHeight - gap) {
      top = Math.max(gap, anchor.top - gap - box.height);
      originY = 'bottom';
    }
    this.#el.style.left = `${Math.round(left)}px`;
    this.#el.style.top = `${Math.round(top)}px`;
    this.#el.style.setProperty('--wr-def-origin', `${originY} left`);
  }

  #attach(): void {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.#cb?.onClose();
      }
    };
    const onPointer = (e: Event): void => {
      if (e.target instanceof Node && !this.#el.contains(e.target)) {
        this.#cb?.onClose();
      }
    };
    this.#doc.addEventListener('keydown', onKey, true);
    const t = this.#doc.defaultView?.setTimeout(() => {
      this.#doc.addEventListener('pointerdown', onPointer, true);
    }, 0);
    this.#cleanups.push(
      () => this.#doc.removeEventListener('keydown', onKey, true),
      () => this.#doc.removeEventListener('pointerdown', onPointer, true),
      () => {
        if (t) this.#doc.defaultView?.clearTimeout(t);
      },
    );
  }
}

/* ---- helpers ------------------------------------------------------ */

function text(doc: Document, s: string): Text {
  return doc.createTextNode(s);
}

function el(doc: Document, tag: string, className: string): HTMLElement {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  return node;
}

function skel(doc: Document): HTMLElement {
  return el(doc, 'div', 'wr-def-skel');
}

function note(doc: Document, text: string): HTMLElement {
  const n = el(doc, 'p', 'wr-def-note');
  n.textContent = text;
  return n;
}
