/**
 * `<textarea>` adapter — §5.1 Tier A (full inline support).
 */

import type { CapabilityTier, EditorAdapterFactory } from '@/types/editor';
import { NativeTextControlAdapter } from './native-text-control-adapter';
import { isElementEditable, isElementVisible } from '@/utils/dom';

export class TextareaAdapter extends NativeTextControlAdapter {
  readonly kind = 'textarea';
  protected readonly tier: CapabilityTier = 'A';
}

export const textareaAdapterFactory: EditorAdapterFactory = {
  kind: 'textarea',
  priority: 100,
  canHandle(element) {
    return (
      element instanceof HTMLTextAreaElement &&
      isElementEditable(element) &&
      isElementVisible(element)
    );
  },
  create(element) {
    return new TextareaAdapter(element);
  },
};
