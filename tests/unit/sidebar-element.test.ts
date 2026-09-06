import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  SidebarElement,
  type SidebarDataSource,
} from '@/ui/sidebar/sidebar-element';
import type { Suggestion } from '@/types/suggestion';
import type { DocumentInsights } from '@/types/insights';
import type { AiCapability } from '@/ai/ai-types';

function insights(over: Partial<DocumentInsights> = {}): DocumentInsights {
  return {
    stats: {
      words: 120,
      characters: 700,
      charactersNoSpaces: 590,
      sentences: 8,
      paragraphs: 2,
      avgSentenceLength: 15,
      longestSentenceLength: 22,
      longSentenceCount: 0,
      longSentencePct: 0,
      readingTimeSeconds: 30,
      speakingTimeSeconds: 48,
      passiveVoiceCount: 1,
      fillerCount: 2,
      repeatedWordRate: 0,
    },
    readability: {
      sufficientText: true,
      fleschReadingEase: 62,
      fleschKincaidGrade: 8.1,
      gunningFog: 10.2,
      colemanLiau: 9,
      smog: 9.4,
      grade: 'Grade 8 — plain English',
    },
    tone: {
      primary: 'professional',
      secondary: 'friendly',
      confidence: 0.7,
      label: 'Likely professional',
      signals: [{ name: 'Politeness markers', detail: '2 found' }],
      scores: {
        neutral: 0.4,
        professional: 1,
        formal: 0.3,
        friendly: 0.6,
        casual: 0.1,
        confident: 0.2,
        empathetic: 0.3,
        urgent: 0.05,
        persuasive: 0.2,
      },
    },
    score: {
      score: 88,
      components: [
        {
          key: 'correctness',
          label: 'Correctness',
          value: 90,
          weight: 0.4,
          note: '1 warning.',
        },
        {
          key: 'clarity',
          label: 'Clarity',
          value: 85,
          weight: 0.2,
          note: 'ok',
        },
        {
          key: 'readability',
          label: 'Readability',
          value: 85,
          weight: 0.15,
          note: 'ok',
        },
        {
          key: 'concision',
          label: 'Concision',
          value: 80,
          weight: 0.15,
          note: '2 filler words.',
        },
        {
          key: 'consistency',
          label: 'Consistency',
          value: 100,
          weight: 0.1,
          note: 'ok',
        },
      ],
      notes: ['Concision: 2 filler words.'],
    },
    suggestionCounts: { error: 1, warning: 1, info: 2 },
    presetId: null,
    ...over,
  };
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

function aiCapability(over: Partial<AiCapability> = {}): AiCapability {
  return {
    enabled: true,
    active: 'ollama',
    label: 'AI Ready — Ollama',
    acknowledged: true,
    enhancedReview: false,
    providers: [
      {
        id: 'ollama',
        state: 'ready',
        detail: 'Connected to Ollama.',
        endpoint: 'localhost:11434',
        model: 'llama3',
      },
    ],
    ...over,
  };
}

let layer: HTMLElement;
let data: SidebarDataSource;
let calls: {
  apply: Mock<(id: string, replacementIndex: number) => void>;
  ignoreOnce: Mock<(id: string) => void>;
  addToDictionary: Mock<(id: string) => void>;
  reveal: Mock<(id: string) => void>;
  setPreset: Mock<(id: string | null) => void>;
  onClose: Mock<() => void>;
  applyFullText: Mock<(text: string) => boolean>;
  applyAiRewrite: Mock<(text: string) => boolean>;
  cancelAi: Mock<() => void>;
  acknowledgeAiPrivacy: Mock<() => Promise<void>>;
};
let aiCap: AiCapability | null = aiCapability();
let notify: () => void = () => {};

beforeEach(() => {
  document.body.innerHTML = '';
  layer = document.createElement('div');
  document.body.appendChild(layer);
  aiCap = aiCapability();
  calls = {
    apply: vi.fn(),
    ignoreOnce: vi.fn(),
    addToDictionary: vi.fn(),
    reveal: vi.fn(),
    setPreset: vi.fn(),
    onClose: vi.fn(),
    applyFullText: vi.fn(() => true),
    applyAiRewrite: vi.fn(() => true),
    cancelAi: vi.fn(),
    acknowledgeAiPrivacy: vi.fn(async () => {}),
  };
  data = {
    getInsights: () => insights(),
    getSuggestions: () => [
      sug(),
      sug({ id: 's2', severity: 'info', source: 'style', message: 'Wordy' }),
    ],
    getActivePresetId: () => null,
    onUpdate: (l) => {
      notify = l;
      return () => {};
    },
    apply: calls.apply,
    ignoreOnce: calls.ignoreOnce,
    addToDictionary: calls.addToDictionary,
    reveal: calls.reveal,
    requestRewrite: vi.fn(async () => ({
      before: 'Hello   world .',
      result: {
        changed: true,
        text: 'Hello world.',
        changes: [
          { reason: 'Collapsed repeated spaces', count: 1, examples: [] },
        ],
      },
    })),
    applyFullText: calls.applyFullText,
    setPreset: calls.setPreset,
    onClose: calls.onClose,
    getStatus: () => 'ready',
    analyzeText: vi.fn(async () => ({ suggestions: [], insights: null })),
    getAiCapability: () => aiCap,
    refreshAiCapability: vi.fn(async () => aiCapability()),
    startAiDownload: vi.fn(async () => ({ ok: true })),
    runAi: vi.fn(async () => ({
      target: { whole: false, text: 'teh cat' },
      response: {
        status: 'ok' as const,
        kind: 'rewrite' as const,
        text: 'the cat',
        changes: [],
        provider: 'ollama' as const,
        model: 'llama3',
      },
    })),
    applyAiRewrite: calls.applyAiRewrite,
    chatAi: vi.fn(async () => ({
      status: 'ok' as const,
      reply: 'Sure — here is a tighter version.',
      provider: 'ollama' as const,
    })),
    cancelAi: calls.cancelAi,
    acknowledgeAiPrivacy: calls.acknowledgeAiPrivacy,
    loadChatHistory: vi.fn(async () => []),
    saveChatHistory: vi.fn(),
  };
});

describe('SidebarElement (§15, §8)', () => {
  it('opens with the Suggestions tab and shows the health score', () => {
    const sb = new SidebarElement(layer, data);
    sb.open();
    expect(layer.querySelector('.wr-sb')?.hasAttribute('hidden')).toBe(false);
    expect(layer.querySelector('.wr-sb-score b')?.textContent).toBe('88');
    expect(
      layer.querySelector('.wr-sb-tab[aria-selected="true"]')?.textContent,
    ).toContain('Suggestions');
    sb.destroy();
  });

  it('applies a suggestion from the list', () => {
    const sb = new SidebarElement(layer, data);
    sb.open();
    layer
      .querySelector<HTMLButtonElement>('.wr-sb-sug .wr-sb-btn.primary')!
      .click();
    expect(calls.apply).toHaveBeenCalledWith('s1', 0);
    sb.destroy();
  });

  it('"Show in text" reveals the suggestion in the editor', () => {
    const sb = new SidebarElement(layer, data);
    sb.open();
    const jump = [
      ...layer.querySelectorAll<HTMLButtonElement>('.wr-sb-btn.link'),
    ].find((b) => b.textContent === 'Show in text')!;
    jump.click();
    expect(calls.reveal).toHaveBeenCalledWith('s1');
    sb.destroy();
  });

  it('the Statistics tab shows word count and readability metrics', () => {
    const sb = new SidebarElement(layer, data);
    sb.open();
    layer.querySelector<HTMLButtonElement>('[data-tab="statistics"]')!.click();
    expect(layer.textContent).toContain('Flesch Reading Ease');
    expect(layer.textContent).toContain('Grade 8 — plain English');
    sb.destroy();
  });

  it('the Tone tab shows the uncertainty-aware label and a preset picker', () => {
    const sb = new SidebarElement(layer, data);
    sb.open();
    layer.querySelector<HTMLButtonElement>('[data-tab="tone"]')!.click();
    expect(layer.textContent).toContain('Likely professional');
    const select = layer.querySelector<HTMLSelectElement>('.wr-sb-select')!;
    select.value = 'academic';
    select.dispatchEvent(new Event('change'));
    expect(calls.setPreset).toHaveBeenCalledWith('academic');
    sb.destroy();
  });

  it('the Rewrite tab previews a diff and applies it on confirm (§3.5)', async () => {
    const sb = new SidebarElement(layer, data);
    sb.open();
    layer.querySelector<HTMLButtonElement>('[data-tab="rewrite"]')!.click();
    layer.querySelector<HTMLButtonElement>('.wr-sb-btn.primary')!.click();
    await vi.waitFor(() =>
      expect(layer.querySelector('.wr-sb-diff')).not.toBeNull(),
    );
    expect(layer.querySelector('.wr-sb-diff del')).not.toBeNull();
    const apply = [
      ...layer.querySelectorAll<HTMLButtonElement>('.wr-sb-btn'),
    ].find((b) => b.textContent === 'Apply clean-up')!;
    apply.click();
    expect(calls.applyFullText).toHaveBeenCalledWith('Hello world.');
    sb.destroy();
  });

  it('Escape and the close button dismiss it without trapping focus', () => {
    const sb = new SidebarElement(layer, data);
    sb.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(sb.isOpen).toBe(false);
    expect(calls.onClose).toHaveBeenCalled();
    sb.destroy();
  });

  it('re-renders when the data source notifies', () => {
    const sb = new SidebarElement(layer, data);
    sb.open();
    data.getSuggestions = () => [];
    notify();
    expect(layer.textContent).toMatch(/Nothing to fix|Start typing/);
    sb.destroy();
  });

  it('the Assistant tab shows the AI status label (§14.4)', () => {
    const sb = new SidebarElement(layer, data);
    sb.open();
    layer.querySelector<HTMLButtonElement>('[data-tab="assistant"]')!.click();
    expect(layer.textContent).toContain('AI Ready — Ollama');
    expect(layer.textContent).toContain('Make it shorter');
    sb.destroy();
  });

  it('an AI rewrite is previewed and only applied on confirm (§4.8)', async () => {
    const sb = new SidebarElement(layer, data);
    sb.open();
    layer.querySelector<HTMLButtonElement>('[data-tab="assistant"]')!.click();
    const shorter = [
      ...layer.querySelectorAll<HTMLButtonElement>(
        '.wr-sb-ai-actions .wr-sb-btn',
      ),
    ].find((b) => b.textContent === 'Make it shorter')!;
    shorter.click();
    await vi.waitFor(() =>
      expect(layer.querySelector('.wr-sb-ai-preview')?.textContent).toBe(
        'the cat',
      ),
    );
    expect(calls.applyAiRewrite).not.toHaveBeenCalled();
    const apply = [
      ...layer.querySelectorAll<HTMLButtonElement>('.wr-sb-btn'),
    ].find((b) => b.textContent === 'Replace selection')!;
    apply.click();
    expect(calls.applyAiRewrite).toHaveBeenCalledWith('the cat');
    sb.destroy();
  });

  it('when AI is disabled the Assistant tab explains, with no action buttons', () => {
    aiCap = {
      enabled: false,
      active: null,
      label: 'AI Unavailable — local writing tools still active',
      providers: [],
      acknowledged: false,
      enhancedReview: false,
    };
    const sb = new SidebarElement(layer, data);
    sb.open();
    layer.querySelector<HTMLButtonElement>('[data-tab="assistant"]')!.click();
    expect(layer.textContent).toContain('AI Unavailable');
    expect(layer.querySelector('.wr-sb-ai-actions')).toBeNull();
    sb.destroy();
  });

  it('a downloadable Chrome model offers a download action, not just "check again" (§14.5)', () => {
    aiCap = aiCapability({
      active: null,
      label: 'AI Unavailable — local writing tools still active',
      providers: [
        {
          id: 'chrome',
          state: 'downloadable',
          detail: 'Chrome can download the on-device model now.',
        },
      ],
    });
    const sb = new SidebarElement(layer, data);
    sb.open();
    layer.querySelector<HTMLButtonElement>('[data-tab="assistant"]')!.click();
    const labels = [
      ...layer.querySelectorAll<HTMLButtonElement>('.wr-sb-btn'),
    ].map((b) => b.textContent);
    expect(labels).toContain('Download on-device AI');
    expect(labels).not.toContain('Check again');
    sb.destroy();
  });

  it('clicking the download action starts the download and refreshes capability, not just re-checks (§14.5)', async () => {
    let downloadCalls = 0;
    let settleCalls = 0;
    data.startAiDownload = vi.fn(async () => {
      downloadCalls += 1;
      return { ok: true };
    });
    const originalRefresh = data.refreshAiCapability;
    data.refreshAiCapability = vi.fn(async () => {
      settleCalls += 1;
      return originalRefresh();
    });
    aiCap = aiCapability({
      active: null,
      label: 'AI Unavailable — local writing tools still active',
      providers: [
        {
          id: 'chrome',
          state: 'downloadable',
          detail: 'Chrome can download the on-device model now.',
        },
      ],
    });
    const sb = new SidebarElement(layer, data);
    sb.open();
    layer.querySelector<HTMLButtonElement>('[data-tab="assistant"]')!.click();
    const dl = [
      ...layer.querySelectorAll<HTMLButtonElement>('.wr-sb-btn'),
    ].find((b) => b.textContent?.includes('Download'))!;
    dl.click();

    // Unlike the old "Check again" (which only re-probes), this actually starts
    // the download and immediately switches to the progress view — the button
    // is gone even before the first probe reports 'downloading'.
    expect(downloadCalls).toBe(1);
    expect(layer.querySelector('.wr-sb-ai-progress')).not.toBeNull();
    expect(
      [...layer.querySelectorAll('.wr-sb-btn')].some((b) =>
        b.textContent?.includes('Download'),
      ),
    ).toBe(false);
    // …and it re-checks capability once the download call settles.
    await vi.waitFor(() => expect(settleCalls).toBeGreaterThanOrEqual(1));
    sb.destroy();
  });

  it('a downloading Chrome model shows live progress, not a dead end (§14.5)', () => {
    aiCap = aiCapability({
      active: null,
      label: 'AI Unavailable — local writing tools still active',
      providers: [
        {
          id: 'chrome',
          state: 'downloading',
          detail: 'The on-device model is downloading…',
          progress: 0.42,
        },
      ],
    });
    const sb = new SidebarElement(layer, data);
    sb.open();
    layer.querySelector<HTMLButtonElement>('[data-tab="assistant"]')!.click();
    expect(layer.textContent).toContain('42%');
    expect(layer.querySelector('.wr-sb-ai-progress')).not.toBeNull();
    sb.destroy();
  });

  it('the first-run privacy note must be acknowledged before actions show (§14.5)', () => {
    aiCap = aiCapability({ acknowledged: false });
    const sb = new SidebarElement(layer, data);
    sb.open();
    layer.querySelector<HTMLButtonElement>('[data-tab="assistant"]')!.click();
    expect(layer.querySelector('.wr-sb-ai-privacy')).not.toBeNull();
    expect(layer.querySelector('.wr-sb-ai-actions')).toBeNull();
    layer
      .querySelector<HTMLButtonElement>('.wr-sb-ai-privacy .wr-sb-btn')!
      .click();
    expect(calls.acknowledgeAiPrivacy).toHaveBeenCalled();
    sb.destroy();
  });

  it('a chat message round-trips through the data source (§4.7)', async () => {
    const sb = new SidebarElement(layer, data);
    sb.open();
    layer.querySelector<HTMLButtonElement>('[data-tab="assistant"]')!.click();
    const input =
      layer.querySelector<HTMLTextAreaElement>('.wr-sb-chat-input')!;
    input.value = 'tighten this';
    input.dispatchEvent(new Event('input'));
    const send = layer.querySelector<HTMLButtonElement>(
      '.wr-sb-chat-form .wr-sb-btn.primary',
    )!;
    send.click();
    await vi.waitFor(() =>
      expect(layer.textContent).toContain('tighter version'),
    );
    sb.destroy();
  });
});
