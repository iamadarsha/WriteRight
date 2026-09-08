/**
 * Content-script controller.
 *
 * Wires together: policy (global `enabled` + per-site rule), the
 * {@link TextFieldManager}, and the Shadow DOM host. Kept separate from the WXT
 * entrypoint so it can be unit-tested with the fake browser (§23.2).
 *
 * Policy sync uses `browser.storage.onChanged` (via the storage watchers),
 * which fires in content scripts too — so a settings/site change propagates
 * without any messaging round-trip and survives background suspension (§5.3).
 * The background is contacted only to report page status (badge + per-tab
 * tracking) and that call transparently wakes a suspended service worker.
 */

import type { PageStatus } from '@/types/capability';
import {
  createDefaultRegistry,
  type AdapterRegistry,
} from '@/adapters/adapter-registry';
import { TextFieldManager, type PolicyState } from './text-field-manager';
import type { EditorSession } from './editor-session';
import { AnalysisCoordinator } from './analysis-coordinator';
import { invalidateAiReady } from './ai-ready-cache';
import { SidebarController } from './sidebar-controller';
import { DefineController } from './define-controller';
import { mountShadowHost, type ShadowHost } from '@/ui/shadow-host';
import { SuggestionPopoverElement } from '@/ui/popover/suggestion-popover';
import { UNDERLINE_CSS } from '@/ui/underline';
import { POPOVER_CSS } from '@/ui/popover/popover-styles';
import { SIDEBAR_CSS } from '@/ui/sidebar/sidebar-styles';
import { DEFINE_CSS } from '@/ui/define/define-styles';
import { sendToBackground, onBroadcast } from '@/messaging';
import { getSettings, watchSettings } from '@/storage/settings';
import type { Settings } from '@/types/settings';
import type { SuggestionSource } from '@/types/suggestion';
import {
  isSiteEnabled,
  watchSiteRules,
  getSiteRule,
} from '@/storage/site-rules';
import { watchDictionary } from '@/storage/dictionary';
import type { DocumentInsights } from '@/types/insights';
import { originKey, isEligibleWebPage } from '@/utils/url';
import { debounce } from '@/utils/scheduler';
import { extensionContextGone } from '@/utils/extension-context';
import { createLogger } from '@/utils/logger';

const log = createLogger('content');

export interface ContentControllerOptions {
  readonly registry?: AdapterRegistry;
  readonly document?: Document;
  readonly location?: Pick<Location, 'href'>;
}

export class ContentController {
  readonly #doc: Document;
  readonly #origin: string;
  readonly #href: string;
  readonly #registry: AdapterRegistry;
  #manager: TextFieldManager | null = null;
  #shadow: ShadowHost | null = null;
  #popover: SuggestionPopoverElement | null = null;
  #coordinator: AnalysisCoordinator | null = null;
  #sidebar: SidebarController | null = null;
  #define: DefineController | null = null;
  #presetId: string | null = null;
  #settings: Settings | null = null;
  #analyzing = false;
  #cleanups: Array<() => void> = [];

  #policy: PolicyState = {
    globallyEnabled: true,
    siteEnabled: true,
    pageInjectable: true,
  };

  constructor(options: ContentControllerOptions = {}) {
    this.#doc = options.document ?? document;
    this.#registry = options.registry ?? createDefaultRegistry();
    const href = options.location?.href ?? location.href;
    this.#href = href;
    this.#origin = originKey(href);
    this.#policy = {
      ...this.#policy,
      pageInjectable: isEligibleWebPage(href).eligible,
    };
  }

  async start(): Promise<void> {
    if (!this.#policy.pageInjectable) {
      log.debug('page not injectable — controller idle');
      return;
    }

    await this.#syncPolicy();

    this.#presetId = await this.#resolvePreset();

    this.#shadow = mountShadowHost(this.#doc);
    this.#shadow.applyStyleSheet(UNDERLINE_CSS);
    this.#shadow.applyStyleSheet(POPOVER_CSS);
    this.#shadow.applyStyleSheet(SIDEBAR_CSS);
    this.#shadow.applyStyleSheet(DEFINE_CSS);
    try {
      this.#settings = await getSettings();
      this.#shadow.applyPreferences(this.#settings);
    } catch {
      /* defaults are fine */
    }
    this.#popover = new SuggestionPopoverElement(
      this.#shadow.uiLayer,
      (open) => {
        this.#shadow?.host.setAttribute('data-wr-popover', open ? '1' : '0');
      },
    );
    this.#sidebar = new SidebarController(
      this.#shadow,
      this.#origin,
      this.#presetId,
      () => this.#manager?.resumeField(),
      () => ({
        writingScore: this.#settings?.features.writingScore ?? true,
        toneHints: this.#settings?.features.toneHints ?? true,
      }),
      (open, tab) => {
        const host = this.#shadow?.host;
        if (!host) return;
        host.dataset['wrSidebar'] = open ? 'open' : 'closed';
        host.dataset['wrSidebarTab'] = tab;
      },
    );

    this.#define = new DefineController({
      host: this.#shadow,
      document: this.#doc,
      isEnabled: () => this.#defineEnabled(),
    });
    this.#define.start();

    this.#manager = new TextFieldManager({
      registry: this.#registry,
      origin: this.#origin,
      document: this.#doc,
      location: this.#locationParts(),
      getPolicy: () => this.#policy,
      onStatusChange: (status) => this.#reportStatus(status),
      onActiveSessionChange: (session) => this.#onActiveSessionChange(session),
    });
    this.#manager.start();

    this.#cleanups.push(
      watchSettings((settings) => {
        this.#settings = settings;
        this.#policy = {
          ...this.#policy,
          globallyEnabled: settings.enabled,
        };
        // AI toggle / provider / endpoint may have changed — drop the cached
        // readiness so the next clarity card re-checks immediately.
        invalidateAiReady();
        this.#shadow?.applyPreferences(settings);
        this.#coordinator?.setCategoryEnabled((s) => this.#categoryEnabled(s));
        this.#sidebar?.notifyChanged();
        this.#manager?.refreshPolicy();
        void this.#resolvePreset().then((id) => {
          this.#presetId = id;
          this.#sidebar?.updatePreset(id);
          this.#coordinator?.reanalyze();
        });
      }),
      watchSiteRules((store) => {
        const rule = store.rules[this.#origin];
        this.#policy = {
          ...this.#policy,
          siteEnabled: rule?.enabled ?? true,
        };
        this.#manager?.refreshPolicy();
        void this.#resolvePreset().then((id) => {
          this.#presetId = id;
          this.#sidebar?.updatePreset(id);
          this.#coordinator?.reanalyze();
        });
      }),
      watchDictionary(() => this.#coordinator?.reanalyze()),
      onBroadcast((message) => {
        if (message.type === 'OPEN_SIDEBAR') this.#sidebar?.open();
        else if (message.type === 'TOGGLE_SIDEBAR') this.#sidebar?.toggle();
      }),
    );

    const onVisible = (): void => {
      if (this.#doc.visibilityState === 'visible') this.#resyncSoon();
    };
    this.#doc.addEventListener('visibilitychange', onVisible);
    this.#cleanups.push(() =>
      this.#doc.removeEventListener('visibilitychange', onVisible),
    );

    // Alt+W toggles the sidebar; Alt+D defines the selection (§9.6 keyboard path).
    const onHotkey = (e: KeyboardEvent): void => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const key = e.key.toLowerCase();
        if (key === 'w') {
          e.preventDefault();
          this.#sidebar?.toggle();
        } else if (key === 'd') {
          e.preventDefault();
          this.#define?.triggerFromShortcut();
        }
      }
    };
    this.#doc.addEventListener('keydown', onHotkey, true);
    this.#cleanups.push(() =>
      this.#doc.removeEventListener('keydown', onHotkey, true),
    );
  }

  async #resolvePreset(): Promise<string | null> {
    try {
      const [settings, rule] = await Promise.all([
        getSettings(),
        getSiteRule(this.#origin),
      ]);
      return rule?.presetId !== undefined
        ? rule.presetId
        : settings.defaultPresetId;
    } catch {
      return this.#presetId;
    }
  }

  stop(): void {
    this.#resyncSoon.cancel();
    for (const fn of this.#cleanups.splice(0)) fn();
    this.#coordinator?.dispose();
    this.#coordinator = null;
    this.#define?.stop();
    this.#define = null;
    this.#sidebar?.destroy();
    this.#sidebar = null;
    this.#manager?.stop();
    this.#manager = null;
    this.#popover?.destroy();
    this.#popover = null;
    this.#shadow?.destroy();
    this.#shadow = null;
  }

  #onActiveSessionChange(session: EditorSession | null): void {
    this.#coordinator?.dispose();
    this.#coordinator = null;
    if (!session || !this.#shadow || !this.#popover) {
      this.#sidebar?.bind(null);
      this.#reflectHostState();
      return;
    }
    this.#coordinator = new AnalysisCoordinator({
      session,
      host: this.#shadow,
      popover: this.#popover,
      origin: this.#origin,
      onAnalyzingChange: (analyzing) => {
        this.#analyzing = analyzing;
        this.#reflectHostState();
      },
      onInsights: (insights) => this.#reportInsights(insights),
      onDisableField: () => {
        this.#manager?.pauseActiveField();
      },
      categoryEnabled: (s) => this.#categoryEnabled(s),
      synonymsEnabled: () => this.#settings?.features.synonyms ?? true,
    });
    this.#coordinator.onUpdate(() => this.#reflectHostState());
    this.#sidebar?.bind(this.#coordinator);
    this.#reflectHostState();
  }

  #reportInsights(insights: DocumentInsights | null): void {
    void sendToBackground({ type: 'REPORT_PAGE_INSIGHTS', insights });
  }

  /** Whether select-to-define may run right now (§11.3). */
  #defineEnabled(): boolean {
    return (
      this.#policy.globallyEnabled &&
      this.#policy.siteEnabled &&
      (this.#settings?.features.defineOnSelect ?? true)
    );
  }

  /** Which inline underline categories the user has left on (§1.2.0). */
  #categoryEnabled(source: SuggestionSource): boolean {
    const f = this.#settings?.features;
    if (!f) return true;
    const map: Partial<Record<SuggestionSource, boolean>> = {
      spell: f.spelling,
      grammar: f.grammar,
      punctuation: f.punctuation,
      style: f.styleWordiness,
      readability: f.readability,
    };
    return map[source] ?? true;
  }

  /**
   * Reflect coarse runtime state onto the light-DOM host element as `data-`
   * attributes — counts and status only, never user text (§6.8). Lets E2E and
   * ad-hoc debugging observe the extension without piercing the closed root.
   */
  #reflectHostState(): void {
    const host = this.#shadow?.host;
    if (!host) return;
    const c = this.#coordinator;
    host.dataset['wrActive'] = c ? 'true' : 'false';
    host.dataset['wrAnalyzing'] = this.#analyzing ? 'true' : 'false';
    host.dataset['wrSuggestions'] = String(c?.suggestions.length ?? 0);
  }

  /** Exposed for tests. */
  get policy(): PolicyState {
    return this.#policy;
  }

  get origin(): string {
    return this.#origin;
  }

  get status(): PageStatus | null {
    return this.#manager?.getStatus() ?? null;
  }

  /** For tests: the active coordinator, if any. */
  get coordinator(): AnalysisCoordinator | null {
    return this.#coordinator;
  }

  /** For tests: whether the in-page sidebar is currently open. */
  get sidebarOpen(): boolean {
    return this.#sidebar?.isOpen ?? false;
  }

  get analyzing(): boolean {
    return this.#analyzing;
  }

  #resyncSoon = debounce(() => {
    void this.#syncPolicy().then(() => this.#manager?.refreshPolicy());
  }, 300);

  async #syncPolicy(): Promise<void> {
    // The extension was reloaded/updated under this still-running content
    // script — every browser.* call now throws. Tear down instead of looping
    // on errors; the tab needs a reload to get the new version (§5.3).
    if (extensionContextGone()) {
      log.debug('extension context gone — stopping content controller');
      this.stop();
      return;
    }
    try {
      const [settings, siteEnabled] = await Promise.all([
        getSettings(),
        isSiteEnabled(this.#origin),
      ]);
      this.#policy = {
        ...this.#policy,
        globallyEnabled: settings.enabled,
        siteEnabled,
      };
    } catch (err) {
      if (extensionContextGone(err)) {
        this.stop();
        return;
      }
      log.warn('policy sync failed — keeping previous policy', err);
    }
  }

  #reportStatus(status: PageStatus): void {
    this.#sidebar?.setPageStatus(
      status.availability,
      status.availability === 'unsupported' ? status.detail : null,
    );
    this.#shadow?.host.setAttribute(
      'data-wr-availability',
      status.availability,
    );
    this.#reflectHostState();
    void sendToBackground({ type: 'REPORT_PAGE_STATUS', status });
  }

  /** `{ hostname, pathname }` from the page URL, for site-profile matching. */
  #locationParts(): { hostname: string; pathname: string } {
    try {
      const u = new URL(this.#href);
      return { hostname: u.hostname, pathname: u.pathname };
    } catch {
      return { hostname: '', pathname: '' };
    }
  }
}
