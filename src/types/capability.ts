/**
 * Results of the Input Capability Detector (§1.3).
 *
 * The detector answers: "is this element an editing surface WriteRight should
 * attach to, and if not, why not?" It never decides *how* to attach — that is
 * the adapter registry's job (§1.4).
 */

export type FieldKind =
  'input-text' | 'textarea' | 'contenteditable' | 'unknown';

/** Why a field was rejected — surfaced honestly in the UI, never hidden (§31 Rule 1). */
export type FieldRejectionReason =
  | 'password-or-credential'
  | 'hidden'
  | 'disabled-or-readonly'
  | 'not-editable'
  | 'likely-code-editor'
  | 'excluded-input-type'
  | 'too-small'
  | 'site-disabled'
  | 'globally-disabled'
  | 'privileged-page'
  | 'unsupported-editor';

export interface FieldDetection {
  readonly element: Element;
  readonly kind: FieldKind;
  /** True when WriteRight should attach an adapter to this element. */
  readonly eligible: boolean;
  /** Present when `eligible` is `false`. */
  readonly rejection?: FieldRejectionReason;
  /** True when the element lives inside a same-origin, reachable iframe. */
  readonly inFrame: boolean;
}

/** The overall page-level availability state shown in the popup (§1.6, §27). */
export type PageAvailability =
  | 'ready' // at least one eligible editor, engine reachable
  | 'limited' // page eligible but only degraded support / no editor yet
  | 'unsupported' // eligible page, editors present but not supportable
  | 'disabled-site' // user turned WriteRight off for this site
  | 'disabled-field' // user turned WriteRight off for the focused field (§4.1 #23)
  | 'disabled-global' // user paused WriteRight everywhere
  | 'unavailable-privileged'; // browser forbids injection here (§0.4)

export interface PageStatus {
  readonly availability: PageAvailability;
  /** Human sentence for the popup — answers "what / is my writing safe / next". */
  readonly detail: string;
  /** Count of eligible editors currently tracked. */
  readonly eligibleFields: number;
  /** Best capability tier available on the page, if any. */
  readonly bestTier?: 'A' | 'B' | 'C' | 'D';
  readonly origin: string;
}
