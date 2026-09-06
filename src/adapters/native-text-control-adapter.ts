/**
 * Shared implementation for `<textarea>` and text `<input>` (§5.1 Tier A).
 *
 * These controls expose their full text via `.value` and their caret via
 * `selectionStart` / `selectionEnd` in UTF-16 code units — exactly the shared
 * model's units (§10.3). Browsers already normalize `\r\n` to `\n` in `.value`,
 * but we still run it through the normalizer so the mapping contract holds.
 */

import type { EditorCapabilities, CapabilityTier } from '@/types/editor';
import type { TextRange, TextSelection } from '@/types/text';
import { BaseAdapter } from './base-adapter';
import { normalizeLineEndings } from '@/core/text-normalize';

type TextControl = HTMLInputElement | HTMLTextAreaElement;

export abstract class NativeTextControlAdapter extends BaseAdapter {
  protected abstract readonly tier: CapabilityTier;

  protected get control(): TextControl {
    return this.element as TextControl;
  }

  getText(): string {
    return normalizeLineEndings(this.control.value).text;
  }

  getSelection(): TextSelection | null {
    const el = this.control;
    const rawStart = el.selectionStart;
    const rawEnd = el.selectionEnd;
    if (rawStart === null || rawEnd === null) return null;
    const norm = normalizeLineEndings(el.value);
    const start = norm.fromSource(rawStart);
    const end = norm.fromSource(rawEnd);
    const dir: TextSelection['direction'] =
      start === end
        ? 'none'
        : el.selectionDirection === 'backward'
          ? 'backward'
          : 'forward';
    return {
      start: Math.min(start, end),
      end: Math.max(start, end),
      direction: dir,
    };
  }

  getCapabilities(): EditorCapabilities {
    return {
      tier: this.tier,
      realtime: true,
      inlineUnderlines: true,
      replace: true,
      readText: true,
    };
  }

  protected doReplaceRange(range: TextRange, replacement: string): boolean {
    const el = this.control;
    const norm = normalizeLineEndings(el.value);
    const srcStart = norm.toSource(range.start);
    const srcEnd = norm.toSource(range.end);

    // Preserve the caret sensibly: if the user's selection is entirely after
    // the edit, shift it by the length delta; otherwise place caret at the end
    // of the replacement.
    const prevStart = el.selectionStart ?? srcEnd;
    const prevEnd = el.selectionEnd ?? srcEnd;
    const delta = replacement.length - (srcEnd - srcStart);

    if (typeof el.setRangeText === 'function') {
      el.setRangeText(replacement, srcStart, srcEnd, 'end');
    } else {
      el.value =
        el.value.slice(0, srcStart) + replacement + el.value.slice(srcEnd);
    }

    if (prevStart >= srcEnd) {
      el.setSelectionRange(prevStart + delta, prevEnd + delta);
    }

    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        cancelable: false,
        inputType: 'insertReplacementText',
        data: replacement,
      }),
    );
    return true;
  }
}
