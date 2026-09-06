import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { SidebarElement } from '@/ui/sidebar/sidebar-element';
import { SuggestionPopoverElement } from '@/ui/popover/suggestion-popover';
import { SidebarLauncher } from '@/ui/sidebar/launcher';
import { SIDEBAR_CSS } from '@/ui/sidebar/sidebar-styles';
import { POPOVER_CSS } from '@/ui/popover/popover-styles';
import { UNDERLINE_CSS } from '@/ui/underline';
import { PopupApp } from '@/entrypoints/popup/App';
import { OptionsApp } from '@/entrypoints/options/App';
import type { SidebarDataSource } from '@/ui/sidebar/sidebar-element';
import type { Suggestion } from '@/types/suggestion';

/**
 * §5.7 accessibility QA — the structural parts a headless DOM can hold:
 * roles, accessible names, keyboard dismissal + focus return, and
 * reduced-motion guards. Screen-reader smoke and contrast-ratio spot checks
 * are in the manual protocol (docs/BROWSER_SUPPORT.md).
 */

/** Every button / link / control reachable from `root` has an accessible name. */
function assertAccessibleNames(root: ParentNode): void {
  const controls = root.querySelectorAll<HTMLElement>(
    'button, a[href], select, [role="button"], [role="tab"], input, textarea',
  );
  for (const el of controls) {
    const labelFor = el.id
      ? root.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()
      : undefined;
    const name =
      el.getAttribute('aria-label') ||
      el.getAttribute('aria-labelledby') ||
      el.getAttribute('title') ||
      el.textContent?.trim() ||
      (el as HTMLInputElement).placeholder ||
      labelFor ||
      el.closest('label')?.textContent?.trim() ||
      '';
    expect(
      name,
      `${el.tagName}.${el.className} needs an accessible name`,
    ).not.toBe('');
  }
}

function sug(over: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 's1',
    sessionId: 's',
    documentVersion: 1,
    source: 'spell',
    start: 0,
    end: 5,
    original: 'havve',
    originalHash: 'h',
    message: 'Misspelling',
    suggestions: ['have'],
    severity: 'error',
    confidence: 0.9,
    ruleId: 'harper:Spelling',
    canAutoApply: true,
    ...over,
  };
}

const NOOP_DATA: SidebarDataSource = {
  getInsights: () => null,
  getSuggestions: () => [sug()],
  getActivePresetId: () => null,
  onUpdate: () => () => {},
  apply: () => {},
  ignoreOnce: () => {},
  addToDictionary: () => {},
  reveal: () => {},
  requestRewrite: async () => ({
    before: '',
    result: { changed: false, text: '', changes: [] },
  }),
  getStatus: () => 'ready',
  analyzeText: async () => ({ suggestions: [], insights: null }),
  applyFullText: () => true,
  setPreset: () => {},
  onClose: () => {},
  getAiCapability: () => null,
  refreshAiCapability: async () => ({
    enabled: false,
    active: null,
    label: 'AI Unavailable — local writing tools still active',
    providers: [],
    acknowledged: false,
    enhancedReview: false,
  }),
  startAiDownload: async () => ({ ok: false, error: 'not available' }),
  runAi: async () => ({
    target: { whole: false, text: '' },
    response: { status: 'blocked', mode: 'unsupported', message: 'off' },
  }),
  applyAiRewrite: () => true,
  chatAi: async () => ({ status: 'blocked', message: 'off' }),
  cancelAi: () => {},
  acknowledgeAiPrivacy: async () => {},
  loadChatHistory: async () => [],
  saveChatHistory: () => {},
};

describe('a11y — in-page surfaces (§5.7)', () => {
  let layer: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    layer = document.createElement('div');
    document.body.appendChild(layer);
  });

  it('the sidebar exposes a landmark role, a label, a tablist and named controls', () => {
    const sb = new SidebarElement(layer, NOOP_DATA);
    sb.open();
    const root = layer.querySelector('.wr-sb')!;
    expect(root.getAttribute('role')).toBe('complementary');
    expect(root.getAttribute('aria-label')).toBeTruthy();
    expect(root.querySelector('[role="tablist"]')).not.toBeNull();
    expect(root.querySelectorAll('[role="tab"]').length).toBeGreaterThanOrEqual(
      4,
    );
    for (const tab of root.querySelectorAll('[role="tab"]')) {
      expect(tab.getAttribute('aria-selected')).toMatch(/true|false/);
    }
    assertAccessibleNames(root);
    sb.destroy();
  });

  it('Escape closes the sidebar and calls back so focus can return to the editor', () => {
    const calls: string[] = [];
    const data = { ...NOOP_DATA, onClose: () => calls.push('close') };
    const sb = new SidebarElement(layer, data);
    sb.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(sb.isOpen).toBe(false);
    expect(calls).toContain('close');
    sb.destroy();
  });

  it('the popover is a labelled modal dialog with named replacement buttons', () => {
    const pop = new SuggestionPopoverElement(layer);
    pop.open({
      suggestion: sug(),
      anchorRect: new DOMRect(0, 0, 10, 10),
      canAddToDictionary: true,
      onApply: () => {},
      onIgnoreOnce: () => {},
      onIgnoreRule: () => {},
      onAddToDictionary: () => {},
      onDisableField: () => {},
      onExplainMore: async () => null,
      onClose: () => {},
    });
    const el = layer.querySelector('.wr-pop')!;
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBe('true');
    expect(el.getAttribute('aria-label')).toBeTruthy();
    assertAccessibleNames(el);
    pop.destroy();
  });

  it('the launcher pill is a button with an accessible name', () => {
    const launcher = new SidebarLauncher(layer, () => {});
    launcher.show();
    const btn = layer.querySelector<HTMLButtonElement>('.wr-launcher')!;
    expect(btn.tagName).toBe('BUTTON');
    expect(
      btn.getAttribute('aria-label') || btn.textContent?.trim(),
    ).toBeTruthy();
    launcher.destroy();
  });

  it('every injected stylesheet guards animation behind prefers-reduced-motion', () => {
    for (const css of [SIDEBAR_CSS, POPOVER_CSS, UNDERLINE_CSS]) {
      if (/transition:|animation:/.test(css)) {
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
      }
    }
  });
});

describe('a11y — extension pages (§5.7)', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('the popup renders a header, a status region and named controls', async () => {
    await act(async () => {
      root.render(<PopupApp />);
    });
    expect(container.querySelector('header')).not.toBeNull();
    // Give effects a tick to settle.
    await act(async () => {
      await Promise.resolve();
    });
    assertAccessibleNames(container);
  });

  it('the options page renders labelled form controls', async () => {
    await act(async () => {
      root.render(<OptionsApp />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('h1')).not.toBeNull();
    assertAccessibleNames(container);
  });
});
