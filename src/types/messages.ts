/**
 * Typed extension messaging contract (§26).
 *
 * All traffic between content scripts, background and UI uses these discriminated
 * unions. Payloads are validated at the boundary (`messaging/validate.ts`);
 * unknown types are rejected. Never trust values from content pages.
 */

import type { PageStatus } from './capability';
import type { AiSettings, Settings } from './settings';
import type { Suggestion } from './suggestion';
import type { DocumentInsights } from './insights';
import type { DefineResult, SynonymResult } from '@/engine/lexicon/types';
import type { HarperSmokeResult } from '@/engine/harper/harper-types';
import type {
  AiCapability,
  AiChange,
  AiChatTurn,
  AiProbeResult,
  AiProviderId,
  AiTask,
} from '@/ai/ai-types';

/** Where a message originated — set by the sender, re-checked by the receiver. */
export type MessageOrigin = 'content' | 'popup' | 'options' | 'background';

/* -------------------------------------------------------------------------- */
/* Requests — always `{ type, ...payload }`                                    */
/* -------------------------------------------------------------------------- */

export type RequestMessage =
  | { type: 'GET_SETTINGS' }
  | { type: 'SET_SETTINGS'; patch: SettingsPatch }
  | { type: 'RESET_ALL_DATA' }
  | { type: 'GET_SITE_STATE'; origin: string }
  | { type: 'SET_SITE_ENABLED'; origin: string; enabled: boolean }
  | { type: 'SET_GLOBAL_ENABLED'; enabled: boolean }
  | { type: 'GET_ACTIVE_TAB_STATUS' }
  | { type: 'REPORT_PAGE_STATUS'; status: PageStatus }
  | { type: 'GET_DIAGNOSTICS' }
  // --- Phase 2: analysis & corrections (§2, §26) ---
  | {
      type: 'ANALYZE_TEXT';
      requestId: string;
      sessionId: string;
      documentVersion: number;
      origin: string;
      text: string;
      /** Include the readability / tone / score pass (§12, §13). */
      withInsights: boolean;
    }
  | { type: 'CANCEL_ANALYSIS'; requestId: string }
  | { type: 'ADD_DICTIONARY_WORD'; word: string }
  | { type: 'GET_DICTIONARY' }
  | { type: 'REMOVE_DICTIONARY_WORD'; word: string }
  | { type: 'IMPORT_DICTIONARY'; text: string }
  | { type: 'CLEAR_DICTIONARY' }
  | {
      type: 'SET_SITE_IGNORED_RULE';
      origin: string;
      ruleId: string;
      ignored: boolean;
    }
  | { type: 'GET_RULE_DESCRIPTION'; ruleId: string }
  | { type: 'GET_ENGINE_STATUS' }
  // --- Phase 3: writing intelligence & presets (§3, §12, §13) ---
  | { type: 'REWRITE_TEXT'; origin: string; text: string }
  | { type: 'SET_SITE_PRESET'; origin: string; presetId: string | null }
  | { type: 'REPORT_PAGE_INSIGHTS'; insights: DocumentInsights | null }
  | { type: 'GET_ACTIVE_TAB_INSIGHTS' }
  // --- Phase 4: optional local AI (§4, §14) ---
  | { type: 'AI_GET_CAPABILITY'; force?: boolean }
  | {
      type: 'AI_TEST_CONNECTION';
      provider: AiProviderId;
      endpoint?: string;
      model?: string;
    }
  | { type: 'AI_LIST_MODELS'; provider: AiProviderId; endpoint?: string }
  | {
      type: 'AI_RUN';
      requestId: string;
      task: AiTask;
      /** The exact text the rewrite/explanation is about. */
      selection: string;
      /** True when `selection` is the whole field (nothing was selected). */
      whole: boolean;
      /** Optional format-preset hint for `to-format` (§3.4). */
      formatHint?: string;
    }
  | {
      type: 'AI_CHAT';
      requestId: string;
      history: readonly AiChatTurn[];
      message: string;
    }
  | { type: 'AI_CANCEL'; requestId: string }
  | { type: 'AI_START_DOWNLOAD' }
  | { type: 'AI_ACK_PRIVACY' }
  | { type: 'AI_GET_CHAT_HISTORY' }
  | { type: 'AI_SAVE_CHAT_HISTORY'; turns: readonly AiChatTurn[] }
  // --- 1.2.0: offline vocabulary (§11.3) ---
  | { type: 'DEFINE'; text: string }
  | { type: 'LOOKUP_SYNONYMS'; word: string };

export type RequestType = RequestMessage['type'];

/** A shallow, partial patch of {@link Settings}; `features` / `ai` merge by key. */
export interface SettingsPatch {
  enabled?: boolean;
  dialect?: Settings['dialect'];
  theme?: Settings['theme'];
  fontScale?: number;
  reducedMotion?: boolean;
  simpleMode?: boolean;
  features?: Partial<Settings['features']>;
  aiConfirmationPolicy?: Settings['aiConfirmationPolicy'];
  strictPrivacy?: boolean;
  ai?: Partial<AiSettings>;
  extraIgnorePatterns?: string[];
  defaultPresetId?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Responses                                                                   */
/* -------------------------------------------------------------------------- */

export interface SiteState {
  readonly origin: string;
  readonly siteEnabled: boolean;
  readonly globallyEnabled: boolean;
}

export interface Diagnostics {
  readonly version: string;
  readonly settingsSchemaVersion: number;
  readonly browser: string;
  readonly engineReady: boolean;
  readonly trackedTabs: number;
}

export type EngineStatusPhase =
  'initializing' | 'ready' | 'degraded' | 'unavailable';

export interface EngineStatus {
  readonly phase: EngineStatusPhase;
  readonly smoke: HarperSmokeResult | null;
  readonly dictionaryWordCount: number;
}

export interface AnalysisResponse {
  readonly requestId: string;
  readonly sessionId: string;
  readonly documentVersion: number;
  readonly suggestions: readonly Suggestion[];
  readonly insights: DocumentInsights | null;
  readonly degraded: boolean;
}

export interface RewriteResponse {
  readonly changed: boolean;
  readonly text: string;
  readonly changes: ReadonlyArray<{
    readonly reason: string;
    readonly count: number;
    readonly examples: ReadonlyArray<{ before: string; after: string }>;
  }>;
}

/* --- Phase 4: local AI (§4, §14) --- */

/** Result of an `AI_RUN`. `blocked` carries an honest limitation message (§4.9). */
export type AiRunResponse =
  | {
      readonly status: 'ok';
      readonly kind: 'rewrite' | 'explanation';
      readonly text: string;
      readonly changes: readonly AiChange[];
      readonly provider: AiProviderId;
      readonly model: string | null;
    }
  | {
      readonly status: 'blocked';
      readonly mode: 'deterministic' | 'unsupported';
      readonly message: string;
    };

export type AiChatResponse =
  | {
      readonly status: 'ok';
      readonly reply: string;
      readonly provider: AiProviderId;
    }
  | { readonly status: 'blocked'; readonly message: string };

export interface ResponseByType {
  GET_SETTINGS: { settings: Settings };
  SET_SETTINGS: { settings: Settings };
  RESET_ALL_DATA: { settings: Settings };
  GET_SITE_STATE: SiteState;
  SET_SITE_ENABLED: SiteState;
  SET_GLOBAL_ENABLED: { settings: Settings };
  GET_ACTIVE_TAB_STATUS: { status: PageStatus | null };
  REPORT_PAGE_STATUS: { ok: true };
  GET_DIAGNOSTICS: Diagnostics;
  ANALYZE_TEXT: AnalysisResponse;
  CANCEL_ANALYSIS: { ok: true };
  ADD_DICTIONARY_WORD: { words: readonly string[] };
  GET_DICTIONARY: { words: readonly string[] };
  REMOVE_DICTIONARY_WORD: { words: readonly string[] };
  IMPORT_DICTIONARY: { words: readonly string[]; added: number };
  CLEAR_DICTIONARY: { words: readonly string[] };
  SET_SITE_IGNORED_RULE: SiteState;
  GET_RULE_DESCRIPTION: { ruleId: string; description: string | null };
  GET_ENGINE_STATUS: EngineStatus;
  REWRITE_TEXT: RewriteResponse;
  SET_SITE_PRESET: SiteState & { presetId: string | null };
  REPORT_PAGE_INSIGHTS: { ok: true };
  GET_ACTIVE_TAB_INSIGHTS: { insights: DocumentInsights | null };
  AI_GET_CAPABILITY: { capability: AiCapability };
  AI_TEST_CONNECTION: { probe: AiProbeResult };
  AI_LIST_MODELS: { models: readonly string[] };
  AI_RUN: AiRunResponse;
  AI_CHAT: AiChatResponse;
  AI_CANCEL: { ok: true };
  AI_START_DOWNLOAD: { ok: boolean; error?: string };
  AI_ACK_PRIVACY: { settings: Settings };
  AI_GET_CHAT_HISTORY: { turns: readonly AiChatTurn[] };
  AI_SAVE_CHAT_HISTORY: { ok: true };
  DEFINE: DefineResult;
  LOOKUP_SYNONYMS: SynonymResult;
}

export type ResponseFor<T extends RequestType> = ResponseByType[T];

/** Uniform envelope so callers can always distinguish success from failure. */
export type MessageResult<T extends RequestType> =
  { ok: true; data: ResponseFor<T> } | { ok: false; error: string };

/* -------------------------------------------------------------------------- */
/* Broadcasts — background → all content scripts (fire-and-forget)             */
/* -------------------------------------------------------------------------- */

export type BroadcastMessage =
  | { type: 'SETTINGS_CHANGED'; settings: Settings }
  | { type: 'SITE_STATE_CHANGED'; origin: string; siteEnabled: boolean }
  | { type: 'ALL_DATA_RESET' }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'OPEN_SIDEBAR' };

export type BroadcastType = BroadcastMessage['type'];
