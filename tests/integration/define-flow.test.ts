import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DefineController } from '@/core/define-controller';
import { BackgroundController } from '@/core/background-controller';
import { mountShadowHost, type ShadowHost } from '@/ui/shadow-host';
import type { LexiconBackend } from '@/core/lexicon-backend';
import { miniStore } from '../support/lexicon';

class StubLexicon implements LexiconBackend {
  readonly #store = miniStore();
  start = async (): Promise<void> => {};
  define = (t: string) => this.#store.define(t);
  synonyms = (w: string) => this.#store.synonyms(w);
}

function stubSelection(text: string, anchor: Node): void {
  vi.spyOn(document, 'getSelection').mockReturnValue({
    isCollapsed: text === '',
    rangeCount: text === '' ? 0 : 1,
    anchorNode: anchor,
    toString: () => text,
    getRangeAt: () => ({
      getClientRects: () => [
        {
          left: 5,
          top: 5,
          right: 40,
          bottom: 20,
          width: 35,
          height: 15,
        } as DOMRect,
      ],
      getBoundingClientRect: () =>
        ({
          left: 5,
          top: 5,
          right: 40,
          bottom: 20,
          width: 35,
          height: 15,
        }) as DOMRect,
      deleteContents: () => {},
      insertNode: () => {},
    }),
    collapseToEnd: () => {},
  } as unknown as Selection);
}

let host: ShadowHost;
let bg: BackgroundController;
let ctl: DefineController;

beforeEach(async () => {
  document.body.innerHTML = '';
  host = mountShadowHost(document);
  bg = new BackgroundController({ lexicon: new StubLexicon() });
  await bg.start();
});

afterEach(() => {
  ctl?.stop();
  bg.stop();
  host.destroy();
  vi.restoreAllMocks();
});

const uiText = (): string => host.uiLayer.textContent ?? '';

describe('select-to-define flow (§11.3)', () => {
  it('selection → pill → panel → real definition', async () => {
    const p = document.createElement('p');
    p.textContent = 'a moment of serendipity';
    document.body.append(p);
    ctl = new DefineController({ host, isEnabled: () => true });
    ctl.start();

    stubSelection('happy', p.firstChild!);
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((r) => setTimeout(r, 260));

    const pill = host.uiLayer.querySelector<HTMLButtonElement>('.wr-def-pill');
    expect(pill).not.toBeNull();
    expect(pill!.hidden).toBe(false);

    pill!.click();
    await vi.waitFor(() => expect(uiText()).toContain('marked by joy'));
    expect(host.uiLayer.querySelector('.wr-def-word')?.textContent).toBe(
      'happy',
    );
  });

  it('Alt+D path skips the pill and opens the panel', async () => {
    const p = document.createElement('p');
    p.textContent = 'text';
    document.body.append(p);
    ctl = new DefineController({ host, isEnabled: () => true });
    ctl.start();
    stubSelection('good', p.firstChild!);

    ctl.triggerFromShortcut();
    await vi.waitFor(() => expect(uiText()).toContain('desirable or positive'));
  });

  it('does nothing when disabled', async () => {
    const p = document.createElement('p');
    p.textContent = 'text';
    document.body.append(p);
    ctl = new DefineController({ host, isEnabled: () => false });
    ctl.start();
    stubSelection('good', p.firstChild!);
    document.dispatchEvent(new Event('selectionchange'));
    await new Promise((r) => setTimeout(r, 260));
    const pill = host.uiLayer.querySelector<HTMLButtonElement>('.wr-def-pill');
    expect(pill?.hidden ?? true).toBe(true);
  });

  it('replaces the selected word in a textarea with a chosen synonym', async () => {
    const ta = document.createElement('textarea');
    ta.value = 'the good news';
    document.body.append(ta);
    ta.setSelectionRange(4, 8);
    ctl = new DefineController({ host, isEnabled: () => true });
    ctl.start();
    stubSelection('good', ta);

    ctl.triggerFromShortcut();
    await vi.waitFor(() =>
      expect(host.uiLayer.querySelector('.wr-def-expand')).not.toBeNull(),
    );
    host.uiLayer.querySelector<HTMLButtonElement>('.wr-def-expand')!.click();
    const fine = [
      ...host.uiLayer.querySelectorAll<HTMLButtonElement>('.wr-def-chip'),
    ].find((c) => c.textContent === 'fine')!;
    fine.click();
    expect(ta.value).toBe('the fine news');
  });
});
