import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestHarperLinter } from '../support/harper';
import { runHarperSmokeTest } from '@/engine/harper/smoke-test';
import type { HarperLinter } from '@/engine/harper/harper-linter';

// Real WASM — slow to load once, then fast. Shared across the file.
let linter: HarperLinter;

beforeAll(async () => {
  linter = createTestHarperLinter('en-US');
  await linter.setup();
}, 60_000);

afterAll(async () => {
  await linter.dispose();
});

describe('Harper integration (§2.1, §11.1)', () => {
  it('passes the startup smoke test', async () => {
    const result = await runHarperSmokeTest(linter);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.ruleCount).toBeGreaterThan(100);
    expect(result.detectedSpelling).toBe(true);
    expect(result.detectedGrammar).toBe(true);
    expect(result.cleanSentenceIsClean).toBe(true);
    expect(result.offsetsAreUtf16).toBe(true);
  });

  it('reports spelling findings with UTF-16 offsets and replacements', async () => {
    const findings = await linter.lint('I havve a pencil.');
    const spell = findings.find((f) => f.problemText === 'havve');
    expect(spell?.kind).toBe('Spelling');
    expect('I havve a pencil.'.slice(spell!.start, spell!.end)).toBe('havve');
    expect(spell?.replacements.map((r) => r.text)).toContain('have');
  });

  it('offsets stay UTF-16 across emoji / surrogate pairs (§10.3)', async () => {
    const text = 'I \u{1F9E0} havve thoughts.';
    const findings = await linter.lint(text);
    const spell = findings.find((f) => f.problemText === 'havve');
    expect(spell).toBeDefined();
    expect(text.slice(spell!.start, spell!.end)).toBe('havve');
  });

  it('a correct sentence produces no findings', async () => {
    expect(await linter.lint('This sentence is perfectly fine.')).toEqual([]);
  });

  it('respects the personal dictionary (importWords silences a "misspelling")', async () => {
    const brandy = 'Zorptech';
    const before = await linter.lint(`We use ${brandy} internally.`);
    expect(before.some((f) => f.problemText === brandy)).toBe(true);

    await linter.importWords([brandy]);
    const after = await linter.lint(`We use ${brandy} internally.`);
    expect(after.some((f) => f.problemText === brandy)).toBe(false);

    await linter.clearWords();
  });

  it('switches dialect (colour vs color)', async () => {
    await linter.setDialect('en-GB');
    const gb = await linter.lint('The colour of the sky.');
    expect(gb.some((f) => f.problemText === 'colour')).toBe(false);

    await linter.setDialect('en-US');
    const us = await linter.lint('The colour of the sky.');
    expect(us.some((f) => f.problemText.toLowerCase() === 'colour')).toBe(true);
  });
});
