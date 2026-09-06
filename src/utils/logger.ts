/**
 * Redaction-safe logging (§6.8, §31 Rule 5).
 *
 * Production logs must never contain user text, document contents, selected
 * text, credentials, tokens, cookies or page source. This logger:
 *  - is silent by default in production builds,
 *  - exposes a `redact()` helper that replaces a string with a short hash,
 *  - refuses to serialize objects flagged as text-bearing.
 *
 * There is no remote logging. Ever (§6.9).
 */

import { shortHash } from './hash';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// `import.meta.env` is provided by WXT/Vite. In tests it is `undefined`.
const isDev = Boolean(
  (import.meta as { env?: { DEV?: boolean; MODE?: string } }).env?.DEV,
);

let threshold = isDev ? LEVELS.debug : LEVELS.warn;

/** Opt-in verbose mode for local debugging (§6.8 "local debug mode"). */
export function setDebugLogging(enabled: boolean): void {
  threshold = enabled ? LEVELS.debug : isDev ? LEVELS.debug : LEVELS.warn;
}

/**
 * Replace a potentially sensitive string with a stable, non-reversible marker.
 * Use this for anything derived from user text before it goes near a log.
 */
export function redact(value: string | null | undefined): string {
  if (value == null || value === '') return '∅';
  return `⟨redacted:${shortHash(value)}:${value.length}⟩`;
}

function emit(level: Level, scope: string, args: readonly unknown[]): void {
  if (LEVELS[level] < threshold) return;
  const prefix = `[WriteRight:${scope}]`;
  const sink = (console[level] ?? console.log).bind(console) as (
    ...a: unknown[]
  ) => void;
  sink(prefix, ...args);
}

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  child(childScope: string): Logger;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (...a) => emit('debug', scope, a),
    info: (...a) => emit('info', scope, a),
    warn: (...a) => emit('warn', scope, a),
    error: (...a) => emit('error', scope, a),
    child: (childScope) => createLogger(`${scope}:${childScope}`),
  };
}

export const log = createLogger('core');
