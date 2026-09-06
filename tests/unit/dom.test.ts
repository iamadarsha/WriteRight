import { describe, it, expect, beforeEach } from 'vitest';
import {
  isTextLikeInput,
  looksLikeCredentialField,
  looksLikeCodeEditor,
  isElementEditable,
  deepActiveElement,
} from '@/utils/dom';

beforeEach(() => {
  document.body.innerHTML = '';
});

function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  const node = tpl.content.firstElementChild as T;
  document.body.appendChild(node);
  return node;
}

describe('isTextLikeInput', () => {
  it('accepts text/no-type inputs', () => {
    expect(isTextLikeInput(el('<input>'))).toBe(true);
    expect(isTextLikeInput(el('<input type="text">'))).toBe(true);
  });
  it('rejects non-prose input types', () => {
    for (const t of [
      'password',
      'email',
      'number',
      'search',
      'date',
      'checkbox',
    ]) {
      expect(isTextLikeInput(el(`<input type="${t}">`)), t).toBe(false);
    }
  });
});

describe('looksLikeCredentialField (§6.4)', () => {
  it('flags password inputs', () => {
    expect(looksLikeCredentialField(el('<input type="password">'))).toBe(true);
  });
  it('flags fields named like credentials/OTP', () => {
    expect(looksLikeCredentialField(el('<input name="user_password">'))).toBe(
      true,
    );
    expect(looksLikeCredentialField(el('<input id="otp-code">'))).toBe(true);
    expect(
      looksLikeCredentialField(el('<input autocomplete="one-time-code">')),
    ).toBe(true);
  });
  it('does not flag an ordinary comment box', () => {
    expect(
      looksLikeCredentialField(el('<textarea name="comment"></textarea>')),
    ).toBe(false);
  });
});

describe('looksLikeCodeEditor (§1.3)', () => {
  it('flags known editor containers', () => {
    const host = el(
      '<div class="cm-editor"><div contenteditable="true">x</div></div>',
    );
    const inner = host.querySelector('[contenteditable]') as HTMLElement;
    expect(looksLikeCodeEditor(inner)).toBe(true);
  });
  it('flags contenteditable inside <pre>', () => {
    const host = el('<pre><code contenteditable="true">code</code></pre>');
    expect(looksLikeCodeEditor(host.querySelector('code')!)).toBe(true);
  });
  it('does not flag an ordinary rich text box', () => {
    expect(
      looksLikeCodeEditor(el('<div contenteditable="true">hi</div>')),
    ).toBe(false);
  });
});

describe('isElementEditable', () => {
  it('false for disabled/readonly', () => {
    expect(isElementEditable(el('<textarea disabled></textarea>'))).toBe(false);
    expect(isElementEditable(el('<input readonly>'))).toBe(false);
  });
  it('true for a normal textarea and contenteditable', () => {
    expect(isElementEditable(el('<textarea></textarea>'))).toBe(true);
    expect(isElementEditable(el('<div contenteditable="true">x</div>'))).toBe(
      true,
    );
  });
});

describe('deepActiveElement', () => {
  it('pierces shadow roots', () => {
    const host = el('<div></div>');
    const root = host.attachShadow({ mode: 'open' });
    const input = document.createElement('input');
    root.appendChild(input);
    input.focus();
    expect(deepActiveElement(document)).toBe(input);
  });
});
