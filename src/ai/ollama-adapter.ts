/**
 * Adapter B — Ollama (§4.3, §14.3, §29.2).
 *
 * Connects only to a user-configured loopback endpoint (default
 * `http://localhost:11434`). Provides a connection test, model discovery,
 * model selection, timeout, cancellation and JSON-mode output where the model
 * supports it. WriteRight never starts, installs or updates the model runtime —
 * the user owns it.
 *
 * Note: Ollama rejects cross-origin requests unless the user sets
 * `OLLAMA_ORIGINS` to allow the extension origin. The connection test surfaces
 * that clearly instead of hanging.
 */

import type {
  AiAdapter,
  AiGenerateInput,
  AiProbeResult,
  AiRawOutput,
  AiStreamChunk,
} from './ai-types';
import { checkLoopback } from './loopback';
import { localFetch } from './http';
import { readStreamLines, isAbortError } from './stream-lines';

const PROBE_TIMEOUT_MS = 4000;
const GENERATE_TIMEOUT_MS = 45_000;
/** No token for this long ⇒ the connection is dead, not just slow (§4.9). */
const STREAM_IDLE_MS = 15_000;

export interface OllamaConfig {
  readonly endpoint: string;
  readonly model: string;
}

export class OllamaAdapter implements AiAdapter {
  readonly id = 'ollama' as const;
  #config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.#config = config;
  }

  setConfig(config: OllamaConfig): void {
    this.#config = config;
  }

  async probe(): Promise<AiProbeResult> {
    const loopback = checkLoopback(this.#config.endpoint);
    if (!loopback.ok) {
      return {
        id: this.id,
        state: 'unavailable',
        detail: `Endpoint must be a loopback address — ${loopback.reason}.`,
        endpoint: this.#config.endpoint,
      };
    }
    try {
      const controller = new AbortController();
      const res = await localFetch(`${loopback.origin}/api/tags`, {
        signal: controller.signal,
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      if (!res.ok) {
        return {
          id: this.id,
          state: 'unavailable',
          detail: `Ollama responded with HTTP ${res.status}.`,
          endpoint: loopback.endpoint,
        };
      }
      const body = (await res.json()) as { models?: Array<{ name?: string }> };
      const models = (body.models ?? [])
        .map((m) => m.name)
        .filter((n): n is string => typeof n === 'string');
      const model = this.#config.model || models[0] || null;
      return {
        id: this.id,
        state: model ? 'ready' : 'unavailable',
        detail: model
          ? `Connected to Ollama. Text is sent to your local server (${loopback.endpoint}).`
          : 'Ollama is running but has no models. Run `ollama pull <model>`.',
        endpoint: loopback.endpoint,
        model,
      };
    } catch (err) {
      return {
        id: this.id,
        state: 'unavailable',
        detail: ollamaError(err),
        endpoint: loopback.endpoint,
      };
    }
  }

  async listModels(): Promise<readonly string[]> {
    const loopback = checkLoopback(this.#config.endpoint);
    if (!loopback.ok) return [];
    const controller = new AbortController();
    const res = await localFetch(`${loopback.origin}/api/tags`, {
      signal: controller.signal,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { models?: Array<{ name?: string }> };
    return (body.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => typeof n === 'string');
  }

  async generate(input: AiGenerateInput): Promise<AiRawOutput> {
    const loopback = checkLoopback(this.#config.endpoint);
    if (!loopback.ok)
      throw new Error(`bad Ollama endpoint: ${loopback.reason}`);
    const model = input.model || this.#config.model;
    if (!model) throw new Error('no Ollama model selected');

    const res = await localFetch(`${loopback.origin}/api/chat`, {
      method: 'POST',
      signal: input.signal,
      timeoutMs: GENERATE_TIMEOUT_MS,
      body: {
        model,
        stream: false,
        ...(input.wantJson ? { format: 'json' } : {}),
        options: {
          temperature: 0.4,
          num_predict: clampPredict(input.maxOutputChars),
        },
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      },
    });
    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}`);
    }
    const body = (await res.json()) as { message?: { content?: string } };
    return {
      raw: body.message?.content ?? '',
      provider: this.id,
      model,
    };
  }

  async *generateStream(input: AiGenerateInput): AsyncIterable<AiStreamChunk> {
    const loopback = checkLoopback(this.#config.endpoint);
    if (!loopback.ok) {
      yield {
        type: 'error',
        message: `bad Ollama endpoint: ${loopback.reason}`,
      };
      return;
    }
    const model = input.model || this.#config.model;
    if (!model) {
      yield { type: 'error', message: 'no Ollama model selected' };
      return;
    }

    let res: Response;
    try {
      res = await localFetch(`${loopback.origin}/api/chat`, {
        method: 'POST',
        signal: input.signal,
        timeoutMs: GENERATE_TIMEOUT_MS,
        body: {
          model,
          stream: true,
          ...(input.wantJson ? { format: 'json' } : {}),
          options: {
            temperature: 0.4,
            num_predict: clampPredict(input.maxOutputChars),
          },
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
        },
      });
    } catch (err) {
      if (isAbortError(err, input.signal)) return;
      yield { type: 'error', message: ollamaError(err) };
      return;
    }
    if (!res.ok) {
      yield { type: 'error', message: `Ollama HTTP ${res.status}` };
      return;
    }
    if (!res.body) {
      yield { type: 'error', message: 'Ollama returned no response body.' };
      return;
    }

    let assembled = '';
    try {
      for await (const line of readStreamLines(res.body, {
        signal: input.signal,
        idleMs: STREAM_IDLE_MS,
      })) {
        let obj: unknown;
        try {
          obj = JSON.parse(line);
        } catch {
          continue; // tolerate a stray keep-alive / blank line
        }
        const content = (obj as { message?: { content?: unknown } }).message
          ?.content;
        if (typeof content === 'string' && content !== '') {
          assembled += content;
          yield { type: 'delta', text: content };
        }
        if ((obj as { done?: unknown }).done === true) break;
      }
    } catch (err) {
      if (isAbortError(err, input.signal)) return;
      yield { type: 'error', message: ollamaError(err) };
      return;
    }
    yield {
      type: 'done',
      raw: { raw: assembled, provider: this.id, model },
    };
  }
}

function clampPredict(maxChars: number): number {
  // Rough chars→tokens; keep a sane ceiling so a runaway model still returns.
  return Math.min(2048, Math.max(128, Math.round(maxChars / 3)));
}

function ollamaError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout/i.test(msg)) {
    return 'Ollama did not respond in time. Is it running?';
  }
  if (/Failed to fetch|NetworkError|load failed/i.test(msg)) {
    return (
      'Could not reach Ollama. Start it, and if it still fails set ' +
      'OLLAMA_ORIGINS to allow this extension.'
    );
  }
  return `Ollama connection failed: ${msg}`;
}
