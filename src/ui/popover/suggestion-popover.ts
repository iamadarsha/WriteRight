/**
 * The inline suggestion popover (§9.7, §2.7), built with plain DOM so the
 * content-script bundle stays light — no React on every page (§17, §31 Rule 7).
 *
 * Mounted into the Shadow DOM host's UI layer. One instance is reused; `open()`
 * (re)renders it for a suggestion, `close()` hides it. Fully keyboard operable:
 * focus moves in on open, Tab is trapped, Esc closes, 1–4 apply a replacement,
 * an outside pointer-down closes (§9.5).
 */

import type { Suggestion } from '@/types/suggestion';
import { createIcon, type IconName } from '@/ui/icons';

export interface PopoverCallbacks {
  onApply: (replacementIndex: number) => void;
  onIgnoreOnce: () => void;
  onIgnoreRule: () => void;
  onAddToDictionary: () => void;
  /** Turn WriteRight off for the field this suggestion belongs to (§4.1 #23). */
  onDisableField: () => void;
  onExplainMore: () => Promise<string | null> | string | null;
  /** Fetch synonyms for the flagged word (§11.3). Absent ⇒ no "better word" row. */
  onSynonyms?: () => Promise<readonly string[]>;
  /** Apply an arbitrary replacement word (a chosen synonym). */
  onApplyWord?: (word: string) => void;
  /**
   * Rephrase the whole sentence this suggestion sits in (§3.5, §12.3). Absent ⇒
   * no "Rephrase" affordance. When `autoRephrase` is set the card runs this
   * itself on open, so a better sentence is waiting without a click.
   */
  onRephrase?: (
    onDelta?: (partial: string) => void,
  ) => Promise<
    | { ok: true; text: string; deterministic: boolean }
    | { ok: false; message: string }
  >;
  /** Apply a rephrased sentence returned by `onRephrase`. */
  onApplyRephrase?: (text: string) => void;
  /** Cancel an in-flight streaming rephrase — called when the card tears down. */
  onRephraseCancel?: () => void;
  onClose: () => void;
}

export interface OpenPopoverArgs extends PopoverCallbacks {
  readonly suggestion: Suggestion;
  readonly anchorRect: DOMRect;
  readonly canAddToDictionary: boolean;
  /** Run `onRephrase` automatically as the card opens (local AI is ready). */
  readonly autoRephrase?: boolean;
}

const CATEGORY: Record<
  Suggestion['source'],
  { label: string; icon: IconName }
> = {
  spell: { label: 'Spelling', icon: 'spelling' },
  grammar: { label: 'Grammar', icon: 'grammar' },
  punctuation: { label: 'Punctuation', icon: 'punctuation' },
  style: { label: 'Style', icon: 'style' },
  tone: { label: 'Tone', icon: 'tone' },
  readability: { label: 'Clarity', icon: 'readability' },
  ai: { label: 'AI', icon: 'sparkle' },
};

const SEVERITY_CLASS: Record<Suggestion['severity'], string> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
};

const GAP = 8;

export class SuggestionPopoverElement {
  readonly #el: HTMLElement;
  readonly #doc: Document;
  readonly #onToggle: ((open: boolean) => void) | undefined;
  #open: OpenPopoverArgs | null = null;
  #cleanups: Array<() => void> = [];
  /** Guards against the auto-run and a manual click both firing a rephrase. */
  #rephrasing = false;

  /**
   * The native top-layer `popover` + its light-dismiss (Chrome 114+, FF 125+,
   * Safari 17+). When present it replaces the hand-rolled document
   * `pointerdown` dismisser and the closed-shadow-root retarget special-case;
   * older engines keep the manual path.
   */
  readonly #native: boolean;

  constructor(uiLayer: HTMLElement, onToggle?: (open: boolean) => void) {
    this.#doc = uiLayer.ownerDocument;
    this.#onToggle = onToggle;
    this.#el = this.#doc.createElement('div');
    this.#native =
      typeof (this.#el as unknown as { showPopover?: unknown }).showPopover ===
      'function';
    this.#el.className = 'wr-pop';
    this.#el.setAttribute('role', 'dialog');
    // Tab focus is trapped in the card while it is open (`#trapFocus`), on both
    // paths — so `aria-modal` matches the keyboard reality for a screen-reader
    // user, and the two paths stay consistent.
    this.#el.setAttribute('aria-modal', 'true');
    if (this.#native) {
      this.#el.setAttribute('popover', 'auto');
      this.#el.addEventListener('toggle', (e) => {
        if (e.newState === 'closed' && this.#open) this.#open.onClose();
      });
    } else {
      this.#el.hidden = true;
    }
    uiLayer.appendChild(this.#el);
  }

  get openSuggestionId(): string | null {
    return this.#open?.suggestion.id ?? null;
  }

  get isOpen(): boolean {
    return this.#open !== null;
  }

  open(args: OpenPopoverArgs): void {
    const wasOpen = this.#open !== null;
    this.#open = args;
    this.#rephrasing = false;
    this.#showEl();
    this.#el.classList.remove('wr-pop-notice');
    this.#render();
    // Land focus on the primary action (the first replacement), not the close
    // button — so Enter applies the fix rather than dismissing the card. Cards
    // with no one-click fix (clarity, wordiness) fall back to the first action.
    const primary =
      this.#el.querySelector<HTMLElement>('.wr-pop-repl') ??
      this.#el.querySelector<HTMLElement>('.wr-pop-action') ??
      this.#el.querySelector<HTMLElement>('button');
    primary?.focus();
    this.#attachDismissers();
    this.#position(args.anchorRect);
    if (!wasOpen) this.#onToggle?.(true);
    if (args.autoRephrase && args.onRephrase) this.#runRephrase();
  }

  reanchor(anchorRect: DOMRect): void {
    if (!this.#open) return;
    this.#open = { ...this.#open, anchorRect };
    this.#position(anchorRect);
  }

  /**
   * Start the sentence rephrase from outside — the coordinator calls this once
   * an async "is local AI ready" check comes back true, so a clarity card
   * fills in its rewrite without the user clicking (§12.3).
   */
  triggerRephrase(): void {
    this.#runRephrase();
  }

  close(): void {
    if (!this.#open) return;
    if (this.#rephrasing) this.#open.onRephraseCancel?.();
    this.#open = null;
    this.#rephrasing = false;
    this.#hideEl();
    this.#el.textContent = '';
    this.#detachDismissers();
    this.#onToggle?.(false);
  }

  #showEl(): void {
    if (this.#native) {
      try {
        (this.#el as unknown as { showPopover(): void }).showPopover();
      } catch {
        /* already in the top layer */
      }
    } else {
      this.#el.hidden = false;
    }
  }

  #hideEl(): void {
    if (this.#native) {
      try {
        (this.#el as unknown as { hidePopover(): void }).hidePopover();
      } catch {
        /* already hidden */
      }
    } else {
      this.#el.hidden = true;
    }
  }

  /**
   * Replace the popover body with a one-line notice and auto-close (§9.7). Used
   * when an apply is refused so the click isn't a silent no-op.
   */
  flashNotice(message: string): void {
    const wasOpen = this.#open !== null;
    this.#open = null;
    this.#showEl();
    this.#el.textContent = '';
    this.#el.classList.add('wr-pop-notice');
    const p = this.#doc.createElement('p');
    p.className = 'wr-pop-msg';
    p.textContent = message;
    this.#el.append(p);
    const win = this.#doc.defaultView;
    win?.setTimeout(() => {
      this.#hideEl();
      this.#el.textContent = '';
      this.#el.classList.remove('wr-pop-notice');
    }, 1600);
    this.#detachDismissers();
    if (wasOpen) this.#onToggle?.(false);
  }

  destroy(): void {
    this.close();
    this.#el.remove();
  }

  /* ---- rendering -------------------------------------------------- */

  #render(): void {
    const args = this.#open;
    if (!args) return;
    const { suggestion: s } = args;
    const doc = this.#doc;
    this.#el.textContent = '';
    const cat = CATEGORY[s.source];
    this.#el.setAttribute('aria-label', `${cat.label} suggestion`);

    /* header: category chip + close */
    const head = el(doc, 'div', 'wr-pop-head');
    const chip = el(
      doc,
      'span',
      `wr-pop-cat ${SEVERITY_CLASS[s.severity]} src-${s.source}`,
    );
    chip.append(
      createIcon(doc, cat.icon, { size: 14 }),
      text(doc, 'span', '', cat.label),
    );
    const close = el(doc, 'button', 'wr-pop-close') as HTMLButtonElement;
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.append(createIcon(doc, 'close', { size: 14 }));
    close.addEventListener('click', () => args.onClose());
    head.append(chip, close);

    /* message + original */
    const msg = el(doc, 'p', 'wr-pop-msg');
    msg.textContent = s.message;
    if (s.original && !s.message.includes(s.original)) {
      msg.append(' ');
      const orig = el(doc, 'span', 'wr-pop-orig');
      orig.textContent = s.original;
      msg.append(orig);
    }
    this.#el.append(head, msg);

    /* replacements — number-keyed, highest confidence first (§9.7) */
    if (s.suggestions.length > 0) {
      const repls = el(doc, 'div', 'wr-pop-repls');
      s.suggestions.slice(0, 4).forEach((r, i) => {
        const b = el(doc, 'button', 'wr-pop-repl') as HTMLButtonElement;
        b.type = 'button';
        if (i > 0) b.classList.add('secondary');
        if (r === '') b.classList.add('remove');
        b.append(text(doc, 'span', 'wr-kbd', String(i + 1)));
        if (r !== '') b.append(text(doc, 'span', '', r));
        b.addEventListener('click', () => args.onApply(i));
        repls.append(b);
      });
      this.#el.append(repls);
    }

    /* actions */
    const actions = el(doc, 'div', 'wr-pop-actions');
    actions.append(
      this.#actionButton('Ignore', 'check', () => args.onIgnoreOnce()),
      this.#actionButton('Ignore rule here', 'shield', () =>
        args.onIgnoreRule(),
      ),
    );
    if (args.canAddToDictionary) {
      actions.append(
        this.#actionButton('Add to dictionary', 'book', () =>
          args.onAddToDictionary(),
        ),
      );
    }
    actions.append(
      this.#actionButton('Turn off for this field', 'eye-off', () =>
        args.onDisableField(),
      ),
    );
    const explainBtn = this.#actionButton(
      'Explain more',
      'info',
      () => {
        explainBtn.disabled = true;
        void Promise.resolve(args.onExplainMore()).then((why) => {
          this.#el.append(this.#explainPanel(s, why));
          this.#position(args.anchorRect);
        });
      },
      'accent',
    );
    actions.append(explainBtn);

    // "Find a better word" — synonyms for a single flagged word (§11.3).
    const oneWord = /^[\p{L}\p{M}'’-]+$/u.test(s.original);
    if (oneWord && args.onSynonyms && args.onApplyWord) {
      const synBtn = this.#actionButton(
        'Find a better word',
        'synonyms',
        () => {
          synBtn.disabled = true;
          void Promise.resolve(args.onSynonyms!()).then((words) => {
            this.#el.append(this.#synonymRow(words, args.onApplyWord!));
            this.#position(args.anchorRect);
          });
        },
      );
      actions.append(synBtn);
    }

    // "Rephrase sentence" — rewrite the whole sentence this flag sits in
    // (§3.5, §12.3). With local AI ready the card runs it on open (autoRephrase).
    if (args.onRephrase && args.onApplyRephrase) {
      actions.append(
        this.#actionButton('Rephrase sentence', 'wand', () =>
          this.#runRephrase(),
        ),
      );
    }

    this.#el.append(actions);
  }

  /**
   * Generate — then show — a rewrite of the whole sentence, inline in the card.
   * Idempotent per open: a second call while one is running is ignored.
   */
  #runRephrase(): void {
    const args = this.#open;
    if (!args?.onRephrase || !args.onApplyRephrase || this.#rephrasing) return;
    this.#rephrasing = true;
    this.#el.querySelector('.wr-pop-rephrase')?.remove();

    const doc = this.#doc;
    const box = el(doc, 'div', 'wr-pop-rephrase');
    const label = text(
      doc,
      'p',
      'wr-pop-rephrase-label',
      'Rewriting this sentence…',
    );
    const body = text(doc, 'p', 'wr-pop-rephrase-text streaming', '');
    box.append(label, body);
    this.#el.append(box);
    this.#position(args.anchorRect);

    const onApply = args.onApplyRephrase;
    const onDelta = (partial: string): void => {
      if (this.#open !== args) return;
      body.textContent = partial;
      this.#position(args.anchorRect);
    };

    void args
      .onRephrase(onDelta)
      .then((r) => {
        if (this.#open !== args) return; // card moved on
        body.classList.remove('streaming');
        if (!r.ok) {
          box.textContent = '';
          box.append(text(doc, 'p', 'wr-pop-rephrase-status', r.message));
          this.#rephrasing = false;
          this.#position(args.anchorRect);
          return;
        }
        label.textContent = r.deterministic
          ? 'Tidied (no AI)'
          : 'Suggested rewrite';
        body.textContent = r.text;
        const row = el(doc, 'div', 'wr-pop-rephrase-actions');
        const apply = el(doc, 'button', 'wr-pop-repl') as HTMLButtonElement;
        apply.type = 'button';
        apply.append(text(doc, 'span', '', 'Use this sentence'));
        apply.addEventListener('click', () => onApply(r.text));
        const redo = this.#actionButton('Try again', 'refresh', () => {
          this.#rephrasing = false;
          this.#runRephrase();
        });
        row.append(apply, redo);
        box.append(row);
        this.#rephrasing = false;
        this.#position(args.anchorRect);
      })
      .catch(() => {
        if (this.#open !== args) return;
        body.classList.remove('streaming');
        box.textContent = '';
        box.append(
          text(doc, 'p', 'wr-pop-rephrase-status', 'Rephrase failed.'),
        );
        this.#rephrasing = false;
      });
  }

  #synonymRow(
    words: readonly string[],
    onApplyWord: (word: string) => void,
  ): HTMLElement {
    const doc = this.#doc;
    const row = el(doc, 'div', 'wr-pop-synonyms');
    if (words.length === 0) {
      row.append(text(doc, 'span', 'wr-pop-syn-empty', 'No synonyms found.'));
      return row;
    }
    for (const word of words.slice(0, 8)) {
      const chip = el(doc, 'button', 'wr-pop-syn-chip') as HTMLButtonElement;
      chip.type = 'button';
      chip.textContent = word;
      chip.addEventListener('click', () => onApplyWord(word));
      row.append(chip);
    }
    return row;
  }

  #explainPanel(s: Suggestion, why: string | null): HTMLElement {
    const doc = this.#doc;
    const panel = el(doc, 'div', 'wr-pop-explain');
    const dl = doc.createElement('dl');
    const row = (term: string, body: string): void => {
      const dt = doc.createElement('dt');
      dt.textContent = term;
      const dd = doc.createElement('dd');
      dd.textContent = body;
      dl.append(dt, dd);
    };
    row('What', s.message);
    const reason = why ?? s.explanation ?? null;
    if (reason) row('Why', reason);
    if (s.suggestions[0] !== undefined && s.suggestions[0] !== '') {
      row('Fix', `${s.original || '…'} → ${s.suggestions[0]}`);
    }
    if (s.example) row('Example', s.example);
    panel.append(dl);
    return panel;
  }

  #actionButton(
    label: string,
    icon: IconName,
    onClick: () => void,
    variant?: 'accent',
  ): HTMLButtonElement {
    const b = el(this.#doc, 'button', 'wr-pop-action') as HTMLButtonElement;
    b.type = 'button';
    if (variant) b.classList.add(variant);
    b.append(
      createIcon(this.#doc, icon, { size: 13 }),
      text(this.#doc, 'span', '', label),
    );
    b.addEventListener('click', onClick);
    return b;
  }

  /* ---- position + dismiss -------------------------------------------- */

  #position(anchor: DOMRect): void {
    const win = this.#doc.defaultView;
    if (!win) return;
    const box = this.#el.getBoundingClientRect();
    let left = anchor.left;
    let top = anchor.bottom + GAP;
    let originY = 'top';
    let originX = 'left';
    if (left + box.width > win.innerWidth - GAP) {
      left = Math.max(GAP, win.innerWidth - GAP - box.width);
      originX = 'right';
    }
    if (top + box.height > win.innerHeight - GAP) {
      top = Math.max(GAP, anchor.top - GAP - box.height);
      originY = 'bottom';
    }
    this.#el.style.left = `${left}px`;
    this.#el.style.top = `${top}px`;
    this.#el.style.setProperty('--wr-pop-origin', `${originY} ${originX}`);
  }

  #attachDismissers(): void {
    const onKey = (e: KeyboardEvent): void => {
      // Native `popover=auto` handles Escape itself (→ `toggle` → onClose).
      if (e.key === 'Escape' && !this.#native) {
        e.stopPropagation();
        this.#open?.onClose();
        return;
      }
      if (e.key === 'Tab') {
        this.#trapFocus(e);
        return;
      }
      // 1–4 apply a replacement (§9.7 keyboard support).
      if (/^[1-4]$/.test(e.key) && this.#open) {
        const idx = Number(e.key) - 1;
        if (idx < this.#open.suggestion.suggestions.length) {
          e.preventDefault();
          this.#open.onApply(idx);
        }
      }
    };
    // WriteRight's UI lives in a *closed* shadow root, so a pointerdown on one
    // of the popover's own buttons is retargeted to the shadow host by the time
    // it reaches this document-level listener — `#el.contains(e.target)` is
    // then false for our own controls, and the card would dismiss itself before
    // the button's click could apply the fix (the "clicking the suggestion does
    // nothing" bug). Anything that resolves to our host happened somewhere in
    // WriteRight's UI; only a pointer on the page itself dismisses the card.
    const shadowHost = (this.#el.getRootNode() as ShadowRoot).host ?? null;
    const onPointer = (e: Event): void => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (target === shadowHost || this.#el.contains(target)) return;
      this.#open?.onClose();
    };
    this.#doc.addEventListener('keydown', onKey, true);
    this.#cleanups.push(() =>
      this.#doc.removeEventListener('keydown', onKey, true),
    );

    // The native top-layer popover's own light-dismiss replaces the hand-rolled
    // document `pointerdown` listener (and the closed-shadow-root retarget
    // special-case from da26e7b) — the browser knows the popover's flat-tree
    // subtree, shadow content included.
    if (this.#native) return;

    const t = this.#doc.defaultView?.setTimeout(() => {
      this.#doc.addEventListener('pointerdown', onPointer, true);
    }, 0);
    this.#cleanups.push(
      () => this.#doc.removeEventListener('pointerdown', onPointer, true),
      () => {
        if (t) this.#doc.defaultView?.clearTimeout(t);
      },
    );
  }

  #detachDismissers(): void {
    for (const fn of this.#cleanups.splice(0)) fn();
  }

  #trapFocus(e: KeyboardEvent): void {
    const focusable = this.#el.querySelectorAll<HTMLElement>(
      'button:not([disabled])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = this.#doc.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

function el(doc: Document, tag: string, className: string): HTMLElement {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  return node;
}
function text(
  doc: Document,
  tag: string,
  className: string,
  content = '',
): HTMLElement {
  const node = el(doc, tag, className);
  if (content) node.textContent = content;
  return node;
}
