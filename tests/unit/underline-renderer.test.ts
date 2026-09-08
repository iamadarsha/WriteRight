import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  suggestionContaining,
  orderSuggestions,
} from '@/ui/underline/underline-renderer';
import { createUnderlineRenderer } from '@/ui/underline';
import { TextareaAdapter } from '@/adapters/textarea-adapter';
import { ContentEditableAdapter } from '@/adapters/contenteditable-adapter';
import { FallbackNoInlineRenderer } from '@/ui/underline/fallback-renderer';
import { UnsupportedAdapter } from '@/adapters/unsupported-adapter';
import { UNDERLINE_CSS } from '@/ui/underline/underline-styles';
import type { Suggestion } from '@/types/suggestion';

function sug(
  start: number,
  end: number,
  over: Partial<Suggestion> = {},
): Suggestion {
  return {
    id: `s${start}-${end}`,
    sessionId: 's',
    documentVersion: 1,
    source: 'spell',
    start,
    end,
    original: 'x',
    originalHash: 'h',
    message: 'm',
    suggestions: ['y'],
    severity: 'error',
    confidence: 0.9,
    canAutoApply: true,
    ...over,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

describe('suggestion hit-testing (§9.7)', () => {
  it('returns the tightest suggestion containing an offset', () => {
    const list = [sug(0, 20), sug(5, 8), sug(30, 35)];
    expect(suggestionContaining(list, 6)?.id).toBe('s5-8');
    expect(suggestionContaining(list, 15)?.id).toBe('s0-20');
    expect(suggestionContaining(list, 32)?.id).toBe('s30-35');
    expect(suggestionContaining(list, 100)).toBeNull();
  });

  it('includes the right edge (caret just after the word)', () => {
    expect(suggestionContaining([sug(2, 7)], 7)?.id).toBe('s2-7');
  });

  it('orders by position', () => {
    const out = orderSuggestions([sug(30, 33), sug(2, 5), sug(10, 12)]);
    expect(out.map((s) => s.start)).toEqual([2, 10, 30]);
  });
});

describe('createUnderlineRenderer strategy selection (§5.1, §18)', () => {
  it('textarea → mirror renderer that mounts a hidden element', () => {
    const ta = document.createElement('textarea');
    ta.value = 'I havve a pen';
    document.body.appendChild(ta);
    const layer = document.createElement('div');
    document.body.appendChild(layer);

    const r = createUnderlineRenderer(new TextareaAdapter(ta), layer);
    r.render([sug(2, 7, { severity: 'error' })]);
    const mirror = layer.querySelector('.wr-ta-mirror');
    expect(mirror).not.toBeNull();
    const mark = mirror!.querySelector('.wr-u');
    expect(mark?.textContent).toBe('havve');
    expect(mark?.className).toContain('wr-u-error');
    r.destroy();
    expect(layer.querySelector('.wr-ta-mirror')).toBeNull();
  });

  it('contenteditable → CSS Custom Highlight renderer when the API exists (§18.3)', () => {
    const reg = new Map<string, unknown>();
    class FakeHighlight {}
    vi.stubGlobal('Highlight', FakeHighlight);
    vi.stubGlobal('CSS', {
      highlights: {
        set: (n: string, h: unknown) => reg.set(n, h),
        delete: (n: string) => reg.delete(n),
      },
      escape: (s: string) => s,
    });
    try {
      const ce = document.createElement('div');
      ce.setAttribute('contenteditable', 'true');
      ce.textContent = 'one two three';
      document.body.appendChild(ce);
      const r = createUnderlineRenderer(
        new ContentEditableAdapter(ce),
        document.createElement('div'),
      );
      r.render([sug(0, 3, { severity: 'error' })]);
      expect(reg.has('wr-hl-error')).toBe(true);
      expect(document.querySelector('.wr-ce-mark')).toBeNull(); // not the <div> path
      r.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('contenteditable → range renderer draws one mark per client rect (fallback)', () => {
    const ce = document.createElement('div');
    ce.setAttribute('contenteditable', 'true');
    ce.textContent = 'one two three';
    document.body.appendChild(ce);
    const layer = document.createElement('div');
    document.body.appendChild(layer);

    // jsdom Range.getClientRects returns []; stub one rect so a mark is drawn.
    const proto = Range.prototype as unknown as {
      getClientRects: () => DOMRect[];
    };
    const orig = proto.getClientRects;
    proto.getClientRects = () =>
      [
        {
          left: 10,
          top: 5,
          right: 40,
          bottom: 20,
          width: 30,
          height: 15,
        } as DOMRect,
      ] as unknown as DOMRect[];

    try {
      const r = createUnderlineRenderer(new ContentEditableAdapter(ce), layer);
      r.render([sug(4, 7, { severity: 'warning' })]);
      const mark = layer.querySelector('.wr-ce-mark');
      expect(mark).not.toBeNull();
      expect((mark as HTMLElement).className).toContain('wr-u-warning');
      r.destroy();
    } finally {
      proto.getClientRects = orig;
    }
  });

  it('contenteditable → does not draw marks for text scrolled out of a clipping ancestor (§18.3 chatgpt.com repro)', () => {
    // ChatGPT's composer: a tall ProseMirror div inside a short `overflow:auto`
    // parent that scrolls it. Rects for lines scrolled out of that ~90px window
    // still report their laid-out position — marks must NOT be drawn there
    // (they scattered across the message history).
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    const ce = document.createElement('div');
    ce.setAttribute('contenteditable', 'true');
    ce.textContent = 'aaaa bbbb cccc';
    scroller.appendChild(ce);
    document.body.appendChild(scroller);
    const layer = document.createElement('div');
    document.body.appendChild(layer);

    vi.stubGlobal('innerWidth', 1200);
    vi.stubGlobal('innerHeight', 900);
    // Visible composer window: y 500..590.
    scroller.getBoundingClientRect = () =>
      ({
        left: 20,
        top: 500,
        right: 620,
        bottom: 590,
        width: 600,
        height: 90,
      }) as DOMRect;

    const proto = Range.prototype as unknown as {
      getClientRects: () => DOMRect[];
    };
    const orig = proto.getClientRects;
    let call = 0;
    proto.getClientRects = () => {
      call += 1;
      // 1st word: visible (baseline 560). 2nd: scrolled above (baseline 120).
      // 3rd: scrolled below (baseline 880).
      const bottoms = [560, 120, 880];
      const b = bottoms[call - 1] ?? 560;
      return [
        { left: 30, top: b - 18, right: 90, bottom: b, width: 60, height: 18 },
      ] as unknown as DOMRect[];
    };

    try {
      const r = createUnderlineRenderer(new ContentEditableAdapter(ce), layer);
      r.render([sug(0, 4), sug(5, 9), sug(10, 14)]);
      const marks = layer.querySelectorAll<HTMLElement>('.wr-ce-mark');
      expect(marks.length).toBe(1);
      expect(marks[0]!.style.top).toBe('559px'); // bottom - 1
      expect(marks[0]!.dataset['wrId']).toBe('s0-4');
    } finally {
      proto.getClientRects = orig;
      vi.unstubAllGlobals();
    }
  });

  it('contenteditable → clips a mark to the visible window width', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowX = 'auto';
    const ce = document.createElement('div');
    ce.setAttribute('contenteditable', 'true');
    ce.textContent = 'wide';
    scroller.appendChild(ce);
    document.body.appendChild(scroller);
    const layer = document.createElement('div');
    document.body.appendChild(layer);

    vi.stubGlobal('innerWidth', 1200);
    vi.stubGlobal('innerHeight', 900);
    scroller.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 100,
        right: 300,
        bottom: 200,
        width: 200,
        height: 100,
      }) as DOMRect;

    const proto = Range.prototype as unknown as {
      getClientRects: () => DOMRect[];
    };
    const orig = proto.getClientRects;
    // Word runs from x 50 to x 400 — only 100..300 is inside the window.
    proto.getClientRects = () =>
      [
        { left: 50, top: 150, right: 400, bottom: 170, width: 350, height: 20 },
      ] as unknown as DOMRect[];

    try {
      const r = createUnderlineRenderer(new ContentEditableAdapter(ce), layer);
      r.render([sug(0, 4)]);
      const mark = layer.querySelector<HTMLElement>('.wr-ce-mark')!;
      expect(mark.style.left).toBe('100px');
      expect(mark.style.width).toBe('200px');
    } finally {
      proto.getClientRects = orig;
      vi.unstubAllGlobals();
    }
  });

  it('unsupported adapter → fallback renderer (no DOM marks)', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const layer = document.createElement('div');
    const r = createUnderlineRenderer(new UnsupportedAdapter(div), layer);
    expect(r).toBeInstanceOf(FallbackNoInlineRenderer);
    r.render([sug(0, 3)]);
    expect(r.suggestionAtOffset(1)?.id).toBe('s0-3');
    expect(layer.children.length).toBe(0);
  });
});

describe('underline styles — the mirror span must never get a fill (§18.3 regression)', () => {
  // The `<input>`/`<textarea>` mirror wraps each flag in
  // `<span class="wr-u wr-u-SEVERITY">` around the *mirrored text*. A
  // `background-color` on that class paints a solid block the full height of
  // the line, over the real field — hiding everything the user types (a user
  // hit this on an Amazon search box). Only `.wr-ce-mark.wr-u-*` (the
  // zero-content contenteditable bar) may take a background.
  function rules(css: string): Array<{ selector: string; body: string }> {
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const out: Array<{ selector: string; body: string }> = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(noComments))) {
      const selector = m[1]!.trim();
      if (selector.startsWith('@')) continue;
      out.push({ selector, body: m[2]!.trim() });
    }
    return out;
  }

  it('no rule on a bare .wr-u-<severity> class sets a background', () => {
    for (const { selector, body } of rules(UNDERLINE_CSS)) {
      if (!/background(-color)?\s*:/.test(body)) continue;
      // Check each comma-separated part on its own — a `.wr-ce-mark.wr-u-error`
      // sharing a rule with a bare `.wr-u-error` does NOT protect the latter.
      for (const part of selector.split(',').map((s) => s.trim())) {
        const hitsMirrorClass = /(^|\s)\.wr-u-(error|warning|info)\b/.test(
          part,
        );
        if (hitsMirrorClass && !part.includes('.wr-ce-mark')) {
          expect.fail(
            `selector "${part}" fills the mirror span with a background (rule: "${selector}")`,
          );
        }
      }
    }
  });

  it('the contenteditable mark still gets its solid-colour line', () => {
    const ce = rules(UNDERLINE_CSS).filter((r) =>
      /\.wr-ce-mark\.wr-u-(error|warning|info)\b/.test(r.selector),
    );
    expect(ce.length).toBe(3);
    for (const r of ce) expect(r.body).toMatch(/background-color\s*:/);
  });
});

describe('mirror vertical alignment for a roomy <input> (§18.2 strike-through fix)', () => {
  it("sets the mirror's line-height to the input's content-box height", () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'magsafe chargr';
    document.body.appendChild(input);
    const layer = document.createElement('div');
    document.body.appendChild(layer);

    // A 60px-tall search box: 15px border, 14px+14px padding → 30px content.
    input.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 420, height: 60 }) as DOMRect;
    const realGCS = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) =>
      el === input
        ? ({
            borderTopWidth: '1px',
            borderBottomWidth: '1px',
            paddingTop: '14px',
            paddingBottom: '14px',
            lineHeight: '27px',
            boxSizing: 'border-box',
            // COPIED_STYLES reads many props; a Proxy returns '' for the rest.
          } as unknown as CSSStyleDeclaration)
        : realGCS(el as Element),
    );

    const r = createUnderlineRenderer(new TextareaAdapter(input), layer);
    r.render([sug(0, 7, { severity: 'error' })]);

    const mirror = layer.querySelector<HTMLElement>('.wr-ta-mirror')!;
    // content height = 60 - 1 - 1 - 14 - 14 = 30
    expect(mirror.style.lineHeight).toBe('30px');
    r.destroy();
  });
});
