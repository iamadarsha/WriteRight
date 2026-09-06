/**
 * Browser capability detection (§5.2, §25.1).
 *
 * The WriteRight architecture is shared across Chromium, Firefox and Safari;
 * only the edges differ. Feature code must branch on *capabilities*, never on
 * `browser === 'x'` (§31 Rule 15 / CONTRIBUTING). This module is the one place
 * those differences are named, and it is pure feature-detection — no UA
 * sniffing.
 *
 * It never asserts that a feature works, only that its API surface is present;
 * the universal in-page experience (content script + Shadow DOM sidebar +
 * background engine) works on every target with none of the optional APIs.
 */

export interface BrowserCapabilities {
  /** `chrome.sidePanel` (Chromium) — a native side panel host. */
  readonly nativeSidePanel: boolean;
  /** `browser.sidebarAction` (Firefox) — a native sidebar host. */
  readonly nativeSidebarAction: boolean;
  /** `browser.commands` — keyboard command registration (§5.2). */
  readonly keyboardCommands: boolean;
  /** `storage.session` — MV3 ephemeral area (falls back to in-memory). */
  readonly sessionStorage: boolean;
  /** `browser.permissions.request` — runtime optional-permission prompts. */
  readonly runtimePermissions: boolean;
  /** The on-device Prompt API (`LanguageModel` / `ai.languageModel`), §4.2. */
  readonly promptApi: boolean;
  /** `browser.action` (MV3) vs `browser.browserAction` (older). */
  readonly action: boolean;
}

type MaybeGlobal = Record<string, unknown> | undefined;

function has(obj: MaybeGlobal, key: string): boolean {
  return !!obj && typeof obj === 'object' && key in obj && obj[key] != null;
}

/**
 * Detect against a supplied `browser`/`chrome` namespace and global scope.
 * Defaults to the ambient ones; tests pass fakes.
 */
export function detectBrowserCapabilities(opts?: {
  browserNs?: MaybeGlobal;
  globalScope?: MaybeGlobal;
}): BrowserCapabilities {
  const ambient: Record<string, unknown> = globalThis;
  const g: MaybeGlobal = opts?.globalScope ?? ambient;
  const b: MaybeGlobal =
    opts?.browserNs ??
    (g?.['browser'] as MaybeGlobal) ??
    (g?.['chrome'] as MaybeGlobal);

  const storageNs = b?.['storage'] as MaybeGlobal;
  const permissionsNs = b?.['permissions'] as MaybeGlobal;

  return {
    nativeSidePanel: has(b, 'sidePanel'),
    nativeSidebarAction: has(b, 'sidebarAction'),
    keyboardCommands: has(b, 'commands'),
    sessionStorage: has(storageNs, 'session'),
    runtimePermissions:
      !!permissionsNs && typeof permissionsNs['request'] === 'function',
    promptApi:
      has(g, 'LanguageModel') || has(g?.['ai'] as MaybeGlobal, 'languageModel'),
    action: has(b, 'action') || has(b, 'browserAction'),
  };
}

/** Memoised ambient detection for feature code. */
let cached: BrowserCapabilities | null = null;
export function browserCapabilities(): BrowserCapabilities {
  return (cached ??= detectBrowserCapabilities());
}

/** Test hook — clears the memoised result. */
export function __resetBrowserCapabilities(): void {
  cached = null;
}

/* -------------------------------------------------------------------------- */
/* Documented support matrix (§5.2). Mirrored in docs/BROWSER_SUPPORT.md.     */
/* `*` = conditional / runtime-detected. Kept as data so a test can assert it */
/* matches the doc and nothing silently regresses.                            */
/* -------------------------------------------------------------------------- */

export type SupportLevel = 'A' | 'B' | 'C' | 'D' | 'yes' | 'no' | 'conditional';

export interface CapabilityRow {
  readonly feature: string;
  readonly chrome: SupportLevel;
  readonly edge: SupportLevel;
  readonly firefox: SupportLevel;
  readonly safari: SupportLevel;
  readonly note?: string;
}

export const CAPABILITY_MATRIX: readonly CapabilityRow[] = [
  {
    feature: 'Inline textarea / input',
    chrome: 'A',
    edge: 'A',
    firefox: 'A',
    safari: 'A',
  },
  {
    feature: 'Ordinary contenteditable',
    chrome: 'A',
    edge: 'A',
    firefox: 'A',
    safari: 'conditional',
    note: 'Safari: selection APIs in some shadow/nested cases are weaker; degrades to Tier C, never silent edits.',
  },
  {
    feature: 'Local grammar/spelling engine (Harper WASM)',
    chrome: 'yes',
    edge: 'yes',
    firefox: 'yes',
    safari: 'yes',
    note: 'Runs in the background/service worker on every target; fully offline.',
  },
  {
    feature: 'Readability / tone / score',
    chrome: 'yes',
    edge: 'yes',
    firefox: 'yes',
    safari: 'yes',
  },
  {
    feature: 'Universal in-page sidebar (Shadow DOM)',
    chrome: 'yes',
    edge: 'yes',
    firefox: 'yes',
    safari: 'yes',
    note: 'The product surface. No native-sidebar API dependency (§15.1).',
  },
  {
    feature: 'Native side panel host',
    chrome: 'conditional',
    edge: 'conditional',
    firefox: 'no',
    safari: 'no',
    note: 'chrome.sidePanel where present; the in-page sidebar is the fallback.',
  },
  {
    feature: 'Keyboard commands',
    chrome: 'yes',
    edge: 'yes',
    firefox: 'yes',
    safari: 'conditional',
    note: 'Safari support for browser.commands varies; the Alt+W in-page hotkey always works.',
  },
  {
    feature: 'Chrome on-device AI (Prompt API)',
    chrome: 'conditional',
    edge: 'conditional',
    firefox: 'no',
    safari: 'no',
    note: 'Runtime + hardware gated. Never a dependency.',
  },
  {
    feature: 'Local Ollama / LM Studio AI',
    chrome: 'yes',
    edge: 'yes',
    firefox: 'yes',
    safari: 'conditional',
    note: 'Loopback only; the user runs the server. Safari extension network policy may restrict loopback.',
  },
];
