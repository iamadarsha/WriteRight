/**
 * Background-hosted linguistic engine service (§2.2).
 *
 * Owns the {@link LinguisticEngine} (Harper/WASM + custom rules), assembles a
 * full {@link AnalysisRequest} from settings + per-site rules + the personal
 * dictionary, and answers analysis / dictionary / rule-description messages.
 *
 * MV3 note: on a service-worker cold start the engine re-initializes (WASM
 * fetch + dictionary build, ~sub-second). `initialize()` is called eagerly and
 * the first `analyze()` awaits it; the content layer shows an "analyzing" state
 * meanwhile and never blocks typing (§5.3, §9.2).
 */

import { browser } from '#imports';
import { createBinaryModuleFromUrl } from 'harper.js';
import type {
  AnalysisResponse,
  EngineStatus,
  RewriteResponse,
} from '@/types/messages';
import type { AnalyzeMessage, EngineBackend } from './engine-backend';
import { HarperLinter } from '@/engine/harper/harper-linter';
import { LinguisticEngine } from '@/engine/linguistic-engine';
import type { AnalysisRequest } from '@/engine/engine-host';
import { getSettings } from '@/storage/settings';
import { getSiteRule } from '@/storage/site-rules';
import {
  getDictionary,
  addWord,
  removeWord,
  importWords,
  resetDictionary,
  watchDictionary,
} from '@/storage/dictionary';
import { findPreset } from '@/engine/format-presets';
import { newId } from '@/utils/id';
import { createLogger } from '@/utils/logger';

const log = createLogger('engine-service');

const WASM_PATH = '/harper/harper_wasm_bg.wasm';

export class EngineService implements EngineBackend {
  #engine: LinguisticEngine | null = null;
  #initError: string | null = null;
  #detach: Array<() => void> = [];
  #ruleDescriptions: Record<string, string> | null = null;

  async start(): Promise<void> {
    try {
      const settings = await getSettings();
      const wasmUrl = browser.runtime.getURL(
        WASM_PATH as Parameters<typeof browser.runtime.getURL>[0],
      );
      const binary = createBinaryModuleFromUrl(wasmUrl, 'full');
      const linter = new HarperLinter({ binary, dialect: settings.dialect });
      this.#engine = new LinguisticEngine(linter);

      // Warm the engine + load the personal dictionary, without blocking start.
      void this.#engine
        .initialize()
        .then(() => getDictionary())
        .then((words) => this.#engine?.setPersonalDictionary(words))
        .catch((err) => {
          this.#initError = String((err as Error).message ?? err);
          log.error('engine warm-up failed', err);
        });

      this.#detach.push(
        watchDictionary((words) => {
          void this.#engine?.setPersonalDictionary(words);
        }),
      );
    } catch (err) {
      this.#initError = String((err as Error).message ?? err);
      log.error('engine service failed to start', err);
    }
  }

  stop(): void {
    for (const fn of this.#detach.splice(0)) fn();
    void this.#engine?.shutdown();
    this.#engine = null;
  }

  /* ---- message handlers ------------------------------------------------ */

  async analyze(msg: AnalyzeMessage): Promise<AnalysisResponse> {
    const emptyResponse: AnalysisResponse = {
      requestId: msg.requestId,
      sessionId: msg.sessionId,
      documentVersion: msg.documentVersion,
      suggestions: [],
      insights: null,
      degraded: true,
    };
    if (!this.#engine) return emptyResponse;

    const [settings, siteRule] = await Promise.all([
      getSettings(),
      getSiteRule(msg.origin),
    ]);
    const presetId =
      siteRule?.presetId !== undefined
        ? siteRule.presetId
        : settings.defaultPresetId;

    const request: AnalysisRequest = {
      requestId: msg.requestId,
      sessionId: msg.sessionId,
      documentVersion: msg.documentVersion,
      text: msg.text,
      dialect: settings.dialect,
      styleChecksEnabled: settings.features.styleWordiness,
      readabilityEnabled: settings.features.readability,
      buzzwords: [],
      disabledRuleIds: siteRule?.ignoredRuleIds ?? [],
      ignoredKeys: [],
      extraIgnorePatterns: settings.extraIgnorePatterns,
      presetId: presetId ?? null,
      withInsights: msg.withInsights,
    };

    const result = await this.#engine.analyze(request);
    return {
      requestId: result.requestId,
      sessionId: result.sessionId,
      documentVersion: result.documentVersion,
      suggestions: result.suggestions,
      insights: result.insights,
      degraded: result.degraded,
    };
  }

  async rewrite(msg: {
    origin: string;
    text: string;
  }): Promise<RewriteResponse> {
    const [settings, siteRule] = await Promise.all([
      getSettings(),
      getSiteRule(msg.origin),
    ]);
    const presetId =
      siteRule?.presetId !== undefined
        ? siteRule.presetId
        : settings.defaultPresetId;
    const preset = findPreset(presetId);
    const { rewriteText } = await import('@/engine/rewrite-engine');
    const result = rewriteText(msg.text, {
      formalizeContractions: preset?.formalizeContractions ?? false,
      extraIgnorePatterns: settings.extraIgnorePatterns,
    });
    return {
      changed: result.changed,
      text: result.text,
      changes: result.changes,
    };
  }

  cancel(requestId: string): void {
    this.#engine?.cancel(requestId);
  }

  async addDictionaryWord(word: string): Promise<readonly string[]> {
    const words = await addWord(word);
    await this.#engine?.setPersonalDictionary(words);
    return words;
  }

  async removeDictionaryWord(word: string): Promise<readonly string[]> {
    const words = await removeWord(word);
    await this.#engine?.setPersonalDictionary(words);
    return words;
  }

  getDictionary(): Promise<readonly string[]> {
    return getDictionary();
  }

  async importDictionary(
    text: string,
  ): Promise<{ words: readonly string[]; added: number }> {
    const { added, total } = await importWords(text);
    await this.#engine?.setPersonalDictionary(total);
    return { words: total, added };
  }

  async clearDictionary(): Promise<readonly string[]> {
    await resetDictionary();
    await this.#engine?.setPersonalDictionary([]);
    return [];
  }

  async ruleDescription(ruleId: string): Promise<string | null> {
    if (ruleId.startsWith('wr:')) return null; // custom rules carry their own copy
    if (!this.#engine) return null;
    if (!this.#ruleDescriptions) {
      try {
        this.#ruleDescriptions = await this.#engine.ruleDescriptions();
      } catch {
        this.#ruleDescriptions = {};
      }
    }
    // ruleId is `harper:<Kind>`; descriptions are keyed by concrete rule name,
    // so we can only offer the kind-level text if present.
    const kind = ruleId.split(':')[1] ?? '';
    return this.#ruleDescriptions?.[kind] ?? null;
  }

  async status(): Promise<EngineStatus> {
    const words = await getDictionary().catch(() => []);
    if (this.#initError) {
      return {
        phase: 'unavailable',
        smoke: null,
        dictionaryWordCount: words.length,
      };
    }
    if (!this.#engine) {
      return {
        phase: 'initializing',
        smoke: null,
        dictionaryWordCount: words.length,
      };
    }
    const smoke = this.#engine.getSmokeResult();
    const phase = !smoke ? 'initializing' : smoke.ok ? 'ready' : 'degraded';
    return { phase, smoke, dictionaryWordCount: words.length };
  }

  newRequestId(): string {
    return newId('an');
  }
}
