/**
 * The small "Define" pill that appears at the end of a short text selection
 * (§11.3). Plain DOM in the Shadow host — no React on the page.
 */

import { createIcon } from '@/ui/icons';

export class DefinePill {
  readonly #el: HTMLButtonElement;
  readonly #doc: Document;
  readonly #word: HTMLElement;
  #onClick: (() => void) | null = null;

  constructor(uiLayer: HTMLElement) {
    this.#doc = uiLayer.ownerDocument;
    this.#el = this.#doc.createElement('button');
    this.#el.className = 'wr-def-pill';
    this.#el.type = 'button';
    this.#el.hidden = true;
    this.#el.setAttribute('aria-label', 'Define selected text');
    this.#el.append(createIcon(this.#doc, 'define', { size: 14 }));
    this.#word = this.#doc.createElement('span');
    this.#word.className = 'wr-def-pill-word';
    this.#el.append(this.#word, textNode(this.#doc, 'Define'));
    this.#el.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection
    this.#el.addEventListener('click', () => this.#onClick?.());
    uiLayer.appendChild(this.#el);
  }

  get visible(): boolean {
    return !this.#el.hidden;
  }

  show(rect: DOMRect, word: string, onClick: () => void): void {
    this.#onClick = onClick;
    this.#word.textContent = word.length > 18 ? `${word.slice(0, 17)}…` : word;
    this.#el.hidden = false;

    const win = this.#doc.defaultView;
    const vw = win?.innerWidth ?? 1024;
    const vh = win?.innerHeight ?? 768;
    // Measure then place: below-right of the selection end, flipped if clipped.
    const box = this.#el.getBoundingClientRect();
    let left = rect.right + 6;
    let top = rect.bottom + 6;
    if (left + box.width > vw - 8)
      left = Math.max(8, rect.left - box.width - 6);
    if (top + box.height > vh - 8) top = Math.max(8, rect.top - box.height - 6);
    this.#el.style.left = `${Math.round(left)}px`;
    this.#el.style.top = `${Math.round(top)}px`;
  }

  hide(): void {
    this.#el.hidden = true;
    this.#onClick = null;
  }

  destroy(): void {
    this.#el.remove();
  }
}

function textNode(doc: Document, s: string): Text {
  return doc.createTextNode(s);
}
