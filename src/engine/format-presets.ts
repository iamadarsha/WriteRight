/**
 * Format presets (§3.4, §13.3). Configuration objects only — they steer
 * guidance, the target tone shown for comparison, which custom rules stay on,
 * and whether the safe-rewrite pass formalizes contractions. They never
 * silently rewrite anything.
 */

import type { FormatPreset } from '@/types/insights';

export const FORMAT_PRESETS: readonly FormatPreset[] = [
  {
    id: 'business-email',
    label: 'Business email',
    description: 'Clear, courteous, and to the point.',
    targetTone: 'professional',
    preferredSentenceLength: 'mixed',
    enabledRuleIds: [
      'wr:repeated-spaces',
      'wr:repeated-punctuation',
      'wr:duplicate-word',
      'wr:sentence-start-case',
      'wr:filler-phrase',
      'wr:buzzword',
    ],
    formalizeContractions: false,
    guidance: [
      'Open with a one-line purpose; keep paragraphs short.',
      'Prefer plain verbs over buzzwords ("decide", not "circle back").',
      'End with a clear ask or next step.',
    ],
  },
  {
    id: 'academic',
    label: 'Academic writing',
    description: 'Formal register, precise, evidence-led.',
    targetTone: 'formal',
    preferredSentenceLength: 'long',
    enabledRuleIds: [
      'wr:repeated-spaces',
      'wr:repeated-punctuation',
      'wr:duplicate-word',
      'wr:sentence-start-case',
      'wr:filler-phrase',
    ],
    formalizeContractions: true,
    guidance: [
      'Avoid contractions and first-person where the field expects it.',
      'Hedge claims deliberately; cite rather than assert.',
      'Define terms on first use.',
    ],
  },
  {
    id: 'social-post',
    label: 'Social post',
    description: 'Short, lively, scannable.',
    targetTone: 'friendly',
    preferredSentenceLength: 'short',
    enabledRuleIds: ['wr:repeated-spaces', 'wr:duplicate-word'],
    formalizeContractions: false,
    guidance: [
      'Lead with the hook in the first line.',
      'One idea per sentence; contractions are fine.',
      'Cut hashtags and filler words.',
    ],
  },
  {
    id: 'technical-docs',
    label: 'Technical documentation',
    description: 'Unambiguous, consistent, task-focused.',
    targetTone: 'neutral',
    preferredSentenceLength: 'short',
    enabledRuleIds: [
      'wr:repeated-spaces',
      'wr:repeated-punctuation',
      'wr:duplicate-word',
      'wr:sentence-start-case',
      'wr:filler-phrase',
      'wr:buzzword',
    ],
    formalizeContractions: false,
    guidance: [
      'Use the imperative for instructions ("Run", "Set").',
      'Keep terminology identical throughout — no synonyms for the same thing.',
      'Prefer active voice and present tense.',
    ],
  },
  {
    id: 'creative',
    label: 'Creative writing',
    description: 'Voice first — most style rules relaxed.',
    targetTone: 'neutral',
    preferredSentenceLength: 'mixed',
    enabledRuleIds: ['wr:repeated-spaces', 'wr:duplicate-word'],
    formalizeContractions: false,
    guidance: [
      'Sentence-length variety is a feature, not a bug.',
      'Repetition and fragments can be deliberate — ignore freely.',
      'Spelling and proper nouns still matter.',
    ],
  },
  {
    id: 'resume',
    label: 'Résumé / cover letter',
    description: 'Concise, active, results-oriented.',
    targetTone: 'confident',
    preferredSentenceLength: 'short',
    enabledRuleIds: [
      'wr:repeated-spaces',
      'wr:repeated-punctuation',
      'wr:duplicate-word',
      'wr:sentence-start-case',
      'wr:filler-phrase',
      'wr:buzzword',
    ],
    formalizeContractions: true,
    guidance: [
      'Start bullets with a strong past-tense verb ("Led", "Shipped").',
      'Quantify impact where you can.',
      'Cut "responsible for" and hedging language.',
    ],
  },
] as const;

export function findPreset(id: string | null | undefined): FormatPreset | null {
  if (!id) return null;
  return FORMAT_PRESETS.find((p) => p.id === id) ?? null;
}
