import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectField,
  isPotentialEditor,
} from '@/core/field-capability-detector';

beforeEach(() => {
  document.body.innerHTML = '';
});

function mount<T extends HTMLElement>(html: string): T {
  document.body.insertAdjacentHTML('beforeend', html);
  return document.body.lastElementChild as T;
}

describe('detectField (§1.3, §6.4)', () => {
  it('accepts an ordinary textarea', () => {
    const d = detectField(mount('<textarea>hi</textarea>'));
    expect(d.eligible).toBe(true);
    expect(d.kind).toBe('textarea');
  });

  it('accepts a text input and ordinary contenteditable', () => {
    expect(detectField(mount('<input type="text">')).eligible).toBe(true);
    expect(
      detectField(mount('<div contenteditable="true">x</div>')).eligible,
    ).toBe(true);
  });

  it('rejects password and credential-like fields', () => {
    expect(detectField(mount('<input type="password">')).rejection).toBe(
      'password-or-credential',
    );
    expect(detectField(mount('<input name="pwd">')).rejection).toBe(
      'password-or-credential',
    );
  });

  it('rejects non-prose input types', () => {
    expect(detectField(mount('<input type="email">')).rejection).toBe(
      'excluded-input-type',
    );
    expect(detectField(mount('<input type="number">')).rejection).toBe(
      'excluded-input-type',
    );
  });

  it('rejects disabled / readonly / hidden fields', () => {
    expect(detectField(mount('<textarea disabled></textarea>')).rejection).toBe(
      'disabled-or-readonly',
    );
    expect(detectField(mount('<input readonly>')).rejection).toBe(
      'disabled-or-readonly',
    );
    expect(detectField(mount('<input type="hidden">')).rejection).toBe(
      'excluded-input-type',
    );
    expect(detectField(mount('<textarea hidden></textarea>')).rejection).toBe(
      'hidden',
    );
  });

  it('rejects likely code editors', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="monaco-editor"><div contenteditable="true" id="c">x</div></div>',
    );
    const inner = document.getElementById('c')!;
    expect(detectField(inner).rejection).toBe('likely-code-editor');
  });

  it('rejects non-editable elements', () => {
    expect(detectField(mount('<div>not editable</div>')).eligible).toBe(false);
  });

  it('accepts the editor shapes real sites use (Gmail, Keep, Notion)', () => {
    // Gmail compose body.
    const gmail = mount<HTMLElement>(
      '<div aria-label="Message Body" role="textbox" contenteditable="true" ' +
        'g_editable="true" style="min-height:120px;width:500px">draft</div>',
    );
    expect(detectField(gmail).eligible).toBe(true);
    expect(detectField(gmail).kind).toBe('contenteditable');

    // Google Keep note body.
    const keep = mount<HTMLElement>(
      '<div contenteditable="true" role="textbox" aria-multiline="true" ' +
        'aria-label="Take a note…" style="width:600px">note text</div>',
    );
    expect(detectField(keep).eligible).toBe(true);

    // Notion editable block (each paragraph is its own contenteditable).
    const notion = mount<HTMLElement>(
      '<div contenteditable="true" style="width:700px" ' +
        'data-content-editable-leaf="true">A paragraph block.</div>',
    );
    expect(detectField(notion).eligible).toBe(true);
  });
});

describe('isPotentialEditor', () => {
  it('is a cheap structural pre-filter', () => {
    expect(isPotentialEditor(mount('<textarea></textarea>'))).toBe(true);
    expect(isPotentialEditor(mount('<span>text</span>'))).toBe(false);
  });
});
