import { describe, it, expect, beforeEach } from 'vitest';
import { applySuggestion } from '@/core/apply-suggestion';
import { TextareaAdapter } from '@/adapters/textarea-adapter';
import type { Suggestion } from '@/types/suggestion';
import { shortHash } from '@/utils/hash';

beforeEach(() => {
  document.body.innerHTML = '';
});

function setup(value: string): {
  adapter: TextareaAdapter;
  el: HTMLTextAreaElement;
} {
  const el = document.createElement('textarea');
  el.value = value;
  document.body.appendChild(el);
  return { adapter: new TextareaAdapter(el), el };
}

function sug(
  text: string,
  start: number,
  end: number,
  over: Partial<Suggestion> = {},
): Suggestion {
  const original = text.slice(start, end);
  return {
    id: 's1',
    sessionId: 'sess',
    documentVersion: 1,
    source: 'spell',
    start,
    end,
    original,
    originalHash: shortHash(original),
    message: 'x',
    suggestions: ['have'],
    severity: 'error',
    confidence: 0.9,
    canAutoApply: true,
    ...over,
  };
}

describe('applySuggestion safety gate (§10.4)', () => {
  it('applies a valid spelling fix and edits only the range', () => {
    const { adapter, el } = setup('I havve a pen');
    const s = sug('I havve a pen', 2, 7);
    const out = applySuggestion(adapter, 'sess', s, 0);
    expect(out).toEqual({ ok: true, replacement: 'have' });
    expect(el.value).toBe('I have a pen');
    adapter.destroy();
  });

  it('refuses when the session id does not match', () => {
    const { adapter } = setup('I havve a pen');
    const out = applySuggestion(
      adapter,
      'OTHER',
      sug('I havve a pen', 2, 7),
      0,
    );
    expect(out).toEqual({ ok: false, reason: 'wrong-session' });
    adapter.destroy();
  });

  it('refuses when the underlying text changed', () => {
    const { adapter, el } = setup('I havve a pen');
    el.value = 'I have a pen'; // fixed manually
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const out = applySuggestion(adapter, 'sess', sug('I havve a pen', 2, 7), 0);
    expect(out).toEqual({ ok: false, reason: 'text-changed' });
    adapter.destroy();
  });

  it('refuses when the hash no longer matches (tampered offsets)', () => {
    const { adapter } = setup('I havve a pen');
    const bad = { ...sug('I havve a pen', 2, 7), originalHash: 'deadbeef' };
    expect(applySuggestion(adapter, 'sess', bad, 0)).toEqual({
      ok: false,
      reason: 'text-changed',
    });
    adapter.destroy();
  });

  it('refuses out-of-bounds ranges', () => {
    const { adapter } = setup('short');
    const s = { ...sug('short', 0, 5), end: 999 };
    expect(applySuggestion(adapter, 'sess', s, 0)).toEqual({
      ok: false,
      reason: 'out-of-bounds',
    });
    adapter.destroy();
  });

  it('refuses during IME composition', () => {
    const { adapter, el } = setup('I havve a pen');
    el.dispatchEvent(new CompositionEvent('compositionstart'));
    expect(
      applySuggestion(adapter, 'sess', sug('I havve a pen', 2, 7), 0),
    ).toEqual({ ok: false, reason: 'composing' });
    adapter.destroy();
  });

  it('refuses when there is no replacement at that index', () => {
    const { adapter } = setup('I havve a pen');
    const s = sug('I havve a pen', 2, 7, { suggestions: ['have'] });
    expect(applySuggestion(adapter, 'sess', s, 5)).toEqual({
      ok: false,
      reason: 'no-replacement',
    });
    adapter.destroy();
  });

  it('collapses a repeated-space range to a single space', () => {
    const { adapter, el } = setup('the  cat');
    const s = sug('the  cat', 3, 5, { suggestions: [' '], source: 'style' });
    const out = applySuggestion(adapter, 'sess', s, 0);
    expect(out.ok).toBe(true);
    expect(el.value).toBe('the cat');
    adapter.destroy();
  });

  it('supports a pure removal (empty-string replacement)', () => {
    const { adapter, el } = setup('really very good');
    const s = sug('really very good', 0, 7, {
      suggestions: [''],
      source: 'style',
    });
    const out = applySuggestion(adapter, 'sess', s, 0);
    expect(out.ok).toBe(true);
    expect(el.value).toBe('very good');
    adapter.destroy();
  });
});
