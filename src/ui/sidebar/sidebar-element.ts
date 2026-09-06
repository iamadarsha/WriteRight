/**
 * The universal in-page sidebar (§15.1, §8) — plain DOM in the Shadow DOM host,
 * so it works identically on every browser with no native-API dependency and
 * no React on the page. Native `sidePanel` / `sidebarAction` are a separate
 * progressive enhancement (§15.2).
 *
 * Tabs: Suggestions · Statistics · Tone · Rewrite. Dismissible without trapping
 * focus (Esc, close button); focus returns to the editor.
 */

import type { Suggestion } from '@/types/suggestion';
import type { DocumentInsights } from '@/types/insights';
import type {
  AiChatResponse,
  AiRunResponse,
  RewriteResponse,
} from '@/types/messages';
import type {
  AiCapability,
  AiChatTurn,
  AiProbeResult,
  AiTask,
} from '@/ai/ai-types';
import { AI_TASK_LABELS } from '@/ai/ai-types';
import { TONE_LABELS, type Tone } from '@/types/insights';
import { FORMAT_PRESETS } from '@/engine/format-presets';
import { createIcon, type IconName } from '@/ui/icons';
import { diffWords } from './word-diff';

export interface SidebarDataSource {
  getInsights(): DocumentInsights | null;
  getSuggestions(): readonly Suggestion[];
  getActivePresetId(): string | null;
  onUpdate(listener: () => void): () => void;
  apply(id: string, replacementIndex: number): void;
  ignoreOnce(id: string): void;
  addToDictionary(id: string): void;
  reveal(id: string): void;
  requestRewrite(): Promise<{ before: string; result: RewriteResponse }>;
  applyFullText(text: string): boolean;
  setPreset(id: string | null): void;
  onClose(): void;
  /**
   * Overall state for the header + empty states. `no-editor` means there is no
   * analysable editor bound (an unsupported / canvas / virtualized surface, or
   * nothing focused) — the sidebar then offers a paste-and-analyse fallback
   * (§3.9, §5.1 Tier C/D).
   */
  getStatus(): 'analyzing' | 'ready' | 'idle' | 'no-editor';
  /** Feature toggles that gate whole sidebar panels (§1.2.0). */
  getFeatures?(): { writingScore: boolean; toneHints: boolean };
  /** Run the read-only analysis pipeline on pasted text (the fallback). */
  analyzeText(text: string): Promise<{
    suggestions: readonly Suggestion[];
    insights: DocumentInsights | null;
  }>;
  /* --- AI (§4). All optional-at-runtime; the tab degrades honestly. --- */
  getAiCapability(): AiCapability | null;
  refreshAiCapability(): Promise<AiCapability>;
  /** Start Chrome's on-device model download (§14.5). Explicit user action only. */
  startAiDownload(): Promise<{ ok: boolean; error?: string }>;
  runAi(task: AiTask): Promise<{
    target: { whole: boolean; text: string };
    response: AiRunResponse;
  }>;
  applyAiRewrite(text: string): boolean;
  chatAi(
    history: readonly AiChatTurn[],
    message: string,
  ): Promise<AiChatResponse>;
  cancelAi(): void;
  acknowledgeAiPrivacy(): Promise<void>;
  /** Opt-in local chat transcript (§4.7); resolves to `[]` unless enabled. */
  loadChatHistory(): Promise<readonly AiChatTurn[]>;
  saveChatHistory(turns: readonly AiChatTurn[]): void;
}

type TabId = 'suggestions' | 'statistics' | 'tone' | 'rewrite' | 'assistant';

/** Rewrite-style AI actions shown as buttons (§4.6). */
const AI_REWRITE_TASKS: AiTask[] = [
  'rewrite-shorter',
  'rewrite-longer',
  'simplify',
  'formalize',
  'casualize',
  'friendly',
  'confident',
  'persuasive',
  'improve-clarity',
  'improve-conclusion',
  'to-format',
  'explain-sentence',
];

const AI_TASK_ICON: Partial<Record<AiTask, IconName>> = {
  'rewrite-shorter': 'chevron-right',
  'rewrite-longer': 'arrow-right',
  simplify: 'check',
  formalize: 'shield',
  casualize: 'tone',
  friendly: 'tone',
  confident: 'gauge',
  persuasive: 'sparkle',
  'improve-clarity': 'style',
  'improve-conclusion': 'wand',
  'to-format': 'book',
  'explain-sentence': 'info',
};

const CATEGORY: Record<
  Suggestion['source'],
  { label: string; icon: IconName }
> = {
  spell: { label: 'Spelling', icon: 'spelling' },
  grammar: { label: 'Grammar', icon: 'grammar' },
  punctuation: { label: 'Punctuation', icon: 'punctuation' },
  style: { label: 'Style', icon: 'style' },
  tone: { label: 'Tone', icon: 'tone' },
  readability: { label: 'Readability', icon: 'readability' },
  ai: { label: 'AI', icon: 'sparkle' },
};

const TAB_META: Record<TabId, { label: string; icon: IconName }> = {
  suggestions: { label: 'Suggestions', icon: 'check' },
  statistics: { label: 'Stats', icon: 'stats' },
  tone: { label: 'Tone', icon: 'tone' },
  rewrite: { label: 'Rewrite', icon: 'wand' },
  assistant: { label: 'Assistant', icon: 'sparkle' },
};

/** Colour a 0–100 score by band. */
function scoreColor(score: number | null | undefined): string {
  if (score == null) return 'var(--wr-text-tertiary)';
  if (score >= 85) return 'var(--wr-success)';
  if (score >= 65) return 'var(--wr-grammar)';
  return 'var(--wr-error)';
}

export class SidebarElement {
  readonly #root: HTMLElement;
  readonly #doc: Document;
  readonly #data: SidebarDataSource;
  #body!: HTMLElement;
  #tab: TabId = 'suggestions';
  #cleanups: Array<() => void> = [];
  #open = false;
  #rewrite: { before: string; result: RewriteResponse } | null = null;
  #ai: {
    busy: boolean;
    task: AiTask | null;
    result: {
      kind: 'rewrite' | 'explanation';
      text: string;
      whole: boolean;
    } | null;
    error: string | null;
  } = { busy: false, task: null, result: null, error: null };
  #chat: AiChatTurn[] = [];
  #chatBusy = false;
  #chatDraft = '';
  /** Paste-and-analyse fallback state for unsupported editors (§3.9). */
  #fallback: {
    text: string;
    busy: boolean;
    result: {
      suggestions: readonly Suggestion[];
      insights: DocumentInsights | null;
    } | null;
  } = { text: '', busy: false, result: null };

  #onState: ((open: boolean, tab: TabId) => void) | undefined;

  constructor(
    uiLayer: HTMLElement,
    data: SidebarDataSource,
    onState?: (open: boolean, tab: TabId) => void,
  ) {
    this.#doc = uiLayer.ownerDocument;
    this.#data = data;
    this.#onState = onState;
    this.#root = this.#doc.createElement('aside');
    this.#root.className = 'wr-sb';
    this.#root.setAttribute('role', 'complementary');
    this.#root.setAttribute('aria-label', 'WriteRight');
    this.#root.hidden = true;
    uiLayer.appendChild(this.#root);
    this.#cleanups.push(data.onUpdate(() => this.#renderBody()));
  }

  get isOpen(): boolean {
    return this.#open;
  }

  get activeTab(): string {
    return this.#tab;
  }

  toggle(): void {
    if (this.#open) this.close();
    else this.open();
  }

  open(): void {
    if (this.#open) return;
    this.#open = true;
    this.#root.hidden = false;
    this.#renderShell();
    this.#renderBody();
    this.#onState?.(true, this.#tab);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && this.#open) {
        e.stopPropagation();
        this.close();
      }
    };
    this.#doc.addEventListener('keydown', onKey, true);
    this.#cleanups.push(() =>
      this.#doc.removeEventListener('keydown', onKey, true),
    );
    this.#root.querySelector<HTMLElement>('.wr-sb-close')?.focus();
  }

  close(): void {
    if (!this.#open) return;
    this.#open = false;
    this.#root.hidden = true;
    this.#stopDownloadPoll();
    this.#onState?.(false, this.#tab);
    this.#data.onClose();
  }

  destroy(): void {
    this.#stopDownloadPoll();
    for (const fn of this.#cleanups.splice(0)) fn();
    this.#root.remove();
  }

  /* ---- shell ------------------------------------------------------ */

  #features(): { writingScore: boolean; toneHints: boolean } {
    return (
      this.#data.getFeatures?.() ?? { writingScore: true, toneHints: true }
    );
  }

  #renderShell(): void {
    const doc = this.#doc;
    this.#root.textContent = '';
    const feat = this.#features();
    this.#featureSig = `${feat.writingScore}|${feat.toneHints}`;

    const resize = el(doc, 'div', 'wr-sb-resize');
    resize.setAttribute('role', 'separator');
    resize.setAttribute('aria-label', 'Resize sidebar');
    this.#wireResize(resize);

    const header = el(doc, 'div', 'wr-sb-header');
    const score = el(doc, 'div', 'wr-sb-score');
    if (feat.writingScore) {
      // SVG progress ring: a track circle + a fill circle animated via dashoffset.
      const R = 20;
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 46 46');
      for (const cls of ['track', 'fill']) {
        const circle = doc.createElementNS(
          'http://www.w3.org/2000/svg',
          'circle',
        );
        circle.setAttribute('cx', '23');
        circle.setAttribute('cy', '23');
        circle.setAttribute('r', String(R));
        circle.setAttribute('class', cls);
        svg.appendChild(circle);
      }
      score.append(svg, el(doc, 'b', ''));
    } else {
      score.append(createIcon(doc, 'check', { size: 20 }));
      score.classList.add('wr-sb-score-off');
    }
    const title = el(doc, 'div', 'wr-sb-title');
    header.append(score, title);
    const close = el(doc, 'button', 'wr-sb-close') as HTMLButtonElement;
    close.type = 'button';
    close.setAttribute('aria-label', 'Close sidebar');
    close.append(createIcon(doc, 'close', { size: 16 }));
    close.addEventListener('click', () => this.close());
    header.append(close);

    const tabs = el(doc, 'div', 'wr-sb-tabs');
    tabs.setAttribute('role', 'tablist');
    const tabIds = (Object.keys(TAB_META) as TabId[]).filter(
      (id) => id !== 'tone' || feat.toneHints,
    );
    for (const id of tabIds) {
      const meta = TAB_META[id];
      const t = el(doc, 'button', 'wr-sb-tab') as HTMLButtonElement;
      t.type = 'button';
      t.setAttribute('role', 'tab');
      t.title = meta.label;
      t.setAttribute('aria-label', meta.label);
      t.dataset['tab'] = id;
      t.append(
        createIcon(doc, meta.icon, { size: 16 }),
        text(doc, 'span', 'wr-sb-tab-label', meta.label),
      );
      t.addEventListener('click', () => {
        this.#tab = id;
        this.#onState?.(this.#open, id);
        if (id === 'assistant') {
          void this.#data.refreshAiCapability().then(() => this.#renderBody());
        }
        this.#renderBody();
      });
      tabs.append(t);
    }
    tabs.append(el(doc, 'div', 'wr-sb-tab-ink'));

    this.#body = el(doc, 'div', 'wr-sb-body');
    this.#body.setAttribute('role', 'tabpanel');

    this.#root.append(resize, header, tabs, this.#body);
  }

  /** Move the tab underline to the selected tab. Re-run while the label expands. */
  #positionTabInk(): void {
    const place = (): void => {
      const ink = this.#root.querySelector<HTMLElement>('.wr-sb-tab-ink');
      const active = this.#root.querySelector<HTMLElement>(
        `.wr-sb-tab[data-tab="${this.#tab}"]`,
      );
      if (!ink || !active) return;
      ink.style.left = `${active.offsetLeft}px`;
      ink.style.width = `${active.offsetWidth}px`;
    };
    place();
    const win = this.#doc.defaultView;
    if (win) {
      win.requestAnimationFrame(place);
      win.setTimeout(place, 220);
    }
  }

  #featureSig = '';

  #renderBody(): void {
    if (!this.#open) return;
    // A live feature toggle (score / tone) changes the shell, not just the body.
    const feat = this.#features();
    const sig = `${feat.writingScore}|${feat.toneHints}`;
    if (sig !== this.#featureSig) {
      this.#featureSig = sig;
      this.#renderShell();
      return; // #renderShell calls #renderBody
    }
    if (this.#tab === 'tone' && !feat.toneHints) {
      this.#tab = 'suggestions';
    }
    const noEditor = this.#data.getStatus() === 'no-editor';
    const insights = noEditor
      ? (this.#fallback.result?.insights ?? null)
      : this.#data.getInsights();
    const suggestions = noEditor
      ? (this.#fallback.result?.suggestions ?? [])
      : this.#data.getSuggestions();

    // header: score ring (when enabled) + title
    const num = this.#root.querySelector<HTMLElement>('.wr-sb-score b');
    const scoreWrap = this.#root.querySelector<HTMLElement>('.wr-sb-score');
    const fill =
      this.#root.querySelector<SVGCircleElement>('.wr-sb-score .fill');
    const title = this.#root.querySelector<HTMLElement>('.wr-sb-title');
    if (num && scoreWrap && fill) {
      const s = insights?.score.score ?? null;
      num.textContent = s == null ? '–' : String(s);
      const C = 2 * Math.PI * 20;
      const pct = Math.max(0, Math.min(100, s ?? 0)) / 100;
      fill.setAttribute('stroke-dasharray', `${C * pct} ${C}`);
      fill.setAttribute('transform', 'rotate(-90 23 23)');
      scoreWrap.style.setProperty('--wr-score-color', scoreColor(s));
      scoreWrap.setAttribute(
        'aria-label',
        s == null
          ? 'Writing health score pending'
          : `Writing health ${s} of 100`,
      );
    }
    if (title) {
      title.textContent = this.#features().writingScore
        ? 'Writing health'
        : 'WriteRight';
      const sub = el(this.#doc, 'small', '');
      const issues = insights
        ? insights.suggestionCounts.error + insights.suggestionCounts.warning
        : 0;
      sub.textContent = insights
        ? `${issues === 0 ? 'No issues' : `${issues} issue${issues === 1 ? '' : 's'}`} · ${insights.stats.words} word${insights.stats.words === 1 ? '' : 's'}`
        : 'Analysing…';
      title.append(sub);
    }

    // tab selection state + badges
    for (const t of this.#root.querySelectorAll<HTMLElement>('.wr-sb-tab')) {
      const id = t.dataset['tab'];
      t.setAttribute('aria-selected', id === this.#tab ? 'true' : 'false');
      t.querySelector('.wr-sb-badge')?.remove();
      if (id === 'suggestions' && suggestions.length > 0) {
        const b = el(this.#doc, 'span', 'wr-sb-badge');
        b.textContent = String(suggestions.length);
        t.append(b);
      }
    }
    this.#positionTabInk();

    this.#body.textContent = '';

    // Unsupported / unfocused editor: the analysis tabs run on pasted text
    // (read-only, no apply/reveal); Rewrite + Assistant need a live editor.
    if (noEditor && (this.#tab === 'rewrite' || this.#tab === 'assistant')) {
      this.#renderNeedsEditor();
      return;
    }
    if (noEditor && !this.#fallback.result && !this.#fallback.busy) {
      this.#renderAnalyzeFallback();
      return;
    }

    switch (this.#tab) {
      case 'suggestions':
        this.#renderSuggestions(suggestions, noEditor);
        break;
      case 'statistics':
        this.#renderStatistics(insights);
        break;
      case 'tone':
        this.#renderTone(insights);
        break;
      case 'rewrite':
        this.#renderRewrite();
        break;
      case 'assistant':
        this.#renderAssistant();
        break;
    }
  }

  #renderNeedsEditor(): void {
    const empty = el(this.#doc, 'div', 'wr-sb-empty');
    empty.append(
      createIcon(this.#doc, 'wand', { size: 30 }),
      text(
        this.#doc,
        'p',
        '',
        'Rewrites and the assistant need a supported editor. Click into a ' +
          'normal text box, then come back.',
      ),
    );
    this.#body.append(empty);
  }

  #renderAnalyzeFallback(): void {
    const doc = this.#doc;
    this.#body.append(
      text(
        doc,
        'p',
        'wr-sb-note',
        "This editor isn't one WriteRight can check inline. Paste your text " +
          'here for a read-only review — spelling, grammar, readability and tone.',
      ),
    );
    const ta = doc.createElement('textarea');
    ta.className = 'wr-sb-analyze-in';
    ta.placeholder = 'Paste text to analyse…';
    ta.value = this.#fallback.text;
    ta.setAttribute('aria-label', 'Text to analyse');
    ta.addEventListener('input', () => {
      this.#fallback.text = ta.value;
    });
    this.#body.append(ta);

    const run = btn(doc, 'Analyse text', 'primary');
    run.prepend(createIcon(doc, 'check', { size: 13 }));
    run.disabled = this.#fallback.text.trim().length === 0;
    ta.addEventListener('input', () => {
      run.disabled = ta.value.trim().length === 0;
    });
    run.addEventListener('click', () => {
      this.#fallback.busy = true;
      this.#renderBody();
      void this.#data
        .analyzeText(this.#fallback.text)
        .then((r) => {
          this.#fallback.busy = false;
          this.#fallback.result = r;
          this.#renderBody();
        })
        .catch(() => {
          this.#fallback.busy = false;
          this.#renderBody();
        });
    });
    this.#body.append(run);
  }

  /* ---- panels --------------------------------------------------- */

  #renderSuggestions(
    suggestions: readonly Suggestion[],
    readOnly = false,
  ): void {
    if (readOnly) {
      if (this.#fallback.busy) {
        this.#skeleton(3);
        return;
      }
      const bar = el(this.#doc, 'div', 'wr-sb-diff-actions');
      const again = btn(this.#doc, 'Analyse different text', 'subtle');
      again.prepend(createIcon(this.#doc, 'refresh', { size: 13 }));
      again.addEventListener('click', () => {
        this.#fallback.result = null;
        this.#renderBody();
      });
      bar.append(again);
      this.#body.append(bar);
    }
    if (suggestions.length === 0) {
      const insights = readOnly
        ? this.#fallback.result?.insights
        : this.#data.getInsights();
      // No text yet → prompt; text present and clean → celebrate.
      const empty = el(this.#doc, 'div', 'wr-sb-empty');
      if (insights && insights.stats.words > 0) {
        empty.classList.add('ok');
        empty.append(
          createIcon(this.#doc, 'check', { size: 30 }),
          text(this.#doc, 'p', '', 'Nothing to fix — this reads cleanly.'),
        );
      } else {
        empty.append(
          createIcon(this.#doc, 'sparkle', { size: 30 }),
          text(
            this.#doc,
            'p',
            '',
            'Start typing in the editor and suggestions will appear here.',
          ),
        );
      }
      this.#body.append(empty);
      return;
    }
    const order: Suggestion['severity'][] = ['error', 'warning', 'info'];
    const titles = {
      error: 'Must fix',
      warning: 'Should fix',
      info: 'Style & clarity',
    };
    for (const sev of order) {
      const group = suggestions.filter((s) => s.severity === sev);
      if (group.length === 0) continue;
      this.#body.append(
        text(
          this.#doc,
          'div',
          'wr-sb-group-title',
          `${titles[sev]} · ${group.length}`,
        ),
      );
      for (const s of group) {
        this.#body.append(this.#suggestionCard(s, readOnly));
      }
    }
  }

  #suggestionCard(s: Suggestion, readOnly = false): HTMLElement {
    const doc = this.#doc;
    const card = el(doc, 'div', `wr-sb-sug ${s.severity}`);
    const cat = CATEGORY[s.source];
    const catEl = el(doc, 'div', 'wr-sb-sug-cat');
    catEl.append(
      createIcon(doc, cat.icon, { size: 13 }),
      text(doc, 'span', '', cat.label),
    );
    card.append(catEl);

    const msg = el(doc, 'div', 'wr-sb-sug-msg');
    msg.textContent = s.message;
    if (s.original && !s.message.includes(s.original)) {
      msg.append(' ');
      const o = el(doc, 'span', 'wr-sb-sug-orig');
      o.textContent = s.original;
      msg.append(o);
    }
    card.append(msg);

    if (readOnly) {
      // Read-only review: show the suggested fix as plain text, no apply.
      if (s.suggestions[0]) {
        card.append(
          text(
            doc,
            'p',
            'wr-sb-note',
            `Suggested: ${s.suggestions.slice(0, 3).join('  ·  ')}`,
          ),
        );
      }
      if (s.explanation) {
        card.append(text(doc, 'p', 'wr-sb-note', s.explanation));
      }
      return card;
    }

    const actions = el(doc, 'div', 'wr-sb-sug-actions');
    s.suggestions.slice(0, 3).forEach((r, i) => {
      const b = btn(doc, r === '' ? 'Delete' : r, i === 0 ? 'primary' : '');
      if (i === 0) b.prepend(createIcon(doc, 'check', { size: 13 }));
      b.addEventListener('click', () => this.#data.apply(s.id, i));
      actions.append(b);
    });
    const jump = btn(doc, 'Show in text', 'link');
    jump.prepend(createIcon(doc, 'arrow-right', { size: 13 }));
    jump.addEventListener('click', () => this.#data.reveal(s.id));
    const ignore = btn(doc, 'Ignore', 'link');
    ignore.addEventListener('click', () => this.#data.ignoreOnce(s.id));
    actions.append(jump, ignore);
    if (s.source === 'spell' && /^\S+$/.test(s.original)) {
      const dict = btn(doc, 'Add word', 'link');
      dict.prepend(createIcon(doc, 'book', { size: 13 }));
      dict.addEventListener('click', () => this.#data.addToDictionary(s.id));
      actions.append(dict);
    }
    card.append(actions);
    return card;
  }

  #skeleton(count = 3): void {
    for (let i = 0; i < count; i++) {
      this.#body.append(el(this.#doc, 'div', 'wr-sb-skel'));
    }
  }

  #sectionHeader(label: string, icon: IconName): HTMLElement {
    const h = el(this.#doc, 'div', 'wr-sb-section-h');
    h.append(
      createIcon(this.#doc, icon, { size: 15 }),
      text(this.#doc, 'span', '', label),
    );
    return h;
  }

  #renderStatistics(insights: DocumentInsights | null): void {
    if (!insights) {
      this.#skeleton(4);
      return;
    }
    const { stats, readability } = insights;
    const grid = el(this.#doc, 'div', 'wr-sb-stats');
    const cell = (value: string, label: string): void => {
      const c = el(this.#doc, 'div', 'wr-sb-stat');
      c.append(
        text(this.#doc, 'b', '', value),
        text(this.#doc, 'span', '', label),
      );
      grid.append(c);
    };
    cell(String(stats.words), 'words');
    cell(String(stats.sentences), 'sentences');
    cell(String(stats.paragraphs), 'paragraphs');
    cell(String(stats.avgSentenceLength), 'avg words / sentence');
    cell(fmtTime(stats.readingTimeSeconds), 'reading time');
    cell(fmtTime(stats.speakingTimeSeconds), 'speaking time');
    this.#body.append(grid);

    this.#body.append(this.#sectionHeader('Readability', 'readability'));
    if (!readability.sufficientText) {
      this.#body.append(
        text(
          this.#doc,
          'p',
          'wr-sb-note',
          'Add more text for a reliable reading level.',
        ),
      );
    }
    this.#body.append(text(this.#doc, 'p', 'wr-sb-note', readability.grade));
    for (const [label, val] of [
      ['Flesch Reading Ease', readability.fleschReadingEase],
      ['Flesch–Kincaid Grade', readability.fleschKincaidGrade],
      ['Gunning Fog', readability.gunningFog],
      ['Coleman–Liau', readability.colemanLiau],
      ['SMOG', readability.smog],
    ] as const) {
      const row = el(this.#doc, 'div', 'wr-sb-metric');
      row.append(
        text(this.#doc, 'span', '', label),
        text(this.#doc, 'b', '', String(val)),
      );
      this.#body.append(row);
    }

    this.#body.append(this.#sectionHeader('Writing health', 'gauge'));
    for (const c of insights.score.components) {
      const row = el(this.#doc, 'div', 'wr-sb-metric');
      row.append(
        text(this.#doc, 'span', '', c.label),
        text(this.#doc, 'b', '', `${c.value} / 100`),
      );
      this.#body.append(row);
      this.#body.append(text(this.#doc, 'p', 'wr-sb-note', c.note));
    }
  }

  #renderTone(insights: DocumentInsights | null): void {
    if (!insights) {
      this.#skeleton(3);
      return;
    }
    const { tone } = insights;
    this.#body.append(text(this.#doc, 'div', 'wr-sb-tone-label', tone.label));
    this.#body.append(
      text(
        this.#doc,
        'p',
        'wr-sb-note',
        'A deterministic estimate from wording and structure — not a verdict.',
      ),
    );

    const tones = Object.entries(tone.scores).sort((a, b) => b[1] - a[1]);
    tones.slice(0, 6).forEach(([name, value], i) => {
      const row = el(
        this.#doc,
        'div',
        `wr-sb-tone-row${i === 0 ? ' top' : ''}`,
      );
      row.append(text(this.#doc, 'span', '', TONE_LABELS[name as Tone]));
      const bar = el(this.#doc, 'div', 'wr-sb-tone-bar');
      const fill = el(this.#doc, 'i', '');
      fill.style.width = `${Math.round(value * 100)}%`;
      bar.append(fill);
      row.append(
        bar,
        text(this.#doc, 'span', '', `${Math.round(value * 100)}`),
      );
      this.#body.append(row);
    });

    if (tone.signals.length > 0) {
      this.#body.append(this.#sectionHeader('What we noticed', 'info'));
      for (const sig of tone.signals) {
        this.#body.append(
          text(this.#doc, 'p', 'wr-sb-note', `${sig.name}: ${sig.detail}`),
        );
      }
    }

    this.#body.append(this.#sectionHeader('Format preset', 'wand'));
    const select = el(this.#doc, 'select', 'wr-sb-select') as HTMLSelectElement;
    select.append(new Option('No preset', ''));
    for (const p of FORMAT_PRESETS) {
      select.append(new Option(p.label, p.id));
    }
    select.value = this.#data.getActivePresetId() ?? '';
    select.addEventListener('change', () =>
      this.#data.setPreset(select.value || null),
    );
    this.#body.append(select);

    const preset = FORMAT_PRESETS.find(
      (p) => p.id === this.#data.getActivePresetId(),
    );
    if (preset) {
      this.#body.append(
        text(
          this.#doc,
          'p',
          'wr-sb-note',
          `Target tone: ${TONE_LABELS[preset.targetTone]}`,
        ),
      );
      const ul = el(this.#doc, 'ul', 'wr-sb-guidance');
      for (const g of preset.guidance) ul.append(text(this.#doc, 'li', '', g));
      this.#body.append(ul);
    }
  }

  #renderRewrite(): void {
    this.#body.append(
      text(
        this.#doc,
        'p',
        'wr-sb-note',
        'Safe, mechanical clean-up only — spacing, punctuation, filler words, ' +
          'and (for formal presets) contractions. Nothing is changed until you apply.',
      ),
    );
    const runBtn = btn(this.#doc, 'Preview a clean-up', 'primary');
    runBtn.prepend(createIcon(this.#doc, 'wand', { size: 13 }));
    runBtn.addEventListener('click', () => {
      runBtn.disabled = true;
      void this.#data.requestRewrite().then((rw) => {
        this.#rewrite = rw;
        this.#renderBody();
      });
    });
    this.#body.append(runBtn);

    const rw = this.#rewrite;
    if (!rw) return;
    if (!rw.result.changed) {
      const empty = el(this.#doc, 'div', 'wr-sb-empty ok');
      empty.append(
        createIcon(this.#doc, 'check', { size: 30 }),
        text(
          this.#doc,
          'p',
          '',
          'Nothing to tidy — the text is already clean.',
        ),
      );
      this.#body.append(empty);
      return;
    }

    this.#body.append(this.#sectionHeader('Proposed changes', 'wand'));
    for (const c of rw.result.changes) {
      this.#body.append(
        text(this.#doc, 'p', 'wr-sb-note', `${c.reason} · ${c.count}×`),
      );
    }

    const diff = el(this.#doc, 'div', 'wr-sb-diff');
    for (const op of diffWords(rw.before, rw.result.text)) {
      if (op.type === 'equal') diff.append(this.#doc.createTextNode(op.text));
      else {
        const tag = this.#doc.createElement(
          op.type === 'insert' ? 'ins' : 'del',
        );
        tag.textContent = op.text;
        diff.append(tag);
      }
    }
    this.#body.append(diff);

    const actions = el(this.#doc, 'div', 'wr-sb-diff-actions');
    const apply = btn(this.#doc, 'Apply clean-up', 'primary');
    apply.prepend(createIcon(this.#doc, 'check', { size: 13 }));
    apply.addEventListener('click', () => {
      if (this.#data.applyFullText(rw.result.text)) {
        this.#rewrite = null;
        this.#renderBody();
      }
    });
    const cancel = btn(this.#doc, 'Discard', 'subtle');
    cancel.addEventListener('click', () => {
      this.#rewrite = null;
      this.#renderBody();
    });
    actions.append(apply, cancel);
    this.#body.append(actions);
  }

  /* ---- assistant (AI) panel (§4.6, §4.7) ----------------------- */

  #aiCapRequested = false;
  #chatLoaded = false;
  /** 0 = no poll running (§14.5) — matches the launcher's own rAF-id pattern. */
  #downloadPollId = 0;
  #downloadError: string | null = null;
  /** True between the download click and its result — so an arbitrary
   * re-render in the gap before the probe first reports 'downloading' still
   * shows the progress view, not a fresh (clickable) Download button. */
  #downloadInFlight = false;

  #renderAssistant(): void {
    const doc = this.#doc;
    const cap = this.#data.getAiCapability();

    if (!this.#chatLoaded) {
      this.#chatLoaded = true;
      void this.#data.loadChatHistory().then((turns) => {
        if (turns.length > 0 && this.#chat.length === 0) {
          this.#chat = turns.map((t) => ({ role: t.role, content: t.content }));
          this.#renderBody();
        }
      });
    }

    if (!cap && !this.#aiCapRequested) {
      this.#aiCapRequested = true;
      void this.#data.refreshAiCapability().then(() => {
        this.#aiCapRequested = false;
        this.#renderBody();
      });
    }

    // Status line (§14.4).
    const ready0 = cap?.active != null;
    const status = el(doc, 'div', `wr-sb-ai-status${ready0 ? ' ready' : ''}`);
    status.append(
      createIcon(doc, ready0 ? 'check' : 'sparkle', { size: 14 }),
      text(doc, 'span', '', cap ? cap.label : 'Checking local AI…'),
    );
    this.#body.append(status);

    if (cap && !cap.enabled) {
      this.#body.append(
        text(
          doc,
          'p',
          'wr-sb-note',
          'Local AI is off. Turn on "Local AI features" in Settings to use ' +
            'on-device or local-model rewrites and chat. Your offline grammar, ' +
            'readability and tone tools keep working either way.',
        ),
      );
      return;
    }

    // First-run privacy explanation (§14.5).
    if (cap && cap.enabled && !cap.acknowledged) {
      const box = el(doc, 'div', 'wr-sb-ai-privacy');
      box.append(
        text(doc, 'p', 'wr-sb-note', 'Before you use local AI:'),
        text(
          doc,
          'p',
          'wr-sb-note',
          '• Chrome on-device AI keeps processing on this device. ' +
            '• Ollama / LM Studio send the selected text to the model server ' +
            'you run locally. • No WriteRight server is ever involved.',
        ),
      );
      const ok = btn(doc, 'Got it', 'primary');
      ok.addEventListener('click', () => {
        void this.#data.acknowledgeAiPrivacy().then(() => {
          void this.#data.refreshAiCapability().then(() => this.#renderBody());
        });
      });
      box.append(ok);
      this.#body.append(box);
      return;
    }

    const ready = cap?.active != null;
    if (cap && cap.enabled && !ready) {
      const chromeProbe = cap.providers.find((p) => p.id === 'chrome');
      const st = chromeProbe?.state;
      if (st === 'downloadable' && !this.#downloadInFlight) {
        this.#renderChromeDownloadPrompt(chromeProbe!);
      } else if (
        chromeProbe &&
        (st === 'downloading' || (this.#downloadInFlight && st !== 'ready'))
      ) {
        this.#renderChromeDownloadProgress(chromeProbe);
      } else {
        this.#stopDownloadPoll();
        const probe = cap.providers.find((p) => p.state !== 'unavailable');
        this.#body.append(
          text(
            doc,
            'p',
            'wr-sb-note',
            probe?.detail ??
              "No local model is ready. Connect Ollama or LM Studio, or set up Chrome's on-device AI in Settings.",
          ),
        );
        const retry = btn(doc, 'Check again', '');
        retry.addEventListener('click', () => {
          void this.#data.refreshAiCapability().then(() => this.#renderBody());
        });
        this.#body.append(retry);
      }
      // Chat + actions still render below in case a provider recovers, but the
      // buttons will surface the same honest message on use.
    } else {
      this.#stopDownloadPoll();
    }

    this.#renderAiActions(ready, cap?.enhancedReview ?? false);
    this.#renderAiChat(ready);
  }

  /**
   * Chrome's on-device model exists but hasn't been downloaded yet (§14.5).
   * Previously this fell through to a generic "no local model is ready"
   * message with only a "Check again" button that could never actually make
   * progress — checking again never downloads anything. This offers the one
   * action that does.
   */
  #renderChromeDownloadPrompt(probe: AiProbeResult): void {
    const doc = this.#doc;
    this.#body.append(text(doc, 'p', 'wr-sb-note', probe.detail));
    if (this.#downloadError) {
      this.#body.append(text(doc, 'p', 'wr-sb-ai-err', this.#downloadError));
    }
    const dl = btn(doc, 'Download on-device AI', 'primary');
    dl.addEventListener('click', () => {
      this.#downloadError = null;
      this.#downloadInFlight = true;
      this.#startDownloadPoll();
      this.#renderBody(); // #downloadInFlight is set → switches to the progress view
      void this.#data.startAiDownload().then((res) => {
        this.#downloadInFlight = false;
        this.#stopDownloadPoll();
        if (!res.ok) this.#downloadError = res.error ?? 'The download failed.';
        void this.#data.refreshAiCapability().then(() => this.#renderBody());
      });
    });
    this.#body.append(dl);
  }

  #renderChromeDownloadProgress(probe: AiProbeResult): void {
    const doc = this.#doc;
    const pct =
      typeof probe.progress === 'number'
        ? Math.round(probe.progress * 100)
        : null;
    this.#body.append(
      text(
        doc,
        'p',
        'wr-sb-note',
        pct !== null
          ? `Downloading the on-device model — ${pct}%`
          : 'Downloading the on-device model… Chrome manages this; it can take a few minutes and only happens once.',
      ),
    );
    const track = el(doc, 'div', 'wr-sb-ai-progress');
    track.setAttribute('role', 'progressbar');
    if (pct !== null) {
      track.setAttribute('aria-valuenow', String(pct));
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
    } else {
      track.classList.add('indeterminate');
    }
    const fill = el(doc, 'div', 'wr-sb-ai-progress-fill');
    if (pct !== null) fill.style.width = `${pct}%`;
    track.append(fill);
    this.#body.append(track);
    this.#startDownloadPoll();
  }

  #startDownloadPoll(): void {
    if (this.#downloadPollId) return;
    const win = this.#doc.defaultView;
    if (!win) return;
    this.#downloadPollId = win.setInterval(() => {
      void this.#data.refreshAiCapability().then((cap) => {
        const chrome = cap.providers.find((p) => p.id === 'chrome');
        // Stop only when we have a definite answer: the model is ready, or
        // Chrome reports a settled non-downloading state. A transient probe
        // failure (empty providers) is NOT a reason to give up polling —
        // the download is still running browser-side.
        const settled =
          cap.active != null ||
          chrome?.state === 'downloadable' ||
          chrome?.state === 'unavailable' ||
          chrome?.state === 'ready';
        if (settled) this.#stopDownloadPoll();
        this.#renderBody();
      });
    }, 1500);
  }

  #stopDownloadPoll(): void {
    if (!this.#downloadPollId) return;
    this.#doc.defaultView?.clearInterval(this.#downloadPollId);
    this.#downloadPollId = 0;
  }

  #renderAiActions(ready: boolean, enhancedReview: boolean): void {
    const doc = this.#doc;
    this.#body.append(this.#sectionHeader('Rewrite the selection', 'wand'));
    this.#body.append(
      text(
        doc,
        'p',
        'wr-sb-note',
        enhancedReview
          ? 'Select text to rewrite just that part. With nothing selected, the ' +
              'action runs on the whole field ("Allow whole-field AI edits" is on).'
          : 'Select the text you want to change first. To let an action run on ' +
              'the whole field, turn on "Allow whole-field AI edits" in Settings.',
      ),
    );

    const grid = el(doc, 'div', 'wr-sb-ai-actions');
    for (const task of AI_REWRITE_TASKS) {
      const b = btn(doc, AI_TASK_LABELS[task], '');
      b.prepend(createIcon(doc, AI_TASK_ICON[task] ?? 'wand', { size: 13 }));
      b.disabled = this.#ai.busy || !ready;
      b.addEventListener('click', () => this.#runAi(task));
      grid.append(b);
    }
    this.#body.append(grid);

    if (this.#ai.busy) {
      const wrap = el(doc, 'div', 'wr-sb-ai-busy');
      wrap.append(
        text(
          doc,
          'span',
          '',
          `Working locally${this.#ai.task ? ` — ${AI_TASK_LABELS[this.#ai.task]}` : ''}…`,
        ),
      );
      const cancel = btn(doc, 'Cancel', 'link');
      cancel.addEventListener('click', () => {
        this.#data.cancelAi();
        this.#ai = {
          busy: false,
          task: null,
          result: null,
          error: 'Cancelled.',
        };
        this.#renderBody();
      });
      wrap.append(cancel);
      this.#body.append(wrap);
    }

    if (this.#ai.error) {
      this.#body.append(
        text(doc, 'p', 'wr-sb-note wr-sb-ai-err', this.#ai.error),
      );
    }

    const result = this.#ai.result;
    if (result) {
      this.#body.append(
        this.#sectionHeader(
          result.kind === 'explanation' ? 'Explanation' : 'Suggested rewrite',
          result.kind === 'explanation' ? 'info' : 'sparkle',
        ),
      );
      const preview = el(doc, 'div', 'wr-sb-ai-preview');
      preview.textContent = result.text;
      this.#body.append(preview);

      if (result.kind === 'rewrite') {
        const actions = el(doc, 'div', 'wr-sb-diff-actions');
        const apply = btn(
          doc,
          result.whole ? 'Replace whole field' : 'Replace selection',
          'primary',
        );
        apply.prepend(createIcon(doc, 'check', { size: 13 }));
        apply.addEventListener('click', () => {
          const okApplied = this.#data.applyAiRewrite(result.text);
          this.#ai = {
            busy: false,
            task: null,
            result: null,
            error: okApplied
              ? null
              : 'The text changed since this rewrite — run it again.',
          };
          this.#renderBody();
        });
        const discard = btn(doc, 'Discard', '');
        discard.addEventListener('click', () => {
          this.#ai = { busy: false, task: null, result: null, error: null };
          this.#renderBody();
        });
        actions.append(apply, discard);
        this.#body.append(actions);
      } else {
        const dismiss = btn(doc, 'Dismiss', '');
        dismiss.addEventListener('click', () => {
          this.#ai = { busy: false, task: null, result: null, error: null };
          this.#renderBody();
        });
        this.#body.append(dismiss);
      }
    }
  }

  #runAi(task: AiTask): void {
    if (this.#ai.busy) return;
    this.#ai = { busy: true, task, result: null, error: null };
    this.#renderBody();
    void this.#data
      .runAi(task)
      .then(({ target, response }) => {
        if (response.status === 'blocked') {
          this.#ai = {
            busy: false,
            task: null,
            result: null,
            error: response.message,
          };
        } else {
          this.#ai = {
            busy: false,
            task: null,
            result: {
              kind: response.kind,
              text: response.text,
              whole: target.whole,
            },
            error: null,
          };
        }
        this.#renderBody();
      })
      .catch((err: unknown) => {
        this.#ai = {
          busy: false,
          task: null,
          result: null,
          error: err instanceof Error ? err.message : 'Local AI failed.',
        };
        this.#renderBody();
      });
  }

  #renderAiChat(ready: boolean): void {
    const doc = this.#doc;
    this.#body.append(this.#sectionHeader('Chat', 'tone'));

    const log = el(doc, 'div', 'wr-sb-chat-log');
    if (this.#chat.length === 0) {
      log.append(
        text(
          doc,
          'p',
          'wr-sb-note',
          'Ask for help with drafting, editing or explaining. The assistant ' +
            'only sees what you type here.',
        ),
      );
    }
    for (const turn of this.#chat) {
      const row = el(doc, 'div', `wr-sb-chat-turn ${turn.role}`);
      row.textContent = turn.content;
      log.append(row);
    }
    if (this.#chatBusy) {
      log.append(
        text(doc, 'div', 'wr-sb-chat-turn assistant wr-sb-typing', '···'),
      );
    }
    this.#body.append(log);

    const form = el(doc, 'div', 'wr-sb-chat-form');
    const input = doc.createElement('textarea');
    input.className = 'wr-sb-chat-input';
    input.rows = 2;
    input.setAttribute('aria-label', 'Message the assistant');
    input.placeholder = ready
      ? 'Message the assistant…'
      : 'Local AI is not ready';
    input.disabled = this.#chatBusy || !ready;
    input.value = this.#chatDraft;
    input.addEventListener('input', () => {
      this.#chatDraft = input.value;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.#sendChat();
      }
    });
    const send = btn(doc, '', 'primary');
    send.setAttribute('aria-label', 'Send message');
    send.append(createIcon(doc, 'arrow-right', { size: 15 }));
    send.disabled = this.#chatBusy || !ready;
    send.addEventListener('click', () => this.#sendChat());
    form.append(input, send);
    this.#body.append(form);

    if (this.#chat.length > 0) {
      const clear = btn(doc, 'Clear chat', 'link');
      clear.addEventListener('click', () => {
        this.#chat = [];
        this.#data.saveChatHistory([]);
        this.#renderBody();
      });
      this.#body.append(clear);
    }
  }

  #sendChat(): void {
    const message = this.#chatDraft.trim();
    if (!message || this.#chatBusy) return;
    const history = [...this.#chat];
    this.#chat.push({ role: 'user', content: message });
    this.#chatDraft = '';
    this.#chatBusy = true;
    this.#renderBody();
    void this.#data
      .chatAi(history, message)
      .then((res) => {
        this.#chatBusy = false;
        this.#chat.push({
          role: 'assistant',
          content: res.status === 'ok' ? res.reply : res.message,
        });
        this.#data.saveChatHistory(this.#chat);
        this.#renderBody();
      })
      .catch(() => {
        this.#chatBusy = false;
        this.#chat.push({
          role: 'assistant',
          content: 'Local AI failed. Your offline tools still work.',
        });
        this.#renderBody();
      });
  }

  /* ---- resize -------------------------------------------------- */

  #wireResize(handle: HTMLElement): void {
    let startX = 0;
    let startW = 0;
    const onMove = (e: PointerEvent): void => {
      const w = Math.min(520, Math.max(300, startW + (startX - e.clientX)));
      this.#root.style.setProperty('--wr-sb-width', `${w}px`);
    };
    const onUp = (): void => {
      this.#doc.removeEventListener('pointermove', onMove);
      this.#doc.removeEventListener('pointerup', onUp);
    };
    handle.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      startW = this.#root.getBoundingClientRect().width;
      this.#doc.addEventListener('pointermove', onMove);
      this.#doc.addEventListener('pointerup', onUp);
    });
  }
}

/* -------------------------------------------------------------------------- */

function el(doc: Document, tag: string, className: string): HTMLElement {
  const n = doc.createElement(tag);
  if (className) n.className = className;
  return n;
}
function text(
  doc: Document,
  tag: string,
  className: string,
  content: string,
): HTMLElement {
  const n = el(doc, tag, className);
  n.textContent = content;
  return n;
}
function btn(doc: Document, label: string, variant: string): HTMLButtonElement {
  const b = doc.createElement('button');
  b.className = `wr-sb-btn ${variant}`.trim();
  b.textContent = label;
  return b;
}
function fmtTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return `${m} min`;
}
