/**
 * Deterministic tone estimation (§13.2).
 *
 * Scores each tone from local lexical/structural signals and reports the
 * winner with **explicit uncertainty** — "Likely professional", never "Your
 * tone is professional" (§13.3). We do not claim an accuracy figure; there is
 * no evaluation dataset behind this (§13.2).
 */

import type { Tone, ToneEstimate, ToneSignal } from '@/types/insights';
import { TONE_LABELS } from '@/types/insights';
import { words, sentences } from '@/core/segmenter';

const TONES: Tone[] = [
  'neutral',
  'professional',
  'formal',
  'friendly',
  'casual',
  'confident',
  'empathetic',
  'urgent',
  'persuasive',
];

const CONTRACTION_RE =
  /\b\w+'(?:re|ve|ll|d|s|t|m)\b|\b(?:can't|won't|don't|isn't|aren't|wasn't|weren't|didn't|doesn't|shouldn't|couldn't|wouldn't)\b/gi;
const HEDGE_RE =
  /\b(?:maybe|perhaps|possibly|probably|might|could be|I think|I guess|I suppose|sort of|kind of|somewhat|arguably|it seems|apparently|reportedly)\b/gi;
const BOOSTER_RE =
  /\b(?:definitely|certainly|absolutely|clearly|obviously|undoubtedly|must|will|always|never|guarantee|proven|essential|critical)\b/gi;
const POLITE_RE =
  /\b(?:please|thank you|thanks|sorry|apologi[sz]e|appreciate|grateful|kindly|would you mind|if you could)\b/gi;
const EMPATHY_RE =
  /\b(?:understand|feel|hear you|that sounds|I'm sorry|difficult|frustrating|hope you|take care|no worries|it's okay)\b/gi;
const URGENCY_RE =
  /\b(?:urgent|asap|immediately|now|today|deadline|right away|time-sensitive|critical|emergency|by (?:end of day|eod|tomorrow))\b/gi;
const PERSUASION_RE =
  /\b(?:you should|you need to|imagine|consider|benefit|opportunity|don't miss|act now|limited|proven|results|guarantee|why not)\b/gi;
const GREETING_RE =
  /^(?:\s*)(?:dear|hi|hello|hey|greetings|to whom it may concern)\b/i;
const CLOSING_RE =
  /\b(?:regards|sincerely|best|cheers|thanks again|warm(?:ly| regards)|respectfully|yours (?:truly|faithfully))\b[\s,]*$/i;
const FORMAL_MARKERS_RE =
  /\b(?:furthermore|moreover|therefore|thus|hence|consequently|nevertheless|notwithstanding|herein|aforementioned|pursuant|whom|shall)\b/gi;
const CASUAL_MARKERS_RE =
  /\b(?:gonna|wanna|gotta|kinda|yeah|nope|lol|haha|awesome|cool|stuff|totally|basically|honestly)\b/gi;
const IMPERATIVE_START_RE = /^(?:please\s+)?[A-Z][a-z]+(?:\s|$)/;
const IMPERATIVE_VERBS = new Set([
  'do',
  'make',
  'send',
  'call',
  'check',
  'review',
  'submit',
  'complete',
  'ensure',
  'confirm',
  'update',
  'provide',
  'contact',
  'reply',
  'schedule',
  'add',
  'remove',
  'fix',
  'consider',
  'note',
  'remember',
  'stop',
  'start',
  'try',
  'use',
  'let',
]);

export function estimateTone(text: string): ToneEstimate {
  const wordSpans = words(text);
  const n = wordSpans.length;
  const scores: Record<Tone, number> = Object.fromEntries(
    TONES.map((t) => [t, 0]),
  ) as Record<Tone, number>;
  const signals: ToneSignal[] = [];

  if (n < 5) {
    return {
      primary: 'neutral',
      secondary: null,
      confidence: 0,
      label: 'Tone unclear — not enough text yet',
      signals: [],
      scores,
    };
  }

  const per100 = (count: number): number => (count / n) * 100;
  const rate = (re: RegExp): number => {
    re.lastIndex = 0;
    let c = 0;
    while (re.exec(text) !== null) c += 1;
    return c;
  };

  // --- contractions -----------------------------------------------------
  const contractions = rate(CONTRACTION_RE);
  if (contractions > 0) {
    const r = per100(contractions);
    scores.casual += r * 0.9;
    scores.friendly += r * 0.6;
    scores.formal -= r * 1.2;
    scores.professional -= r * 0.3;
    signals.push({
      name: 'Contractions',
      detail: `${r.toFixed(1)} per 100 words`,
    });
  } else {
    scores.formal += 1.5;
    scores.professional += 0.5;
  }

  // --- punctuation density -------------------------------------------
  const exclamations = (text.match(/!/g) ?? []).length;
  const questions = (text.match(/\?/g) ?? []).length;
  if (exclamations > 0) {
    const r = per100(exclamations);
    scores.friendly += r * 1.2;
    scores.urgent += r * 1.0;
    scores.persuasive += r * 0.8;
    scores.formal -= r * 1.5;
    signals.push({
      name: 'Exclamation marks',
      detail: `${exclamations} in the text`,
    });
  }
  if (questions > 0) {
    scores.friendly += per100(questions) * 0.5;
    scores.persuasive += per100(questions) * 0.6;
  }

  // --- person -------------------------------------------------------
  const firstPerson = rate(/\b(?:I|we|me|us|my|our|mine|ours)\b/gi);
  const secondPerson = rate(/\b(?:you|your|yours|you're|you'll)\b/gi);
  if (secondPerson > 0) {
    const r = per100(secondPerson);
    scores.friendly += r * 0.7;
    scores.persuasive += r * 0.9;
    scores.empathetic += r * 0.4;
    signals.push({
      name: 'Addresses the reader',
      detail: `${r.toFixed(1)} per 100 words ("you")`,
    });
  }
  if (firstPerson > 0) {
    scores.casual += per100(firstPerson) * 0.3;
    scores.empathetic += per100(firstPerson) * 0.2;
  }
  if (firstPerson === 0 && secondPerson === 0) {
    scores.neutral += 2;
    scores.formal += 1;
  }

  // --- hedging vs boosting ----------------------------------------
  const hedges = rate(HEDGE_RE);
  const boosters = rate(BOOSTER_RE);
  if (hedges > boosters) {
    const r = per100(hedges - boosters);
    scores.empathetic += r * 0.6;
    scores.neutral += r * 0.4;
    scores.confident -= r * 1.0;
    signals.push({
      name: 'Hedging language',
      detail: `${hedges} hedges vs ${boosters} boosters`,
    });
  } else if (boosters > hedges) {
    const r = per100(boosters - hedges);
    scores.confident += r * 1.1;
    scores.persuasive += r * 0.5;
    scores.urgent += r * 0.3;
    signals.push({
      name: 'Assertive language',
      detail: `${boosters} strong claims`,
    });
  }

  // --- politeness / empathy / urgency / persuasion --------------
  const polite = rate(POLITE_RE);
  if (polite > 0) {
    scores.professional += per100(polite) * 0.8;
    scores.empathetic += per100(polite) * 0.6;
    scores.friendly += per100(polite) * 0.3;
    signals.push({
      name: 'Politeness markers',
      detail: `${polite} ("please", "thanks"…)`,
    });
  }
  const empathy = rate(EMPATHY_RE);
  if (empathy > 0) {
    scores.empathetic += per100(empathy) * 1.4;
    signals.push({ name: 'Empathetic phrases', detail: `${empathy} found` });
  }
  const urgency = rate(URGENCY_RE);
  if (urgency > 0) {
    scores.urgent += per100(urgency) * 1.6;
    signals.push({
      name: 'Urgency cues',
      detail: `${urgency} ("asap", "deadline"…)`,
    });
  }
  const persuasion = rate(PERSUASION_RE);
  if (persuasion > 0) {
    scores.persuasive += per100(persuasion) * 1.3;
    signals.push({
      name: 'Persuasive phrasing',
      detail: `${persuasion} found`,
    });
  }

  // --- register markers ---------------------------------------
  const formalMarkers = rate(FORMAL_MARKERS_RE);
  if (formalMarkers > 0) {
    scores.formal += per100(formalMarkers) * 1.5;
    scores.professional += per100(formalMarkers) * 0.5;
    signals.push({
      name: 'Formal connectors',
      detail: `${formalMarkers} ("furthermore", "therefore"…)`,
    });
  }
  const casualMarkers = rate(CASUAL_MARKERS_RE);
  if (casualMarkers > 0) {
    scores.casual += per100(casualMarkers) * 1.6;
    scores.formal -= per100(casualMarkers) * 1.5;
    signals.push({
      name: 'Casual words',
      detail: `${casualMarkers} ("gonna", "yeah"…)`,
    });
  }

  // --- greeting / closing -------------------------------------
  if (GREETING_RE.test(text) || CLOSING_RE.test(text.trimEnd())) {
    scores.professional += 3;
    scores.formal += 1.5;
    signals.push({
      name: 'Letter/email structure',
      detail: 'greeting or sign-off present',
    });
  }

  // --- imperative structure ---------------------------------
  let imperatives = 0;
  for (const s of sentences(text)) {
    const first = words(s.text)[0]?.text.toLowerCase() ?? '';
    if (IMPERATIVE_START_RE.test(s.text) && IMPERATIVE_VERBS.has(first)) {
      imperatives += 1;
    }
  }
  if (imperatives > 0) {
    const r = (imperatives / Math.max(1, sentences(text).length)) * 100;
    scores.urgent += r * 0.5;
    scores.confident += r * 0.4;
    scores.professional += r * 0.2;
    signals.push({
      name: 'Direct instructions',
      detail: `${imperatives} imperative sentence(s)`,
    });
  }

  // --- sentence complexity ---------------------------------
  const avgLen =
    sentences(text).reduce((sum, s) => sum + words(s.text).length, 0) /
    Math.max(1, sentences(text).length);
  if (avgLen > 22) {
    scores.formal += 2;
    scores.professional += 1;
  } else if (avgLen < 10) {
    scores.casual += 1.5;
    scores.friendly += 1;
    scores.urgent += 0.5;
  }

  // baseline so "neutral" wins on flat text
  scores.neutral += 2.5;
  scores.professional += 1;

  // --- resolve --------------------------------------------
  const ranked = [...TONES].sort((a, b) => scores[b] - scores[a]);
  const primary = ranked[0]!;
  const secondary = ranked[1]!;
  const top = scores[primary];
  const second = scores[secondary];
  const margin = top <= 0 ? 0 : (top - second) / top;
  const strength = Math.min(1, top / 12);
  const confidence = clamp01(margin * 0.6 + strength * 0.4);

  return {
    primary,
    secondary: confidence < 0.15 ? null : secondary,
    confidence: round2(confidence),
    label: toLabel(primary, confidence, n),
    signals: signals.slice(0, 6),
    scores: normalizeScores(scores),
  };
}

function toLabel(tone: Tone, confidence: number, wordCount: number): string {
  const name = TONE_LABELS[tone].toLowerCase();
  if (wordCount < 20) return `Leaning ${name} (short text — low confidence)`;
  if (confidence >= 0.6) return `Likely ${name}`;
  if (confidence >= 0.3) return `Possibly ${name}`;
  return 'Tone unclear or mixed';
}

function normalizeScores(scores: Record<Tone, number>): Record<Tone, number> {
  const max = Math.max(1, ...TONES.map((t) => scores[t]));
  const out = {} as Record<Tone, number>;
  for (const t of TONES) out[t] = round2(Math.max(0, scores[t]) / max);
  return out;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
