/**
 * WriteRight icon set — inline SVG, no remote assets (§6.5), no icon font.
 *
 * Icons are authored here as path data (24×24 grid, 1.75px stroke, round caps),
 * so the same set renders in the plain-DOM content UI (`createIcon`) and in the
 * React extension pages (`<Icon>` in `components/Icon.tsx`). All strokes use
 * `currentColor`, so colour comes from the surrounding text colour and every
 * icon pairs with a text label (§9.3 — never colour alone).
 */

export type IconName =
  | 'spelling'
  | 'grammar'
  | 'style'
  | 'tone'
  | 'readability'
  | 'check'
  | 'close'
  | 'info'
  | 'warning'
  | 'sparkle'
  | 'wand'
  | 'chevron-down'
  | 'chevron-right'
  | 'book'
  | 'shield'
  | 'gauge'
  | 'arrow-right'
  | 'plus'
  | 'trash'
  | 'download'
  | 'upload'
  | 'eye-off'
  | 'refresh'
  | 'stats'
  | 'punctuation'
  | 'define'
  | 'synonyms'
  | 'speaker'
  | 'drag'
  | 'sliders';

interface IconDef {
  /** One or more <path d="…"> strings. */
  readonly paths: readonly string[];
  /** Optional non-path children (circles etc.) as [tag, attrs]. */
  readonly shapes?: ReadonlyArray<readonly [string, Record<string, string>]>;
  /** `stroke` (default) or `fill`. */
  readonly mode?: 'stroke' | 'fill';
}

const ICONS: Record<IconName, IconDef> = {
  spelling: { paths: ['M4 20 10 5h1l6 15', 'M6.2 14.5h8.6'] },
  grammar: {
    paths: ['M5 6h14', 'M5 12h9', 'M5 18h12', 'M17.5 15.5 20 18l-2.5 2.5'],
  },
  style: {
    paths: ['M4 15c3 0 3-9 8-9 3 0 4 3 4 5', 'M8 15h12', 'M15 12l3 3-3 3'],
  },
  tone: {
    paths: ['M4 12a8 8 0 0 1 16 0', 'M12 12l4-3'],
    shapes: [
      ['circle', { cx: '12', cy: '12', r: '1.4', fill: 'currentColor' }],
    ],
  },
  readability: { paths: ['M4 6h16', 'M4 10h16', 'M4 14h10', 'M4 18h13'] },
  check: { paths: ['M5 12.5 10 17 19 7'] },
  close: { paths: ['M6 6l12 12', 'M18 6 6 18'] },
  info: {
    paths: ['M12 11v6'],
    shapes: [
      ['circle', { cx: '12', cy: '12', r: '9' }],
      ['circle', { cx: '12', cy: '7.6', r: '1', fill: 'currentColor' }],
    ],
  },
  warning: {
    paths: ['M12 3.5 21 19H3z', 'M12 9v5'],
    shapes: [
      ['circle', { cx: '12', cy: '16.6', r: '1', fill: 'currentColor' }],
    ],
  },
  sparkle: {
    paths: [
      'M12 3.5c.6 3.9 1.6 4.9 5.5 5.5-3.9.6-4.9 1.6-5.5 5.5-.6-3.9-1.6-4.9-5.5-5.5 3.9-.6 4.9-1.6 5.5-5.5Z',
      'M18.5 15c.3 1.7.7 2.1 2.5 2.5-1.8.4-2.2.8-2.5 2.5-.3-1.7-.7-2.1-2.5-2.5 1.8-.4 2.2-.8 2.5-2.5Z',
    ],
  },
  wand: {
    paths: [
      'M5 19 15 9',
      'M14 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1z',
      'M6 15l1.5 1.5',
    ],
  },
  'chevron-down': { paths: ['M6 9.5 12 15l6-5.5'] },
  'chevron-right': { paths: ['M9.5 6 15 12l-5.5 6'] },
  book: {
    paths: ['M5 4.5h10a2 2 0 0 1 2 2V20l-6-3-6 3V4.5Z', 'M9 4.5V15'],
  },
  shield: {
    paths: [
      'M12 3.5 19 6v6c0 4.5-3 7-7 8.5C8 19 5 16.5 5 12V6z',
      'M9 12l2 2 4-4',
    ],
  },
  gauge: {
    paths: ['M5 17a8 8 0 1 1 14 0', 'M12 13l4-3'],
    shapes: [
      ['circle', { cx: '12', cy: '13', r: '1.3', fill: 'currentColor' }],
    ],
  },
  'arrow-right': { paths: ['M4 12h15', 'M13 6l6 6-6 6'] },
  plus: { paths: ['M12 5v14', 'M5 12h14'] },
  trash: {
    paths: [
      'M5 7h14',
      'M9 7V5h6v2',
      'M7 7l1 13h8l1-13',
      'M10 11v6',
      'M14 11v6',
    ],
  },
  download: { paths: ['M12 4v11', 'M7.5 11 12 15.5 16.5 11', 'M5 19h14'] },
  upload: { paths: ['M12 20V9', 'M7.5 13 12 8.5 16.5 13', 'M5 5h14'] },
  'eye-off': {
    paths: [
      'M4 4l16 16',
      'M9.6 5.4A9 9 0 0 1 12 5c5 0 9 4.5 9 7-.4 1-1.4 2.4-2.9 3.6',
      'M6.2 7.7C4.5 9 3.4 10.6 3 11.5 3.9 13.6 7.5 18 12 18a8 8 0 0 0 3.2-.7',
    ],
  },
  refresh: {
    paths: [
      'M5 12a7 7 0 0 1 12-4.5L19 9',
      'M19 4v5h-5',
      'M19 12a7 7 0 0 1-12 4.5L5 15',
      'M5 20v-5h5',
    ],
  },
  stats: { paths: ['M5 19V11', 'M12 19V5', 'M19 19v-6', 'M4 19h16'] },
  punctuation: {
    paths: ['M8 7v5', 'M16 7v5'],
    shapes: [
      ['circle', { cx: '8', cy: '16', r: '1.3', fill: 'currentColor' }],
      ['circle', { cx: '16', cy: '16', r: '1.3', fill: 'currentColor' }],
    ],
  },
  define: {
    paths: [
      'M5 5.5A1.5 1.5 0 0 1 6.5 4H18v13H6.5A1.5 1.5 0 0 0 5 18.5z',
      'M5 18.5A1.5 1.5 0 0 0 6.5 20H18',
      'M9 8h6',
      'M9 11h4',
    ],
  },
  synonyms: {
    paths: [
      'M4 8h11',
      'M4 8l3-3M4 8l3 3',
      'M20 16H9',
      'M20 16l-3-3M20 16l-3 3',
    ],
  },
  speaker: {
    paths: [
      'M4 9v6h4l5 4V5L8 9z',
      'M16 9c1.2 1 1.2 5 0 6',
      'M18.5 7c2.5 2 2.5 8 0 10',
    ],
  },
  drag: {
    paths: [],
    shapes: [
      ['circle', { cx: '9', cy: '6', r: '1.4', fill: 'currentColor' }],
      ['circle', { cx: '15', cy: '6', r: '1.4', fill: 'currentColor' }],
      ['circle', { cx: '9', cy: '12', r: '1.4', fill: 'currentColor' }],
      ['circle', { cx: '15', cy: '12', r: '1.4', fill: 'currentColor' }],
      ['circle', { cx: '9', cy: '18', r: '1.4', fill: 'currentColor' }],
      ['circle', { cx: '15', cy: '18', r: '1.4', fill: 'currentColor' }],
    ],
  },
  sliders: {
    paths: ['M4 8h9', 'M17 8h3', 'M4 16h3', 'M11 16h9'],
    shapes: [
      ['circle', { cx: '15', cy: '8', r: '2' }],
      ['circle', { cx: '9', cy: '16', r: '2' }],
    ],
  },
};

const XMLNS = 'http://www.w3.org/2000/svg';

/** Build a decorative (aria-hidden) SVG icon element for the plain-DOM UI. */
export function createIcon(
  doc: Document,
  name: IconName,
  opts: { size?: number; className?: string } = {},
): SVGSVGElement {
  const def = ICONS[name];
  const size = opts.size ?? 16;
  const svg = doc.createElementNS(XMLNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (opts.className) svg.setAttribute('class', opts.className);

  const strokeMode = (def.mode ?? 'stroke') === 'stroke';
  for (const d of def.paths) {
    const p = doc.createElementNS(XMLNS, 'path');
    p.setAttribute('d', d);
    if (strokeMode) {
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '1.75');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
    } else {
      p.setAttribute('fill', 'currentColor');
    }
    svg.appendChild(p);
  }
  for (const [tag, attrs] of def.shapes ?? []) {
    const el = doc.createElementNS(XMLNS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (!('fill' in attrs) && strokeMode) {
      el.setAttribute('stroke', 'currentColor');
      el.setAttribute('stroke-width', '1.75');
    }
    svg.appendChild(el);
  }
  return svg;
}

/** Raw path data, for the React `<Icon>` component. */
export function iconDef(name: IconName): IconDef {
  return ICONS[name];
}
