/**
 * Background/service-worker controller.
 *
 * Single source of truth for settings + per-site rules, the message router
 * (§26), and per-tab status → toolbar badge. Written as a class so it can be
 * unit-tested against WXT's fake browser (§23.2); the entrypoint is a 3-line
 * shim.
 *
 * MV3 note: the service worker may suspend at any time. All state that must
 * survive suspension lives in `storage` (durable) or `storage.session`
 * (ephemeral per-tab). In-memory maps are treated as caches only (§5.3).
 */

import { browser } from '#imports';
import type { PageStatus } from '@/types/capability';
import type {
  AnalysisResponse,
  Diagnostics,
  EngineStatus,
  RewriteResponse,
  SiteState,
} from '@/types/messages';
import type { Settings } from '@/types/settings';
import {
  handleBackgroundRequests,
  sendToActiveTabContent,
  type RequestHandlers,
  type MessageSender,
} from '@/messaging';
import {
  initStorage,
  getSettings,
  patchSettings,
  resetAllData,
  isSiteEnabled,
  setSiteEnabled,
} from '@/storage';
import {
  setSiteIgnoredRules,
  setSitePreset,
  getSiteRule,
} from '@/storage/site-rules';
import {
  setTabStatus,
  getTabStatus,
  clearTabStatus,
  setTabInsights,
  getTabInsights,
} from '@/storage/session-state';
import type { EngineBackend } from './engine-backend';
import type { AiBackend } from './ai-backend';
import type { LexiconBackend } from './lexicon-backend';
import type { AiCapability } from '@/ai/ai-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('background');

/** The AI-off capability shape, shared by the no-backend fallbacks (§4.1). */
function aiUnavailable(): AiCapability {
  return {
    enabled: false,
    active: null,
    label: 'AI Unavailable — local writing tools still active',
    providers: [],
    acknowledged: false,
    enhancedReview: false,
  };
}

const BADGE = {
  ready: { text: '', color: '#1a7f37' },
  limited: { text: '', color: '#b5730f' },
  unsupported: { text: '!', color: '#b5730f' },
  'disabled-site': { text: 'off', color: '#8e8e93' },
  'disabled-field': { text: 'off', color: '#8e8e93' },
  'disabled-global': { text: 'off', color: '#8e8e93' },
  'unavailable-privileged': { text: '', color: '#8e8e93' },
} as const;

export interface BackgroundControllerOptions {
  /** The linguistic engine backend (§2.2). Omitted in Phase 1-only tests. */
  readonly engine?: EngineBackend;
  /** The optional local-AI backend (§4). Omitted when AI is not exercised. */
  readonly ai?: AiBackend;
  /** The offline vocabulary backend (§11.3). Omitted when define is not exercised. */
  readonly lexicon?: LexiconBackend;
}

export class BackgroundController {
  #settings: Settings | null = null;
  #detachFns: Array<() => void> = [];
  readonly #engine?: EngineBackend;
  readonly #ai?: AiBackend;
  readonly #lexicon?: LexiconBackend;

  constructor(options: BackgroundControllerOptions = {}) {
    this.#engine = options.engine;
    this.#ai = options.ai;
    this.#lexicon = options.lexicon;
  }

  async start(): Promise<void> {
    this.#settings = await initStorage();
    log.info('background started', {
      schema: this.#settings.schemaVersion,
      enabled: this.#settings.enabled,
    });

    if (this.#engine) {
      this.#engine.start().catch((err) => {
        log.error('engine service failed to start', err);
      });
    }

    if (this.#ai) {
      this.#ai.start().catch((err) => {
        log.error('ai service failed to start', err);
      });
    }

    if (this.#lexicon) {
      this.#lexicon.start().catch((err) => {
        log.error('lexicon service failed to start', err);
      });
    }

    // Content scripts and extension pages observe settings/site-rule changes
    // directly via `browser.storage.onChanged` (§26 keeps the *request* channel
    // typed; state propagation rides storage events, which survive SW suspension).
    this.#detachFns.push(handleBackgroundRequests(this.#handlers()));

    browser.tabs.onRemoved.addListener((tabId) => {
      void clearTabStatus(tabId);
    });
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'loading' && changeInfo.url) {
        void clearTabStatus(tabId);
        void this.#applyBadge(tabId, null);
      }
    });
    // A prerendered / back-forward-cached page can be swapped in under a *new*
    // tab id, leaving the old id's status + insights stranded in
    // `storage.session` (§5.3). Clear the retired id. `onReplaced` is absent on
    // Firefox and stubbed-incompletely by some test doubles — either is fine.
    try {
      browser.tabs.onReplaced?.addListener((_addedTabId, removedTabId) => {
        void clearTabStatus(removedTabId);
      });
    } catch {
      /* no prerender lifecycle on this browser */
    }

    // §5.2 keyboard command → the active tab's in-page sidebar. `_execute_action`
    // is handled by the browser; only our custom command reaches here. Guarded:
    // `browser.commands` presence varies (Safari) and some test doubles stub it
    // incompletely — a missing command API just means the in-page Alt+W hotkey
    // is the only path, which is fine.
    try {
      browser.commands?.onCommand?.addListener((command) => {
        if (command === 'toggle-sidebar') {
          void sendToActiveTabContent({ type: 'TOGGLE_SIDEBAR' });
        }
      });
    } catch (err) {
      log.debug('browser.commands not available', err);
    }
  }

  stop(): void {
    for (const fn of this.#detachFns.splice(0)) fn();
    this.#engine?.stop();
    this.#ai?.stop();
  }

  /* ---- request handlers -------------------------------------------- */

  #handlers(): RequestHandlers {
    return {
      GET_SETTINGS: async () => ({ settings: await this.#getSettings() }),

      SET_SETTINGS: async (msg) => {
        const settings = await patchSettings(msg.patch);
        this.#settings = settings;
        return { settings };
      },

      RESET_ALL_DATA: async () => {
        const settings = await resetAllData();
        this.#settings = settings;
        return { settings };
      },

      SET_GLOBAL_ENABLED: async (msg) => {
        const settings = await patchSettings({ enabled: msg.enabled });
        this.#settings = settings;
        return { settings };
      },

      GET_SITE_STATE: async (msg) => this.#siteState(msg.origin),

      SET_SITE_ENABLED: async (msg) => {
        await setSiteEnabled(msg.origin, msg.enabled);
        return this.#siteState(msg.origin);
      },

      GET_ACTIVE_TAB_STATUS: async () => {
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.id == null) return { status: null };
        return { status: await getTabStatus(tab.id) };
      },

      REPORT_PAGE_STATUS: async (msg, sender: MessageSender) => {
        const tabId = sender.tab?.id;
        if (tabId != null) {
          await setTabStatus(tabId, msg.status);
          await this.#applyBadge(tabId, msg.status);
        }
        return { ok: true };
      },

      GET_DIAGNOSTICS: async (): Promise<Diagnostics> => {
        const settings = await this.#getSettings();
        let version = '0.0.0';
        try {
          version = browser.runtime.getManifest().version;
        } catch {
          /* manifest unavailable in some test contexts */
        }
        const engineStatus = await this.#engine?.status();
        return {
          version,
          settingsSchemaVersion: settings.schemaVersion,
          browser: import.meta.env.BROWSER ?? 'unknown',
          engineReady: engineStatus?.phase === 'ready',
          trackedTabs: (await browser.tabs.query({})).length,
        };
      },

      /* ---- Phase 2: analysis & corrections (§2) ---------------------- */

      ANALYZE_TEXT: async (msg): Promise<AnalysisResponse> => {
        if (!this.#engine) {
          return {
            requestId: msg.requestId,
            sessionId: msg.sessionId,
            documentVersion: msg.documentVersion,
            suggestions: [],
            insights: null,
            degraded: true,
          };
        }
        return this.#engine.analyze(msg);
      },

      CANCEL_ANALYSIS: (msg) => {
        this.#engine?.cancel(msg.requestId);
        return { ok: true };
      },

      ADD_DICTIONARY_WORD: async (msg) => {
        if (!this.#engine) return { words: [] };
        return { words: await this.#engine.addDictionaryWord(msg.word) };
      },

      GET_DICTIONARY: async () => {
        if (!this.#engine) return { words: [] };
        return { words: await this.#engine.getDictionary() };
      },

      REMOVE_DICTIONARY_WORD: async (msg) => {
        if (!this.#engine) return { words: [] };
        return { words: await this.#engine.removeDictionaryWord(msg.word) };
      },

      IMPORT_DICTIONARY: async (msg) => {
        if (!this.#engine) return { words: [], added: 0 };
        return this.#engine.importDictionary(msg.text);
      },

      CLEAR_DICTIONARY: async () => {
        if (!this.#engine) return { words: [] };
        return { words: await this.#engine.clearDictionary() };
      },

      SET_SITE_IGNORED_RULE: async (msg): Promise<SiteState> => {
        const rule = await getSiteRule(msg.origin);
        const current = new Set(rule?.ignoredRuleIds ?? []);
        if (msg.ignored) current.add(msg.ruleId);
        else current.delete(msg.ruleId);
        await setSiteIgnoredRules(msg.origin, [...current]);
        return this.#siteState(msg.origin);
      },

      GET_RULE_DESCRIPTION: async (msg) => ({
        ruleId: msg.ruleId,
        description: (await this.#engine?.ruleDescription(msg.ruleId)) ?? null,
      }),

      GET_ENGINE_STATUS: async (): Promise<EngineStatus> =>
        (await this.#engine?.status()) ?? {
          phase: 'unavailable',
          smoke: null,
          dictionaryWordCount: 0,
        },

      /* ---- Phase 3: writing intelligence & presets (§3, §12, §13) ---- */

      REWRITE_TEXT: async (msg): Promise<RewriteResponse> => {
        if (!this.#engine) {
          return { changed: false, text: msg.text, changes: [] };
        }
        return this.#engine.rewrite({ origin: msg.origin, text: msg.text });
      },

      SET_SITE_PRESET: async (msg) => {
        await setSitePreset(msg.origin, msg.presetId);
        const state = await this.#siteState(msg.origin);
        return { ...state, presetId: msg.presetId };
      },

      REPORT_PAGE_INSIGHTS: async (msg, sender: MessageSender) => {
        const tabId = sender.tab?.id;
        if (tabId != null) await setTabInsights(tabId, msg.insights);
        return { ok: true };
      },

      GET_ACTIVE_TAB_INSIGHTS: async () => {
        const [tab] = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.id == null) return { insights: null };
        return { insights: await getTabInsights(tab.id) };
      },

      /* ---- Phase 4: optional local AI (§4, §14) --------------------- */

      AI_GET_CAPABILITY: async (msg) => {
        if (!this.#ai) return { capability: aiUnavailable() };
        return this.#ai.getCapability(msg.force === true);
      },

      AI_TEST_CONNECTION: async (msg) => {
        if (!this.#ai) {
          return {
            probe: {
              id: msg.provider,
              state: 'unavailable',
              detail: 'Local AI is not available in this build.',
            },
          };
        }
        return this.#ai.testConnection({
          provider: msg.provider,
          endpoint: msg.endpoint,
          model: msg.model,
        });
      },

      AI_LIST_MODELS: async (msg) => {
        if (!this.#ai) return { models: [] };
        return this.#ai.listModels({
          provider: msg.provider,
          endpoint: msg.endpoint,
        });
      },

      AI_RUN: async (msg) => {
        if (!this.#ai) {
          return {
            status: 'blocked',
            mode: 'unsupported',
            message:
              'Local AI is turned off. Your offline grammar and writing tools are still working.',
          };
        }
        return this.#ai.run({
          requestId: msg.requestId,
          task: msg.task,
          selection: msg.selection,
          whole: msg.whole,
          formatHint: msg.formatHint,
        });
      },

      AI_CHAT: async (msg) => {
        if (!this.#ai) {
          return {
            status: 'blocked',
            message: 'Local AI is turned off.',
          };
        }
        return this.#ai.chat({
          requestId: msg.requestId,
          history: msg.history,
          message: msg.message,
        });
      },

      AI_CANCEL: (msg) => {
        this.#ai?.cancel(msg.requestId);
        return { ok: true };
      },

      AI_START_DOWNLOAD: async () => {
        if (!this.#ai) {
          return {
            ok: false,
            error: 'Local AI is not available in this build.',
          };
        }
        return this.#ai.startChromeDownload();
      },

      AI_ACK_PRIVACY: async () => {
        if (!this.#ai) return { settings: await this.#getSettings() };
        const res = await this.#ai.acknowledgePrivacy();
        this.#settings = res.settings;
        return res;
      },

      AI_GET_CHAT_HISTORY: async () => {
        if (!this.#ai) return { turns: [] };
        return this.#ai.getChatHistory();
      },

      AI_SAVE_CHAT_HISTORY: async (msg) => {
        if (!this.#ai) return { ok: true };
        return this.#ai.saveChatHistory(msg.turns);
      },

      /* ---- 1.2.0: offline vocabulary (§11.3) ---- */

      DEFINE: async (msg) => {
        if (!this.#lexicon) return { entries: [], unavailable: true };
        return this.#lexicon.define(msg.text);
      },

      LOOKUP_SYNONYMS: async (msg) => {
        if (!this.#lexicon) {
          return {
            word: msg.word,
            synonyms: [],
            antonyms: [],
            unavailable: true,
          };
        }
        return this.#lexicon.synonyms(msg.word);
      },
    };
  }

  /* ---- helpers --------------------------------------------------- */

  async #getSettings(): Promise<Settings> {
    if (!this.#settings) this.#settings = await getSettings();
    return this.#settings;
  }

  async #siteState(origin: string): Promise<SiteState> {
    const settings = await this.#getSettings();
    return {
      origin,
      siteEnabled: await isSiteEnabled(origin),
      globallyEnabled: settings.enabled,
    };
  }

  async #applyBadge(tabId: number, status: PageStatus | null): Promise<void> {
    const action = browser.action;
    if (!action) return;
    try {
      if (!status) {
        await action.setBadgeText({ tabId, text: '' });
        await action.setTitle({ tabId, title: 'WriteRight' });
        return;
      }
      const badge = BADGE[status.availability] ?? BADGE.limited;
      await action.setBadgeText({ tabId, text: badge.text });
      await action.setBadgeBackgroundColor?.({ tabId, color: badge.color });
      await action.setTitle({ tabId, title: `WriteRight — ${status.detail}` });
    } catch (err) {
      log.debug('badge update failed (tab likely closed)', err);
    }
  }
}
