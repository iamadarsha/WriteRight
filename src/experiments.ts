/**
 * Phase 3 architecture spikes (see docs/PHASE-3-SPIKES.md).
 *
 * Each flag gates a prototype of an alternative implementation so it can be
 * built, measured against what exists, and then adopted or deleted — never a
 * permanent config surface. Off by default; turn one on for a build with the
 * matching `WXT_EXP_*` env var:
 *
 *   WXT_EXP_CSS_HIGHLIGHTS=1 npm run build
 *
 * Tests see every flag as `false` (the env vars are unset), so the shipped
 * behaviour is exactly the current one until a spike wins its go/no-go.
 */

declare global {
  interface ImportMetaEnv {
    readonly WXT_EXP_CSS_HIGHLIGHTS?: string;
    readonly WXT_EXP_NATIVE_POPOVER?: string;
    readonly WXT_EXP_OFFSCREEN_AI?: string;
  }
}

function on(value: unknown): boolean {
  return value === '1' || value === 'true';
}

export const EXPERIMENTS = {
  /** 3.2 — draw `contenteditable` underlines with the CSS Custom Highlight API. */
  cssHighlightUnderlines: on(import.meta.env.WXT_EXP_CSS_HIGHLIGHTS),
  /** 3.3 — the suggestion card as a native `popover` (top layer + light-dismiss). */
  nativePopover: on(import.meta.env.WXT_EXP_NATIVE_POPOVER),
  /** 3.1 — run the Chrome Prompt API in an offscreen document, not the worker. */
  offscreenPromptApi: on(import.meta.env.WXT_EXP_OFFSCREEN_AI),
} as const;
