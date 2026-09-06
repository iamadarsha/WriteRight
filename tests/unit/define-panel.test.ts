import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DefinePanel } from '@/ui/define/define-panel';
import type { DefineResult } from '@/engine/lexicon/types';

const RECT = { left: 10, top: 10, bottom: 24, right: 60 } as DOMRect;

const RESULT: DefineResult = {
  entries: [
    {
      word: 'happy',
      resolvedFrom: undefined,
      senses: [
        {
          pos: 'adjective',
          definition: 'marked by joy or pleasure',
          example: 'a happy smile',
          synonyms: ['glad', 'joyful'],
          antonyms: ['unhappy'],
        },
      ],
    },
  ],
};

let layer: HTMLElement;
let panel: DefinePanel;
let calls: { close: number; lookup: string[]; replace: string[] };

beforeEach(() => {
  document.body.innerHTML = '';
  layer = document.createElement('div');
  document.body.append(layer);
  panel = new DefinePanel(layer);
  calls = { close: 0, lookup: [], replace: [] };
});

afterEach(() => panel.destroy());

function open(
  canReplace = false,
  state = { kind: 'loading' as const, word: 'happy' },
) {
  panel.open(
    RECT,
    state,
    {
      onClose: () => (calls.close += 1),
      onLookup: (w) => calls.lookup.push(w),
      onReplace: canReplace ? (w) => calls.replace.push(w) : undefined,
    },
    canReplace,
  );
}

describe('DefinePanel (§11.3)', () => {
  it('shows skeletons while loading, then a compact single sense — no example or chips yet', () => {
    open();
    expect(layer.querySelectorAll('.wr-def-skel').length).toBeGreaterThan(0);

    panel.render({ kind: 'result', result: RESULT });
    expect(layer.querySelector('.wr-def-word')?.textContent).toBe('happy');
    expect(layer.querySelector('.wr-def-pos')?.textContent).toBe('adjective');
    expect(layer.textContent).toContain('marked by joy');
    // Collapsed (§8): a small box, not a dialog that dumps everything —
    // the example and synonym/antonym chips wait for the expand toggle.
    expect(layer.textContent).not.toContain('a happy smile');
    expect(layer.querySelectorAll('.wr-def-chip').length).toBe(0);
    expect(layer.querySelector('.wr-def-expand')).not.toBeNull();
  });

  it('the expand toggle reveals the example and chips, and only then', () => {
    open();
    panel.render({ kind: 'result', result: RESULT });
    const toggle = layer.querySelector<HTMLButtonElement>('.wr-def-expand')!;
    toggle.click();

    expect(layer.textContent).toContain('a happy smile');
    expect(layer.querySelector('.wr-def-panel')?.classList).toContain(
      'expanded',
    );
    const chips = [...layer.querySelectorAll('.wr-def-chip')].map(
      (c) => c.textContent,
    );
    expect(chips).toEqual(
      expect.arrayContaining(['glad', 'joyful', 'unhappy']),
    );
    expect(layer.querySelector('.wr-def-expand')).toBeNull();
  });

  it('a new open() resets back to collapsed, even after a previous expand', () => {
    open();
    panel.render({ kind: 'result', result: RESULT });
    layer.querySelector<HTMLButtonElement>('.wr-def-expand')!.click();
    expect(layer.textContent).toContain('a happy smile');

    open(); // a fresh lookup
    panel.render({ kind: 'result', result: RESULT });
    expect(layer.textContent).not.toContain('a happy smile');
  });

  it('a synonym chip replaces when editable, else re-looks-up', () => {
    open(true);
    panel.render({ kind: 'result', result: RESULT });
    layer.querySelector<HTMLButtonElement>('.wr-def-expand')!.click();
    const glad = [
      ...layer.querySelectorAll<HTMLButtonElement>('.wr-def-chip'),
    ].find((c) => c.textContent === 'glad')!;
    glad.click();
    expect(calls.replace).toEqual(['glad']);

    // an antonym never replaces — it looks up
    const opp = [
      ...layer.querySelectorAll<HTMLButtonElement>('.wr-def-chip.ant'),
    ][0]!;
    opp.click();
    expect(calls.lookup).toEqual(['unhappy']);
  });

  it('non-editable: a synonym chip looks it up', () => {
    open(false);
    panel.render({ kind: 'result', result: RESULT });
    layer.querySelector<HTMLButtonElement>('.wr-def-expand')!.click();
    const glad = [
      ...layer.querySelectorAll<HTMLButtonElement>('.wr-def-chip'),
    ].find((c) => c.textContent === 'glad')!;
    glad.click();
    expect(calls.lookup).toEqual(['glad']);
    expect(calls.replace).toEqual([]);
  });

  it('renders honest notes for error / unavailable / empty', () => {
    open();
    panel.render({ kind: 'error' });
    expect(layer.textContent).toMatch(/try again/i);

    panel.render({
      kind: 'result',
      result: { entries: [], unavailable: true },
    });
    expect(layer.textContent).toMatch(/isn.t ready/i);

    panel.render({ kind: 'result', result: { entries: [] } });
    expect(layer.textContent).toMatch(/no definition/i);
  });

  it('Escape closes it', () => {
    open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(calls.close).toBe(1);
  });

  it('an outside pointer-down closes it', async () => {
    open();
    await new Promise((r) => setTimeout(r, 5));
    document.body.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true }),
    );
    expect(calls.close).toBe(1);
  });

  it('close() and destroy() remove it from the DOM', () => {
    open();
    panel.close();
    expect(layer.querySelector('.wr-def-panel')?.hasAttribute('hidden')).toBe(
      true,
    );
    panel.destroy();
    expect(layer.querySelector('.wr-def-panel')).toBeNull();
  });
});

// jsdom's getBoundingClientRect returns zeros; positioning must not throw.
it('positioning is resilient to zero rects', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 0, 0),
  );
  const l = document.createElement('div');
  document.body.append(l);
  const p = new DefinePanel(l);
  expect(() =>
    p.open(
      new DOMRect(0, 0, 0, 0),
      { kind: 'loading', word: 'x' },
      { onClose: () => {}, onLookup: () => {} },
      false,
    ),
  ).not.toThrow();
  p.destroy();
  vi.restoreAllMocks();
});
