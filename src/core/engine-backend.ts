/**
 * The surface the background message router needs from the linguistic engine
 * (§2.2, §26). Implemented by {@link EngineService} in the extension and by a
 * lightweight double in tests.
 */

import type {
  AnalysisResponse,
  EngineStatus,
  RewriteResponse,
} from '@/types/messages';

export interface AnalyzeMessage {
  readonly requestId: string;
  readonly sessionId: string;
  readonly documentVersion: number;
  readonly origin: string;
  readonly text: string;
  readonly withInsights: boolean;
}

export interface EngineBackend {
  start(): Promise<void>;
  stop(): void;
  analyze(msg: AnalyzeMessage): Promise<AnalysisResponse>;
  rewrite(msg: { origin: string; text: string }): Promise<RewriteResponse>;
  cancel(requestId: string): void;
  addDictionaryWord(word: string): Promise<readonly string[]>;
  removeDictionaryWord(word: string): Promise<readonly string[]>;
  getDictionary(): Promise<readonly string[]>;
  importDictionary(
    text: string,
  ): Promise<{ words: readonly string[]; added: number }>;
  clearDictionary(): Promise<readonly string[]>;
  ruleDescription(ruleId: string): Promise<string | null>;
  status(): Promise<EngineStatus>;
}
