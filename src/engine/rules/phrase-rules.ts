/**
 * Wordiness & buzzword checks (§2.4, §11.2). Style-only, low confidence,
 * never auto-applied — "explain, then apply" (§9).
 */

import type { RawFinding, StyleRule } from './rule-types';
import { isProtected, matchAll } from './rule-types';

interface Phrase {
  readonly pattern: RegExp;
  readonly message: string;
  readonly replacements: readonly string[];
}

/** Wordy phrases with a tighter equivalent. */
const FILLER_PHRASES: Phrase[] = [
  {
    pattern: /\bin order to\b/gi,
    message: 'Simpler: “to”.',
    replacements: ['to'],
  },
  {
    pattern: /\bdue to the fact that\b/gi,
    message: 'Simpler: “because”.',
    replacements: ['because'],
  },
  {
    pattern: /\bat this (?:point in time|moment in time)\b/gi,
    message: 'Simpler: “now”.',
    replacements: ['now'],
  },
  {
    pattern: /\bin the event that\b/gi,
    message: 'Simpler: “if”.',
    replacements: ['if'],
  },
  {
    pattern: /\bfor the purpose of\b/gi,
    message: 'Simpler: “to” or “for”.',
    replacements: ['to', 'for'],
  },
  {
    pattern: /\ba (?:large |small |certain )?number of\b/gi,
    message: 'Consider “many”, “several”, or a specific count.',
    replacements: ['many', 'several'],
  },
  {
    pattern: /\bthe fact that\b/gi,
    message: 'Often removable — try rephrasing without “the fact that”.',
    replacements: ['that'],
  },
  {
    pattern:
      /\b(?:really|very|quite|extremely|actually|basically|literally)\s+/gi,
    message: 'Intensifiers can weaken prose — consider removing.',
    replacements: [''],
  },
  {
    pattern: /\bneedless to say\b/gi,
    message: 'If it’s needless to say, consider cutting it.',
    replacements: [''],
  },
];

/** Default corporate buzzwords; users add more via settings (§11.2). */
const DEFAULT_BUZZWORDS = [
  'synergy',
  'synergize',
  'circle back',
  'move the needle',
  'low-hanging fruit',
  'think outside the box',
  'paradigm shift',
  'boil the ocean',
  'take it offline',
  'drink the kool-aid',
  'open the kimono',
  'best of breed',
  'core competency',
  'value-add',
  'deep dive',
  'double-click on',
];

export const fillerPhraseRule: StyleRule = {
  id: 'wr:filler-phrase',
  label: 'Wordy phrases',
  appliesTo: (ctx) => ctx.styleChecksEnabled,
  check(text, ctx) {
    const out: RawFinding[] = [];
    for (const phrase of FILLER_PHRASES) {
      for (const m of matchAll(phrase.pattern, text)) {
        const start = m.index;
        const end = start + m[0].length;
        if (isProtected(start, end, ctx.protectedSpans)) continue;
        out.push({
          ruleId: this.id,
          source: 'style',
          start,
          end,
          original: m[0],
          message: phrase.message,
          explanation:
            'A shorter phrase carries the same meaning and keeps the reader ' +
            'moving. This is a style nudge, not an error — keep it if the ' +
            'rhythm matters.',
          example: '“in order to begin” → “to begin”',
          replacements: phrase.replacements.map((r) =>
            preserveTrailingSpace(m[0], r),
          ),
          severity: 'info',
          confidence: 0.55,
          canAutoApply: false,
        });
      }
    }
    return out;
  },
};

export const buzzwordRule: StyleRule = {
  id: 'wr:buzzword',
  label: 'Corporate buzzwords',
  appliesTo: (ctx) => ctx.styleChecksEnabled,
  check(text, ctx) {
    const terms = [...DEFAULT_BUZZWORDS, ...ctx.buzzwords]
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 1);
    if (terms.length === 0) return [];

    const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'gi');

    const out: RawFinding[] = [];
    for (const m of matchAll(re, text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (isProtected(start, end, ctx.protectedSpans)) continue;
      out.push({
        ruleId: this.id,
        source: 'style',
        start,
        end,
        original: m[0],
        message: `“${m[0]}” is business jargon — consider plain language.`,
        explanation:
          'Jargon asks the reader to translate. A plain word is usually ' +
          'clearer and sounds less like a template. Your call — some audiences ' +
          'expect the term.',
        example: '“let’s circle back” → “let’s revisit this”',
        replacements: [],
        severity: 'info',
        confidence: 0.5,
        canAutoApply: false,
      });
    }
    return out;
  },
};

function preserveTrailingSpace(original: string, replacement: string): string {
  if (replacement === '') return '';
  return /\s$/.test(original) && !/\s$/.test(replacement)
    ? `${replacement} `
    : replacement;
}
