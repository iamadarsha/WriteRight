/**
 * Text `<input>` adapter — §5.1 Tier A.
 *
 * Only prose-bearing input types are handled (see `isTextLikeInput`); password,
 * email, number, search, etc. are excluded by the capability detector (§1.3,
 * §6.4) before an adapter is ever created.
 */

import type { CapabilityTier, EditorAdapterFactory } from '@/types/editor';
import { NativeTextControlAdapter } from './native-text-control-adapter';
import {
  isElementEditable,
  isElementVisible,
  isTextLikeInput,
  looksLikeCredentialField,
} from '@/utils/dom';

export class InputAdapter extends NativeTextControlAdapter {
  readonly kind = 'input';
  protected readonly tier: CapabilityTier = 'A';
}

export const inputAdapterFactory: EditorAdapterFactory = {
  kind: 'input',
  priority: 100,
  canHandle(element) {
    return (
      isTextLikeInput(element) &&
      !looksLikeCredentialField(element) &&
      isElementEditable(element) &&
      isElementVisible(element)
    );
  },
  create(element) {
    return new InputAdapter(element);
  },
};
