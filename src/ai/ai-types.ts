/**
 * Shared contracts for the optional local-AI layer (§4, §14).
 *
 * Nothing here reaches a paid cloud API. Every adapter is either the browser's
 * own on-device model or a model server the user runs on loopback. The rest of
 * WriteRight never depends on any of this being available (§4.1).
 */

/** Which local engine actually answered / could answer. */
export type AiProviderId = 'chrome' | 'ollama' | 'lmstudio' | 'custom';

/** Provider preference (`auto` lets the router pick by availability). */
export type AiProviderPreference = 'auto' | AiProviderId;

/**
 * Generative tasks the user can invoke (§4.6). `chat` is the free-form sidebar
 * conversation (§4.7); `explain-sentence` returns prose, everything else
 * returns a rewrite of the selection.
 */
export type AiTask =
  | 'rewrite-shorter'
  | 'rewrite-longer'
  | 'simplify'
  | 'formalize'
  | 'casualize'
  | 'friendly'
  | 'confident'
  | 'persuasive'
  | 'improve-clarity'
  | 'improve-conclusion'
  | 'to-format'
  | 'explain-sentence'
  | 'chat';

/** How the router classified a request before choosing an engine (§4.5). */
export type AiTaskClass = 'generative' | 'deterministic' | 'unsupported';

/** A single reason line the model (or a fallback) attaches to a rewrite. */
export interface AiChange {
  readonly type: string;
  readonly reason: string;
}

/** Normalised result of one generative call. */
export interface AiRunResult {
  readonly kind: 'rewrite' | 'explanation';
  /** For `rewrite`: the replacement for the selection. For `explanation`: prose. */
  readonly text: string;
  readonly changes: readonly AiChange[];
  readonly provider: AiProviderId;
  readonly model: string | null;
}

/** One conversation turn for the AI chat sidebar (§4.7). */
export interface AiChatTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/**
 * A generative adapter. Implementations live in `prompt-api-adapter.ts`,
 * `ollama-adapter.ts`, `lm-studio-adapter.ts`, `local-endpoint-adapter.ts`.
 */
export interface AiAdapter {
  readonly id: AiProviderId;
  /** Cheap, side-effect-free readiness probe (§14.4). Never downloads a model. */
  probe(): Promise<AiProbeResult>;
  /** List selectable models where the provider supports it (§4.3). */
  listModels?(): Promise<readonly string[]>;
  /** Run one generative prompt. Must honour `signal` for cancellation (§4.9). */
  generate(input: AiGenerateInput): Promise<AiRawOutput>;
}

export interface AiGenerateInput {
  /** Fully-formed system + user prompt (already injection-delimited, §14.7). */
  readonly system: string;
  readonly user: string;
  /** Ask the provider for JSON where it supports it (§14.6). */
  readonly wantJson: boolean;
  readonly signal: AbortSignal;
  readonly model: string | null;
  readonly maxOutputChars: number;
}

/** Raw provider output before {@link validateAiOutput}. */
export interface AiRawOutput {
  readonly raw: string;
  readonly provider: AiProviderId;
  readonly model: string | null;
}

export type AiProbeState =
  /** Ready to run now. */
  | 'ready'
  /** Reachable, but the on-device model must download first (§14.5). */
  | 'downloadable'
  /** Model is downloading right now. */
  | 'downloading'
  /** Not reachable / not configured / unsupported device. */
  | 'unavailable';

export interface AiProbeResult {
  readonly id: AiProviderId;
  readonly state: AiProbeState;
  /** Plain-language, no cloud upsell (§4.9). */
  readonly detail: string;
  /** Endpoint host:port for local providers, shown in settings (§14.5). */
  readonly endpoint?: string;
  readonly model?: string | null;
  /** 0–1 fraction while `state === 'downloading'`. Absent when unknown. */
  readonly progress?: number;
}

/** What the UI shows for overall AI status (§14.4). */
export interface AiCapability {
  /** `features.ai` master switch (§20.1). */
  readonly enabled: boolean;
  /** The provider the router would use right now, or null. */
  readonly active: AiProviderId | null;
  readonly label: string;
  readonly providers: readonly AiProbeResult[];
  /** True once the user has seen the first-run privacy explanation (§14.5). */
  readonly acknowledged: boolean;
  /**
   * "Enhanced local review" (§4.5): the user has explicitly allowed AI actions
   * to run on the whole field when nothing is selected. Off by default — broad
   * rewrites stay user-invoked (a selection) unless this is on.
   */
  readonly enhancedReview: boolean;
}

export const AI_TASK_LABELS: Record<AiTask, string> = {
  'rewrite-shorter': 'Make it shorter',
  'rewrite-longer': 'Make it longer',
  simplify: 'Simplify',
  formalize: 'More formal',
  casualize: 'More casual',
  friendly: 'Friendlier',
  confident: 'More confident',
  persuasive: 'More persuasive',
  'improve-clarity': 'Improve clarity',
  'improve-conclusion': 'Improve the conclusion',
  'to-format': 'Rewrite for the current format',
  'explain-sentence': 'Explain this sentence',
  chat: 'Chat',
};
