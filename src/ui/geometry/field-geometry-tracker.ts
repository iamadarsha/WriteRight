/**
 * One place that watches a focused field's on-screen geometry (§8, §18.2).
 *
 * The launcher icon, the underline renderer, and the suggestion popover all
 * need to know "where is this field and its text right now" and "did that just
 * change". Before, each attached its own scroll (capture) + resize +
 * ResizeObserver + rAF loop against arbitrary third-party DOM — three copies of
 * the same fragile plumbing, and the source of three separate bugs. Now they
 * subscribe here: one set of listeners, one rAF-gated dispatch, one ~1s poll.
 *
 * Grammarly's own engineering write-up describes the same shape — listeners
 * plus a periodic poll for the changes listeners miss (a rich editor swapping
 * its own nodes, a layout shift with no event).
 */

export class FieldGeometryTracker {
  readonly #el: Element;
  readonly #doc: Document;
  readonly #subs = new Set<() => void>();
  readonly #cleanups: Array<() => void> = [];
  #rafId = 0;
  #pollId = 0;
  #disposed = false;

  constructor(el: Element) {
    this.#el = el;
    this.#doc = el.ownerDocument;
    const win = this.#doc.defaultView;
    const schedule = (): void => this.#schedule();

    // Scroll can happen on ANY ancestor of the field — capture catches them all.
    this.#doc.addEventListener('scroll', schedule, {
      passive: true,
      capture: true,
    });
    this.#cleanups.push(() =>
      this.#doc.removeEventListener('scroll', schedule, true),
    );

    if (win) {
      win.addEventListener('resize', schedule, { passive: true });
      this.#cleanups.push(() => win.removeEventListener('resize', schedule));
    }
    if (win && 'ResizeObserver' in win) {
      const ro = new win.ResizeObserver(schedule);
      ro.observe(el);
      this.#cleanups.push(() => ro.disconnect());
    }
    // §18.3 defensive poll: rich editors (ProseMirror, Lexical, …) replace
    // their own DOM nodes, and some layout shifts fire nothing. Subscribers
    // are cheap (rAF-gated, and they only read rects), so a slow tick self-heals
    // anything the listeners above miss.
    if (win) {
      this.#pollId = win.setInterval(schedule, 1000);
      this.#cleanups.push(() => win.clearInterval(this.#pollId));
    }
  }

  get element(): Element {
    return this.#el;
  }

  /** The field's current viewport rect. */
  fieldRect(): DOMRect {
    return this.#el.getBoundingClientRect();
  }

  /**
   * Subscribe to "geometry may have changed". Fires once immediately (rAF) so a
   * fresh subscriber positions itself. Returns an unsubscribe.
   */
  subscribe(cb: () => void): () => void {
    this.#subs.add(cb);
    this.#schedule();
    return () => {
      this.#subs.delete(cb);
    };
  }

  /** Force a dispatch (rAF-gated) — e.g. right after the adapter reports an edit. */
  notify(): void {
    this.#schedule();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const win = this.#doc.defaultView;
    if (this.#rafId && win) win.cancelAnimationFrame(this.#rafId);
    for (const fn of this.#cleanups.splice(0)) fn();
    this.#subs.clear();
  }

  #schedule(): void {
    if (this.#rafId || this.#disposed) return;
    const win = this.#doc.defaultView;
    if (!win) {
      this.#flush();
      return;
    }
    this.#rafId = win.requestAnimationFrame(() => {
      this.#rafId = 0;
      this.#flush();
    });
  }

  #flush(): void {
    if (this.#disposed) return;
    for (const cb of [...this.#subs]) {
      try {
        cb();
      } catch {
        /* one subscriber throwing must not stop the others */
      }
    }
  }
}
