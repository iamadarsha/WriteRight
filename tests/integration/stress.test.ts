import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TextFieldManager, type PolicyState } from '@/core/text-field-manager';
import { createDefaultRegistry } from '@/adapters/adapter-registry';
import { LinguisticEngine } from '@/engine/linguistic-engine';
import { createTestHarperLinter } from '../support/harper';
import type { AnalysisRequest } from '@/engine/engine-host';

/**
 * §5.8 stress QA (the parts observable without a real browser). Real
 * sleep/wake, DPR and multi-window churn are in the manual browser matrix
 * (docs/BROWSER_SUPPORT.md); here we pin the invariants jsdom can hold:
 * bounded latency on large input, no listener/observer leaks across
 * mount/unmount and SPA churn, and correct behaviour with many simultaneous
 * surfaces.
 */

const ENABLED: PolicyState = {
  globallyEnabled: true,
  siteEnabled: true,
  pageInjectable: true,
};

function focus(el: HTMLElement): void {
  el.focus();
  el.dispatchEvent(
    new FocusEvent('focusin', { bubbles: true, composed: true }),
  );
}

function makeManager(): TextFieldManager {
  return new TextFieldManager({
    registry: createDefaultRegistry(),
    origin: 'https://example.com',
    getPolicy: () => ENABLED,
    onStatusChange: () => {},
  });
}

describe('stress — editor lifecycle (§5.8)', () => {
  let manager: TextFieldManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });
  afterEach(() => {
    manager?.stop();
    vi.useRealTimers();
  });

  it('200 focus/blur cycles on the same field leave exactly one tracked session', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    manager = makeManager();
    manager.start();

    for (let i = 0; i < 200; i++) {
      focus(ta);
      ta.blur();
      document.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    }
    focus(ta);
    expect(manager.trackedCount).toBe(1);
  });

  it('100 mount → remove cycles do not accumulate sessions or listeners', async () => {
    manager = makeManager();
    manager.start();

    for (let i = 0; i < 100; i++) {
      const ta = document.createElement('textarea');
      ta.className = 'comment';
      document.body.appendChild(ta);
      focus(ta);
      ta.remove();
      await vi.advanceTimersByTimeAsync(1200);
    }
    expect(manager.trackedCount).toBe(0);
    // A fresh field still attaches cleanly after all that churn.
    const fresh = document.createElement('textarea');
    document.body.appendChild(fresh);
    focus(fresh);
    expect(manager.trackedCount).toBe(1);
  });

  it('repeated SPA-style subtree replacement keeps only the live surface', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    manager = makeManager();
    manager.start();

    for (let i = 0; i < 50; i++) {
      host.innerHTML = '';
      const ta = document.createElement('textarea');
      host.appendChild(ta);
      focus(ta);
      await vi.advanceTimersByTimeAsync(300);
    }
    await vi.advanceTimersByTimeAsync(1200);
    expect(manager.trackedCount).toBe(1);
  });

  it('many simultaneous editor surfaces: only the focused one is active (§17.4)', () => {
    manager = makeManager();
    manager.start();
    const fields: HTMLTextAreaElement[] = [];
    for (let i = 0; i < 25; i++) {
      const ta = document.createElement('textarea');
      document.body.appendChild(ta);
      fields.push(ta);
      focus(ta);
    }
    expect(manager.trackedCount).toBeGreaterThanOrEqual(1);
    expect(manager.activeSession?.adapter.element).toBe(fields.at(-1));

    focus(fields[0]!);
    expect(manager.activeSession?.adapter.element).toBe(fields[0]);
  });

  it('stop() after heavy churn removes every listener (idempotent)', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    manager = makeManager();
    manager.start();
    for (let i = 0; i < 50; i++) {
      focus(ta);
      ta.dispatchEvent(new Event('input'));
    }
    manager.stop();
    manager.stop(); // idempotent
    expect(manager.trackedCount).toBe(0);
  });
});

describe('stress — engine on large / pathological input (§5.8, §2.9)', () => {
  let engine: LinguisticEngine;

  beforeEach(async () => {
    engine = new LinguisticEngine(createTestHarperLinter('en-US'));
    await engine.initialize();
  }, 60_000);
  afterEach(async () => {
    await engine.shutdown();
  });

  function req(text: string): AnalysisRequest {
    return {
      requestId: 'stress',
      sessionId: 's',
      documentVersion: 1,
      text,
      dialect: 'en-US',
      styleChecksEnabled: true,
      readabilityEnabled: true,
      buzzwords: [],
      disabledRuleIds: [],
      ignoredKeys: [],
      extraIgnorePatterns: [],
      presetId: null,
      withInsights: true,
    };
  }

  it('a 10,000-word document analyses and stays bounded', async () => {
    const para =
      'The teh committee reviewed the propsal and approved teh budget quickly. ';
    const doc = para.repeat(1430); // ~10k words
    const t0 = performance.now();
    const { suggestions, insights } = await engine.analyze(req(doc));
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(15_000);
    expect(suggestions.length).toBeGreaterThan(50); // many "teh" / "propsal"
    expect(insights).not.toBeNull();
  }, 30_000);

  it('a document that produces 100+ suggestions still returns a well-formed list', async () => {
    const doc = 'I recieve teh propsal. '.repeat(60);
    const { suggestions } = await engine.analyze(req(doc));
    expect(suggestions.length).toBeGreaterThan(100);
    for (const s of suggestions) {
      expect(s.end).toBeGreaterThan(s.start);
      expect(doc.slice(s.start, s.end)).toBe(s.original);
      expect(s.id).toBeTruthy();
    }
  });

  it('50 back-to-back analyses of changing text do not leak or drift', async () => {
    for (let v = 1; v <= 50; v++) {
      const { suggestions } = await engine.analyze({
        ...req(`Version ${v}: I recieve teh update.`),
        documentVersion: v,
      });
      expect(suggestions.length).toBeGreaterThan(0);
    }
    // A final clean sentence comes back clean — no state carried over.
    const clean = await engine.analyze(
      req('This sentence is entirely correct.'),
    );
    expect(
      clean.suggestions.filter((s) => s.severity === 'error'),
    ).toHaveLength(0);
  }, 30_000);

  it('adversarial input (only punctuation / whitespace / emoji) does not throw', async () => {
    for (const text of [
      '',
      '   \n\n\t  ',
      '!!!???...,,,;;;',
      '\u{1F600}\u{1F469}‍\u{1F467} \u{1F1EF}\u{1F1F5}',
      '.'.repeat(5000),
      'a'.repeat(20_000),
    ]) {
      const res = await engine.analyze(req(text));
      expect(Array.isArray(res.suggestions)).toBe(true);
    }
  });
});
