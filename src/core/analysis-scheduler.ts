/**
 * Per-session analysis scheduling (§17.2, §17.3).
 *
 * - coalesces rapid changes behind a short debounce (default 250 ms),
 * - guarantees a run at least every `maxWaitMs` under sustained typing,
 * - tags each request with the document version + a monotonic request id,
 * - discards results for stale versions / superseded requests (§31 Rule 12),
 * - never runs while an IME composition is active.
 *
 * The scheduler is transport-agnostic: it calls an injected `analyze` function
 * (which, in the extension, messages the background engine).
 */

import { debounce, type Debounced } from '@/utils/scheduler';
import type { Suggestion } from '@/types/suggestion';
import type { DocumentInsights } from '@/types/insights';
import { newId } from '@/utils/id';

export interface AnalyzeInput {
  readonly requestId: string;
  readonly documentVersion: number;
  readonly text: string;
}

export interface AnalyzeOutput {
  readonly requestId: string;
  readonly documentVersion: number;
  readonly suggestions: readonly Suggestion[];
  readonly insights: DocumentInsights | null;
  readonly degraded: boolean;
}

export interface AnalysisSchedulerOptions {
  /** Current canonical snapshot + version. Called at fire time, not schedule time. */
  readonly snapshot: () => { text: string; version: number };
  /** True while the editor is mid-IME-composition — defer (§5.3). */
  readonly isComposing: () => boolean;
  /** Perform the analysis (messages the background in the extension). */
  readonly analyze: (input: AnalyzeInput) => Promise<AnalyzeOutput>;
  /** Called with fresh, non-stale results. */
  readonly onResult: (output: AnalyzeOutput) => void;
  /** Called when a run starts / ends, for an "analyzing…" affordance (§9.2). */
  readonly onStateChange?: (state: 'idle' | 'running') => void;
  readonly debounceMs?: number;
  readonly maxWaitMs?: number;
}

export class AnalysisScheduler {
  readonly #opts: AnalysisSchedulerOptions;
  readonly #debounced: Debounced<[]>;
  #latestRequestId = '';
  #lastAnalyzedText: string | null = null;
  #inFlight = false;
  #rerunQueued = false;
  #disposed = false;

  constructor(options: AnalysisSchedulerOptions) {
    this.#opts = options;
    this.#debounced = debounce(
      () => void this.#run(),
      options.debounceMs ?? 250,
      options.maxWaitMs ?? 1200,
    );
  }

  /** Call on every editor change. */
  schedule(): void {
    if (this.#disposed) return;
    this.#debounced();
  }

  /** Force an immediate analysis (e.g. after applying a fix, or on focus). */
  flushNow(): void {
    if (this.#disposed) return;
    this.#debounced.cancel();
    void this.#run();
  }

  dispose(): void {
    this.#disposed = true;
    this.#debounced.cancel();
    this.#latestRequestId = '';
  }

  async #run(): Promise<void> {
    if (this.#disposed) return;
    if (this.#opts.isComposing()) {
      // Retry shortly after composition typically ends.
      this.#debounced();
      return;
    }
    if (this.#inFlight) {
      this.#rerunQueued = true;
      return;
    }

    const { text, version } = this.#opts.snapshot();
    if (text === this.#lastAnalyzedText) return;

    const requestId = newId('an');
    this.#latestRequestId = requestId;
    this.#inFlight = true;
    this.#opts.onStateChange?.('running');

    try {
      const output = await this.#opts.analyze({
        requestId,
        documentVersion: version,
        text,
      });
      // Discard if superseded or the document moved on (§17.3).
      const current = this.#opts.snapshot();
      if (
        !this.#disposed &&
        output.requestId === this.#latestRequestId &&
        output.documentVersion === current.version
      ) {
        this.#lastAnalyzedText = text;
        this.#opts.onResult(output);
      }
    } finally {
      this.#inFlight = false;
      this.#opts.onStateChange?.('idle');
      if (this.#rerunQueued && !this.#disposed) {
        this.#rerunQueued = false;
        this.#debounced();
      }
    }
  }
}
