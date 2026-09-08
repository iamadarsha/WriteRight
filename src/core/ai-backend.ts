/**
 * The surface the background message router needs from the optional local-AI
 * layer (§4, §26). Implemented by {@link AiService}; omitted entirely in builds
 * / tests that don't exercise AI. When absent, every AI message returns an
 * honest "AI unavailable" response and nothing else changes (§4.1).
 */

import type {
  AiChatResponse,
  AiRunResponse,
  ResponseFor,
} from '@/types/messages';

/**
 * What {@link AiBackend.runStream} yields (§4.8): `delta` text is display-only,
 * shown as it arrives; the single terminal `final` carries the **validated**
 * {@link AiRunResponse} — the exact shape {@link AiBackend.run} returns — and is
 * the only thing the UI may apply.
 */
export type AiRunStreamChunk =
  | { readonly type: 'delta'; readonly text: string }
  | { readonly type: 'final'; readonly response: AiRunResponse };

export interface AiBackend {
  start(): Promise<void>;
  stop(): void;
  getCapability(force: boolean): Promise<ResponseFor<'AI_GET_CAPABILITY'>>;
  testConnection(input: {
    provider: string;
    endpoint?: string;
    model?: string;
  }): Promise<ResponseFor<'AI_TEST_CONNECTION'>>;
  listModels(input: {
    provider: string;
    endpoint?: string;
  }): Promise<ResponseFor<'AI_LIST_MODELS'>>;
  run(input: {
    requestId: string;
    task: string;
    selection: string;
    whole: boolean;
    formatHint?: string;
  }): Promise<AiRunResponse>;
  /** Streaming form of {@link run} (§4.8). Same routing, prompt and validation. */
  runStream(input: {
    requestId: string;
    task: string;
    selection: string;
    whole: boolean;
    formatHint?: string;
  }): AsyncIterable<AiRunStreamChunk>;
  chat(input: {
    requestId: string;
    history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
    message: string;
  }): Promise<AiChatResponse>;
  cancel(requestId: string): void;
  /** Start Chrome's on-device model download (§14.5). Explicit user action only. */
  startChromeDownload(): Promise<ResponseFor<'AI_START_DOWNLOAD'>>;
  acknowledgePrivacy(): Promise<ResponseFor<'AI_ACK_PRIVACY'>>;
  getChatHistory(): Promise<ResponseFor<'AI_GET_CHAT_HISTORY'>>;
  saveChatHistory(
    turns: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<ResponseFor<'AI_SAVE_CHAT_HISTORY'>>;
}
