/**
 * A small floating launcher that opens the sidebar (§8 "Inline assistant").
 * Also reachable by keyboard (the content controller binds Alt+W).
 *
 * While a supported field is focused, it anchors to that field's own bottom-right
 * corner — like Grammarly's field icon — so it sits next to whatever you're
 * actually typing into rather than a fixed spot on the screen, and shrinks to a
 * small icon-only circle with a tiny count badge (no label; the position next to
 * your cursor is the affordance). With no field to anchor to (nothing focused
 * yet, or an unsupported editor, §3.9/§5.1) it falls back to a labelled pill
 * fixed in the viewport corner, so WriteRight stays discoverable either way.
 */

import { createIcon } from '@/ui/icons';

const GAP_PX = 6;
/** How much of the icon sits *below* the field's bottom edge (0–1). Keeping
 * most of it past the edge means it never covers the last line of text — the
 * one place in a field where text is guaranteed not to be. */
const OVERHANG = 0.55;

export class SidebarLauncher {
  readonly #doc: Document;
  readonly #el: HTMLButtonElement;
  readonly #label: HTMLElement;
  readonly #onOpen: () => void;
  readonly #onResume: (() => void) | undefined;
  #visible = false;
  #resumeMode = false;
  #issues = 0;

  #target: Element | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #rafId = 0;
  #cleanups: Array<() => void> = [];

  constructor(uiLayer: HTMLElement, onOpen: () => void, onResume?: () => void) {
    const doc = uiLayer.ownerDocument;
    this.#doc = doc;
    this.#onOpen = onOpen;
    this.#onResume = onResume;
    this.#el = doc.createElement('button');
    this.#el.className = 'wr-launcher';
    this.#el.type = 'button';
    this.#el.hidden = true;
    this.#el.setAttribute('aria-label', 'Open WriteRight');

    const dot = doc.createElement('span');
    dot.className = 'wr-launcher-dot';
    this.#label = doc.createElement('span');
    this.#label.className = 'wr-launcher-label';
    this.#label.textContent = 'WriteRight';
    const count = doc.createElement('span');
    count.className = 'wr-launcher-count';
    count.hidden = true;

    this.#el.append(
      dot,
      createIcon(doc, 'sparkle', { size: 15 }),
      this.#label,
      count,
    );
    this.#el.addEventListener('click', () => {
      if (this.#resumeMode) this.#onResume?.();
      else this.#onOpen();
    });
    uiLayer.appendChild(this.#el);

    const schedule = (): void => this.#scheduleReposition();
    const win = doc.defaultView;
    win?.addEventListener('resize', schedule, { passive: true });
    this.#cleanups.push(() => win?.removeEventListener('resize', schedule));
    // Scroll can happen on any ancestor of the anchored field; capture-phase
    // catches them all (matches the underline renderer's own pattern).
    doc.addEventListener('scroll', schedule, { passive: true, capture: true });
    this.#cleanups.push(() =>
      doc.removeEventListener('scroll', schedule, true),
    );
  }

  /**
   * Anchor to `element`'s own box, or fall back to the fixed viewport-corner
   * pill when `null` — there's no specific field to sit next to yet.
   */
  attachTo(element: Element | null): void {
    if (this.#target === element) return;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#target = element;
    this.#el.classList.toggle('anchored', !!element);
    this.#label.hidden = !!element;
    if (element) {
      const win = this.#doc.defaultView;
      if (win && 'ResizeObserver' in win) {
        this.#resizeObserver = new win.ResizeObserver(() =>
          this.#scheduleReposition(),
        );
        this.#resizeObserver.observe(element);
      }
    } else {
      this.#el.style.left = '';
      this.#el.style.top = '';
    }
    this.#scheduleReposition();
  }

  /** Update the status dot + issue count. */
  setState(issues: number): void {
    this.#issues = issues;
    if (this.#resumeMode) return;
    const dot = this.#el.querySelector<HTMLElement>('.wr-launcher-dot');
    const count = this.#el.querySelector<HTMLElement>('.wr-launcher-count');
    if (dot) dot.classList.toggle('warn', issues > 0);
    if (count) {
      count.hidden = issues === 0;
      count.textContent = issues > 0 ? String(Math.min(issues, 99)) : '';
    }
    this.#el.setAttribute(
      'aria-label',
      issues > 0
        ? `Open WriteRight — ${issues} suggestion${issues === 1 ? '' : 's'}`
        : 'Open WriteRight',
    );
    this.#scheduleReposition(); // the badge appearing/growing can shift width
  }

  /**
   * Switch the pill between "open the sidebar" and "turn WriteRight back on for
   * this field" (§4.1 #23). In resume mode a click calls `onResume`.
   */
  setResumeMode(active: boolean): void {
    if (this.#resumeMode === active) return;
    this.#resumeMode = active;
    const dot = this.#el.querySelector<HTMLElement>('.wr-launcher-dot');
    const count = this.#el.querySelector<HTMLElement>('.wr-launcher-count');
    if (active) {
      this.#label.textContent = 'Turn on for this field';
      dot?.classList.remove('warn');
      dot?.classList.add('off');
      if (count) count.hidden = true;
      this.#el.classList.add('resume');
      this.#el.setAttribute('aria-label', 'Turn WriteRight on for this field');
    } else {
      this.#label.textContent = 'WriteRight';
      dot?.classList.remove('off');
      this.#el.classList.remove('resume');
      this.setState(this.#issues);
    }
  }

  show(): void {
    if (this.#visible) return;
    this.#visible = true;
    this.#el.hidden = false;
    this.#scheduleReposition();
  }

  hide(): void {
    if (!this.#visible) return;
    this.#visible = false;
    this.#el.hidden = true;
  }

  destroy(): void {
    this.#resizeObserver?.disconnect();
    const win = this.#doc.defaultView;
    if (this.#rafId && win) win.cancelAnimationFrame(this.#rafId);
    for (const fn of this.#cleanups.splice(0)) fn();
    this.#el.remove();
  }

  #scheduleReposition(): void {
    if (this.#rafId || !this.#target || !this.#visible) return;
    const win = this.#doc.defaultView;
    if (!win) return;
    this.#rafId = win.requestAnimationFrame(() => {
      this.#rafId = 0;
      this.#reposition();
    });
  }

  #reposition(): void {
    const target = this.#target;
    if (!target || !this.#visible) return;
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return; // mid-layout / detaching
    const win = this.#doc.defaultView;
    const vw = win?.innerWidth ?? rect.right;
    const vh = win?.innerHeight ?? rect.bottom;
    const box = this.#el.getBoundingClientRect();
    // Hug the field's bottom-right corner, sitting mostly *past* the bottom
    // edge so the icon never overlaps the text itself (§8). Right edge flush
    // with the field's right edge.
    const left = Math.min(
      Math.max(GAP_PX, rect.right - box.width),
      Math.max(GAP_PX, vw - box.width - GAP_PX),
    );
    // The lower clamp lets the icon keep ~60% past the viewport's bottom edge
    // rather than snapping back up over the text of a field that sits flush to
    // the fold (a compose bar pinned to the bottom of the window).
    const top = Math.min(
      Math.max(GAP_PX, rect.bottom - box.height * (1 - OVERHANG)),
      Math.max(GAP_PX, vh - box.height * 0.4),
    );
    this.#el.style.left = `${Math.round(left)}px`;
    this.#el.style.top = `${Math.round(top)}px`;
  }
}
