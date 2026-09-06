/**
 * Unsupported editor adapter — §5.1 Tier D.
 *
 * Used when an element is an editing surface but WriteRight cannot safely read
 * or modify it (canvas/virtualized editors, unknown rich editors). Its job is
 * to make the product **honest**: report "unsupported" rather than showing
 * misleading results or silently mutating content (§31 Rule 1, Rule 13).
 */

import type { EditorAdapterFactory, EditorCapabilities } from '@/types/editor';
import type { TextRange, TextSelection } from '@/types/text';
import { BaseAdapter } from './base-adapter';

export class UnsupportedAdapter extends BaseAdapter {
  readonly kind = 'unsupported';

  getText(): string {
    return '';
  }

  getSelection(): TextSelection | null {
    return null;
  }

  getCapabilities(): EditorCapabilities {
    return {
      tier: 'D',
      realtime: false,
      inlineUnderlines: false,
      replace: false,
      readText: false,
    };
  }

  override isEditable(): boolean {
    return false;
  }

  protected doReplaceRange(_range: TextRange, _replacement: string): boolean {
    return false; // never mutate an editor we do not understand
  }
}

/**
 * Lowest priority — only selected when nothing else claims the element. The
 * detector decides *whether* to create it; the registry never falls back to it
 * automatically for non-editing elements.
 */
export const unsupportedAdapterFactory: EditorAdapterFactory = {
  kind: 'unsupported',
  priority: -1000,
  canHandle() {
    return true;
  },
  create(element) {
    return new UnsupportedAdapter(element);
  },
};
