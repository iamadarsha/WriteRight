/**
 * Adapter A — Chrome built-in on-device AI (§4.2, §14.3, §29.1).
 *
 * Uses the browser-managed Prompt API (`LanguageModel`), which runs a
 * Gemini-Nano-class model entirely on the device. Availability is runtime- and
 * hardware-dependent, so everything here is capability-detected and the rest of
 * WriteRight never waits on it.
 *
 * The API surface has shifted across Chrome versions (`window.ai.languageModel`
 * → `self.ai.languageModel` → the `LanguageModel` global). We resolve whichever
 * is present and treat a missing API as simply "unavailable".
 *
 * Model download: a first `create()` may trigger a browser-managed download of
 * the model. That is never user-text processing — no document content is ever
 * attached to a readiness check or a download (§14.5).
 */

import type {
  AiAdapter,
  AiGenerateInput,
  AiProbeResult,
  AiRawOutput,
} from './ai-types';

/** Minimal structural view of the Prompt API we depend on. */
interface LanguageModelSession {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy?(): void;
}
interface DownloadProgressEvent extends Event {
  readonly loaded?: number;
  readonly total?: number;
}
interface LanguageModelFactory {
  availability?(): Promise<string>;
  capabilities?(): Promise<{ available?: string }>;
  create(options?: {
    signal?: AbortSignal;
    initialPrompts?: Array<{ role: string; content: string }>;
    // Older builds accept `systemPrompt`; newer use `initialPrompts`.
    systemPrompt?: string;
    monitor?: (m: EventTarget) => void;
    outputLanguage?: string;
    expectedOutputs?: Array<{ type: string; languages?: string[] }>;
  }): Promise<LanguageModelSession>;
}

/** Normalise a `downloadprogress` event to a 0–1 fraction (§14.5). Chrome has
 * shipped both `{ loaded: bytes, total: bytes }` and `{ loaded: 0..1 }` shapes
 * across versions — accept either rather than trusting one. */
function progressFraction(e: DownloadProgressEvent): number | null {
  const { loaded, total } = e;
  if (typeof loaded !== 'number' || Number.isNaN(loaded)) return null;
  if (typeof total === 'number' && total > 0) {
    return Math.min(1, Math.max(0, loaded / total));
  }
  if (loaded >= 0 && loaded <= 1) return loaded;
  return null;
}

function resolveFactory(): LanguageModelFactory | null {
  const g = globalThis as unknown as {
    LanguageModel?: LanguageModelFactory;
    ai?: { languageModel?: LanguageModelFactory };
  };
  if (g.LanguageModel && typeof g.LanguageModel.create === 'function') {
    return g.LanguageModel;
  }
  if (g.ai?.languageModel && typeof g.ai.languageModel.create === 'function') {
    return g.ai.languageModel;
  }
  return null;
}

/** Map the various availability strings to our probe states. */
function mapAvailability(value: string | undefined): AiProbeResult['state'] {
  if (value === 'available' || value === 'readily') return 'ready';
  if (value === 'downloadable' || value === 'after-download') {
    return 'downloadable';
  }
  if (value === 'downloading') return 'downloading';
  return 'unavailable';
}

export class PromptApiAdapter implements AiAdapter {
  readonly id = 'chrome' as const;
  /** Set for the lifetime of an in-flight {@link startDownload} call, so
   * `probe()` can report it authoritatively instead of racing a fresh
   * `availability()` read against our own in-progress `create()` (§14.5). */
  #downloading = false;
  #progress: number | null = null;

  async probe(): Promise<AiProbeResult> {
    if (this.#downloading) {
      return {
        id: this.id,
        state: 'downloading',
        detail: 'The on-device model is downloading…',
        model: 'chrome-builtin',
        ...(this.#progress !== null ? { progress: this.#progress } : {}),
      };
    }
    const factory = resolveFactory();
    if (!factory) {
      return {
        id: this.id,
        state: 'unavailable',
        detail: 'This browser has no built-in on-device AI.',
      };
    }
    try {
      let raw: string | undefined;
      if (typeof factory.availability === 'function') {
        raw = await factory.availability();
      } else if (typeof factory.capabilities === 'function') {
        raw = (await factory.capabilities()).available;
      }
      const state = mapAvailability(raw);
      const detail =
        state === 'ready'
          ? 'On-device model ready. Text stays on this device.'
          : state === 'downloadable'
            ? 'Chrome can download the on-device model now — a one-time download, managed by Chrome itself.'
            : state === 'downloading'
              ? 'The on-device model is downloading…'
              : 'The on-device model is not available on this device.';
      return { id: this.id, state, detail, model: 'chrome-builtin' };
    } catch (err) {
      return {
        id: this.id,
        state: 'unavailable',
        detail: `On-device AI check failed: ${describe(err)}`,
      };
    }
  }

  /**
   * Start (or wait out) the browser-managed model download (§14.5). Chrome
   * triggers this as a side effect of `create()` when the model state is
   * `downloadable` — there is no separate "just download" API. Only ever
   * called from an explicit user action (a button click), never implicitly
   * from a probe, so a multi-GB download never starts silently.
   */
  async startDownload(): Promise<{ ok: boolean; error?: string }> {
    const factory = resolveFactory();
    if (!factory) {
      return { ok: false, error: 'This browser has no built-in on-device AI.' };
    }
    this.#downloading = true;
    this.#progress = null;
    let session: LanguageModelSession | null = null;
    try {
      session = await factory.create({
        monitor: (m) => {
          m.addEventListener('downloadprogress', (e: DownloadProgressEvent) => {
            const fraction = progressFraction(e);
            if (fraction !== null) this.#progress = fraction;
          });
        },
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: describe(err) };
    } finally {
      this.#downloading = false;
      this.#progress = null;
      try {
        session?.destroy?.();
      } catch {
        /* best effort */
      }
    }
  }

  async generate(input: AiGenerateInput): Promise<AiRawOutput> {
    const factory = resolveFactory();
    if (!factory) throw new Error('on-device AI is not available');

    let session: LanguageModelSession | null = null;
    try {
      session = await factory.create({
        signal: input.signal,
        initialPrompts: [{ role: 'system', content: input.system }],
        systemPrompt: input.system,
      });
      const text = await session.prompt(input.user, { signal: input.signal });
      return { raw: text, provider: this.id, model: 'chrome-builtin' };
    } finally {
      try {
        session?.destroy?.();
      } catch {
        /* best effort */
      }
    }
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
