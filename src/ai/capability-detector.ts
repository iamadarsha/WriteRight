/**
 * AI capability detection (§4.1, §14.4).
 *
 * Holds one instance of each adapter, probes them on demand, and reports a
 * single {@link AiCapability} for the UI. Probes are cheap and never trigger a
 * model download. Results are cached briefly so the popup and sidebar don't
 * hammer a local server.
 *
 * The detector requires nothing: with `features.ai` off, or every provider
 * unavailable, the label is "AI Unavailable — local writing tools still active"
 * and the rest of WriteRight is unaffected (§4.1).
 */

import type { AiSettings } from '@/types/settings';
import type {
  AiAdapter,
  AiCapability,
  AiProbeResult,
  AiProviderId,
} from './ai-types';
import { PromptApiAdapter } from './prompt-api-adapter';
import { OffscreenPromptApiAdapter } from './offscreen-prompt-adapter';
import { OllamaAdapter } from './ollama-adapter';
import { LmStudioAdapter } from './lm-studio-adapter';
import { OpenAiCompatibleAdapter } from './local-endpoint-adapter';
import { EXPERIMENTS } from '@/experiments';

/** Chrome adapter shape the detector needs — `AiAdapter` plus the download hook. */
type ChromeAdapter = AiAdapter & {
  startDownload(): Promise<{ ok: boolean; error?: string }>;
};

const CACHE_TTL_MS = 8000;

/** Order the router prefers when `provider` is `auto` (§14.3). */
const PREFERENCE_ORDER: AiProviderId[] = [
  'chrome',
  'ollama',
  'lmstudio',
  'custom',
];

export class CapabilityDetector {
  // Spike 3.1: run the Prompt API in an offscreen document, not the worker.
  readonly #chrome: ChromeAdapter = EXPERIMENTS.offscreenPromptApi
    ? new OffscreenPromptApiAdapter()
    : new PromptApiAdapter();
  readonly #ollama: OllamaAdapter;
  readonly #lmStudio: LmStudioAdapter;
  readonly #custom: OpenAiCompatibleAdapter;
  #settings: AiSettings;
  #cache: { at: number; capability: AiCapability } | null = null;

  constructor(settings: AiSettings) {
    this.#settings = settings;
    this.#ollama = new OllamaAdapter({
      endpoint: settings.ollamaEndpoint,
      model: settings.ollamaModel,
    });
    this.#lmStudio = new LmStudioAdapter({
      endpoint: settings.lmStudioEndpoint,
      model: settings.lmStudioModel,
    });
    this.#custom = new OpenAiCompatibleAdapter('custom', 'Local endpoint', {
      endpoint: settings.customEndpoint,
      model: settings.customModel,
    });
  }

  updateSettings(settings: AiSettings): void {
    this.#settings = settings;
    this.#ollama.setConfig({
      endpoint: settings.ollamaEndpoint,
      model: settings.ollamaModel,
    });
    this.#lmStudio.setConfig({
      endpoint: settings.lmStudioEndpoint,
      model: settings.lmStudioModel,
    });
    this.#custom.setConfig({
      endpoint: settings.customEndpoint,
      model: settings.customModel,
    });
    this.#cache = null;
  }

  /**
   * Kick off Chrome's on-device model download (§14.5). Only called from an
   * explicit user action in the UI. Clears the probe cache on completion so
   * the very next capability check reflects reality instead of a stale
   * "unavailable" for up to {@link CACHE_TTL_MS}.
   */
  async startChromeDownload(): Promise<{ ok: boolean; error?: string }> {
    const result = await this.#chrome.startDownload();
    this.#cache = null;
    return result;
  }

  adapter(id: AiProviderId): AiAdapter {
    switch (id) {
      case 'chrome':
        return this.#chrome;
      case 'ollama':
        return this.#ollama;
      case 'lmstudio':
        return this.#lmStudio;
      case 'custom':
        return this.#custom;
    }
  }

  /** Probe every provider that could plausibly be configured. */
  async probeAll(force = false): Promise<AiProbeResult[]> {
    const candidates: AiProviderId[] = ['chrome'];
    if (this.#settings.ollamaEndpoint) candidates.push('ollama');
    if (this.#settings.lmStudioEndpoint) candidates.push('lmstudio');
    if (this.#settings.customEndpoint) candidates.push('custom');

    const results = await Promise.all(
      candidates.map((id) =>
        this.adapter(id)
          .probe()
          .catch((err): AiProbeResult => ({
            id,
            state: 'unavailable',
            detail: `Probe failed: ${err instanceof Error ? err.message : String(err)}`,
          })),
      ),
    );
    void force;
    return results;
  }

  /** The provider the router would use right now, honouring the preference. */
  pickActive(probes: readonly AiProbeResult[]): AiProviderId | null {
    const ready = new Set(
      probes.filter((p) => p.state === 'ready').map((p) => p.id),
    );
    if (this.#settings.provider !== 'auto') {
      return ready.has(this.#settings.provider)
        ? this.#settings.provider
        : null;
    }
    for (const id of PREFERENCE_ORDER) if (ready.has(id)) return id;
    return null;
  }

  async capability(enabled: boolean, force = false): Promise<AiCapability> {
    if (!enabled) {
      return {
        enabled: false,
        active: null,
        label: 'AI Unavailable — local writing tools still active',
        providers: [],
        acknowledged: this.#settings.acknowledgedPrivacy,
        enhancedReview: this.#settings.enhancedReview,
      };
    }
    if (!force && this.#cache && Date.now() - this.#cache.at < CACHE_TTL_MS) {
      return this.#cache.capability;
    }
    const providers = await this.probeAll(force);
    const active = this.pickActive(providers);
    const capability: AiCapability = {
      enabled: true,
      active,
      label: labelFor(active),
      providers,
      acknowledged: this.#settings.acknowledgedPrivacy,
      enhancedReview: this.#settings.enhancedReview,
    };
    this.#cache = { at: Date.now(), capability };
    return capability;
  }
}

function labelFor(active: AiProviderId | null): string {
  switch (active) {
    case 'chrome':
      return 'AI Ready — Chrome on-device';
    case 'ollama':
      return 'AI Ready — Ollama';
    case 'lmstudio':
      return 'AI Ready — LM Studio';
    case 'custom':
      return 'AI Ready — local endpoint';
    case null:
      return 'AI Unavailable — local writing tools still active';
  }
}
