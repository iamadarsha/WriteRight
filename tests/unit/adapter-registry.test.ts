import { describe, it, expect, beforeEach } from 'vitest';
import {
  AdapterRegistry,
  createDefaultRegistry,
} from '@/adapters/adapter-registry';
import type { EditorAdapterFactory } from '@/types/editor';

beforeEach(() => {
  document.body.innerHTML = '';
});

function add<T extends HTMLElement>(html: string): T {
  document.body.insertAdjacentHTML('beforeend', html);
  return document.body.lastElementChild as T;
}

describe('AdapterRegistry (§1.4)', () => {
  it('matches textarea → textarea adapter, input → input adapter', () => {
    const r = createDefaultRegistry();
    expect(r.match(add('<textarea></textarea>'))?.kind).toBe('textarea');
    expect(r.match(add('<input type="text">'))?.kind).toBe('input');
    expect(r.match(add('<div contenteditable="true">x</div>'))?.kind).toBe(
      'contenteditable',
    );
  });

  it('returns null for a non-editor element', () => {
    const r = createDefaultRegistry();
    expect(r.match(add('<div>plain</div>'))).toBeNull();
  });

  it('create(force=true) falls back to the unsupported adapter (Tier D)', () => {
    const r = createDefaultRegistry();
    const adapter = r.create(add('<div>plain</div>'), true);
    expect(adapter?.kind).toBe('unsupported');
    expect(adapter?.getCapabilityTier()).toBe('D');
    adapter?.destroy();
  });

  it('honours factory priority (site adapter beats generic)', () => {
    const r = new AdapterRegistry();
    const generic: EditorAdapterFactory = {
      kind: 'contenteditable',
      priority: 50,
      canHandle: () => true,
      create: () => {
        throw new Error('should not be called');
      },
    };
    const site: EditorAdapterFactory = {
      kind: 'site-x',
      priority: 200,
      canHandle: () => true,
      create: () => {
        throw new Error('unused');
      },
    };
    r.register(generic);
    r.register(site);
    expect(r.match(add('<div contenteditable="true">x</div>'))?.kind).toBe(
      'site-x',
    );
  });

  it('ignores a throwing factory during matching', () => {
    const r = new AdapterRegistry();
    r.register({
      kind: 'bad',
      priority: 100,
      canHandle: () => {
        throw new Error('boom');
      },
      create: () => {
        throw new Error('unused');
      },
    });
    expect(() => r.match(add('<textarea></textarea>'))).not.toThrow();
  });

  it('register is idempotent by kind', () => {
    const r = new AdapterRegistry();
    const f: EditorAdapterFactory = {
      kind: 'x',
      priority: 1,
      canHandle: () => false,
      create: () => {
        throw new Error('unused');
      },
    };
    r.register(f);
    r.register(f);
    expect(r.kinds.filter((k) => k === 'x')).toHaveLength(1);
  });
});
