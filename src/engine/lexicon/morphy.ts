/**
 * Minimal lemmatiser, modelled on WordNet's Morphy (§D7).
 *
 * `morphCandidates(word)` returns an ordered list of forms to try against the
 * lexicon: the word itself, a curated irregular mapping, then the classic
 * detachment rules. The caller keeps the first candidate that the lexicon
 * actually contains — so over-generation here is harmless.
 *
 * The curated `IRREGULAR` map covers the finite set of English forms the
 * suffix rules cannot reach (irregular plurals, strong verbs, a few
 * comparatives). Everything regular — cats→cat, running→run, faster→fast —
 * falls to the rules.
 */

import type { LexPos } from './types';

/** Irregular form → lemma. Kept deliberately small and auditable. */
const IRREGULAR: Readonly<Record<string, string>> = {
  // irregular plurals
  children: 'child',
  men: 'man',
  women: 'woman',
  feet: 'foot',
  teeth: 'tooth',
  geese: 'goose',
  mice: 'mouse',
  lice: 'louse',
  people: 'person',
  oxen: 'ox',
  dice: 'die',
  pennies: 'penny',
  pence: 'penny',
  data: 'datum',
  media: 'medium',
  criteria: 'criterion',
  phenomena: 'phenomenon',
  analyses: 'analysis',
  crises: 'crisis',
  theses: 'thesis',
  bases: 'basis',
  diagnoses: 'diagnosis',
  hypotheses: 'hypothesis',
  parentheses: 'parenthesis',
  indices: 'index',
  indexes: 'index',
  matrices: 'matrix',
  vertices: 'vertex',
  appendices: 'appendix',
  cacti: 'cactus',
  fungi: 'fungus',
  nuclei: 'nucleus',
  radii: 'radius',
  stimuli: 'stimulus',
  alumni: 'alumnus',
  syllabi: 'syllabus',
  bacteria: 'bacterium',
  curricula: 'curriculum',
  memoranda: 'memorandum',
  strata: 'stratum',
  formulae: 'formula',
  antennae: 'antenna',
  larvae: 'larva',
  vertebrae: 'vertebra',
  // strong / irregular verbs (past + participle → base)
  was: 'be',
  were: 'be',
  been: 'be',
  am: 'be',
  are: 'be',
  is: 'be',
  had: 'have',
  has: 'have',
  did: 'do',
  does: 'do',
  done: 'do',
  went: 'go',
  gone: 'go',
  goes: 'go',
  made: 'make',
  said: 'say',
  took: 'take',
  taken: 'take',
  came: 'come',
  saw: 'see',
  seen: 'see',
  knew: 'know',
  known: 'know',
  got: 'get',
  gotten: 'get',
  gave: 'give',
  given: 'give',
  found: 'find',
  thought: 'think',
  told: 'tell',
  became: 'become',
  left: 'leave',
  felt: 'feel',
  brought: 'bring',
  began: 'begin',
  begun: 'begin',
  kept: 'keep',
  held: 'hold',
  wrote: 'write',
  written: 'write',
  stood: 'stand',
  heard: 'hear',
  meant: 'mean',
  met: 'meet',
  ran: 'run',
  paid: 'pay',
  sat: 'sit',
  spoke: 'speak',
  spoken: 'speak',
  lay: 'lie',
  lain: 'lie',
  led: 'lead',
  read: 'read',
  grew: 'grow',
  grown: 'grow',
  lost: 'lose',
  fell: 'fall',
  fallen: 'fall',
  sent: 'send',
  built: 'build',
  understood: 'understand',
  drew: 'draw',
  drawn: 'draw',
  broke: 'break',
  broken: 'break',
  spent: 'spend',
  cut: 'cut',
  rose: 'rise',
  risen: 'rise',
  drove: 'drive',
  driven: 'drive',
  bought: 'buy',
  wore: 'wear',
  worn: 'wear',
  chose: 'choose',
  chosen: 'choose',
  ate: 'eat',
  eaten: 'eat',
  caught: 'catch',
  taught: 'teach',
  flew: 'fly',
  flown: 'fly',
  threw: 'throw',
  thrown: 'throw',
  won: 'win',
  swam: 'swim',
  swum: 'swim',
  hung: 'hang',
  sang: 'sing',
  sung: 'sing',
  drank: 'drink',
  drunk: 'drink',
  rang: 'ring',
  rung: 'ring',
  sank: 'sink',
  sunk: 'sink',
  shook: 'shake',
  shaken: 'shake',
  rode: 'ride',
  ridden: 'ride',
  froze: 'freeze',
  frozen: 'freeze',
  stole: 'steal',
  stolen: 'steal',
  spread: 'spread',
  slept: 'sleep',
  dealt: 'deal',
  bent: 'bend',
  lent: 'lend',
  swept: 'sweep',
  wept: 'weep',
  crept: 'creep',
  dug: 'dig',
  stuck: 'stick',
  struck: 'strike',
  swung: 'swing',
  bit: 'bite',
  bitten: 'bite',
  hid: 'hide',
  hidden: 'hide',
  bled: 'bleed',
  fed: 'feed',
  fled: 'flee',
  shot: 'shoot',
  lit: 'light',
  quit: 'quit',
  put: 'put',
  set: 'set',
  hurt: 'hurt',
  let: 'let',
  shut: 'shut',
  cost: 'cost',
  bet: 'bet',
  beat: 'beat',
  beaten: 'beat',
  // irregular comparatives / superlatives
  better: 'good',
  best: 'good',
  worse: 'bad',
  worst: 'bad',
  further: 'far',
  furthest: 'far',
  farther: 'far',
  farthest: 'far',
  more: 'much',
  most: 'much',
  less: 'little',
  least: 'little',
  elder: 'old',
  eldest: 'old',
};

interface Rule {
  readonly suffix: string;
  readonly replace: string;
}

const NOUN_RULES: readonly Rule[] = [
  { suffix: 'ses', replace: 's' },
  { suffix: 'xes', replace: 'x' },
  { suffix: 'zes', replace: 'z' },
  { suffix: 'ches', replace: 'ch' },
  { suffix: 'shes', replace: 'sh' },
  { suffix: 'ies', replace: 'y' },
  { suffix: 'ves', replace: 'f' },
  { suffix: 'ves', replace: 'fe' },
  { suffix: 's', replace: '' },
];

const VERB_RULES: readonly Rule[] = [
  { suffix: 'ies', replace: 'y' },
  { suffix: 'ied', replace: 'y' },
  { suffix: 'ying', replace: 'ie' },
  { suffix: 'ing', replace: '' },
  { suffix: 'ing', replace: 'e' },
  { suffix: 'ed', replace: '' },
  { suffix: 'ed', replace: 'e' },
  { suffix: 'es', replace: '' },
  { suffix: 'es', replace: 'e' },
  { suffix: 's', replace: '' },
];

const ADJ_RULES: readonly Rule[] = [
  { suffix: 'iest', replace: 'y' },
  { suffix: 'ier', replace: 'y' },
  { suffix: 'est', replace: '' },
  { suffix: 'est', replace: 'e' },
  { suffix: 'er', replace: '' },
  { suffix: 'er', replace: 'e' },
];

function applyRules(word: string, rules: readonly Rule[]): string[] {
  const out: string[] = [];
  for (const { suffix, replace } of rules) {
    if (word.length > suffix.length + 1 && word.endsWith(suffix)) {
      out.push(word.slice(0, word.length - suffix.length) + replace);
      // handle doubled final consonant: "running" → "runn" → "run"
      if (suffix === 'ing' || suffix === 'ed') {
        const stem = word.slice(0, word.length - suffix.length);
        if (
          stem.length > 2 &&
          stem[stem.length - 1] === stem[stem.length - 2] &&
          /[bdfglmnprt]/.test(stem[stem.length - 1]!)
        ) {
          out.push(stem.slice(0, -1));
        }
      }
    }
  }
  return out;
}

/**
 * Ordered candidate lemmas for `word` — the word itself first, then irregular
 * and rule-derived forms. Deduplicated, all lower-case. The caller filters by
 * lexicon membership.
 */
export function morphCandidates(word: string, pos?: LexPos): string[] {
  const w = word.toLowerCase().trim();
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (c: string): void => {
    if (c.length >= 1 && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  };

  add(w);
  const irr = IRREGULAR[w];
  if (irr) add(irr);

  const posList: LexPos[] = pos
    ? [pos]
    : ['noun', 'verb', 'adjective', 'adverb'];
  for (const p of posList) {
    if (p === 'noun') for (const c of applyRules(w, NOUN_RULES)) add(c);
    else if (p === 'verb') for (const c of applyRules(w, VERB_RULES)) add(c);
    else if (p === 'adjective')
      for (const c of applyRules(w, ADJ_RULES)) add(c);
  }
  return out;
}

/** For build-time: the reverse — used to sanity-check the map. */
export const IRREGULAR_FORMS = IRREGULAR;
