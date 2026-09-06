/**
 * Durable settings schema (§20) and its version (§20.4).
 *
 * Every durable structure carries a `schemaVersion`. Startup runs deterministic,
 * idempotent migrations before the value is read (see `storage/migrations.ts`).
 */

export const SETTINGS_SCHEMA_VERSION = 2;
export const DICTIONARY_SCHEMA_VERSION = 1;
export const SITE_RULES_SCHEMA_VERSION = 1;

export type ThemePreference = 'system' | 'light' | 'dark';

/** English dialects available for the selected local engine release (§20.2). */
export type Dialect = 'en-US' | 'en-GB' | 'en-CA' | 'en-AU' | 'en-IN';

export type AiConfirmationPolicy = 'always' | 'large-only' | 'never';

/** Local-AI provider preference (§4.1, §14.3). `auto` = pick by availability. */
export type AiProviderPref =
  'auto' | 'chrome' | 'ollama' | 'lmstudio' | 'custom';

/**
 * Local-AI configuration (§4, §14.5). Every field is inert unless
 * `features.ai` is on. Endpoints are loopback-only and enforced at runtime
 * (§6.3); they are never contacted until the user runs a connection test or
 * invokes an AI action.
 */
export interface AiSettings {
  readonly provider: AiProviderPref;
  readonly ollamaEndpoint: string;
  readonly ollamaModel: string;
  readonly lmStudioEndpoint: string;
  readonly lmStudioModel: string;
  /** Generic OpenAI-compatible local server (§4.4 Adapter D). */
  readonly customEndpoint: string;
  readonly customModel: string;
  /**
   * "Enhanced local review" (§4.5): allow an AI proofreading pass in addition
   * to the deterministic engine. Off by default; the UI shows the mode.
   */
  readonly enhancedReview: boolean;
  /** Keep the AI chat transcript locally between sessions (§4.7). Off by default. */
  readonly keepChatHistory: boolean;
  /** The user has seen the first-run local-AI privacy explanation (§14.5). */
  readonly acknowledgedPrivacy: boolean;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'auto',
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: '',
  lmStudioEndpoint: 'http://localhost:1234',
  lmStudioModel: '',
  customEndpoint: '',
  customModel: '',
  enhancedReview: false,
  keepChatHistory: false,
  acknowledgedPrivacy: false,
};

/** §20.1 global settings. */
export interface Settings {
  readonly schemaVersion: number;
  /** Master switch. When `false`, WriteRight is inert everywhere (§1.7 global pause). */
  readonly enabled: boolean;
  readonly dialect: Dialect;
  readonly theme: ThemePreference;
  /** UI font scale multiplier, 0.85..1.5. */
  readonly fontScale: number;
  readonly reducedMotion: boolean;
  /**
   * Plain-language, large-target UI variant for low-literacy users and language
   * learners (§9.5). Applied via `data-wr-simple` on every WriteRight surface.
   */
  readonly simpleMode: boolean;
  /**
   * Feature toggles — all default on except AI (§20.1). Each one is wired: the
   * four inline-check toggles filter which underline categories render, `define`
   * / `synonyms` gate the vocabulary layer, `writingScore` / `toneHints` gate
   * those panels.
   */
  readonly features: {
    /** Red spelling underlines. */
    readonly spelling: boolean;
    /** Amber grammar underlines (Harper grammar + duplicate word, sentence case). */
    readonly grammar: boolean;
    /** Spacing & punctuation underlines (repeated spaces / punctuation). */
    readonly punctuation: boolean;
    /** Purple style underlines (wordy phrases, buzzwords, filler). */
    readonly styleWordiness: boolean;
    /** The 0–100 writing-health score, in the popup + sidebar. */
    readonly writingScore: boolean;
    /** The tone estimate. */
    readonly toneHints: boolean;
    /** Select text on any page to see its definition (§11.3). */
    readonly defineOnSelect: boolean;
    /** Offer synonyms in the define panel and the suggestion popover. */
    readonly synonyms: boolean;
    /** Optional local AI (§4). */
    readonly ai: boolean;
  };
  readonly aiConfirmationPolicy: AiConfirmationPolicy;
  /**
   * Strict privacy mode (§4.1 #26, §6). When on, local AI is force-disabled
   * and diagnostics stay off — WriteRight is deterministic, offline-only.
   */
  readonly strictPrivacy: boolean;
  /** Local-AI provider config (§4). Inert unless `features.ai` is on. */
  readonly ai: AiSettings;
  /** Never analyze these element/URL patterns in addition to the built-ins (§10.2). */
  readonly extraIgnorePatterns: readonly string[];
  /** Default format preset id (§3.4), or `null` for none. Sites can override. */
  readonly defaultPresetId: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  enabled: true,
  dialect: 'en-US',
  theme: 'system',
  fontScale: 1,
  reducedMotion: false,
  simpleMode: false,
  features: {
    spelling: true,
    grammar: true,
    punctuation: true,
    styleWordiness: true,
    writingScore: true,
    toneHints: true,
    defineOnSelect: true,
    synonyms: true,
    ai: false,
  },
  aiConfirmationPolicy: 'large-only',
  strictPrivacy: false,
  ai: DEFAULT_AI_SETTINGS,
  extraIgnorePatterns: [],
  defaultPresetId: null,
};

/** §20.3 per-site controls, keyed by registrable origin. */
export interface SiteRule {
  readonly origin: string;
  readonly enabled: boolean;
  /** Rule ids the user chose to always ignore on this site. */
  readonly ignoredRuleIds: readonly string[];
  /** Optional forced adapter override, e.g. `'unsupported'` or a site adapter kind. */
  readonly adapterOverride?: string;
  /** Format preset for this site (§3.4, §20.3), overriding the global default. */
  readonly presetId?: string | null;
  readonly updatedAt: number;
}

export interface SiteRulesStore {
  readonly schemaVersion: number;
  readonly rules: Readonly<Record<string, SiteRule>>;
}

export const DEFAULT_SITE_RULES: SiteRulesStore = {
  schemaVersion: SITE_RULES_SCHEMA_VERSION,
  rules: {},
};

/** §11.4 personal dictionary — durable, local, case-preserving. */
export interface PersonalDictionaryStore {
  readonly schemaVersion: number;
  /** Original-case words the user added. Lookup is case-insensitive. */
  readonly words: readonly string[];
}

export const DEFAULT_DICTIONARY: PersonalDictionaryStore = {
  schemaVersion: DICTIONARY_SCHEMA_VERSION,
  words: [],
};
