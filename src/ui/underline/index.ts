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
    // CSS Custom Highlight API where it exists (Chrome 105+, FF 140+, Safari
    // 17.2+): the browser clips the underline to any scrollable ancestor for
    // free, so a composer like ChatGPT's can't scatter marks (§18.3). Older
    // engines fall back to the absolutely-positioned mark renderer.
    if (highlightApiAvailable()) {
      return new ContentEditableHighlightRenderer(
        withRange as never,
        overlayLayer,
      );
    }
    return new ContentEditableRangeRenderer(withRange as never, overlayLayer);
  }

  return new FallbackNoInlineRenderer();
}
