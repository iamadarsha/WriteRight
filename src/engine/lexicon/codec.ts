/**
 * Isomorphic (Node build script + browser service worker) encode/decode for the
 * compact lexicon binary. No dependencies — `DataView` + `TextEncoder` only.
 *
 * Two artefacts:
 *   glosses.bin  — [u32 magic][u8 version] then N gzip payloads, back to back.
 *   lemmas.bin   — [u32 magic][u8 version][u32 blockCount][u32 totalEntries]
 *                  then, per block: [u32 offset][u32 length]
 *                  [u16 len][firstLemma][u16 len][lastLemma].
 *
 * A decompressed block payload:
 *   [u32 recordCount] then, per record (sorted by lemma):
 *     [u16 len][lemma]
 *     [u8 senseCount] then, per sense:
 *       [u8 posCode]
 *       [u16 len][definition]
 *       [u16 len][example]        (len 0 ⇒ no example)
 *       [u8 n] then n × ([u8 len][synonym])
 *       [u8 n] then n × ([u8 len][antonym])
 */

import {
  LEXICON_DATA_MAGIC,
  LEXICON_INDEX_MAGIC,
  LEXICON_FORMAT_VERSION,
  POS_CODES,
  POS_TO_CODE,
  type LexBlockRef,
  type LexPos,
} from './types';

/** A record as stored in a block (one head word). */
export interface RawRecord {
  readonly lemma: string;
  readonly senses: ReadonlyArray<{
    readonly pos: LexPos;
    readonly definition: string;
    readonly example: string;
    readonly synonyms: readonly string[];
    readonly antonyms: readonly string[];
  }>;
}

const te = new TextEncoder();
const td = new TextDecoder();

/* ---- writer ------------------------------------------------------------ */

export class ByteWriter {
  #buf: Uint8Array;
  #view: DataView;
  #len = 0;

  constructor(initial = 1024) {
    this.#buf = new Uint8Array(initial);
    this.#view = new DataView(this.#buf.buffer);
  }

  #ensure(extra: number): void {
    if (this.#len + extra <= this.#buf.length) return;
    let next = this.#buf.length * 2;
    while (next < this.#len + extra) next *= 2;
    const grown = new Uint8Array(next);
    grown.set(this.#buf.subarray(0, this.#len));
    this.#buf = grown;
    this.#view = new DataView(this.#buf.buffer);
  }

  u8(n: number): void {
    this.#ensure(1);
    this.#view.setUint8(this.#len, n & 0xff);
    this.#len += 1;
  }

  u16(n: number): void {
    this.#ensure(2);
    this.#view.setUint16(this.#len, n & 0xffff, true);
    this.#len += 2;
  }

  u32(n: number): void {
    this.#ensure(4);
    this.#view.setUint32(this.#len, n >>> 0, true);
    this.#len += 4;
  }

  bytes(b: Uint8Array): void {
    this.#ensure(b.length);
    this.#buf.set(b, this.#len);
    this.#len += b.length;
  }

  /** length-prefixed (u8) string — for short values (synonyms), clamped to 255 bytes. */
  str8(s: string): void {
    const b = te.encode(s);
    const n = Math.min(b.length, 255);
    this.u8(n);
    this.bytes(b.subarray(0, n));
  }

  /** length-prefixed (u16) string — for definitions/examples, clamped to 65535. */
  str16(s: string): void {
    const b = te.encode(s);
    const n = Math.min(b.length, 0xffff);
    this.u16(n);
    this.bytes(b.subarray(0, n));
  }

  finish(): Uint8Array {
    return this.#buf.slice(0, this.#len);
  }
}

/* ---- reader ---------------------------------------------------------- */

export class ByteReader {
  #view: DataView;
  #pos = 0;
  readonly #bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get eof(): boolean {
    return this.#pos >= this.#bytes.length;
  }

  u8(): number {
    const n = this.#view.getUint8(this.#pos);
    this.#pos += 1;
    return n;
  }

  u16(): number {
    const n = this.#view.getUint16(this.#pos, true);
    this.#pos += 2;
    return n;
  }

  u32(): number {
    const n = this.#view.getUint32(this.#pos, true);
    this.#pos += 4;
    return n;
  }

  str8(): string {
    const n = this.u8();
    const s = td.decode(this.#bytes.subarray(this.#pos, this.#pos + n));
    this.#pos += n;
    return s;
  }

  str16(): string {
    const n = this.u16();
    const s = td.decode(this.#bytes.subarray(this.#pos, this.#pos + n));
    this.#pos += n;
    return s;
  }
}

/* ---- block payload -------------------------------------------------- */

export function encodeBlock(records: readonly RawRecord[]): Uint8Array {
  const w = new ByteWriter(64 * 1024);
  w.u32(records.length);
  for (const rec of records) {
    w.str16(rec.lemma);
    w.u8(Math.min(rec.senses.length, 255));
    for (const s of rec.senses.slice(0, 255)) {
      w.u8(POS_TO_CODE[s.pos]);
      w.str16(s.definition);
      w.str16(s.example);
      const syn = s.synonyms.slice(0, 255);
      w.u8(syn.length);
      for (const x of syn) w.str8(x);
      const ant = s.antonyms.slice(0, 255);
      w.u8(ant.length);
      for (const x of ant) w.str8(x);
    }
  }
  return w.finish();
}

export function decodeBlock(payload: Uint8Array): RawRecord[] {
  const r = new ByteReader(payload);
  const count = r.u32();
  const out: RawRecord[] = [];
  for (let i = 0; i < count; i++) {
    const lemma = r.str16();
    const senseCount = r.u8();
    const senses: RawRecord['senses'][number][] = [];
    for (let j = 0; j < senseCount; j++) {
      const pos = POS_CODES[r.u8()] ?? 'noun';
      const definition = r.str16();
      const example = r.str16();
      const synN = r.u8();
      const synonyms: string[] = [];
      for (let k = 0; k < synN; k++) synonyms.push(r.str8());
      const antN = r.u8();
      const antonyms: string[] = [];
      for (let k = 0; k < antN; k++) antonyms.push(r.str8());
      senses.push({ pos, definition, example, synonyms, antonyms });
    }
    out.push({ lemma, senses });
  }
  return out;
}

/** Find a lemma in a decoded block (records are lemma-sorted). */
export function findRecord(
  records: readonly RawRecord[],
  lemma: string,
): RawRecord | null {
  let lo = 0;
  let hi = records.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cmp =
      records[mid]!.lemma < lemma ? -1 : records[mid]!.lemma > lemma ? 1 : 0;
    if (cmp === 0) return records[mid]!;
    if (cmp < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

/* ---- index ---------------------------------------------------------- */

export function encodeIndex(
  blocks: ReadonlyArray<LexBlockRef>,
  totalEntries: number,
): Uint8Array {
  const w = new ByteWriter(blocks.length * 64 + 16);
  w.u32(LEXICON_INDEX_MAGIC);
  w.u8(LEXICON_FORMAT_VERSION);
  w.u32(blocks.length);
  w.u32(totalEntries);
  for (const b of blocks) {
    w.u32(b.offset);
    w.u32(b.length);
    w.str16(b.firstLemma);
    w.str16(b.lastLemma);
  }
  return w.finish();
}

export interface LexiconIndex {
  readonly totalEntries: number;
  readonly blocks: readonly LexBlockRef[];
}

export function decodeIndex(bytes: Uint8Array): LexiconIndex {
  const r = new ByteReader(bytes);
  const magic = r.u32();
  if (magic !== LEXICON_INDEX_MAGIC) {
    throw new Error('lexicon index: bad magic');
  }
  const version = r.u8();
  if (version !== LEXICON_FORMAT_VERSION) {
    throw new Error(`lexicon index: unsupported version ${version}`);
  }
  const blockCount = r.u32();
  const totalEntries = r.u32();
  const blocks: LexBlockRef[] = [];
  for (let i = 0; i < blockCount; i++) {
    const offset = r.u32();
    const length = r.u32();
    const firstLemma = r.str16();
    const lastLemma = r.str16();
    blocks.push({ offset, length, firstLemma, lastLemma });
  }
  return { totalEntries, blocks };
}

/** The block that could contain `lemma`, or -1. Blocks are globally sorted. */
export function blockFor(
  blocks: readonly LexBlockRef[],
  lemma: string,
): number {
  let lo = 0;
  let hi = blocks.length - 1;
  let candidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (blocks[mid]!.firstLemma <= lemma) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (candidate === -1) return -1;
  return lemma <= blocks[candidate]!.lastLemma ? candidate : -1;
}

export const LEXICON_DATA_HEADER_BYTES = 5;

export function encodeDataHeader(): Uint8Array {
  const w = new ByteWriter(8);
  w.u32(LEXICON_DATA_MAGIC);
  w.u8(LEXICON_FORMAT_VERSION);
  return w.finish();
}

export function checkDataHeader(bytes: Uint8Array): void {
  const r = new ByteReader(bytes);
  if (r.u32() !== LEXICON_DATA_MAGIC)
    throw new Error('lexicon data: bad magic');
  if (r.u8() !== LEXICON_FORMAT_VERSION) {
    throw new Error('lexicon data: unsupported version');
  }
}
