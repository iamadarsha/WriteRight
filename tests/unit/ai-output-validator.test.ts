import { describe, it, expect } from 'vitest';
import { validateAiOutput, validateChatReply } from '@/ai/output-validator';
import type { AiRawOutput } from '@/ai/ai-types';

function raw(text: string): AiRawOutput {
  return { raw: text, provider: 'ollama', model: 'llama3' };
}

const SELECTION = 'the quick brown fox jumps over the lazy dog';

describe('AI output validation (§4.8, §14.6)', () => {
  it('parses the structured rewrite JSON shape', () => {
    const res = validateAiOutput(
      raw(
        JSON.stringify({
          rewrittenText: 'A quick brown fox leaps over a lazy dog.',
          changes: [{ type: 'clarity', reason: 'tightened' }],
        }),
      ),
      { kind: 'rewrite', selection: SELECTION, maxOutputChars: 400 },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.kind).toBe('rewrite');
      expect(res.value.text).toContain('quick brown fox');
      expect(res.value.changes).toHaveLength(1);
    }
  });

  it('falls back to plain text when the model ignores the JSON contract', () => {
    const res = validateAiOutput(raw('A tighter sentence about the fox.'), {
      kind: 'rewrite',
      selection: SELECTION,
      maxOutputChars: 400,
    });
    expect(res.ok).toBe(true);
    if (res.ok)
      expect(res.value.text).toBe('A tighter sentence about the fox.');
  });

  it('rejects output that introduces HTML markup (§14.6)', () => {
    const res = validateAiOutput(
      raw('{"rewrittenText":"<img src=x onerror=alert(1)> the fox"}'),
      { kind: 'rewrite', selection: SELECTION, maxOutputChars: 400 },
    );
    expect(res.ok).toBe(false);
  });

  it('rejects output that introduces a script URI', () => {
    const res = validateAiOutput(
      raw('{"rewrittenText":"click javascript:steal() now for the fox"}'),
      { kind: 'rewrite', selection: SELECTION, maxOutputChars: 400 },
    );
    expect(res.ok).toBe(false);
  });

  it('rejects output far larger than the allowed size', () => {
    const res = validateAiOutput(raw('x'.repeat(5000)), {
      kind: 'rewrite',
      selection: SELECTION,
      maxOutputChars: 200,
    });
    expect(res.ok).toBe(false);
  });

  it('rejects a rewrite whose length is implausible for the selection', () => {
    const res = validateAiOutput(raw('no.'), {
      kind: 'rewrite',
      selection: SELECTION,
      maxOutputChars: 400,
    });
    expect(res.ok).toBe(false);
  });

  it('strips control characters but keeps newlines and tabs', () => {
    const res = validateAiOutput(
      raw('{"explanation":"line one\\nline\\ttwo\\u0007done"}'),
      { kind: 'explanation', selection: '', maxOutputChars: 400 },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text).toContain('line one\nline\ttwo');
      expect(res.value.text).not.toContain('');
    }
  });

  it('validateChatReply trims and caps, and rejects empty', () => {
    expect(validateChatReply('   ', 100)).toEqual({
      ok: false,
      error: 'empty reply',
    });
    const long = validateChatReply('a'.repeat(500), 100);
    expect(long.ok).toBe(true);
    if (long.ok) expect(long.text).toHaveLength(100);
  });
});
