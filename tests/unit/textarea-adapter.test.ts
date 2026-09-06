import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextareaAdapter } from '@/adapters/textarea-adapter';
import { InputAdapter } from '@/adapters/input-adapter';

beforeEach(() => {
  document.body.innerHTML = '';
});

function textarea(value = ''): HTMLTextAreaElement {
  const t = document.createElement('textarea');
  t.value = value;
  document.body.appendChild(t);
  return t;
}

describe('TextareaAdapter (§5.1 Tier A)', () => {
  it('reports Tier A capabilities and reads text', () => {
    const a = new TextareaAdapter(textarea('Hello world'));
    expect(a.getCapabilityTier()).toBe('A');
    expect(a.getText()).toBe('Hello world');
    const caps = a.getCapabilities();
    expect(caps).toMatchObject({ replace: true, inlineUnderlines: true });
    a.destroy();
  });

  it('maps selection to UTF-16 offsets', () => {
    const el = textarea('one two three');
    el.setSelectionRange(4, 7);
    const a = new TextareaAdapter(el);
    expect(a.getSelection()).toEqual({
      start: 4,
      end: 7,
      direction: 'forward',
    });
    a.destroy();
  });

  it('bumps the document version on input and notifies subscribers', () => {
    const el = textarea('a');
    const a = new TextareaAdapter(el);
    const listener = vi.fn();
    a.subscribe(listener);
    const v0 = a.getDocumentVersion();
    el.value = 'ab';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(a.getDocumentVersion()).toBe(v0 + 1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'input' }),
    );
    a.destroy();
  });

  it('replaceRange edits only the target range and fires input', () => {
    const el = textarea('I has a pen');
    const a = new TextareaAdapter(el);
    const inputSpy = vi.fn();
    el.addEventListener('input', inputSpy);
    const ok = a.replaceRange({ start: 2, end: 5 }, 'have');
    expect(ok).toBe(true);
    expect(el.value).toBe('I have a pen');
    expect(inputSpy).toHaveBeenCalled();
    a.destroy();
  });

  it('refuses replaceRange during IME composition (§5.3)', () => {
    const el = textarea('abc');
    const a = new TextareaAdapter(el);
    el.dispatchEvent(new CompositionEvent('compositionstart'));
    expect(a.isComposing()).toBe(true);
    expect(a.replaceRange({ start: 0, end: 1 }, 'X')).toBe(false);
    expect(el.value).toBe('abc');
    el.dispatchEvent(new CompositionEvent('compositionend'));
    expect(a.isComposing()).toBe(false);
    a.destroy();
  });

  it('refuses replaceRange with an out-of-bounds range', () => {
    const a = new TextareaAdapter(textarea('short'));
    expect(a.replaceRange({ start: 0, end: 999 }, 'x')).toBe(false);
    a.destroy();
  });

  it('destroy() is idempotent and detaches listeners', () => {
    const el = textarea('a');
    const a = new TextareaAdapter(el);
    const listener = vi.fn();
    a.subscribe(listener);
    a.destroy();
    a.destroy();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('InputAdapter', () => {
  it('reads and replaces text in a single-line input', () => {
    const el = document.createElement('input');
    el.type = 'text';
    el.value = 'teh cat';
    document.body.appendChild(el);
    const a = new InputAdapter(el);
    expect(a.getText()).toBe('teh cat');
    expect(a.replaceRange({ start: 0, end: 3 }, 'the')).toBe(true);
    expect(el.value).toBe('the cat');
    a.destroy();
  });
});
