import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BackgroundController } from '@/core/background-controller';
import { sendToBackground } from '@/messaging';
import type { LexiconBackend } from '@/core/lexicon-backend';
import { LexiconService } from '@/core/lexicon-service';
import { miniStore } from '../support/lexicon';

/**
 * DEFINE / LOOKUP_SYNONYMS through the real message router, plus the honest
 * "unavailable" path when there is no lexicon backend at all.
 */

class StubLexicon implements LexiconBackend {
  readonly #store = miniStore();
  start = async (): Promise<void> => {};
  define = (text: string) => this.#store.define(text);
  synonyms = (word: string) => this.#store.synonyms(word);
}

let bg: BackgroundController;

afterEach(() => bg?.stop());

describe('BackgroundController vocabulary handlers (§11.3, §26)', () => {
  it('DEFINE returns senses for a real lookup', async () => {
    bg = new BackgroundController({ lexicon: new StubLexicon() });
    await bg.start();
    const res = await sendToBackground({ type: 'DEFINE', text: 'happy' });
    expect(res.ok && res.data.entries[0]?.word).toBe('happy');
    expect(res.ok && res.data.entries[0]?.senses[0]?.synonyms).toContain(
      'glad',
    );
  });

  it('DEFINE resolves an inflected query', async () => {
    bg = new BackgroundController({ lexicon: new StubLexicon() });
    await bg.start();
    const res = await sendToBackground({ type: 'DEFINE', text: 'running' });
    expect(res.ok && res.data.entries.some((e) => e.word === 'run')).toBe(true);
  });

  it('LOOKUP_SYNONYMS returns synonyms + antonyms', async () => {
    bg = new BackgroundController({ lexicon: new StubLexicon() });
    await bg.start();
    const res = await sendToBackground({
      type: 'LOOKUP_SYNONYMS',
      word: 'good',
    });
    expect(res.ok && res.data.synonyms).toContain('fine');
    expect(res.ok && res.data.antonyms).toContain('bad');
  });

  it('is honestly unavailable when no lexicon backend is wired', async () => {
    bg = new BackgroundController({});
    await bg.start();
    const def = await sendToBackground({ type: 'DEFINE', text: 'happy' });
    expect(def.ok && def.data).toEqual({ entries: [], unavailable: true });
    const syn = await sendToBackground({
      type: 'LOOKUP_SYNONYMS',
      word: 'happy',
    });
    expect(syn.ok && syn.data.unavailable).toBe(true);
  });

  it('LexiconService swallows a broken store and reports unavailable', async () => {
    const svc = new LexiconService();
    // No `start()` → no store → every call is a safe no-op.
    expect(await svc.define('x')).toEqual({ entries: [], unavailable: true });
    expect((await svc.synonyms('x')).unavailable).toBe(true);
  });
});

// A malformed DEFINE payload is rejected at the boundary, not passed through.
describe('vocabulary message validation', () => {
  beforeEach(async () => {
    bg = new BackgroundController({ lexicon: new StubLexicon() });
    await bg.start();
  });

  it('rejects an over-long DEFINE text', async () => {
    const res = await sendToBackground({
      type: 'DEFINE',
      text: 'x'.repeat(200),
    } as never);
    expect(res.ok).toBe(false);
  });
});
