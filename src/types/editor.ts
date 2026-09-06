/**
 * The {@link EditorAdapter} contract (§5.2) and its capability model (§5.1).
 *
 * All browser/editor interaction is isolated behind this interface (§31 Rule 14).
 * No site-specific hack belongs in the core text engine — site adapters live in
 * `src/adapters/sites/` and are feature-detected, version-gated and fall back.
 */

import type { TextRange, TextSelection } from './text';

/**
 * §5.1 capability tiers:
 *  - `A` full inline support (textarea, input, ordinary contenteditable)
 *  - `B` adapter-based rich editor, text state accessible, inline optional
 *  - `C` advanced/canvas/virtualized — sidebar/on-demand only, never silent edits
 *  - `D` unsupported — say so honestly rather than showing misleading results
 */
export type CapabilityTier = 'A' | 'B' | 'C' | 'D';

/** What an adapter of a given tier is allowed / able to do. */
export interface EditorCapabilities {
  readonly tier: CapabilityTier;
  /** Real-time analysis as the user types. */
  readonly realtime: boolean;
  /** Precise inline underlines aligned to text geometry. */
  readonly inlineUnderlines: boolean;
  /** One-click replacement through supported selection/input mechanisms. */
  readonly replace: boolean;
  /** Text can be read out for sidebar / on-demand analysis. */
  readonly readText: boolean;
}

export interface EditorChange {
  /** Monotonic per-adapter version after this change (§17.3). */
  readonly version: number;
  /** `input` reason where the platform reports one, else `unknown`. */
  readonly reason:
    'input' | 'paste' | 'composition' | 'programmatic' | 'unknown';
}

export type EditorChangeListener = (change: EditorChange) => void;

/**
 * §5.2 — the formal interface. Implementations must be idempotent on repeated
 * initialization and must not accumulate listeners or overlays (§5.3).
 */
export interface EditorAdapter {
  /** Stable id for this adapter instance (used by sessions & suggestions). */
  readonly id: string;
  /** Identifier of the concrete adapter kind, e.g. `'textarea'`. */
  readonly kind: string;
  /** The element this adapter is bound to. */
  readonly element: Element;

  getCapabilities(): EditorCapabilities;
  getCapabilityTier(): CapabilityTier;

  /** Canonical, normalized document text (UTF-16, LF line endings). */
  getText(): string;
  /** Current selection in UTF-16 code units, or `null` when unknown. */
  getSelection(): TextSelection | null;
  /** Monotonically increasing document version (§17.3, §19). */
  getDocumentVersion(): number;

  /**
   * Replace `range` with `replacement`. Returns `false` (no-op) when the edit
   * cannot be applied safely — never "best effort" into user content (§10.4).
   */
  replaceRange(range: TextRange, replacement: string): boolean;

  focus(): void;
  isEditable(): boolean;
  /** True while an IME composition is active — defer destructive edits (§5.3). */
  isComposing(): boolean;

  /** Subscribe to change/selection events; returns an unsubscribe function. */
  subscribe(listener: EditorChangeListener): () => void;

  /** Detach all listeners/observers/overlays. Safe to call more than once. */
  destroy(): void;
}

/** A factory that can recognize and wrap a specific class of editor element. */
export interface EditorAdapterFactory {
  readonly kind: string;
  /** Higher runs first. Site adapters use high priority; unsupported is lowest. */
  readonly priority: number;
  canHandle(element: Element): boolean;
  create(element: Element): EditorAdapter;
}
