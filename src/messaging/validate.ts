/**
 * Runtime validation for extension messages (§26).
 *
 * Content pages are untrusted. Every inbound message is validated structurally
 * before a handler sees it; unknown `type`s are rejected. These guards are
 * hand-written (no schema library) to keep the content-script bundle tiny and
 * the trust boundary obvious (§6.4, §31 Rule 7).
 */

import type {
  BroadcastMessage,
  RequestMessage,
  RequestType,
  SettingsPatch,
} from '@/types/messages';

const REQUEST_TYPES: ReadonlySet<RequestType> = new Set<RequestType>([
  'GET_SETTINGS',
  'SET_SETTINGS',
  'RESET_ALL_DATA',
  'GET_SITE_STATE',
  'SET_SITE_ENABLED',
  'SET_GLOBAL_ENABLED',
  'GET_ACTIVE_TAB_STATUS',
  'REPORT_PAGE_STATUS',
  'GET_DIAGNOSTICS',
  'ANALYZE_TEXT',
  'CANCEL_ANALYSIS',
  'ADD_DICTIONARY_WORD',
  'GET_DICTIONARY',
  'REMOVE_DICTIONARY_WORD',
  'IMPORT_DICTIONARY',
  'CLEAR_DICTIONARY',
  'SET_SITE_IGNORED_RULE',
  'GET_RULE_DESCRIPTION',
  'GET_ENGINE_STATUS',
  'REWRITE_TEXT',
  'SET_SITE_PRESET',
  'REPORT_PAGE_INSIGHTS',
  'GET_ACTIVE_TAB_INSIGHTS',
  'AI_GET_CAPABILITY',
  'AI_TEST_CONNECTION',
  'AI_LIST_MODELS',
  'AI_RUN',
  'AI_CHAT',
  'AI_CANCEL',
  'AI_START_DOWNLOAD',
  'AI_ACK_PRIVACY',
  'AI_GET_CHAT_HISTORY',
  'AI_SAVE_CHAT_HISTORY',
  'DEFINE',
  'LOOKUP_SYNONYMS',
]);

/** A dictionary query is a word or short phrase, never a paragraph. */
const MAX_DEFINE_CHARS = 80;

/** Web editors can hold a lot of text; cap what we will accept per request. */
const MAX_ANALYZE_CHARS = 200_000;

/** A single AI action / chat message is bounded well below the analysis cap. */
const MAX_AI_SELECTION_CHARS = 16_000;
const MAX_AI_CHAT_CHARS = 8000;

const AI_PROVIDERS = new Set(['chrome', 'ollama', 'lmstudio', 'custom']);
const AI_TASKS = new Set([
  'rewrite-shorter',
  'rewrite-longer',
  'simplify',
  'formalize',
  'casualize',
  'friendly',
  'confident',
  'persuasive',
  'improve-clarity',
  'improve-conclusion',
  'to-format',
  'explain-sentence',
  'chat',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

export function isSettingsPatch(v: unknown): v is SettingsPatch {
  if (!isRecord(v)) return false;
  const allowed = new Set([
    'enabled',
    'dialect',
    'theme',
    'fontScale',
    'reducedMotion',
    'simpleMode',
    'features',
    'aiConfirmationPolicy',
    'strictPrivacy',
    'ai',
    'extraIgnorePatterns',
    'defaultPresetId',
  ]);
  for (const key of Object.keys(v)) if (!allowed.has(key)) return false;
  if ('strictPrivacy' in v && !isBoolean(v['strictPrivacy'])) return false;
  if ('simpleMode' in v && !isBoolean(v['simpleMode'])) return false;
  if ('ai' in v && !isAiPatch(v['ai'])) return false;
  if (
    'defaultPresetId' in v &&
    v['defaultPresetId'] !== null &&
    !isString(v['defaultPresetId'])
  ) {
    return false;
  }
  if ('enabled' in v && !isBoolean(v['enabled'])) return false;
  if ('reducedMotion' in v && !isBoolean(v['reducedMotion'])) return false;
  if ('fontScale' in v && typeof v['fontScale'] !== 'number') return false;
  if ('dialect' in v && !isString(v['dialect'])) return false;
  if ('theme' in v && !isString(v['theme'])) return false;
  if ('aiConfirmationPolicy' in v && !isString(v['aiConfirmationPolicy'])) {
    return false;
  }
  if (
    'extraIgnorePatterns' in v &&
    !(
      Array.isArray(v['extraIgnorePatterns']) &&
      v['extraIgnorePatterns'].every(isString)
    )
  ) {
    return false;
  }
  if ('features' in v) {
    const f = v['features'];
    if (!isRecord(f)) return false;
    const featureKeys = new Set([
      'spelling',
      'grammar',
      'punctuation',
      'styleWordiness',
      'writingScore',
      'toneHints',
      'defineOnSelect',
      'synonyms',
      'ai',
    ]);
    for (const [k, val] of Object.entries(f)) {
      if (!featureKeys.has(k) || !isBoolean(val)) return false;
    }
  }
  return true;
}

const AI_PATCH_KEYS = new Set([
  'provider',
  'ollamaEndpoint',
  'ollamaModel',
  'lmStudioEndpoint',
  'lmStudioModel',
  'customEndpoint',
  'customModel',
  'enhancedReview',
  'keepChatHistory',
  'acknowledgedPrivacy',
]);

function isAiPatch(v: unknown): boolean {
  if (!isRecord(v)) return false;
  for (const [k, val] of Object.entries(v)) {
    if (!AI_PATCH_KEYS.has(k)) return false;
    if (k === 'provider') {
      if (
        !isString(val) ||
        !['auto', 'chrome', 'ollama', 'lmstudio', 'custom'].includes(val)
      ) {
        return false;
      }
    } else if (k.endsWith('Endpoint') || k.endsWith('Model')) {
      if (!isString(val) || val.length > 200) return false;
    } else if (!isBoolean(val)) {
      return false;
    }
  }
  return true;
}

/** Structural guard for an inbound request message. */
export function isRequestMessage(v: unknown): v is RequestMessage {
  if (!isRecord(v) || !isString(v['type'])) return false;
  const type = v['type'];
  if (!REQUEST_TYPES.has(type as RequestType)) return false;

  switch (type as RequestType) {
    case 'SET_SETTINGS':
      return isSettingsPatch(v['patch']);
    case 'GET_SITE_STATE':
      return isString(v['origin']);
    case 'SET_SITE_ENABLED':
      return isString(v['origin']) && isBoolean(v['enabled']);
    case 'SET_GLOBAL_ENABLED':
      return isBoolean(v['enabled']);
    case 'REPORT_PAGE_STATUS':
      return isPageStatusShape(v['status']);
    case 'ANALYZE_TEXT':
      return (
        isString(v['requestId']) &&
        isString(v['sessionId']) &&
        typeof v['documentVersion'] === 'number' &&
        isString(v['origin']) &&
        isString(v['text']) &&
        v['text'].length <= MAX_ANALYZE_CHARS &&
        isBoolean(v['withInsights'])
      );
    case 'CANCEL_ANALYSIS':
      return isString(v['requestId']);
    case 'ADD_DICTIONARY_WORD':
    case 'REMOVE_DICTIONARY_WORD':
      return isString(v['word']) && v['word'].length <= 128;
    case 'IMPORT_DICTIONARY':
      return isString(v['text']) && v['text'].length <= 200_000;
    case 'SET_SITE_IGNORED_RULE':
      return (
        isString(v['origin']) &&
        isString(v['ruleId']) &&
        isBoolean(v['ignored'])
      );
    case 'GET_RULE_DESCRIPTION':
      return isString(v['ruleId']);
    case 'REWRITE_TEXT':
      return (
        isString(v['origin']) &&
        isString(v['text']) &&
        v['text'].length <= MAX_ANALYZE_CHARS
      );
    case 'SET_SITE_PRESET':
      return (
        isString(v['origin']) &&
        (v['presetId'] === null || isString(v['presetId']))
      );
    case 'REPORT_PAGE_INSIGHTS':
      return v['insights'] === null || isRecord(v['insights']);
    case 'AI_GET_CAPABILITY':
      return v['force'] === undefined || isBoolean(v['force']);
    case 'AI_TEST_CONNECTION':
      return (
        isString(v['provider']) &&
        AI_PROVIDERS.has(v['provider']) &&
        (v['endpoint'] === undefined ||
          (isString(v['endpoint']) && v['endpoint'].length <= 200)) &&
        (v['model'] === undefined ||
          (isString(v['model']) && v['model'].length <= 200))
      );
    case 'AI_LIST_MODELS':
      return (
        isString(v['provider']) &&
        AI_PROVIDERS.has(v['provider']) &&
        (v['endpoint'] === undefined ||
          (isString(v['endpoint']) && v['endpoint'].length <= 200))
      );
    case 'AI_RUN':
      return (
        isString(v['requestId']) &&
        isString(v['task']) &&
        AI_TASKS.has(v['task']) &&
        isString(v['selection']) &&
        v['selection'].length <= MAX_AI_SELECTION_CHARS &&
        isBoolean(v['whole']) &&
        (v['formatHint'] === undefined ||
          (isString(v['formatHint']) && v['formatHint'].length <= 120))
      );
    case 'AI_CHAT':
      return (
        isString(v['requestId']) &&
        isString(v['message']) &&
        v['message'].length <= MAX_AI_CHAT_CHARS &&
        isChatHistory(v['history'])
      );
    case 'AI_CANCEL':
      return isString(v['requestId']);
    case 'AI_SAVE_CHAT_HISTORY':
      return isChatHistory(v['turns']);
    case 'DEFINE':
      return isString(v['text']) && v['text'].length <= MAX_DEFINE_CHARS;
    case 'LOOKUP_SYNONYMS':
      return isString(v['word']) && v['word'].length <= MAX_DEFINE_CHARS;
    case 'GET_SETTINGS':
    case 'RESET_ALL_DATA':
    case 'GET_ACTIVE_TAB_STATUS':
    case 'GET_ACTIVE_TAB_INSIGHTS':
    case 'GET_DIAGNOSTICS':
    case 'GET_ENGINE_STATUS':
    case 'GET_DICTIONARY':
    case 'CLEAR_DICTIONARY':
    case 'AI_ACK_PRIVACY':
    case 'AI_GET_CHAT_HISTORY':
    case 'AI_START_DOWNLOAD':
      return true;
    default:
      return false;
  }
}

function isChatHistory(v: unknown): boolean {
  if (!Array.isArray(v) || v.length > 40) return false;
  return v.every(
    (t) =>
      isRecord(t) &&
      (t['role'] === 'user' || t['role'] === 'assistant') &&
      isString(t['content']) &&
      t['content'].length <= 8000,
  );
}

function isPageStatusShape(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return (
    isString(v['availability']) &&
    isString(v['detail']) &&
    typeof v['eligibleFields'] === 'number' &&
    isString(v['origin'])
  );
}

const BROADCAST_TYPES = new Set([
  'SETTINGS_CHANGED',
  'SITE_STATE_CHANGED',
  'ALL_DATA_RESET',
  'TOGGLE_SIDEBAR',
  'OPEN_SIDEBAR',
]);

export function isBroadcastMessage(v: unknown): v is BroadcastMessage {
  if (!isRecord(v) || !isString(v['type'])) return false;
  if (!BROADCAST_TYPES.has(v['type'])) return false;
  if (v['type'] === 'SITE_STATE_CHANGED') {
    return isString(v['origin']) && isBoolean(v['siteEnabled']);
  }
  return true;
}
