/**
 * Text Field Manager (§16, §1.5, §17.4).
 *
 * The heart of the content-script world. Responsibilities:
 *  - discover editing surfaces (focus-driven + a debounced MutationObserver),
 *  - attach exactly one {@link EditorSession} per surface, idempotently (§5.3),
 *  - keep only the focused surface "active" for real-time work (§17.4),
 *  - tear down sessions when their element leaves the DOM,
 *  - react to page-lifecycle events (SPA nav, bfcache, visibility) (§0.4),
 *  - compute the page availability status shown in the popup (§1.6, §27).
 *
 * It performs NO linguistic analysis — that arrives in Phase 2 behind the
 * engine host. It also never mutates the host page except through an adapter's
 * explicit `replaceRange` (§31 Rule 13).
 */

import type { AdapterRegistry } from '@/adapters/adapter-registry';
import type { DetectorOptions } from './field-capability-detector';
import type { PageAvailability, PageStatus } from '@/types/capability';
import type { CapabilityTier } from '@/types/editor';
import { EditorSession } from './editor-session';
import { detectField, isPotentialEditor } from './field-capability-detector';
import { PageLifecycle } from './page-lifecycle';
import {
  resolveSiteProfile,
  type SiteProfile,
} from '@/adapters/sites/site-profiles';
import { debounce } from '@/utils/scheduler';
import { createLogger } from '@/utils/logger';

const log = createLogger('field-manager');

const EDITOR_SELECTOR =
  'textarea, input, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

export interface PolicyState {
  readonly globallyEnabled: boolean;
  readonly siteEnabled: boolean;
  /** `false` when the browser forbids injection here (§0.4). Rare for content scripts. */
  readonly pageInjectable: boolean;
}

export interface TextFieldManagerOptions {
  readonly registry: AdapterRegistry;
  readonly origin: string;
  readonly getPolicy: () => PolicyState;
  readonly onStatusChange: (status: PageStatus) => void;
  /** Fired when the focused editor session changes (§17.4). Phase 2: analysis. */
  readonly onActiveSessionChange?: (session: EditorSession | null) => void;
  readonly detectorOptions?: DetectorOptions;
  readonly document?: Document;
  /**
   * Current page location, for site-profile matching (§5.1). Defaults to the
   * managed document's own location; injectable for tests.
   */
  readonly location?: Pick<Location, 'hostname' | 'pathname'>;
}

const TIER_ORDER: Record<CapabilityTier, number> = { A: 3, B: 2, C: 1, D: 0 };

export class TextFieldManager {
  readonly #opts: TextFieldManagerOptions;
  readonly #doc: Document;
  readonly #sessions = new Map<Element, EditorSession>();
  readonly #lifecycle = new PageLifecycle();
  /**
   * Fields the user turned WriteRight off for (§4.1 #23). Session-scoped: a
   * field element has no stable identity across reloads, so this deliberately
   * does not persist — reloading the page is the documented "resume all".
   */
  readonly #pausedFields = new WeakSet<Element>();

  #active: EditorSession | null = null;
  #observer: MutationObserver | null = null;
  #started = false;
  #lastStatusKey = '';
  /** Non-null on a known canvas/virtualized editor (Google Docs &c., §5.1). */
  readonly #siteProfile: SiteProfile | null;

  constructor(options: TextFieldManagerOptions) {
    this.#opts = options;
    this.#doc = options.document ?? document;
    const loc = options.location ?? this.#doc.defaultView?.location;
    this.#siteProfile = loc
      ? resolveSiteProfile({
          hostname: loc.hostname,
          pathname: loc.pathname,
        })
      : null;
  }

  /* ---- lifecycle ------------------------------------------------------- */

  start(): void {
    if (this.#started) return;
    this.#started = true;

    this.#doc.addEventListener('focusin', this.#onFocusIn, true);
    this.#doc.addEventListener('focusout', this.#onFocusOut, true);

    this.#observer = new MutationObserver(this.#onMutations);
    this.#observer.observe(this.#doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'contenteditable',
        'disabled',
        'readonly',
        'type',
        'hidden',
      ],
    });

    this.#wireLifecycle();
    this.#lifecycle.start();

    // Attach to whatever is already focused, then publish status.
    this.#maybeAttach(this.#deepActive());
    this.#publishStatus();
    log.debug('manager started', { origin: this.#opts.origin });
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;

    this.#doc.removeEventListener('focusin', this.#onFocusIn, true);
    this.#doc.removeEventListener('focusout', this.#onFocusOut, true);
    this.#observer?.disconnect();
    this.#observer = null;
    this.#scheduleRescan.cancel();
    this.#lifecycle.stop();

    for (const session of this.#sessions.values()) session.destroy();
    this.#sessions.clear();
    this.#clearActive(false);
  }

  /** Re-evaluate policy: tear everything down if we may no longer run. */
  refreshPolicy(): void {
    if (!this.#started) return;
    if (!this.#canOperate()) {
      for (const session of this.#sessions.values()) session.destroy();
      this.#sessions.clear();
      this.#clearActive(false);
    } else {
      this.#maybeAttach(this.#deepActive());
    }
    this.#publishStatus();
  }

  /** Public: current page status (used to answer popup queries synchronously). */
  getStatus(): PageStatus {
    return this.#computeStatus();
  }

  /**
   * Turn WriteRight off for the focused field (§4.1 #23). Tears the session
   * down, leaves the field untouched, and reports the new status. Returns the
   * element that was paused, or `null` if there was no eligible active field.
   */
  pauseActiveField(): Element | null {
    const el = this.#active?.adapter.element ?? this.#deepActive();
    if (!el || !isPotentialEditor(el)) return null;
    this.#pausedFields.add(el);
    const session = this.#sessions.get(el);
    if (session) {
      session.destroy();
      this.#sessions.delete(el);
      if (this.#active === session) this.#clearActive(false);
    }
    this.#publishStatus();
    return el;
  }

  /** Whether the focused field is one the user turned WriteRight off for. */
  isActiveFieldPaused(): boolean {
    const el = this.#deepActive();
    return !!el && this.#pausedFields.has(el);
  }

  /**
   * Turn WriteRight back on for a previously paused field (default: the focused
   * one) and re-attach immediately if it is still focused (§4.1 #23).
   */
  resumeField(element?: Element | null): void {
    const el = element ?? this.#deepActive();
    if (!el) return;
    this.#pausedFields.delete(el);
    if (el === this.#deepActive()) this.#maybeAttach(el);
    this.#publishStatus();
  }

  get activeSession(): EditorSession | null {
    return this.#active;
  }

  get trackedCount(): number {
    return this.#sessions.size;
  }

  /* ---- focus handling ------------------------------------------------- */

  #onFocusIn = (event: Event): void => {
    // A `focusin` that crosses a shadow boundary is retargeted to the host, so
    // prefer the real composed-path target; fall back to the deep active element.
    const composed = event.composedPath?.();
    const target =
      composed && composed[0] instanceof Element
        ? composed[0]
        : event.target instanceof Element
          ? event.target
          : this.#deepActive();
    if (target) this.#maybeAttach(target);
  };

  #onFocusOut = (event: FocusEvent): void => {
    // A mousedown on our own anchored launcher blurs the field *before* the
    // browser finishes moving focus to the button — `document.activeElement`
    // hasn't settled yet, so checking it (even deferred) can still read as
    // "focus left WriteRight" and clear the session, which un-anchors and
    // hides the very button being clicked, mid-click (§8, chatgpt.com repro:
    // clicking the launcher did nothing because it vanished under the
    // pointer). `relatedTarget` carries the browser's already-decided next
    // focus target synchronously, before that race window opens, so check it
    // first and skip the deferred settle-check entirely when it's ours.
    const related =
      event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (this.#isOwnUi(related)) return;
    // Defer: focus often bounces between elements within one interaction.
    queueMicrotask(() => {
      const active = this.#deepActive();
      // Focus moving into WriteRight's own in-page UI (the suggestion popover
      // or sidebar, which live in a closed shadow root that reports its host as
      // `document.activeElement`) is not the user leaving the editor — keep the
      // session alive so the popover it just opened is not torn down (§5.3).
      if (this.#isOwnUi(active)) return;
      if (this.#active && this.#active.adapter.element !== active) {
        this.#clearActive();
        this.#publishStatus();
      }
    });
  };

  #isOwnUi(el: Element | null): boolean {
    return (
      !!el &&
      (el.id === 'writeright-host' ||
        el.hasAttribute?.('data-writeright') ||
        !!el.closest?.('[data-writeright]'))
    );
  }

  #maybeAttach(element: Element | null): void {
    if (!element || !this.#canOperate()) return;
    if (!isPotentialEditor(element)) return;
    if (this.#pausedFields.has(element)) {
      // The user turned WriteRight off for this field — stay hands-off but
      // let the status reflect it so the launcher can offer "turn back on".
      this.#publishStatus();
      return;
    }

    const existing = this.#sessions.get(element);
    if (existing) {
      this.#setActive(existing);
      return;
    }

    const detection = detectField(element, this.#opts.detectorOptions);
    if (!detection.eligible) {
      log.debug('field rejected', detection.rejection);
      this.#publishStatus();
      return;
    }

    // Tier A adapter, or a forced unsupported (Tier D) so we can be honest.
    const adapter =
      this.#opts.registry.create(element, false) ??
      this.#opts.registry.create(element, true);
    if (!adapter) return;

    const session = new EditorSession(adapter);
    this.#sessions.set(element, session);
    this.#setActive(session);
    log.debug('attached', {
      kind: adapter.kind,
      tier: adapter.getCapabilityTier(),
    });
    this.#publishStatus();
  }

  #setActive(session: EditorSession): void {
    if (this.#active === session) {
      // Same session, but it may have been deactivated (e.g. tab was hidden).
      if (!session.isActive) session.activate(() => this.#publishStatus());
      return;
    }
    this.#active?.deactivate();
    this.#active = session;
    session.activate(() => {
      this.#publishStatus();
    });
    this.#opts.onActiveSessionChange?.(session);
  }

  /** Clear the active session (deactivating it) and notify. */
  #clearActive(deactivate = true): void {
    if (!this.#active) return;
    if (deactivate) this.#active.deactivate();
    this.#active = null;
    this.#opts.onActiveSessionChange?.(null);
  }

  /* ---- mutation handling (§1.5) -------------------------------------- */

  #onMutations = (mutations: MutationRecord[]): void => {
    let structural = false;
    for (const m of mutations) {
      if (m.type === 'childList') {
        structural = true;
        for (const removed of m.removedNodes) {
          if (removed instanceof Element) this.#teardownDetached(removed);
        }
      }
    }
    if (structural) this.#scheduleRescan();
    else this.#scheduleRescan();
  };

  #scheduleRescan = debounce(
    () => {
      this.#pruneDetached();
      // Re-attach to the focused element in case it just became editable, or
      // a client-side view swap replaced the previous one.
      this.#maybeAttach(this.#deepActive());
      this.#publishStatus();
    },
    200,
    1000,
  );

  #teardownDetached(removed: Element): void {
    for (const [el, session] of this.#sessions) {
      if (removed === el || removed.contains(el)) {
        session.destroy();
        this.#sessions.delete(el);
        if (this.#active === session) this.#clearActive(false);
      }
    }
  }

  #pruneDetached(): void {
    for (const [el, session] of this.#sessions) {
      if (!el.isConnected) {
        session.destroy();
        this.#sessions.delete(el);
        if (this.#active === session) this.#clearActive(false);
      }
    }
  }

  /* ---- page lifecycle ----------------------------------------------- */

  #wireLifecycle(): void {
    const { events } = this.#lifecycle;
    events.on('url-changed', ({ to }) => {
      log.debug('url-changed', to);
      this.#pruneDetached();
      this.#scheduleRescan();
    });
    events.on('dom-replaced', () => this.#scheduleRescan());
    events.on('page-shown', ({ persisted }) => {
      if (persisted) {
        // bfcache restore — sessions may be stale; rebuild from scratch.
        for (const s of this.#sessions.values()) s.destroy();
        this.#sessions.clear();
        this.#clearActive(false);
      }
      this.#maybeAttach(this.#deepActive());
      this.#publishStatus();
    });
    events.on('visibility-changed', ({ visible }) => {
      if (!visible && this.#active) {
        this.#active.deactivate();
      } else if (visible) {
        this.#maybeAttach(this.#deepActive());
      }
    });
  }

  /* ---- status ------------------------------------------------------- */

  #publishStatus(): void {
    const status = this.#computeStatus();
    const key = `${status.availability}|${status.eligibleFields}|${status.bestTier ?? '-'}`;
    if (key === this.#lastStatusKey) return;
    this.#lastStatusKey = key;
    this.#opts.onStatusChange(status);
  }

  #computeStatus(): PageStatus {
    const origin = this.#opts.origin;
    const policy = this.#opts.getPolicy();

    if (!policy.pageInjectable) {
      return status(
        'unavailable-privileged',
        'WriteRight can’t run on this browser page. Your writing here is untouched.',
        0,
        origin,
      );
    }
    if (!policy.globallyEnabled) {
      return status(
        'disabled-global',
        'WriteRight is paused everywhere. Turn it back on from the popup.',
        0,
        origin,
      );
    }
    if (!policy.siteEnabled) {
      return status(
        'disabled-site',
        `WriteRight is turned off for ${origin}. Re-enable it from the popup.`,
        0,
        origin,
      );
    }
    if (this.isActiveFieldPaused()) {
      return status(
        'disabled-field',
        'WriteRight is off for this field. Use the WriteRight button to turn it back on.',
        0,
        origin,
      );
    }

    // Known canvas / virtualized editor (Google Docs &c.): the primary writing
    // surface can't be checked inline, so say so and steer to the sidebar's
    // paste-and-analyse fallback — regardless of any stray title <input> the
    // scan below might otherwise latch onto (§5.1, §31 Rule 1).
    if (this.#siteProfile) {
      return status(
        'unsupported',
        this.#siteProfile.detail,
        0,
        origin,
        undefined,
        this.#siteProfile.id,
      );
    }

    // Scan (no session creation) for eligible editors + best tier.
    let eligible = 0;
    let unsupportedEditors = 0;
    let bestTier: CapabilityTier | undefined;

    const candidates = this.#doc.querySelectorAll(EDITOR_SELECTOR);
    for (const el of candidates) {
      if (!isPotentialEditor(el)) continue;
      const d = detectField(el, this.#opts.detectorOptions);
      if (d.eligible) {
        eligible += 1;
        const factory = this.#opts.registry.match(el);
        const tier: CapabilityTier = factory ? 'A' : 'D';
        if (tier === 'D') unsupportedEditors += 1;
        if (!bestTier || TIER_ORDER[tier] > TIER_ORDER[bestTier])
          bestTier = tier;
      } else if (d.rejection === 'unsupported-editor') {
        unsupportedEditors += 1;
      }
    }

    let availability: PageAvailability;
    let detail: string;
    if (eligible > 0 && bestTier && TIER_ORDER[bestTier] >= TIER_ORDER.A) {
      availability = 'ready';
      detail = `WriteRight is active. ${eligible} editable field${eligible === 1 ? '' : 's'} on this page.`;
    } else if (eligible > 0) {
      availability = 'limited';
      detail = 'WriteRight is running with limited support on this page.';
    } else if (unsupportedEditors > 0) {
      availability = 'unsupported';
      detail =
        'This page’s editor isn’t supported for inline help. Use the sidebar instead.';
    } else {
      availability = 'limited';
      detail =
        'WriteRight is watching this page. Click into a text field to begin.';
    }

    return status(availability, detail, eligible, origin, bestTier);
  }

  /* ---- helpers ----------------------------------------------------- */

  #canOperate(): boolean {
    const p = this.#opts.getPolicy();
    return p.pageInjectable && p.globallyEnabled && p.siteEnabled;
  }

  #deepActive(): Element | null {
    let el: Element | null = this.#doc.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }
}

function status(
  availability: PageAvailability,
  detail: string,
  eligibleFields: number,
  origin: string,
  bestTier?: CapabilityTier,
  siteProfileId?: string,
): PageStatus {
  return {
    availability,
    detail,
    eligibleFields,
    origin,
    bestTier,
    siteProfileId,
  };
}
