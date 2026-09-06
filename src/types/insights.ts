/**
 * Deterministic writing-intelligence results (§12, §13, §3.8).
 *
 * Everything here is computed locally from the text — no model, no profile,
 * no network (§12.2 "Store no hidden user profile about writing quality").
 */

/* ---- statistics (§12.1, §3.8) --------------------------------------- */

export interface DocumentStats {
  readonly words: number;
  readonly characters: number;
  readonly charactersNoSpaces: number;
  readonly sentences: number;
  readonly paragraphs: number;
  readonly avgSentenceLength: number;
  readonly longestSentenceLength: number;
  readonly longSentenceCount: number; // sentences > 25 words
  readonly longSentencePct: number;
  readonly readingTimeSeconds: number; // 238 wpm
  readonly speakingTimeSeconds: number; // 150 wpm
  readonly passiveVoiceCount: number;
  readonly fillerCount: number;
  readonly repeatedWordRate: number; // adjacent-duplicate rate, 0..1
}

/* ---- readability (§12.1) ------------------------------------------- */

export interface ReadabilityScores {
  /** True once there is enough text for the formulas to mean anything. */
  readonly sufficientText: boolean;
  readonly fleschReadingEase: number; // 0..100 (higher = easier)
  readonly fleschKincaidGrade: number; // US grade level
  readonly gunningFog: number;
  readonly colemanLiau: number;
  readonly smog: number;
  /** A single friendly grade band derived from the above. */
  readonly grade: string; // e.g. "Grade 8 — plain English"
}

/* ---- tone (§13) --------------------------------------------------- */

export type Tone =
  | 'neutral'
  | 'professional'
  | 'formal'
  | 'friendly'
  | 'casual'
  | 'confident'
  | 'empathetic'
  | 'urgent'
  | 'persuasive';

export const TONE_LABELS: Record<Tone, string> = {
  neutral: 'Neutral',
  professional: 'Professional',
  formal: 'Formal',
  friendly: 'Friendly',
  casual: 'Casual',
  confident: 'Confident',
  empathetic: 'Empathetic',
  urgent: 'Urgent',
  persuasive: 'Persuasive',
};

export interface ToneSignal {
  readonly name: string;
  /** Human-readable observed value, e.g. "12% contractions". */
  readonly detail: string;
}

export interface ToneEstimate {
  readonly primary: Tone;
  readonly secondary: Tone | null;
  /** 0..1 — margin between top two tones × overall signal strength. */
  readonly confidence: number;
  /** Uncertainty-aware phrasing (§13.3): "Likely professional", "Tone unclear". */
  readonly label: string;
  readonly signals: readonly ToneSignal[];
  /** Per-tone raw scores, for the sidebar meter. */
  readonly scores: Readonly<Record<Tone, number>>;
}

/* ---- writing health score (§12.2) -------------------------------- */

export interface HealthScoreComponent {
  readonly key:
    'correctness' | 'clarity' | 'readability' | 'concision' | 'consistency';
  readonly label: string;
  readonly value: number; // 0..100
  readonly weight: number; // fraction, sums to 1
  readonly note: string; // why it is where it is
}

export interface HealthScore {
  readonly score: number; // 0..100
  readonly components: readonly HealthScoreComponent[];
  /** Short lines the UI can show under a score change (§12.3). */
  readonly notes: readonly string[];
}

/* ---- format presets (§3.4, §13.3) ------------------------------- */

export interface FormatPreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly targetTone: Tone;
  readonly preferredSentenceLength: 'short' | 'mixed' | 'long';
  /** Custom rule ids to keep on for this preset (others may be relaxed). */
  readonly enabledRuleIds: readonly string[];
  /** Formalize contractions when rewriting under this preset. */
  readonly formalizeContractions: boolean;
  readonly guidance: readonly string[];
}

/* ---- the bundle -------------------------------------------------- */

export interface DocumentInsights {
  readonly stats: DocumentStats;
  readonly readability: ReadabilityScores;
  readonly tone: ToneEstimate;
  readonly score: HealthScore;
  readonly suggestionCounts: {
    readonly error: number;
    readonly warning: number;
    readonly info: number;
  };
  /** Which format preset these insights were computed against, if any. */
  readonly presetId: string | null;
}
