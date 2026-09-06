/**
 * Runs the custom WriteRight rule layer (§2.4) and returns raw findings.
 * Order does not matter — the merger sorts and dedupes (§21).
 */

import type { RawFinding, RuleContext, StyleRule } from './rule-types';
import {
  repeatedSpacesRule,
  repeatedPunctuationRule,
} from './whitespace-rules';
import { duplicateWordRule, sentenceStartCaseRule } from './word-rules';
import { fillerPhraseRule, buzzwordRule } from './phrase-rules';
import { confusablesRule } from './confusables-rule';
import { createLogger } from '@/utils/logger';

const log = createLogger('engine:rules');

export const ALL_RULES: readonly StyleRule[] = [
  repeatedSpacesRule,
  repeatedPunctuationRule,
  duplicateWordRule,
  sentenceStartCaseRule,
  confusablesRule,
  fillerPhraseRule,
  buzzwordRule,
];

export function runCustomRules(
  text: string,
  ctx: RuleContext,
  disabledRuleIds: ReadonlySet<string> = new Set(),
): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const rule of ALL_RULES) {
    if (disabledRuleIds.has(rule.id)) continue;
    if (!rule.appliesTo(ctx)) continue;
    try {
      findings.push(...rule.check(text, ctx));
    } catch (err) {
      log.warn(`rule ${rule.id} threw`, err);
    }
  }
  return findings;
}

export { ALL_RULES as customRules };
