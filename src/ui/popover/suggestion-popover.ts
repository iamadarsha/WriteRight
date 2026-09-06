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
  onClose: () => void;
}

export interface OpenPopoverArgs extends PopoverCallbacks {
  readonly suggestion: Suggestion;
  readonly anchorRect: DOMRect;
  readonly canAddToDictionary: boolean;
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
  readability: { label: 'Readability', icon: 'readability' },
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

  constructor(uiLayer: HTMLElement, onToggle?: (open: boolean) => void) {
    this.#doc = uiLayer.ownerDocument;
    this.#onToggle = onToggle;
    this.#el = this.#doc.createElement('div');
    this.#el.className = 'wr-pop';
    this.#el.setAttribute('role', 'dialog');
    this.#el.setAttribute('aria-modal', 'true');
    this.#el.hidden = true;
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
    this.#el.hidden = false;
    this.#render();
    this.#el.querySelector<HTMLElement>('button')?.focus();
    this.#attachDismissers();
    this.#position(args.anchorRect);
    if (!wasOpen) this.#onToggle?.(true);
  }

  reanchor(anchorRect: DOMRect): void {
    if (!this.#open) return;
    this.#open = { ...this.#open, anchorRect };
    this.#position(anchorRect);
  }

  close(): void {
    if (!this.#open) return;
    this.#open = null;
    this.#el.hidden = true;
    this.#el.textContent = '';
    this.#detachDismissers();
    this.#onToggle?.(false);
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
    const chip = el(doc, 'span', `wr-pop-cat ${SEVERITY_CLASS[s.severity]}`);
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

    this.#el.append(actions);
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
      if (e.key === 'Escape') {
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
    const onPointer = (e: Event): void => {
      if (e.target instanceof Node && !this.#el.contains(e.target)) {
        this.#open?.onClose();
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
