import { describe, it, expect } from 'vitest';
import {
  encodeBlock,
  decodeBlock,
  findRecord,
  encodeIndex,
  decodeIndex,
  blockFor,
  encodeDataHeader,
  checkDataHeader,
  type RawRecord,
} from '@/engine/lexicon/codec';
import type { LexBlockRef } from '@/engine/lexicon/types';

const recs: RawRecord[] = [
  {
    lemma: 'alpha',
    senses: [
      {
        pos: 'noun',
        definition: 'the first letter',
        example: 'alpha and omega',
        synonyms: ['a'],
        antonyms: ['omega'],
      },
    ],
  },
  {
    lemma: 'béta',
    senses: [
      {
        pos: 'adjective',
        definition: 'a test build with an accented lemma — 你好',
        example: '',
        synonyms: [],
        antonyms: [],
      },
      {
        pos: 'noun',
        definition: 'second sense',
        example: 'x',
        synonyms: ['second'],
        antonyms: [],
      },
    ],
  },
];

describe('lexicon codec (§11.3)', () => {
  it('round-trips a block, preserving order, senses, unicode and relations', () => {
    const decoded = decodeBlock(encodeBlock(recs));
    expect(decoded).toEqual(recs);
    expect(decoded[1]!.senses[0]!.definition).toContain('你好');
  });

  it('findRecord binary-searches a lemma-sorted block', () => {
    const decoded = decodeBlock(encodeBlock(recs));
    expect(findRecord(decoded, 'alpha')?.lemma).toBe('alpha');
    expect(findRecord(decoded, 'béta')?.senses).toHaveLength(2);
    expect(findRecord(decoded, 'gamma')).toBeNull();
  });

  it('round-trips the index', () => {
    const blocks: LexBlockRef[] = [
      { offset: 0, length: 12, firstLemma: 'a', lastLemma: 'm' },
      { offset: 12, length: 34, firstLemma: 'n', lastLemma: 'z' },
    ];
    const idx = decodeIndex(encodeIndex(blocks, 999));
    expect(idx.totalEntries).toBe(999);
    expect(idx.blocks).toEqual(blocks);
  });

  it('blockFor locates the candidate block, or -1 in a gap / out of range', () => {
    const blocks: LexBlockRef[] = [
      { offset: 0, length: 1, firstLemma: 'ant', lastLemma: 'cat' },
      { offset: 1, length: 1, firstLemma: 'dog', lastLemma: 'fox' },
    ];
    expect(blockFor(blocks, 'bee')).toBe(0);
    expect(blockFor(blocks, 'elk')).toBe(1);
    expect(blockFor(blocks, 'cow')).toBe(-1); // gap between blocks
    expect(blockFor(blocks, 'zebra')).toBe(-1); // past the end
    expect(blockFor(blocks, 'aardvark')).toBe(-1); // before the start
  });

  it('rejects a data blob with the wrong magic or version', () => {
    expect(() => checkDataHeader(encodeDataHeader())).not.toThrow();
    expect(() => checkDataHeader(new Uint8Array([1, 2, 3, 4, 5]))).toThrow();
  });

  it('clamps over-long strings instead of throwing', () => {
    const big: RawRecord = {
      lemma: 'x'.repeat(200),
      senses: [
        {
          pos: 'noun',
          definition: 'y'.repeat(70000),
          example: '',
          synonyms: ['z'.repeat(300)],
          antonyms: [],
        },
      ],
    };
    const decoded = decodeBlock(encodeBlock([big]));
    expect(decoded[0]!.senses[0]!.definition.length).toBeLessThanOrEqual(65535);
    expect(decoded[0]!.senses[0]!.synonyms[0]!.length).toBeLessThanOrEqual(255);
  });
});
