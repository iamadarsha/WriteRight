/**
 * Build the compact offline lexicon from Open English WordNet 2025+ (§11.3).
 *
 *   input   english-wordnet-2025-plus.xml.gz   (CC-BY-4.0, ~13 MB, pinned by SHA-256)
 *   output  public/lexicon/lemmas.bin          (block index, ~KBs)
 *           public/lexicon/glosses.bin         (per-block gzip, ~MBs)
 *           public/lexicon/VERSION.json        (provenance + hashes + counts)
 *
 * Only the subset WriteRight uses is kept: lemma, part of speech, definition,
 * one example, synset co-members (synonyms), direct antonyms. Raw WordNet is
 * never shipped.
 *
 * Resilient: the raw download is cached under node_modules/.cache; if the host
 * is unreachable and a matching cache or a matching existing build is present,
 * it is reused. Only a cold machine with no network hard-fails.
 *
 * Runs from `prepare` and `prebuild*`, and standalone via `npm run sync:lexicon`.
 */

import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { SaxesParser } from 'saxes';
import {
  ByteWriter,
  encodeBlock,
  encodeDataHeader,
  encodeIndex,
  type RawRecord,
} from '../src/engine/lexicon/codec';
import type { LexBlockRef, LexPos } from '../src/engine/lexicon/types';

const ROOT = process.cwd();
const SOURCE_URL =
  'https://en-word.net/downloads/english-wordnet-2025-plus.xml.gz';
const SOURCE_SHA256 =
  '31f4af16c54b532fd5484d4cc33aee588a31bb5b70683ae8197842fde5b586bc';
const SOURCE_VERSION = 'Open English WordNet 2025+';
const SOURCE_LICENSE = 'CC-BY-4.0';

const CACHE_DIR = resolve(ROOT, 'node_modules/.cache/writeright');
const CACHE_FILE = resolve(CACHE_DIR, 'oewn-2025-plus.xml.gz');
const OUT_DIR = resolve(ROOT, 'public/lexicon');
const INDEX_OUT = resolve(OUT_DIR, 'lemmas.bin');
const DATA_OUT = resolve(OUT_DIR, 'glosses.bin');
const VERSION_OUT = resolve(OUT_DIR, 'VERSION.json');

/** Entries per block. ~256 keeps a decompressed block ~40–80 KB. */
const BLOCK_ENTRIES = 256;
/** Cap senses kept per lemma — WordNet's order is roughly by frequency. */
const MAX_SENSES = 12;

const POS_MAP: Record<string, LexPos> = {
  n: 'noun',
  v: 'verb',
  a: 'adjective',
  s: 'adjective',
  r: 'adverb',
};

function sha256(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function getSource(): Promise<Buffer> {
  mkdirSync(CACHE_DIR, { recursive: true });
  if (existsSync(CACHE_FILE)) {
    const cached = readFileSync(CACHE_FILE);
    if (sha256(cached) === SOURCE_SHA256) {
      console.log('• using cached WordNet download');
      return cached;
    }
    console.log('• cached download hash mismatch — re-fetching');
  }
  console.log(`• downloading ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha256(buf);
  if (got !== SOURCE_SHA256) {
    throw new Error(
      `download hash mismatch\n  expected ${SOURCE_SHA256}\n  got      ${got}\n` +
        `If Open English WordNet published a new build, update SOURCE_SHA256 after review.`,
    );
  }
  await new Promise<void>((ok, fail) => {
    const s = createWriteStream(CACHE_FILE);
    s.on('finish', ok).on('error', fail).end(buf);
  });
  return buf;
}

interface SynsetData {
  pos: LexPos | undefined;
  definition: string;
  example: string;
  members: string[];
}

interface SenseData {
  entryId: string;
  synsetId: string;
  antonyms: string[];
}

function parse(xml: string): {
  entryLemma: Map<string, string>;
  entryForm: Map<string, string>;
  senses: Map<string, SenseData>;
  entrySenses: Map<string, string[]>;
  synsets: Map<string, SynsetData>;
} {
  const entryLemma = new Map<string, string>();
  const entryForm = new Map<string, string>();
  const senses = new Map<string, SenseData>();
  const entrySenses = new Map<string, string[]>();
  const synsets = new Map<string, SynsetData>();

  const parser = new SaxesParser();
  let curEntry: string | null = null;
  let curSense: SenseData | null = null;
  let curSynset: SynsetData | null = null;
  let text: 'definition' | 'example' | null = null;

  parser.on('opentag', (node) => {
    const a = node.attributes as Record<string, string>;
    switch (node.name) {
      case 'LexicalEntry':
        curEntry = a['id'] ?? null;
        break;
      case 'Lemma':
        if (curEntry && a['writtenForm']) {
          entryLemma.set(curEntry, a['writtenForm'].toLowerCase());
          entryForm.set(curEntry, a['writtenForm']);
        }
        break;
      case 'Sense':
        if (curEntry && a['id'] && a['synset']) {
          curSense = { entryId: curEntry, synsetId: a['synset'], antonyms: [] };
          senses.set(a['id'], curSense);
          const list = entrySenses.get(curEntry) ?? [];
          list.push(a['id']);
          entrySenses.set(curEntry, list);
        }
        break;
      case 'SenseRelation':
        if (curSense && a['relType'] === 'antonym' && a['target']) {
          curSense.antonyms.push(a['target']);
        }
        break;
      case 'Synset':
        if (a['id']) {
          curSynset = {
            pos: a['partOfSpeech'] ? POS_MAP[a['partOfSpeech']] : undefined,
            definition: '',
            example: '',
            members: a['members'] ? a['members'].split(/\s+/) : [],
          };
          synsets.set(a['id'], curSynset);
        }
        break;
      case 'Definition':
        text = 'definition';
        break;
      case 'Example':
        text = curSynset && !curSynset.example ? 'example' : null;
        break;
      default:
        break;
    }
  });

  parser.on('text', (t) => {
    if (!text || !curSynset) return;
    if (text === 'definition') curSynset.definition += t;
    else curSynset.example += t;
  });

  parser.on('closetag', (node) => {
    switch (node.name) {
      case 'LexicalEntry':
        curEntry = null;
        break;
      case 'Sense':
        curSense = null;
        break;
      case 'Synset':
        curSynset = null;
        break;
      case 'Definition':
      case 'Example':
        text = null;
        break;
      default:
        break;
    }
  });

  // Feed in chunks so saxes streams instead of choking on a 100 MB string.
  const CHUNK = 1 << 20;
  for (let i = 0; i < xml.length; i += CHUNK) {
    parser.write(xml.slice(i, i + CHUNK));
  }
  parser.close();

  return { entryLemma, entryForm, senses, entrySenses, synsets };
}

/** Rank a form so the natural lower-case spelling outranks Title-Case / ALL-CAPS. */
function formRank(form: string, lemma: string): number {
  if (form === lemma) return 0;
  if (form.toLowerCase() === lemma) {
    if (form === form.toUpperCase() && form !== form.toLowerCase()) return 3; // ALL CAPS
    if (form[0] === form[0]?.toUpperCase()) return 2; // Title Case
    return 1;
  }
  return 4;
}

function build(): RawRecord[] {
  const raw = readFileSync(CACHE_FILE);
  console.log('• decompressing…');
  const xml = gunzipSync(raw).toString('utf8');
  console.log('• parsing LMF…');
  const { entryLemma, entryForm, senses, entrySenses, synsets } = parse(xml);
  console.log(
    `  entries=${entryLemma.size} senses=${senses.size} synsets=${synsets.size}`,
  );

  interface Ranked {
    sense: RawRecord['senses'][number];
    rank: number;
    order: number;
  }
  const byLemma = new Map<string, Ranked[]>();

  for (const [entryId, senseIds] of entrySenses) {
    const lemma = entryLemma.get(entryId);
    if (!lemma) continue;
    const rank = formRank(entryForm.get(entryId) ?? lemma, lemma);
    let order = 0;
    for (const senseId of senseIds) {
      const sense = senses.get(senseId);
      if (!sense) continue;
      const syn = synsets.get(sense.synsetId);
      if (!syn || !syn.pos || !syn.definition.trim()) continue;

      const synonyms = dedupe(
        syn.members
          .map((m) => entryLemma.get(m))
          .filter((w): w is string => !!w && w !== lemma),
      );
      const antonyms = dedupe(
        sense.antonyms
          .map((t) => {
            const target = senses.get(t);
            return target ? entryLemma.get(target.entryId) : undefined;
          })
          .filter((w): w is string => !!w && w !== lemma),
      );

      const def = syn.definition.trim().replace(/\s+/g, ' ');
      const list = byLemma.get(lemma) ?? [];
      if (!list.some((r) => r.sense.definition === def)) {
        list.push({
          rank,
          order: order++,
          sense: {
            pos: syn.pos,
            definition: def,
            example: syn.example.trim().replace(/\s+/g, ' '),
            synonyms,
            antonyms,
          },
        });
      }
      byLemma.set(lemma, list);
    }
  }

  const records: RawRecord[] = [];
  for (const [lemma, ranked] of byLemma) {
    if (!lemma || lemma.length > 80) continue;
    ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);
    records.push({
      lemma,
      senses: ranked.slice(0, MAX_SENSES).map((r) => r.sense),
    });
  }
  records.sort((a, b) => (a.lemma < b.lemma ? -1 : a.lemma > b.lemma ? 1 : 0));
  return records;
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

function emit(records: RawRecord[]): void {
  mkdirSync(OUT_DIR, { recursive: true });

  const blocks: LexBlockRef[] = [];
  const data = new ByteWriter(8 * 1024 * 1024);
  data.bytes(encodeDataHeader());
  let offset = 0;

  for (let i = 0; i < records.length; i += BLOCK_ENTRIES) {
    const slice = records.slice(i, i + BLOCK_ENTRIES);
    const gz = gzipSync(encodeBlock(slice), { level: 9 });
    data.bytes(gz);
    blocks.push({
      offset,
      length: gz.length,
      firstLemma: slice[0]!.lemma,
      lastLemma: slice[slice.length - 1]!.lemma,
    });
    offset += gz.length;
  }

  const indexBytes = encodeIndex(blocks, records.length);
  const dataBytes = data.finish();

  writeFileSync(INDEX_OUT, indexBytes);
  writeFileSync(DATA_OUT, dataBytes);

  const totalSenses = records.reduce((n, r) => n + r.senses.length, 0);
  writeFileSync(
    VERSION_OUT,
    JSON.stringify(
      {
        note: 'Generated by scripts/build-lexicon.ts — do not edit.',
        source: SOURCE_VERSION,
        sourceUrl: SOURCE_URL,
        sourceSha256: SOURCE_SHA256,
        license: SOURCE_LICENSE,
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        lemmas: records.length,
        senses: totalSenses,
        blocks: blocks.length,
        indexBytes: indexBytes.length,
        dataBytes: dataBytes.length,
        indexSha256: sha256(indexBytes),
        dataSha256: sha256(dataBytes),
      },
      null,
      2,
    ) + '\n',
  );

  console.log(
    `✓ lexicon built: ${records.length} lemmas / ${totalSenses} senses / ` +
      `${blocks.length} blocks  (${(dataBytes.length / 1024 / 1024).toFixed(
        1,
      )} MB data + ${(indexBytes.length / 1024).toFixed(0)} KB index)`,
  );
}

async function main(): Promise<void> {
  // Fast path: a matching build already exists and we are not forced.
  if (
    process.argv.includes('--check') &&
    existsSync(VERSION_OUT) &&
    existsSync(INDEX_OUT) &&
    existsSync(DATA_OUT)
  ) {
    const v = JSON.parse(readFileSync(VERSION_OUT, 'utf8')) as {
      indexSha256: string;
      dataSha256: string;
    };
    if (
      sha256(readFileSync(INDEX_OUT)) === v.indexSha256 &&
      sha256(readFileSync(DATA_OUT)) === v.dataSha256
    ) {
      console.log('✓ lexicon up to date');
      return;
    }
    console.log('• lexicon artefacts changed — rebuilding');
  }

  try {
    await getSource();
  } catch (err) {
    if (
      existsSync(INDEX_OUT) &&
      existsSync(DATA_OUT) &&
      existsSync(VERSION_OUT)
    ) {
      console.warn(
        `⚠ could not fetch WordNet (${(err as Error).message}) — keeping existing build`,
      );
      return;
    }
    throw err;
  }
  emit(build());
}

void main().catch((err: unknown) => {
  console.error('✗ build-lexicon failed:', err);
  process.exit(1);
});
