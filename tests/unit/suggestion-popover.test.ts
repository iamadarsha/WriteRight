import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SuggestionPopoverElement } from '@/ui/popover/suggestion-popover';
import type { OpenPopoverArgs } from '@/ui/popover/suggestion-popover';
import type { Suggestion } from '@/types/suggestion';

function suggestion(over: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 's1',
    sessionId: 's',
    documentVersion: 1,
    source: 'spell',
    start: 2,
    end: 7,
    original: 'havve',
    originalHash: 'h',
    message: 'Did you mean to spell this differently?',
    suggestions: ['have', 'halve'],
    severity: 'error',
    confidence: 0.9,
    ruleId: 'harper:Spelling',
    canAutoApply: true,
    ...over,
  };
}

let layer: HTMLElement;
let pop: SuggestionPopoverElement;
let cbs: Pick<
  OpenPopoverArgs,
  | 'onApply'
  | 'onIgnoreOnce'
  | 'onIgnoreRule'
  | 'onAddToDictionary'
  | 'onDisableField'
  | 'onExplainMore'
  | 'onClose'
>;

function open(over: Partial<OpenPopoverArgs> = {}): void {
  cbs = {
    onApply: vi.fn<(i: number) => void>(),
    onIgnoreOnce: vi.fn<() => void>(),
    onIgnoreRule: vi.fn<() => void>(),
    onAddToDictionary: vi.fn<() => void>(),
    onDisableField: vi.fn<() => void>(),
    onExplainMore: vi
      .fn<() => Promise<string>>()
      .mockResolvedValue('Because reasons.'),
    onClose: vi.fn<() => void>(),
  };
  pop.open({
    suggestion: suggestion(),
    anchorRect: { left: 10, top: 10, bottom: 24, right: 60 } as DOMRect,
    canAddToDictionary: true,
    ...cbs,
    ...over,
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  layer = document.createElement('div');
  document.body.appendChild(layer);
  pop = new SuggestionPopoverElement(layer);
});

describe('SuggestionPopoverElement (§9.7, §2.7)', () => {
  it('renders category, message, and replacement buttons (best first)', () => {
    open();
    const el = layer.querySelector('.wr-pop')!;
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.textContent).toContain('Spelling');
    const repls = el.querySelectorAll('.wr-pop-repl');
    expect(
      [...repls].map((b) => b.querySelector('span:last-child')?.textContent),
    ).toEqual(['have', 'halve']);
  });

  it('clicking the first replacement calls onApply(0)', () => {
    open();
    layer.querySelector<HTMLButtonElement>('.wr-pop-repl')!.click();
    expect(cbs.onApply).toHaveBeenCalledWith(0);
  });

  it('offers Add to dictionary only when allowed', () => {
    open({ canAddToDictionary: false });
    expect(layer.textContent).not.toContain('Add to dictionary');
    pop.close();
    open({ canAddToDictionary: true });
    expect(layer.textContent).toContain('Add to dictionary');
  });

  it('Explain more shows a what / why panel (§3.7)', async () => {
    open();
    const btn = [
      ...layer.querySelectorAll<HTMLButtonElement>('.wr-pop-action'),
    ].find((b) => b.textContent?.trim() === 'Explain more')!;
    btn.click();
    await vi.waitFor(() => {
      const panel = layer.querySelector('.wr-pop-explain');
      expect(panel).not.toBeNull();
      expect(panel?.textContent).toContain('Because reasons.');
      expect(panel?.textContent).toContain('What');
    });
  });

  it('Escape closes it', () => {
    open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cbs.onClose).toHaveBeenCalled();
  });

  it('a clarity card auto-generates the rephrase on open and applies it (§12.3)', async () => {
    const onRephrase = vi.fn().mockResolvedValue({
      ok: true,
      text: 'A short, clear sentence.',
      deterministic: false,
    });
    const onApplyRephrase = vi.fn<(t: string) => void>();
    open({
      suggestion: suggestion({
        source: 'readability',
        severity: 'info',
        suggestions: [],
        original: 'This whole long sentence is the flagged span.',
        message: 'This sentence is long.',
      }),
      autoRephrase: true,
      onRephrase,
      onApplyRephrase,
    });

    expect(onRephrase).toHaveBeenCalledTimes(1); // fired on open, no click
    await vi.waitFor(() => {
      const box = layer.querySelector('.wr-pop-rephrase');
      expect(box?.textContent).toContain('A short, clear sentence.');
    });

    [
      ...layer.querySelectorAll<HTMLButtonElement>(
        '.wr-pop-rephrase .wr-pop-repl',
      ),
    ]
      .find((b) => b.textContent === 'Use this sentence')!
      .click();
    expect(onApplyRephrase).toHaveBeenCalledWith('A short, clear sentence.');
  });

  it('without autoRephrase, the "Rephrase sentence" button generates on demand', async () => {
    const onRephrase = vi.fn().mockResolvedValue({
      ok: false,
      message: 'A full rephrase needs local AI.',
    });
    open({
      suggestion: suggestion({ source: 'readability', suggestions: [] }),
      onRephrase,
      onApplyRephrase: vi.fn(),
    });
    expect(onRephrase).not.toHaveBeenCalled();

    [...layer.querySelectorAll<HTMLButtonElement>('.wr-pop-action')]
      .find((b) => b.textContent?.trim() === 'Rephrase sentence')!
      .click();
    await vi.waitFor(() =>
      expect(layer.querySelector('.wr-pop-rephrase')?.textContent).toContain(
        'needs local AI',
      ),
    );
  });

  it('"Turn off for this field" fires the field-disable callback (§4.1 #23)', () => {
    open();
    const btn = [
      ...layer.querySelectorAll<HTMLButtonElement>('.wr-pop-action'),
    ].find((b) => b.textContent?.trim() === 'Turn off for this field')!;
    btn.click();
    expect(cbs.onDisableField).toHaveBeenCalled();
  });

  it('an outside pointerdown closes it', async () => {
    open();
    await new Promise((r) => setTimeout(r, 5));
    document.body.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true }),
    );
    expect(cbs.onClose).toHaveBeenCalled();
  });

  it('close() and destroy() remove it from the DOM', () => {
    open();
    pop.close();
    expect(layer.querySelector('.wr-pop')?.hasAttribute('hidden')).toBe(true);
    pop.destroy();
    expect(layer.querySelector('.wr-pop')).toBeNull();
  });
});
