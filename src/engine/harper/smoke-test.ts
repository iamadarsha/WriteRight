/**
 * Mandatory engine startup smoke test (§2.1, §35).
 *
 * A silently-empty engine is a release blocker. This proves, against the exact
 * shipped `harper.js` artifact, that:
 *  1. the engine loads and its default lint config is populated,
 *  2. a known spelling error is detected,
 *  3. a known grammar error is detected,
 *  4. a correct sentence produces no findings,
 *  5. offsets come back as UTF-16 code units (surrogate-pair safe) — §10.3.
 *
 * `EngineService` runs this once after init; the result drives
 * `Diagnostics.engineReady` and a loud console error on failure.
 */

import type { HarperLinter } from './harper-linter';
import type { HarperSmokeResult } from './harper-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('engine:smoke');

const SPELLING_PROBE = 'I havve a pencil.';
const GRAMMAR_PROBE = 'He are my friend.';
const CLEAN_PROBE = 'The quick brown fox jumps over the lazy dog.';
// "havve" starts at UTF-16 index 5 (emoji is a surrogate pair); at Unicode
// scalar index 4. Harper must report 5.
const EMOJI_PROBE = 'I \u{1F9E0} havve thoughts.';
const EMOJI_EXPECTED_START = 5;

export async function runHarperSmokeTest(
  linter: HarperLinter,
): Promise<HarperSmokeResult> {
  const started = Date.now();
  const failures: string[] = [];

  await linter.setup();

  const ruleCount = await linter.ruleCount().catch(() => 0);
  if (ruleCount < 100) {
    failures.push(`default lint config is not populated (${ruleCount} rules)`);
  }

  const spelling = await linter.lint(SPELLING_PROBE);
  const detectedSpelling = spelling.some(
    (f) => f.kind === 'Spelling' && f.problemText.toLowerCase() === 'havve',
  );
  if (!detectedSpelling) failures.push('did not flag the spelling probe');

  const grammar = await linter.lint(GRAMMAR_PROBE);
  const detectedGrammar = grammar.some(
    (f) => f.kind === 'Agreement' || f.kind === 'Grammar',
  );
  if (!detectedGrammar) failures.push('did not flag the grammar probe');

  const clean = await linter.lint(CLEAN_PROBE);
  const cleanSentenceIsClean = clean.length === 0;
  if (!cleanSentenceIsClean) {
    failures.push(
      `clean sentence produced ${clean.length} finding(s): ${clean
        .map((f) => f.message)
        .join(' | ')}`,
    );
  }

  const emoji = await linter.lint(EMOJI_PROBE);
  const offsetsAreUtf16 = emoji.some(
    (f) => f.problemText === 'havve' && f.start === EMOJI_EXPECTED_START,
  );
  if (!offsetsAreUtf16) {
    failures.push(
      'offsets are not UTF-16 code units (surrogate-pair check failed)',
    );
  }

  const result: HarperSmokeResult = {
    ok: failures.length === 0,
    ruleCount,
    detectedSpelling,
    detectedGrammar,
    cleanSentenceIsClean,
    offsetsAreUtf16,
    durationMs: Date.now() - started,
    failures,
  };

  if (result.ok) {
    log.info(
      `engine smoke test passed (${ruleCount} rules, ${result.durationMs}ms)`,
    );
  } else {
    log.error('ENGINE SMOKE TEST FAILED', result.failures);
  }
  return result;
}
