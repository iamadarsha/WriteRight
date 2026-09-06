/**
 * The local linguistic engine (§10.1 pipeline, §2).
 *
 * ```
 * normalized text
 *   → protected spans (§10.2)
 *   → Harper (spelling + grammar, §11.1)   ┐
 *   → custom WriteRight rules (§2.4)        ├→ normalize → filter → merge (§21)
 *                                          ┘
 *   → Suggestion[]
 * ```
 *
 * Runs behind {@link EngineHost}. Hosted in the background service worker
 * (§2.2) so no page main thread is blocked.
 */

import type {
  AnalysisRequest,
  AnalysisResult,
  EngineHost,
} from './engine-host';
import { suggestionIgnoreKey } from './engine-host';
import type { Suggestion } from '@/types/suggestion';
import type { HarperLinter } from './harper/harper-linter';
import type { HarperSmokeResult } from './harper/harper-types';
import { runHarperSmokeTest } from './harper/smoke-test';
import { findProtectedSpans, isRangeProtected } from '@/core/protected-spans';
import { runCustomRules, ALL_RULES } from './rules/rule-engine';
import type { RuleContext } from './rules/rule-types';
import { findPreset } from './format-presets';
import {
  normalizeHarperFinding,
  normalizeRawFinding,
  type NormalizeContext,
} from './suggestion-normalizer';
import { mergeSuggestions } from './suggestion-merger';
import { computeInsights } from './insights-engine';
import { createLogger } from '@/utils/logger';

const log = createLogger('engine');

export class LinguisticEngine implements EngineHost {
  readonly #linter: HarperLinter;
  #initialized: Promise<void> | null = null;
  #smoke: HarperSmokeResult | null = null;
  #ready = false;
  readonly #cancelled = new Set<string>();

  constructor(linter: HarperLinter) {
    this.#linter = linter;
  }

  initialize(): Promise<void> {
    if (this.#initialized) return this.#initialized;
    this.#initialized = (async () => {
      await this.#linter.setup();
      this.#smoke = await runHarperSmokeTest(this.#linter);
      // §2.1 — a silent zero-result engine is a release blocker. We still come
      // up (degraded) so deterministic custom rules keep working, but we flag it.
      this.#ready = this.#smoke.ok;
      if (!this.#smoke.ok) {
        log.error('engine initialized DEGRADED — Harper checks unavailable', {
          failures: this.#smoke.failures,
        });
      }
    })();
    return this.#initialized;
  }

  isReady(): boolean {
    return this.#ready;
  }

  getSmokeResult(): HarperSmokeResult | null {
    return this.#smoke;
  }

  /** Per-rule markdown descriptions for "Explain more" (§2.7). */
  ruleDescriptions(): Promise<Record<string, string>> {
    return this.#linter.ruleDescriptions();
  }

  cancel(requestId: string): void {
    this.#cancelled.add(requestId);
  }

  async setDialect(dialect: AnalysisRequest['dialect']): Promise<void> {
    await this.#linter.setDialect(dialect);
  }

  async setPersonalDictionary(words: readonly string[]): Promise<void> {
    await this.#linter.clearWords();
    await this.#linter.importWords(words);
  }

  async shutdown(): Promise<void> {
    this.#ready = false;
    this.#initialized = null;
    await this.#linter.dispose();
  }

  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    await this.initialize();

    const empty = (degraded: boolean): AnalysisResult => ({
      requestId: request.requestId,
      sessionId: request.sessionId,
      documentVersion: request.documentVersion,
      suggestions: [],
      insights: request.withInsights
        ? computeInsights(request.text, [], request.presetId)
        : null,
      degraded,
    });

    if (this.#cancelled.has(request.requestId)) {
      this.#cancelled.delete(request.requestId);
      return empty(false);
    }

    const text = request.text;
    if (text.trim().length === 0) return empty(!this.#ready);

    const disabled = new Set(request.disabledRuleIds);
    // A format preset keeps only its listed custom rules on (§3.4).
    const preset = findPreset(request.presetId);
    if (preset) {
      const keep = new Set(preset.enabledRuleIds);
      for (const rule of ALL_RULES) {
        if (!keep.has(rule.id)) disabled.add(rule.id);
      }
    }
    const ignored = new Set(request.ignoredKeys);
    const spans = findProtectedSpans(text, {
      extraPatterns: request.extraIgnorePatterns,
    });

    const normCtx: NormalizeContext = {
      sessionId: request.sessionId,
      documentVersion: request.documentVersion,
      snapshot: text,
    };
    const ruleCtx: RuleContext = {
      protectedSpans: spans,
      buzzwords: request.buzzwords,
      styleChecksEnabled: request.styleChecksEnabled,
    };

    const collected: Suggestion[] = [];

    // --- Harper -----------------------------------------------------------
    if (this.#ready) {
      try {
        await this.#linter.setDialect(request.dialect);
        const harperFindings = await this.#linter.lint(text);
        for (const finding of harperFindings) {
          if (disabled.has(finding.ruleId)) continue;
          if (
            isRangeProtected({ start: finding.start, end: finding.end }, spans)
          ) {
            continue;
          }
          const suggestion = normalizeHarperFinding(finding, normCtx);
          if (suggestion && !ignored.has(suggestionIgnoreKey(suggestion))) {
            collected.push(suggestion);
          }
        }
      } catch (err) {
        log.error('Harper analysis failed for this request', err);
      }
    }

    // --- custom rules ----------------------------------------------------
    for (const raw of runCustomRules(text, ruleCtx, disabled)) {
      const suggestion = normalizeRawFinding(raw, normCtx);
      if (suggestion && !ignored.has(suggestionIgnoreKey(suggestion))) {
        collected.push(suggestion);
      }
    }

    if (this.#cancelled.has(request.requestId)) {
      this.#cancelled.delete(request.requestId);
      return empty(false);
    }

    const suggestions = mergeSuggestions(collected);

    return {
      requestId: request.requestId,
      sessionId: request.sessionId,
      documentVersion: request.documentVersion,
      suggestions,
      insights: request.withInsights
        ? computeInsights(text, suggestions, request.presetId)
        : null,
      degraded: !this.#ready,
    };
  }
}
