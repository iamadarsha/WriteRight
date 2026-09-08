/**
 * Adapter D — generic local OpenAI-compatible endpoint (§4.4, §14.3 Adapter D).
 *
 * A future-safe abstraction for local model servers that speak the OpenAI
 * `/v1/chat/completions` shape (LM Studio, llama.cpp server, vLLM on loopback,
 * text-generation-webui, …). It is **not** a path to a public cloud API — the
 * loopback guard (§6.3) refuses any non-loopback host.
 *
 * `LmStudioAdapter` is a thin subclass that only changes the default endpoint
 * and the display name.
 */

import type {
  AiAdapter,
  AiGenerateInput,
  AiProbeResult,
  AiProviderId,
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

export interface OpenAiCompatibleConfig {
  readonly endpoint: string;
  readonly model: string;
}

export class OpenAiCompatibleAdapter implements AiAdapter {
  readonly id: AiProviderId;
  readonly #name: string;
  #config: OpenAiCompatibleConfig;

  constructor(id: AiProviderId, name: string, config: OpenAiCompatibleConfig) {
    this.id = id;
    this.#name = name;
    this.#config = config;
  }

  setConfig(config: OpenAiCompatibleConfig): void {
    this.#config = config;
  }

  /** `http://localhost:1234` → `http://localhost:1234/v1` (idempotent). */
  #base(origin: string): string {
    const path = new URL(this.#config.endpoint).pathname.replace(/\/+$/, '');
    return path.endsWith('/v1') ? `${origin}${path}` : `${origin}/v1`;
  }

  async probe(): Promise<AiProbeResult> {
    const loopback = checkLoopback(this.#config.endpoint);
    if (!loopback.ok || !loopback.origin) {
      return {
        id: this.id,
        state: 'unavailable',
        detail: `Endpoint must be a loopback address — ${loopback.reason}.`,
        endpoint: this.#config.endpoint,
      };
    }
    try {
      const controller = new AbortController();
      const res = await localFetch(`${this.#base(loopback.origin)}/models`, {
        signal: controller.signal,
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      if (!res.ok) {
        return {
          id: this.id,
          state: 'unavailable',
          detail: `${this.#name} responded with HTTP ${res.status}.`,
          endpoint: loopback.endpoint,
        };
      }
      const body = (await res.json()) as { data?: Array<{ id?: string }> };
      const models = (body.data ?? [])
        .map((m) => m.id)
        .filter((n): n is string => typeof n === 'string');
      const model = this.#config.model || models[0] || null;
      return {
        id: this.id,
        state: model ? 'ready' : 'unavailable',
        detail: model
          ? `Connected to ${this.#name}. Text is sent to your local server (${loopback.endpoint}).`
          : `${this.#name} is running but has no model loaded.`,
        endpoint: loopback.endpoint,
        model,
      };
    } catch (err) {
      return {
        id: this.id,
        state: 'unavailable',
        detail: openAiError(this.#name, err),
        endpoint: loopback.endpoint,
      };
    }
  }

  async listModels(): Promise<readonly string[]> {
    const loopback = checkLoopback(this.#config.endpoint);
    if (!loopback.ok || !loopback.origin) return [];
    const controller = new AbortController();
    const res = await localFetch(`${this.#base(loopback.origin)}/models`, {
      signal: controller.signal,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    return (body.data ?? [])
      .map((m) => m.id)
      .filter((n): n is string => typeof n === 'string');
  }

  async generate(input: AiGenerateInput): Promise<AiRawOutput> {
    const loopback = checkLoopback(this.#config.endpoint);
    if (!loopback.ok || !loopback.origin) {
      throw new Error(`bad ${this.#name} endpoint: ${loopback.reason}`);
    }
    const model = input.model || this.#config.model;
    if (!model) throw new Error(`no ${this.#name} model selected`);

    const res = await localFetch(
      `${this.#base(loopback.origin)}/chat/completions`,
      {
        method: 'POST',
        signal: input.signal,
        timeoutMs: GENERATE_TIMEOUT_MS,
        body: {
          model,
          stream: false,
          temperature: 0.4,
          max_tokens: Math.min(
            2048,
            Math.max(128, Math.round(input.maxOutputChars / 3)),
          ),
          ...(input.wantJson
            ? { response_format: { type: 'json_object' } }
            : {}),
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
        },
      },
    );
    if (!res.ok) throw new Error(`${this.#name} HTTP ${res.status}`);
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return {
      raw: body.choices?.[0]?.message?.content ?? '',
      provider: this.id,
      model,
    };
  }

  async *generateStream(input: AiGenerateInput): AsyncIterable<AiStreamChunk> {
    const loopback = checkLoopback(this.#config.endpoint);
    if (!loopback.ok || !loopback.origin) {
      yield {
        type: 'error',
        message: `bad ${this.#name} endpoint: ${loopback.reason}`,
      };
      return;
    }
    const model = input.model || this.#config.model;
    if (!model) {
      yield { type: 'error', message: `no ${this.#name} model selected` };
      return;
    }

    let res: Response;
    try {
      res = await localFetch(
        `${this.#base(loopback.origin)}/chat/completions`,
        {
          method: 'POST',
          signal: input.signal,
          timeoutMs: GENERATE_TIMEOUT_MS,
          body: {
            model,
            stream: true,
            temperature: 0.4,
            max_tokens: Math.min(
              2048,
              Math.max(128, Math.round(input.maxOutputChars / 3)),
            ),
            ...(input.wantJson
              ? { response_format: { type: 'json_object' } }
              : {}),
            messages: [
              { role: 'system', content: input.system },
              { role: 'user', content: input.user },
            ],
          },
        },
      );
    } catch (err) {
      if (isAbortError(err, input.signal)) return;
      yield { type: 'error', message: openAiError(this.#name, err) };
      return;
    }
    if (!res.ok) {
      yield { type: 'error', message: `${this.#name} HTTP ${res.status}` };
      return;
    }
    if (!res.body) {
      yield {
        type: 'error',
        message: `${this.#name} returned no response body.`,
      };
      return;
    }

    let assembled = '';
    try {
      for await (const line of readStreamLines(res.body, {
        signal: input.signal,
        idleMs: STREAM_IDLE_MS,
      })) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '' || payload === '[DONE]') {
          if (payload === '[DONE]') break;
          continue;
        }
        let obj: unknown;
        try {
          obj = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = (
          obj as { choices?: Array<{ delta?: { content?: unknown } }> }
        ).choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta !== '') {
          assembled += delta;
          yield { type: 'delta', text: delta };
        }
      }
    } catch (err) {
      if (isAbortError(err, input.signal)) return;
      yield { type: 'error', message: openAiError(this.#name, err) };
      return;
    }
    yield {
      type: 'done',
      raw: { raw: assembled, provider: this.id, model },
    };
  }
}

function openAiError(name: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout/i.test(msg))
    return `${name} did not respond in time. Is it running?`;
  if (/Failed to fetch|NetworkError|load failed/i.test(msg)) {
    return `Could not reach ${name} on that address. Start its local server.`;
  }
  return `${name} connection failed: ${msg}`;
}
