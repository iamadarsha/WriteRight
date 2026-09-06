import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorSession } from '@/core/editor-session';
import { TextareaAdapter } from '@/adapters/textarea-adapter';
import type { Suggestion } from '@/types/suggestion';

beforeEach(() => {
  document.body.innerHTML = '';
});

function makeSession(value = 'hello'): {
  session: EditorSession;
  el: HTMLTextAreaElement;
} {
  const el = document.createElement('textarea');
  el.value = value;
  document.body.appendChild(el);
  return { session: new EditorSession(new TextareaAdapter(el)), el };
}

function fakeSuggestion(over: Partial<Suggestion>): Suggestion {
  return {
    id: 's1',
    sessionId: 'x',
    documentVersion: 0,
    source: 'grammar',
    start: 0,
    end: 1,
    original: 'h',
    originalHash: 'h',
    message: 'm',
    suggestions: ['H'],
    severity: 'warning',
    confidence: 0.9,
    canAutoApply: true,
    ...over,
  };
}

describe('EditorSession (§19)', () => {
  it('tracks a content hash that updates on change', () => {
    const { session, el } = makeSession();
    const h0 = session.textHash;
    session.activate(() => {});
    el.value = 'hello world';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(session.textHash).not.toBe(h0);
    session.destroy();
  });

  it('activate/deactivate toggles isActive and stops listening', () => {
    const { session, el } = makeSession();
    const onChange = vi.fn();
    session.activate(onChange);
    expect(session.isActive).toBe(true);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(1);
    session.deactivate();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(1);
    session.destroy();
  });

  it('only keeps suggestions for the current document version (§31 Rule 12)', () => {
    const { session } = makeSession();
    const v = session.version;
    session.setSuggestions([
      fakeSuggestion({ sessionId: session.sessionId, documentVersion: v }),
      fakeSuggestion({
        id: 's2',
        sessionId: session.sessionId,
        documentVersion: v + 5,
      }),
    ]);
    expect(session.suggestions).toHaveLength(1);
    expect(session.suggestions[0]?.id).toBe('s1');
    session.destroy();
  });

  it('rejects suggestions minted for a different session', () => {
    const { session } = makeSession();
    session.setSuggestions([
      fakeSuggestion({
        sessionId: 'someone-else',
        documentVersion: session.version,
      }),
    ]);
    expect(session.suggestions).toHaveLength(0);
    session.destroy();
  });

  it('destroy() clears state and stops future change callbacks', () => {
    const { session, el } = makeSession();
    const onChange = vi.fn();
    session.activate(onChange);
    session.setSuggestions([
      fakeSuggestion({
        sessionId: session.sessionId,
        documentVersion: session.version,
      }),
    ]);
    session.destroy();
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();
    expect(session.suggestions).toHaveLength(0);
  });
});
