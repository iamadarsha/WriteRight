/**
 * Input Capability Detector (§1.3).
 *
 * Given a DOM element, decide whether WriteRight should attach to it and, if
 * not, exactly why. Element-level policy only — site/global/privileged-page
 * policy is applied by the {@link TextFieldManager}.
 *
 * Excluded by design (§6.4): password & credential fields, hidden/disabled/
 * readonly fields, likely code editors, and non-prose input types.
 */

import type {
  FieldDetection,
  FieldKind,
  FieldRejectionReason,
} from '@/types/capability';
import {
  isContentEditableElement,
  isElementEditable,
  isElementVisible,
  isTextLikeInput,
  looksLikeCodeEditor,
  looksLikeCredentialField,
} from '@/utils/dom';

/** Ignore tiny fields (single-char inputs, PIN boxes) — usually not prose. */
const MIN_USEFUL_WIDTH_PX = 48;

export interface DetectorOptions {
  /** Minimum rendered width before a field is considered prose-worthy. */
  readonly minWidthPx?: number;
}

function classify(element: Element): FieldKind {
  if (element instanceof HTMLTextAreaElement) return 'textarea';
  if (element instanceof HTMLInputElement) return 'input-text';
  if (isContentEditableElement(element)) return 'contenteditable';
  return 'unknown';
}

function reject(
  element: Element,
  kind: FieldKind,
  rejection: FieldRejectionReason,
  inFrame: boolean,
): FieldDetection {
  return { element, kind, eligible: false, rejection, inFrame };
}

export function detectField(
  element: Element,
  options: DetectorOptions = {},
): FieldDetection {
  const inFrame =
    element.ownerDocument.defaultView !==
    element.ownerDocument.defaultView?.top;
  const kind = classify(element);

  if (kind === 'unknown') {
    return reject(element, kind, 'not-editable', inFrame);
  }

  // --- credential / sensitive fields -------------------------------------
  if (
    element instanceof HTMLInputElement &&
    element.type.toLowerCase() === 'password'
  ) {
    return reject(element, kind, 'password-or-credential', inFrame);
  }
  if (looksLikeCredentialField(element)) {
    return reject(element, kind, 'password-or-credential', inFrame);
  }

  // --- input type gating ------------------------------------------------
  if (element instanceof HTMLInputElement && !isTextLikeInput(element)) {
    return reject(element, kind, 'excluded-input-type', inFrame);
  }

  // --- hidden / disabled / readonly ----------------------------------------
  if (
    element instanceof HTMLElement &&
    (element.hidden || element.getAttribute('aria-hidden') === 'true')
  ) {
    return reject(element, kind, 'hidden', inFrame);
  }
  if (!isElementEditable(element)) {
    return reject(element, kind, 'disabled-or-readonly', inFrame);
  }
  if (!isElementVisible(element)) {
    return reject(element, kind, 'hidden', inFrame);
  }

  // --- code editors ------------------------------------------------------
  if (looksLikeCodeEditor(element)) {
    return reject(element, kind, 'likely-code-editor', inFrame);
  }

  // --- size gate (inputs only; contenteditable can legitimately be small) --
  if (element instanceof HTMLInputElement) {
    const width = element.getBoundingClientRect().width;
    const min = options.minWidthPx ?? MIN_USEFUL_WIDTH_PX;
    if (width > 0 && width < min) {
      return reject(element, kind, 'too-small', inFrame);
    }
  }

  return { element, kind, eligible: true, inFrame };
}

/** Cheap pre-filter: could this element *ever* be an editing surface? */
export function isPotentialEditor(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) return true;
  return isContentEditableElement(element);
}
