import { describe, it, expect } from 'vitest';
import { classifyTask, route } from '@/ai/ai-router';
import type { AiCapability } from '@/ai/ai-types';

function cap(over: Partial<AiCapability> = {}): AiCapability {
  return {
    enabled: true,
    active: 'ollama',
    label: 'AI Ready — Ollama',
    acknowledged: true,
    enhancedReview: false,
    providers: [
      { id: 'ollama', state: 'ready', detail: 'ok', model: 'llama3' },
    ],
    ...over,
  };
}

describe('AI router (§4.5)', () => {
  it('classifies the rewrite/explain/chat tasks as generative', () => {
    for (const t of [
      'rewrite-shorter',
      'simplify',
      'explain-sentence',
      'chat',
    ] as const) {
      expect(classifyTask(t)).toBe('generative');
    }
  });

  it('routes a rewrite to the active provider when one is ready', () => {
    const d = route({ task: 'simplify', selectionChars: 120 }, cap());
    expect(d).toEqual({
      mode: 'generative',
      provider: 'ollama',
      model: 'llama3',
    });
  });

  it('a rewrite on an empty field is deterministic guidance, not an AI call', () => {
    const d = route({ task: 'simplify', selectionChars: 0 }, cap());
    expect(d.mode).toBe('deterministic');
  });

  it('a whole-field rewrite needs a selection OR "Allow whole-field AI edits" (§4.5)', () => {
    // whole field, no enhanced review → guidance, not AI
    const blocked = route(
      { task: 'simplify', selectionChars: 400, whole: true },
      cap(),
    );
    expect(blocked.mode).toBe('deterministic');
    if (blocked.mode === 'deterministic') {
      expect(blocked.hint).toMatch(/whole[- ]field/i);
    }
    // whole field + enhanced review on → allowed
    const allowed = route(
      { task: 'simplify', selectionChars: 400, whole: true },
      cap({ enhancedReview: true }),
    );
    expect(allowed.mode).toBe('generative');
    // an explicit selection is always fine
    const selected = route(
      { task: 'simplify', selectionChars: 400, whole: false },
      cap(),
    );
    expect(selected.mode).toBe('generative');
  });

  it('blocks an oversized selection with a helpful message, not an AI call', () => {
    const d = route({ task: 'simplify', selectionChars: 99_999 }, cap());
    expect(d).toMatchObject({ mode: 'deterministic' });
  });

  it('is unsupported (not a cloud upsell) when AI is disabled', () => {
    const d = route(
      { task: 'simplify', selectionChars: 100 },
      cap({ enabled: false, active: null }),
    );
    expect(d.mode).toBe('unsupported');
    if (d.mode === 'unsupported') {
      expect(d.reason).toMatch(/offline|turned off/i);
      expect(d.reason).not.toMatch(/cloud|upgrade|subscri/i);
    }
  });

  it('explains the on-device download state instead of failing silently (§14.5)', () => {
    const d = route(
      { task: 'chat', selectionChars: 0 },
      cap({
        active: null,
        providers: [
          { id: 'chrome', state: 'downloadable', detail: 'needs download' },
        ],
      }),
    );
    expect(d.mode).toBe('unsupported');
    if (d.mode === 'unsupported') expect(d.reason).toMatch(/download/i);
  });

  it('chat is allowed with no selection', () => {
    const d = route({ task: 'chat', selectionChars: 0 }, cap());
    expect(d.mode).toBe('generative');
  });
});
