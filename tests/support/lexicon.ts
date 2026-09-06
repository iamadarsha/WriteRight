/**
 * Builds a tiny real lexicon binary (index + data) in memory, using the same
 * codec the production build uses, so store tests exercise the actual format.
 */

import { gzipSync, gunzipSync } from 'node:zlib';
import {
  encodeBlock,
  encodeDataHeader,
  encodeIndex,
  type RawRecord,
} from '@/engine/lexicon/codec';
import type { LexBlockRef } from '@/engine/lexicon/types';
import {
  LexiconStore,
  type LexiconStoreOptions,
} from '@/engine/lexicon/lexicon-store';

export const MINI_RECORDS: RawRecord[] = [
  {
    lemma: 'apple',
    senses: [
      {
        pos: 'noun',
        definition: 'a round fruit with red or green skin and crisp flesh',
        example: 'she packed an apple for lunch',
        synonyms: [],
        antonyms: [],
      },
    ],
  },
  {
    lemma: 'be',
    senses: [
      {
        pos: 'verb',
        definition: 'have the quality of being; exist',
        example: '',
        synonyms: ['exist'],
        antonyms: [],
      },
    ],
  },
  {
    lemma: 'good',
    senses: [
      {
        pos: 'adjective',
        definition: 'having desirable or positive qualities',
        example: 'a good report card',
        synonyms: ['fine', 'superior'],
        antonyms: ['bad', 'evil'],
      },
    ],
  },
  {
    lemma: 'happy',
    senses: [
      {
        pos: 'adjective',
        definition: 'enjoying or showing or marked by joy or pleasure',
        example: 'a happy smile',
        synonyms: ['glad', 'felicitous'],
        antonyms: ['unhappy'],
      },
    ],
  },
  {
    lemma: 'run',
    senses: [
      {
        pos: 'verb',
        definition: 'move fast by using one’s feet',
        example: 'don’t run — you’ll fall',
        synonyms: ['sprint', 'race'],
        antonyms: ['walk'],
      },
      {
        pos: 'noun',
        definition:
          'a score in baseball made by a runner touching all four bases',
        example: '',
        synonyms: ['tally'],
        antonyms: [],
      },
    ],
  },
  {
    lemma: 'quick',
    senses: [
      {
        pos: 'adjective',
        definition: 'accomplished rapidly and without delay',
        example: 'a quick reply',
        synonyms: ['speedy', 'rapid'],
        antonyms: ['slow'],
      },
    ],
  },
  {
    lemma: 'carbon dioxide',
    senses: [
      {
        pos: 'noun',
        definition: 'a heavy odourless colourless gas exhaled in respiration',
        example: '',
        synonyms: ['co2'],
        antonyms: [],
      },
    ],
  },
];

/** Build the two artefacts as Uint8Arrays (one record per block to test paging). */
export function buildMiniLexicon(records = MINI_RECORDS): {
  index: Uint8Array;
  data: Uint8Array;
} {
  const sorted = [...records].sort((a, b) =>
    a.lemma < b.lemma ? -1 : a.lemma > b.lemma ? 1 : 0,
  );
  const blocks: LexBlockRef[] = [];
  const parts: Uint8Array[] = [encodeDataHeader()];
  let offset = 0;
  for (const rec of sorted) {
    const gz = gzipSync(encodeBlock([rec]));
    parts.push(gz);
    blocks.push({
      offset,
      length: gz.length,
      firstLemma: rec.lemma,
      lastLemma: rec.lemma,
    });
    offset += gz.length;
  }
  let total = 0;
  for (const p of parts) total += p.length;
  const data = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    data.set(p, at);
    at += p.length;
  }
  return { index: encodeIndex(blocks, sorted.length), data };
}

/** A LexiconStore wired to an in-memory mini lexicon and Node's zlib. */
export function miniStore(
  over: Partial<LexiconStoreOptions> = {},
): LexiconStore {
  const { index, data } = buildMiniLexicon();
  const toAB = (b: Uint8Array): ArrayBuffer =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const fetchImpl = (async (url: string) => ({
    ok: true,
    arrayBuffer: async () => toAB(url.includes('lemmas') ? index : data),
  })) as unknown as typeof fetch;
  return new LexiconStore({
    indexUrl: 'x/lemmas.bin',
    dataUrl: 'x/glosses.bin',
    fetchImpl,
    gunzip: async (b) => new Uint8Array(gunzipSync(b)),
    ...over,
  });
}
