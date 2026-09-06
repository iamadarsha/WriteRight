/**
 * Editor adapter registry (§1.4).
 *
 * Holds the ordered list of {@link EditorAdapterFactory} implementations and
 * picks the best one for a given element. Site-specific adapters register with
 * high priority; the unsupported adapter is the explicit last resort.
 *
 * The registry never decides *whether* an element should be adapted — that is
 * the capability detector's job (§1.3). It only answers "given that we want to
 * adapt this element, which adapter fits best?".
 */

import type { EditorAdapter, EditorAdapterFactory } from '@/types/editor';
import { inputAdapterFactory } from './input-adapter';
import { textareaAdapterFactory } from './textarea-adapter';
import { contentEditableAdapterFactory } from './contenteditable-adapter';
import { unsupportedAdapterFactory } from './unsupported-adapter';

export class AdapterRegistry {
  #factories: EditorAdapterFactory[] = [];

  register(factory: EditorAdapterFactory): void {
    if (this.#factories.some((f) => f.kind === factory.kind)) return;
    this.#factories.push(factory);
    this.#factories.sort((a, b) => b.priority - a.priority);
  }

  /** All registered factory kinds, highest priority first. */
  get kinds(): readonly string[] {
    return this.#factories.map((f) => f.kind);
  }

  /** The best matching factory for `element`, or `null` if none claim it. */
  match(element: Element): EditorAdapterFactory | null {
    for (const factory of this.#factories) {
      if (factory.kind === 'unsupported') continue;
      try {
        if (factory.canHandle(element)) return factory;
      } catch {
        // A misbehaving site adapter must not break detection.
      }
    }
    return null;
  }

  /**
   * Create an adapter for `element`.
   * @param force - when `true`, fall back to the unsupported adapter instead of
   *   returning `null` (used when the detector knows this is an editor but no
   *   real adapter fits — Tier D).
   */
  create(element: Element, force = false): EditorAdapter | null {
    const factory = this.match(element);
    if (factory) return factory.create(element);
    if (force) return unsupportedAdapterFactory.create(element);
    return null;
  }
}

/** The default registry with the Phase 1 Tier-A adapters + unsupported. */
export function createDefaultRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register(textareaAdapterFactory);
  registry.register(inputAdapterFactory);
  registry.register(contentEditableAdapterFactory);
  registry.register(unsupportedAdapterFactory);
  return registry;
}
