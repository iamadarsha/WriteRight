/**
 * DOM inspection helpers shared by the capability detector and adapters.
 * All functions are read-only — they never mutate the host page (§31 Rule 13).
 */

/**
 * True unless the element is hidden. Uses `Element.checkVisibility()` where the
 * engine supports it (it correctly handles ancestor `display:none`,
 * `content-visibility`, etc.); otherwise falls back to own-element computed
 * style. We deliberately do NOT reject purely on a zero-size layout box: an
 * editor can be momentarily collapsed and still be a legitimate target.
 */
export function isElementVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement) && !(el instanceof SVGElement)) return false;
  if (!el.isConnected) return false;
  const html = el as HTMLElement;
  if (html.hidden) return false;

  const withCheck = el as Element & {
    checkVisibility?: (opts?: {
      checkOpacity?: boolean;
      checkVisibilityCSS?: boolean;
      contentVisibilityAuto?: boolean;
    }) => boolean;
  };
  if (typeof withCheck.checkVisibility === 'function') {
    return withCheck.checkVisibility({
      checkOpacity: true,
      checkVisibilityCSS: true,
      contentVisibilityAuto: true,
    });
  }

  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style) {
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden' || style.visibility === 'collapse') {
      return false;
    }
    if (style.opacity !== '' && Number(style.opacity) === 0) return false;
  }
  return true;
}

/**
 * True when `el` is an editing host via the `contenteditable` attribute.
 *
 * We do not rely solely on `HTMLElement.isContentEditable`: it is not
 * implemented consistently across DOM engines (notably jsdom), so we also read
 * the attribute directly and walk up for an explicit `contenteditable="false"`
 * ancestor that would disable it.
 */
export function isContentEditableElement(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const raw = el.getAttribute('contenteditable');
  if (raw === null) return false;
  const value = raw.toLowerCase();
  if (value !== '' && value !== 'true' && value !== 'plaintext-only') {
    return false;
  }
  // Disabled by an ancestor?
  for (
    let node: Element | null = el.parentElement;
    node;
    node = node.parentElement
  ) {
    const anc = node.getAttribute('contenteditable');
    if (anc === null) continue;
    return anc.toLowerCase() !== 'false';
  }
  return true;
}

/** `<input>` types that never carry prose we should analyze. */
const NON_PROSE_INPUT_TYPES = new Set([
  'password',
  'email',
  'number',
  'tel',
  'url',
  'search',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
  'color',
  'range',
  'checkbox',
  'radio',
  'file',
  'hidden',
  'submit',
  'reset',
  'button',
  'image',
]);

export function isTextLikeInput(el: Element): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  const type = (el.getAttribute('type') ?? 'text').toLowerCase();
  return !NON_PROSE_INPUT_TYPES.has(type);
}

/** Heuristic: does this input/textarea look like a credential field? (§6.4) */
export function looksLikeCredentialField(el: Element): boolean {
  if (el instanceof HTMLInputElement && el.type.toLowerCase() === 'password') {
    return true;
  }
  const hay = [
    el.getAttribute('name'),
    el.getAttribute('id'),
    el.getAttribute('autocomplete'),
    el.getAttribute('aria-label'),
    (el as HTMLElement).dataset?.['testid'],
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /(^|[^a-z])(password|passwd|pwd|otp|one-?time|2fa|mfa|cvv|cvc|card-?number|ssn|pin)([^a-z]|$)/.test(
    hay,
  );
}

/** Whether the element is currently editable (not disabled/readonly). */
export function isElementEditable(el: Element): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return !el.disabled && !el.readOnly;
  }
  if (isContentEditableElement(el)) {
    return el.closest('[aria-disabled="true"]') === null;
  }
  return false;
}

/**
 * Heuristic detection of code editors (CodeMirror, Monaco, ACE, Prism live
 * editors). WriteRight excludes these in Phase 1 (§1.3) — prose rules would be
 * noise, and their DOM is not ordinary contenteditable.
 */
export function looksLikeCodeEditor(el: Element): boolean {
  const marker = el.closest(
    [
      '.CodeMirror',
      '.cm-editor',
      '.monaco-editor',
      '.ace_editor',
      '[data-mode-id]',
      '.ProseMirror.code',
      'pre[contenteditable]',
      'code[contenteditable]',
    ].join(','),
  );
  if (marker) return true;
  // contenteditable inside a <pre> almost always means code / ascii art.
  if (isContentEditableElement(el) && el.closest('pre')) {
    return true;
  }
  return false;
}

/** Deepest active element, piercing open shadow roots. */
export function deepActiveElement(doc: Document = document): Element | null {
  let active: Element | null = doc.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

/** Is `node` inside a shadow root (open or closed we can see)? */
export function isInShadowDom(node: Node): boolean {
  return node.getRootNode() instanceof ShadowRoot;
}
