/**
 * Underline renderer factory — picks a strategy from the adapter's capability
 * tier (§5.1, §18).
 */

import type { EditorAdapter } from '@/types/editor';
import type { UnderlineRenderer } from './underline-renderer';
import { TextareaOverlayRenderer } from './textarea-overlay-renderer';
import { ContentEditableRangeRenderer } from './contenteditable-range-renderer';
import {
  ContentEditableHighlightRenderer,
  highlightApiAvailable,
} from './contenteditable-highlight-renderer';
import { FallbackNoInlineRenderer } from './fallback-renderer';
import { EXPERIMENTS } from '@/experiments';

export type { UnderlineRenderer } from './underline-renderer';
export { UNDERLINE_CSS } from './underline-styles';

export function createUnderlineRenderer(
  adapter: EditorAdapter,
  overlayLayer: HTMLElement,
): UnderlineRenderer {
  const caps = adapter.getCapabilities();
  if (!caps.inlineUnderlines) return new FallbackNoInlineRenderer();

  const el = adapter.element;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return new TextareaOverlayRenderer(el, overlayLayer);
  }

  const withRange = adapter as EditorAdapter & {
    buildRangeFor?: (start: number, end: number) => Range | null;
  };
  if (
    adapter.kind === 'contenteditable' &&
    typeof withRange.buildRangeFor === 'function'
  ) {
    if (EXPERIMENTS.cssHighlightUnderlines && highlightApiAvailable()) {
      // Spike 3.2 — measured against the range renderer, not shipped by default.
      return new ContentEditableHighlightRenderer(
        withRange as never,
        overlayLayer,
      );
    }
    return new ContentEditableRangeRenderer(withRange as never, overlayLayer);
  }

  return new FallbackNoInlineRenderer();
}
