/**
 * Thin wrapper over Harper's `LocalLinter` (§11.1, §2.1).
 *
 * Responsibilities:
 *  - own one `LocalLinter` instance and its lifecycle,
 *  - translate our `Dialect` string ⇆ Harper's enum,
 *  - run `lint()` with plaintext options and project every `Lint` handle into a
 *    plain {@link HarperFinding} immediately, freeing the WASM handles,
 *  - expose personal-dictionary + ignore-hash hooks,
 *  - provide rule descriptions for "Explain more".
 *
 * We deliberately do NOT reimplement Harper's grammar in TypeScript (§35).
 * The binary is injected by the caller so the same wrapper runs in the
 * extension (WASM fetched from `runtime.getURL`) and in Node tests (the
 * packaged `harper.js/binary`).
 */

import { LocalLinter, Dialect, type Linter, type Lint } from 'harper.js';
import type {
  HarperFinding,
  HarperLintKind,
  HarperReplacement,
} from './harper-types';
import type { Dialect as WrDialect } from '@/types/settings';
import { createLogger } from '@/utils/logger';

const log = createLogger('engine:harper');

const DIALECT_MAP: Record<WrDialect, Dialect> = {
  'en-US': Dialect.American,
  'en-GB': Dialect.British,
  'en-CA': Dialect.Canadian,
  'en-AU': Dialect.Australian,
  'en-IN': Dialect.Indian,
};

export interface HarperLinterOptions {
  // Harper's `BinaryModule`; typed loosely to avoid importing a non-exported class.
  readonly binary: unknown;
  readonly dialect: WrDialect;
}

const SUGGESTION_KIND: Record<number, HarperReplacement['kind']> = {
  0: 'replace',
  1: 'remove',
  2: 'insert-after',
};

export class HarperLinter {
  #linter: Linter;
  #ready: Promise<void> | null = null;
  #disposed = false;
  #dialect: WrDialect;

  constructor(options: HarperLinterOptions) {
    this.#dialect = options.dialect;
    this.#linter = new LocalLinter({
      binary: options.binary as never,
      dialect: DIALECT_MAP[options.dialect],
    });
  }

  /** Idempotent; safe to call eagerly to warm the engine (§2.1). */
  async setup(): Promise<void> {
    if (this.#ready) return this.#ready;
    this.#ready = this.#linter.setup();
    return this.#ready;
  }

  get dialect(): WrDialect {
    return this.#dialect;
  }

  async setDialect(dialect: WrDialect): Promise<void> {
    if (dialect === this.#dialect) return;
    this.#dialect = dialect;
    await this.#linter.setDialect(DIALECT_MAP[dialect]);
  }

  /** Number of rules in the effective lint config — 0 means the engine failed to load (§2.1). */
  async ruleCount(): Promise<number> {
    const cfg = await this.#linter.getLintConfig();
    return Object.keys(cfg).length;
  }

  async ruleDescriptions(): Promise<Record<string, string>> {
    return this.#linter.getLintDescriptions();
  }

  /** Lint `text` as plaintext and return plain findings (handles freed). */
  async lint(text: string): Promise<HarperFinding[]> {
    if (this.#disposed) return [];
    await this.setup();

    let lints: Lint[];
    try {
      lints = await this.#linter.lint(text, {
        language: 'plaintext',
        dedup: true,
      });
    } catch (err) {
      log.error('harper lint threw', err);
      return [];
    }

    const findings: HarperFinding[] = [];
    for (const lint of lints) {
      try {
        findings.push(projectLint(lint));
      } catch (err) {
        log.warn('failed to project a lint', err);
      } finally {
        safeFree(lint);
      }
    }
    return findings;
  }

  /* ---- personal dictionary & ignore hooks -------------------------- */

  async importWords(words: readonly string[]): Promise<void> {
    if (words.length === 0) return;
    await this.#linter.importWords([...words]);
  }

  async clearWords(): Promise<void> {
    await this.#linter.clearWords();
  }

  async importIgnoredLints(json: string): Promise<void> {
    try {
      await this.#linter.importIgnoredLints(json);
    } catch (err) {
      log.warn('importIgnoredLints failed', err);
    }
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    try {
      await this.#linter.dispose();
    } catch {
      /* already gone */
    }
  }
}

/* -------------------------------------------------------------------------- */

function projectLint(lint: Lint): HarperFinding {
  const span = lint.span();
  const start = span.start;
  const end = span.end;
  safeFree(span);

  const kindRaw = lint.lint_kind();
  const kind: HarperLintKind = isHarperKind(kindRaw) ? kindRaw : 'Unknown';

  const replacements: HarperReplacement[] = [];
  for (const s of lint.suggestions()) {
    const kindNum: number = s.kind();
    replacements.push({
      kind: SUGGESTION_KIND[kindNum] ?? 'replace',
      text: s.get_replacement_text(),
    });
    safeFree(s);
  }

  return {
    kind,
    kindPretty: lint.lint_kind_pretty(),
    start,
    end,
    problemText: lint.get_problem_text(),
    message: lint.message(),
    replacements,
    ruleId: `harper:${kind}`,
  };
}

const HARPER_KINDS = new Set<string>([
  'Agreement',
  'BoundaryError',
  'Capitalization',
  'Eggcorn',
  'Enhancement',
  'Formatting',
  'Grammar',
  'Malapropism',
  'Miscellaneous',
  'Nonstandard',
  'Punctuation',
  'Readability',
  'Redundancy',
  'Regionalism',
  'Repetition',
  'Spelling',
  'Style',
  'Typo',
  'Usage',
  'WordChoice',
  'WordOrder',
]);

function isHarperKind(v: string): v is HarperLintKind {
  return HARPER_KINDS.has(v);
}

function safeFree(handle: { free?: () => void } | null | undefined): void {
  try {
    handle?.free?.();
  } catch {
    /* handle already released */
  }
}
