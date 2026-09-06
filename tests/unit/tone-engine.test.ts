import { describe, it, expect } from 'vitest';
import { estimateTone } from '@/engine/tone-engine';

describe('estimateTone (§13)', () => {
  it('is deterministic — identical text gives an identical result', () => {
    const text =
      'Hi team, thanks so much for the update! I really appreciate it. ' +
      "Let's catch up tomorrow.";
    expect(estimateTone(text)).toEqual(estimateTone(text));
  });

  it('always phrases the result with uncertainty (§13.3)', () => {
    const r = estimateTone(
      'Dear Sir or Madam, I am writing to formally request further information ' +
        'regarding the aforementioned matter. I would be grateful for your reply.',
    );
    expect(r.label).toMatch(/^(Likely|Possibly|Leaning|Tone unclear)/);
    expect(r.label).not.toMatch(/definitely|is professional/i);
  });

  it('detects a formal register', () => {
    const r = estimateTone(
      'Furthermore, the committee shall convene to deliberate upon the ' +
        'proposal. Notwithstanding prior objections, the resolution is hereby ' +
        'adopted pursuant to the bylaws.',
    );
    expect(['formal', 'professional']).toContain(r.primary);
  });

  it('detects a casual register', () => {
    const r = estimateTone(
      "yeah I'm gonna grab lunch, wanna come? it's basically right around the " +
        'corner lol. totally worth it!',
    );
    expect(['casual', 'friendly']).toContain(r.primary);
  });

  it('detects urgency', () => {
    const r = estimateTone(
      'This is urgent. We need the fix deployed immediately, before the ' +
        'deadline today. Please respond ASAP.',
    );
    expect(r.primary).toBe('urgent');
  });

  it('reports "unclear" for very short text', () => {
    const r = estimateTone('ok thanks');
    expect(r.confidence).toBeLessThan(0.3);
    expect(r.label).toMatch(/unclear|Leaning/);
  });

  it('exposes readable signals', () => {
    const r = estimateTone(
      "Hi! Thanks for reaching out. I'm really glad you asked — happy to help!",
    );
    expect(r.signals.length).toBeGreaterThan(0);
    expect(r.signals[0]).toHaveProperty('detail');
  });
});
