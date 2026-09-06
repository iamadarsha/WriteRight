/**
 * Background-side offline vocabulary store (§11.3, design D5/D6).
 *
 * Loads the compact lexicon binary lazily — nothing happens until the first
 * `define()` / `synonyms()` call. After that the small block index stays
 * resident and the compressed data blob is kept with an LRU of decoded blocks;
 * everything is dropped after {@link IDLE_EVICT_MS} of no lookups so a user who
 * never touches "define" pays zero steady-state memory.
 *
 * Never hangs: `#ensureLoaded()` is memoised, fails fast, and is retried at most
 * once per {@link RETRY_COOLDOWN_MS}; on any failure lookups resolve to
 * `{ unavailable: true }` rather than pending forever.
 */

import { createLogger } from '@/utils/logger';
import { morphCandidates } from './morphy';
import {
  blockFor,
  checkDataHeader,
  decodeBlock,
  decodeIndex,
  findRecord,
  LEXICON_DATA_HEADER_BYTES,
  type LexiconIndex,
  type RawRecord,
} from './codec';
import type { DefineResult, LexEntry, LexSense, SynonymResult } from './types';

const log = createLogger('lexicon');

const IDLE_EVICT_MS = 5 * 60_000;
const RETRY_COOLDOWN_MS = 30_000;
const MAX_DECODED_BLOCKS = 16;
const LOAD_TIMEOUT_MS = 15_000;
const MAX_QUERY_CHARS = 64;
const MAX_QUERY_WORDS = 6;

export type Gunzip = (input: Uint8Array) => Promise<Uint8Array>;

export interface LexiconStoreOptions {
  /** `browser.runtime.getURL('lexicon/lemmas.bin')`. */
  readonly indexUrl: string;
  /** `browser.runtime.getURL('lexicon/glosses.bin')`. */
  readonly dataUrl: string;
  /** Injected so the build script/tests use Node zlib and the SW uses DecompressionStream. */
  readonly gunzip?: Gunzip;
  /** Injected for tests. */
  readonly fetchImpl?: typeof fetch;
}

interface Loaded {
  readonly index: LexiconIndex;
  /** The whole compressed `glosses.bin` (header + gzip blocks). */
  readonly data: Uint8Array;
}

export class LexiconStore {
  readonly #indexUrl: string;
  readonly #dataUrl: string;
  readonly #gunzip: Gunzip;
  readonly #fetch: typeof fetch;
  #loaded: Loaded | null = null;
  #loading: Promise<Loaded | null> | null = null;
  #lastFailureAt = 0;
  #idleTimer: ReturnType<typeof setTimeout> | null = null;
  readonly #blockCache = new Map<number, RawRecord[]>();

  constructor(opts: LexiconStoreOptions) {
    this.#indexUrl = opts.indexUrl;
    this.#dataUrl = opts.dataUrl;
    this.#gunzip = opts.gunzip ?? nativeGunzip;
    this.#fetch = opts.fetchImpl ?? fetch;
  }

  /** True once the data is resident (tests / diagnostics). */
  get ready(): boolean {
    return this.#loaded !== null;
  }

  async define(query: string): Promise<DefineResult> {
    const loaded = await this.#ensureLoaded();
    if (!loaded) return { entries: [], unavailable: true };
    this.#touch();

    const entries: LexEntry[] = [];
    for (const term of this.#queryForms(query)) {
      const entry = await this.#lookupExact(loaded, term.form, term.from);
      if (entry) entries.push(entry);
      if (entries.length >= 3) break;
    }
    return { entries };
  }

  async synonyms(word: string): Promise<SynonymResult> {
    const loaded = await this.#ensureLoaded();
    if (!loaded) {
      return { word, synonyms: [], antonyms: [], unavailable: true };
    }
    this.#touch();

    const synonyms = new Set<string>();
    const antonyms = new Set<string>();
    for (const term of this.#queryForms(word)) {
      const rec = await this.#recordFor(loaded, term.form);
      if (!rec) continue;
      for (const sense of rec.senses) {
        for (const s of sense.synonyms) if (s !== term.form) synonyms.add(s);
        for (const a of sense.antonyms) antonyms.add(a);
      }
      if (synonyms.size > 0 || antonyms.size > 0) break;
    }
    return {
      word,
      synonyms: [...synonyms].slice(0, 12),
      antonyms: [...antonyms].slice(0, 8),
    };
  }

  /** Drop everything now (tests, or an explicit low-memory signal). */
  evict(): void {
    this.#loaded = null;
    this.#blockCache.clear();
    if (this.#idleTimer) {
      clearTimeout(this.#idleTimer);
      this.#idleTimer = null;
    }
    log.debug('lexicon evicted');
  }

  /* ---- loading ---------------------------------------------------- */

  #ensureLoaded(): Promise<Loaded | null> {
    if (this.#loaded) return Promise.resolve(this.#loaded);
    if (this.#loading) return this.#loading;
    if (Date.now() - this.#lastFailureAt < RETRY_COOLDOWN_MS) {
      return Promise.resolve(null);
    }
    this.#loading = this.#load()
      .then((loaded) => {
        this.#loaded = loaded;
        this.#loading = null;
        this.#touch();
        log.debug('lexicon loaded', { entries: loaded.index.totalEntries });
        return loaded;
      })
      .catch((err: unknown) => {
        this.#loading = null;
        this.#lastFailureAt = Date.now();
        log.warn('lexicon load failed — define is unavailable', err);
        return null;
      });
    return this.#loading;
  }

  async #load(): Promise<Loaded> {
    const [indexBytes, dataBytes] = await Promise.all([
      fetchBytes(this.#fetch, this.#indexUrl, LOAD_TIMEOUT_MS),
      fetchBytes(this.#fetch, this.#dataUrl, LOAD_TIMEOUT_MS),
    ]);
    checkDataHeader(dataBytes);
    const index = decodeIndex(indexBytes);
    return { index, data: dataBytes };
  }

  /* ---- lookup --------------------------------------------------- */

  #queryForms(query: string): Array<{ form: string; from?: string }> {
    const cleaned = query.toLowerCase().trim().replace(/\s+/g, ' ');
    if (!cleaned || cleaned.length > MAX_QUERY_CHARS) return [];
    const words = cleaned.split(' ');
    if (words.length > MAX_QUERY_WORDS) return [];

    const forms: Array<{ form: string; from?: string }> = [];
    const push = (form: string, from?: string): void => {
      if (form && !forms.some((f) => f.form === form))
        forms.push({ form, from });
    };

    if (words.length > 1) {
      push(cleaned);
      push(words.join('_'));
    }
    const head = words.length === 1 ? cleaned : (words[words.length - 1] ?? '');
    for (const cand of morphCandidates(head)) {
      push(cand, cand === head ? undefined : head);
    }
    return forms;
  }

  async #lookupExact(
    loaded: Loaded,
    form: string,
    from?: string,
  ): Promise<LexEntry | null> {
    const rec = await this.#recordFor(loaded, form);
    if (!rec) return null;
    const senses: LexSense[] = rec.senses.map((s) => ({
      pos: s.pos,
      definition: s.definition,
      example: s.example || undefined,
      synonyms: s.synonyms.filter((x) => x !== rec.lemma),
      antonyms: s.antonyms,
    }));
    return {
      word: rec.lemma,
      resolvedFrom: from && from !== rec.lemma ? from : undefined,
      senses,
    };
  }

  async #recordFor(loaded: Loaded, lemma: string): Promise<RawRecord | null> {
    const blockIdx = blockFor(loaded.index.blocks, lemma);
    if (blockIdx < 0) return null;
    const block = await this.#decodedBlock(loaded, blockIdx);
    return block ? findRecord(block, lemma) : null;
  }

  async #decodedBlock(
    loaded: Loaded,
    blockIdx: number,
  ): Promise<RawRecord[] | null> {
    const cached = this.#blockCache.get(blockIdx);
    if (cached) {
      this.#blockCache.delete(blockIdx);
      this.#blockCache.set(blockIdx, cached);
      return cached;
    }
    const ref = loaded.index.blocks[blockIdx];
    if (!ref) return null;
    let records: RawRecord[];
    try {
      const gz = loaded.data.subarray(
        LEXICON_DATA_HEADER_BYTES + ref.offset,
        LEXICON_DATA_HEADER_BYTES + ref.offset + ref.length,
      );
      records = decodeBlock(await this.#gunzip(gz));
    } catch (err) {
      log.warn('lexicon block decode failed', err);
      return null;
    }
    this.#blockCache.set(blockIdx, records);
    if (this.#blockCache.size > MAX_DECODED_BLOCKS) {
      const oldest = this.#blockCache.keys().next().value;
      if (oldest !== undefined) this.#blockCache.delete(oldest);
    }
    return records;
  }

  /* ---- idle eviction ------------------------------------------- */

  #touch(): void {
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => this.evict(), IDLE_EVICT_MS);
    (this.#idleTimer as { unref?: () => void }).unref?.();
  }
}

/* ---- helpers ---------------------------------------------------- */

async function fetchBytes(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Uint8Array> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/** Browser gunzip via `DecompressionStream` (available in MV3 service workers). */
async function nativeGunzip(input: Uint8Array): Promise<Uint8Array> {
  const DS = (
    globalThis as { DecompressionStream?: typeof DecompressionStream }
  ).DecompressionStream;
  if (!DS) throw new Error('DecompressionStream unavailable');
  const part = new Uint8Array(input); // widen to a plain ArrayBuffer-backed view
  const stream = new Blob([part.buffer]).stream().pipeThrough(new DS('gzip'));
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
