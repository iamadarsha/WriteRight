import { describe, it, expect, vi, afterEach } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { LexiconStore } from '@/engine/lexicon/lexicon-store';
import { miniStore, buildMiniLexicon } from '../support/lexicon';

afterEach(() => vi.useRealTimers());

describe('LexiconStore (§11.3)', () => {
  it('defines an exact lemma with senses, example, synonyms and antonyms', async () => {
    const res = await miniStore().define('good');
    expect(res.unavailable).toBeUndefined();
    const e = res.entries[0]!;
    expect(e.word).toBe('good');
    expect(e.senses[0]!.pos).toBe('adjective');
    expect(e.senses[0]!.definition).toContain('desirable');
    expect(e.senses[0]!.synonyms).toContain('fine');
    expect(e.senses[0]!.antonyms).toContain('bad');
  });

  it('resolves an inflected query through Morphy and reports resolvedFrom', async () => {
    const res = await miniStore().define('running');
    const e = res.entries.find((x) => x.word === 'run')!;
    expect(e).toBeTruthy();
    expect(e.resolvedFrom).toBe('running');
    expect(e.senses.length).toBeGreaterThanOrEqual(1);
  });

  it('handles multi-word phrases', async () => {
    const res = await miniStore().define('carbon dioxide');
    expect(res.entries[0]!.word).toBe('carbon dioxide');
    expect(res.entries[0]!.senses[0]!.synonyms).toContain('co2');
  });

  it('returns no entries for an unknown word (never rejects)', async () => {
    const res = await miniStore().define('zxqwibble');
    expect(res.entries).toEqual([]);
    expect(res.unavailable).toBeUndefined();
  });

  it('synonyms() collects across senses and dedupes the head word', async () => {
    const res = await miniStore().synonyms('run');
    expect(res.synonyms).toEqual(expect.arrayContaining(['sprint', 'tally']));
    expect(res.synonyms).not.toContain('run');
    expect(res.antonyms).toContain('walk');
  });

  it('reports unavailable — never hangs — when the data cannot be fetched', async () => {
    const store = new LexiconStore({
      indexUrl: 'x/lemmas.bin',
      dataUrl: 'x/glosses.bin',
      fetchImpl: (async () => ({
        ok: false,
        status: 500,
      })) as unknown as typeof fetch,
      gunzip: async (b) => b,
    });
    const res = await store.define('good');
    expect(res).toEqual({ entries: [], unavailable: true });
  });

  it('does not retry a failed load on every call (30 s cooldown)', async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: false, status: 500 }) as unknown as Response,
    );
    const store = new LexiconStore({
      indexUrl: 'x/lemmas.bin',
      dataUrl: 'x/glosses.bin',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      gunzip: async (b) => b,
    });
    await store.define('good');
    await store.define('happy');
    await store.define('run');
    // 2 fetches for the single first attempt (index + data); no retries after.
    expect(fetchImpl.mock.calls.length).toBe(2);
  });

  it('survives a malformed data blob', async () => {
    const { index } = buildMiniLexicon();
    const toAB = (b: Uint8Array): ArrayBuffer =>
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    const junk = new Uint8Array([0x57, 0x52, 0x4c, 0x44, 1, 9, 9, 9, 9, 9]);
    const store = new LexiconStore({
      indexUrl: 'x/lemmas.bin',
      dataUrl: 'x/glosses.bin',
      fetchImpl: (async (url: string) => ({
        ok: true,
        arrayBuffer: async () => toAB(url.includes('lemmas') ? index : junk),
      })) as unknown as typeof fetch,
      gunzip: async () => {
        throw new Error('bad gzip');
      },
    });
    const res = await store.define('good');
    expect(res.entries).toEqual([]);
  });

  it('serves 200 concurrent lookups without a duplicate load', async () => {
    const fetchImpl = vi.fn(miniFetch());
    const store = new LexiconStore({
      indexUrl: 'x/lemmas.bin',
      dataUrl: 'x/glosses.bin',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      gunzip: gunzip(),
    });
    const words = ['good', 'happy', 'run', 'quick', 'apple', 'be'];
    const results = await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        store.define(words[i % words.length]!),
      ),
    );
    expect(results.every((r) => !r.unavailable)).toBe(true);
    expect(fetchImpl.mock.calls.length).toBe(2); // index + data, once
  });

  it('evicts everything after the idle timeout and reloads on the next lookup', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(miniFetch());
    const store = new LexiconStore({
      indexUrl: 'x/lemmas.bin',
      dataUrl: 'x/glosses.bin',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      gunzip: gunzip(),
    });
    await store.define('good');
    expect(store.ready).toBe(true);
    expect(fetchImpl.mock.calls.length).toBe(2);

    vi.advanceTimersByTime(6 * 60_000);
    expect(store.ready).toBe(false);

    await store.define('happy');
    expect(fetchImpl.mock.calls.length).toBe(4); // reloaded
  });
});

/* ---- helpers ---- */

function gunzip(): (b: Uint8Array) => Promise<Uint8Array> {
  return async (b) => new Uint8Array(gunzipSync(b));
}

function miniFetch(): typeof fetch {
  const { index, data } = buildMiniLexicon();
  const toAB = (b: Uint8Array): ArrayBuffer =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  return (async (url: string) => ({
    ok: true,
    arrayBuffer: async () => toAB(url.includes('lemmas') ? index : data),
  })) as unknown as typeof fetch;
}
