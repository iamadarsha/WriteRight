/**
 * Background-hosted local-AI service (§4.5–§4.9).
 *
 * Owns the {@link CapabilityDetector} and the adapters, routes each request
 * through {@link route}, builds injection-safe prompts, validates every
 * response, and tracks an `AbortController` per request id so the UI can cancel
 * (§4.9). Runs only in the background service worker — the page never talks to
 * a model directly.
 *
 * Nothing here reaches a paid API. Chrome on-device runs in the browser; Ollama
 * / LM Studio / custom are loopback-only and enforced by {@link checkLoopback}.
 */

import { browser } from '#imports';
import type { AiBackend } from '@/core/ai-backend';
import type {
  AiChatResponse,
  AiRunResponse,
  ResponseFor,
} from '@/types/messages';
import type { AiSettings, Settings } from '@/types/settings';
import { getSettings, patchSettings, watchSettings } from '@/storage/settings';
import { getSiteRule } from '@/storage/site-rules';
import {
  getChatHistory,
  setChatHistory,
  clearChatHistory,
} from '@/storage/ai-chat';
import { findPreset } from '@/engine/format-presets';
import { CapabilityDetector } from './capability-detector';
import { route } from './ai-router';
import { CHAT_SYSTEM_PROMPT, promptForTask } from './prompts/templates';
import { validateAiOutput, validateChatReply } from './output-validator';
import type { AiProviderId, AiTask } from './ai-types';
import { checkLoopback } from './loopback';
import { createLogger } from '@/utils/logger';

const log = createLogger('ai-service');

const MAX_SELECTION_CHARS = 8000;
const MAX_CHAT_CHARS = 6000;
const CHAT_REPLY_CAP = 4000;

export class AiService implements AiBackend {
  #detector: CapabilityDetector | null = null;
  #settings: AiSettings | null = null;
  #inflight = new Map<string, AbortController>();
  #detach: Array<() => void> = [];

  async start(): Promise<void> {
    const settings = await getSettings();
    this.#settings = settings.ai;
    this.#detector = new CapabilityDetector(settings.ai);
    this.#detach.push(
      watchSettings((next) => {
        this.#settings = next.ai;
        this.#detector?.updateSettings(next.ai);
      }),
    );
  }

  stop(): void {
    for (const c of this.#inflight.values()) c.abort(new Error('shutdown'));
    this.#inflight.clear();
    for (const fn of this.#detach.splice(0)) fn();
  }

  async getCapability(
    force: boolean,
  ): Promise<ResponseFor<'AI_GET_CAPABILITY'>> {
    const settings = await getSettings();
    const detector = this.#requireDetector();
    return {
      capability: await detector.capability(aiEnabled(settings), force),
    };
  }

  async testConnection(input: {
    provider: string;
    endpoint?: string;
    model?: string;
  }): Promise<ResponseFor<'AI_TEST_CONNECTION'>> {
    const provider = input.provider as AiProviderId;
    if (input.endpoint && provider !== 'chrome') {
      const c = checkLoopback(input.endpoint);
      if (!c.ok) {
        return {
          probe: {
            id: provider,
            state: 'unavailable',
            detail: `That endpoint is not a loopback address — ${c.reason}. WriteRight only connects to a model server on your own machine.`,
            endpoint: input.endpoint,
          },
        };
      }
    }
    // Probe against a transient config built from the supplied overrides so the
    // user can test before saving.
    const detector = this.#transientDetector(
      provider,
      input.endpoint,
      input.model,
    );
    return { probe: await detector.adapter(provider).probe() };
  }

  async listModels(input: {
    provider: string;
    endpoint?: string;
  }): Promise<ResponseFor<'AI_LIST_MODELS'>> {
    const provider = input.provider as AiProviderId;
    const detector = this.#transientDetector(provider, input.endpoint);
    const adapter = detector.adapter(provider);
    const models = adapter.listModels ? await adapter.listModels() : [];
    return { models };
  }

  async run(input: {
    requestId: string;
    task: string;
    selection: string;
    whole: boolean;
    formatHint?: string;
  }): Promise<AiRunResponse> {
    const task = input.task as AiTask;
    if (task === 'chat') {
      return {
        status: 'blocked',
        mode: 'unsupported',
        message: 'Use the chat panel for a conversation.',
      };
    }
    const selection = input.selection.slice(0, MAX_SELECTION_CHARS + 1);
    const settings = await getSettings();
    const capability = await this.#requireDetector().capability(
      aiEnabled(settings),
      false,
    );

    const decision = route(
      { task, selectionChars: selection.length, whole: input.whole },
      capability,
    );
    if (decision.mode === 'deterministic') {
      return {
        status: 'blocked',
        mode: 'deterministic',
        message: decision.hint,
      };
    }
    if (decision.mode === 'unsupported') {
      return {
        status: 'blocked',
        mode: 'unsupported',
        message: decision.reason,
      };
    }

    const template = promptForTask(task);
    const formatHint = await this.#resolveFormatHint(task, input.formatHint);
    const user = template.user(selection.trim(), formatHint);
    const maxOutputChars =
      template.kind === 'explanation'
        ? 900
        : Math.min(
            MAX_SELECTION_CHARS + 400,
            Math.round(selection.length * 3) + 400,
          );

    const controller = new AbortController();
    this.#inflight.set(input.requestId, controller);
    try {
      const adapter = this.#requireDetector().adapter(decision.provider);
      const raw = await adapter.generate({
        system: template.system,
        user,
        wantJson: template.wantJson,
        signal: controller.signal,
        model: decision.model,
        maxOutputChars,
      });
      const validated = validateAiOutput(raw, {
        kind: template.kind,
        selection: selection.trim(),
        maxOutputChars,
      });
      if (!validated.ok) {
        log.warn('AI output rejected', validated.error);
        return {
          status: 'blocked',
          mode: 'unsupported',
          message: `The local model returned something WriteRight could not safely use (${validated.error}). Nothing was changed.`,
        };
      }
      return {
        status: 'ok',
        kind: validated.value.kind,
        text: validated.value.text,
        changes: validated.value.changes,
        provider: validated.value.provider,
        model: validated.value.model,
      };
    } catch (err) {
      return {
        status: 'blocked',
        mode: 'unsupported',
        message: aiFailure(err),
      };
    } finally {
      this.#inflight.delete(input.requestId);
    }
  }

  async chat(input: {
    requestId: string;
    history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>;
    message: string;
  }): Promise<AiChatResponse> {
    const message = input.message.slice(0, MAX_CHAT_CHARS);
    const settings = await getSettings();
    const capability = await this.#requireDetector().capability(
      aiEnabled(settings),
      false,
    );
    const decision = route({ task: 'chat', selectionChars: 0 }, capability);
    if (decision.mode !== 'generative') {
      return {
        status: 'blocked',
        message:
          decision.mode === 'deterministic' ? decision.hint : decision.reason,
      };
    }

    const transcript = input.history
      .slice(-8)
      .map(
        (t) =>
          `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content.slice(0, 2000)}`,
      )
      .join('\n');
    const user = `${transcript ? `${transcript}\n` : ''}User: ${message}\nAssistant:`;

    const controller = new AbortController();
    this.#inflight.set(input.requestId, controller);
    try {
      const adapter = this.#requireDetector().adapter(decision.provider);
      const raw = await adapter.generate({
        system: CHAT_SYSTEM_PROMPT,
        user,
        wantJson: false,
        signal: controller.signal,
        model: decision.model,
        maxOutputChars: CHAT_REPLY_CAP,
      });
      const validated = validateChatReply(raw.raw, CHAT_REPLY_CAP);
      if (!validated.ok) {
        return {
          status: 'blocked',
          message: 'The local model returned an empty reply.',
        };
      }
      return {
        status: 'ok',
        reply: validated.text,
        provider: decision.provider,
      };
    } catch (err) {
      return { status: 'blocked', message: aiFailure(err) };
    } finally {
      this.#inflight.delete(input.requestId);
    }
  }

  cancel(requestId: string): void {
    this.#inflight.get(requestId)?.abort(new Error('cancelled'));
    this.#inflight.delete(requestId);
  }

  async startChromeDownload(): Promise<ResponseFor<'AI_START_DOWNLOAD'>> {
    return this.#requireDetector().startChromeDownload();
  }

  async acknowledgePrivacy(): Promise<ResponseFor<'AI_ACK_PRIVACY'>> {
    const settings = await patchSettings({ ai: { acknowledgedPrivacy: true } });
    this.#settings = settings.ai;
    this.#detector?.updateSettings(settings.ai);
    return { settings };
  }

  async getChatHistory(): Promise<ResponseFor<'AI_GET_CHAT_HISTORY'>> {
    const settings = await getSettings();
    if (!settings.ai.keepChatHistory) return { turns: [] };
    return { turns: await getChatHistory() };
  }

  async saveChatHistory(
    turns: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<ResponseFor<'AI_SAVE_CHAT_HISTORY'>> {
    const settings = await getSettings();
    // Only persist while the user has opted in; otherwise make sure nothing
    // lingers on disk (§4.7).
    if (settings.ai.keepChatHistory) await setChatHistory(turns);
    else await clearChatHistory();
    return { ok: true };
  }

  /* ---- internals --------------------------------------------------- */

  #requireDetector(): CapabilityDetector {
    if (!this.#detector) {
      this.#detector = new CapabilityDetector(
        this.#settings ?? emptyAiSettings(),
      );
    }
    return this.#detector;
  }

  #transientDetector(
    _provider: AiProviderId,
    endpoint?: string,
    model?: string,
  ): CapabilityDetector {
    const base = this.#settings ?? emptyAiSettings();
    const patched: AiSettings = {
      ...base,
      ...(endpoint
        ? {
            ollamaEndpoint:
              _provider === 'ollama' ? endpoint : base.ollamaEndpoint,
            lmStudioEndpoint:
              _provider === 'lmstudio' ? endpoint : base.lmStudioEndpoint,
            customEndpoint:
              _provider === 'custom' ? endpoint : base.customEndpoint,
          }
        : {}),
      ...(model
        ? {
            ollamaModel: _provider === 'ollama' ? model : base.ollamaModel,
            lmStudioModel:
              _provider === 'lmstudio' ? model : base.lmStudioModel,
            customModel: _provider === 'custom' ? model : base.customModel,
          }
        : {}),
    };
    return new CapabilityDetector(patched);
  }

  async #resolveFormatHint(
    task: AiTask,
    explicit: string | undefined,
  ): Promise<string | undefined> {
    if (task !== 'to-format') return undefined;
    if (explicit) return explicit;
    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const origin = tab?.url ? new URL(tab.url).origin : '';
      const settings = await getSettings();
      const rule = origin ? await getSiteRule(origin) : null;
      const presetId =
        rule?.presetId !== undefined ? rule.presetId : settings.defaultPresetId;
      return findPreset(presetId)?.label;
    } catch {
      return undefined;
    }
  }
}

/** AI is available only when the feature is on AND strict privacy is off (§4.1 #26). */
function aiEnabled(settings: Settings): boolean {
  return settings.features.ai && !settings.strictPrivacy;
}

function aiFailure(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err);
  if (name === 'AbortError' || /\b(cancel|abort)/i.test(msg))
    return 'Cancelled.';
  if (/shutdown/i.test(msg)) return 'The extension was reloaded — try again.';
  if (/timeout/i.test(msg)) {
    return 'The local model did not respond in time. Your offline writing tools are still working.';
  }
  return `Local AI failed: ${msg}. Your offline writing tools are still working.`;
}

function emptyAiSettings(): AiSettings {
  return {
    provider: 'auto',
    ollamaEndpoint: '',
    ollamaModel: '',
    lmStudioEndpoint: '',
    lmStudioModel: '',
    customEndpoint: '',
    customModel: '',
    enhancedReview: false,
    keepChatHistory: false,
    acknowledgedPrivacy: false,
  };
}
