/**
 * A stable logical text model for an ordinary `contenteditable` subtree (§18.3).
 *
 * We serialize the subtree to plain text (UTF-16, LF line endings) and keep a
 * segment map from model offsets to DOM `Text` nodes, so we can:
 *  - map a DOM Selection/Range to model offsets,
 *  - map model offsets back to a DOM Range for geometry and replacement.
 *
 * The model is a *snapshot*; rebuild it whenever the document version changes.
 */

/** Block-ish tags that introduce a line break in the text model. */
const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TR',
  'UL',
]);

export interface Segment {
  readonly node: Text;
  /** Inclusive model offset where this text node's content starts. */
  readonly start: number;
  /** Length in UTF-16 code units (equals `node.data.length` at build time). */
  readonly length: number;
}

export interface DomPoint {
  readonly node: Node;
  readonly offset: number;
}

export class ContentEditableModel {
  readonly text: string;
  readonly segments: readonly Segment[];

  private constructor(text: string, segments: Segment[]) {
    this.text = text;
    this.segments = segments;
  }

  /**
   * False once any segment's text node has been detached — which rich-text
   * editors (ProseMirror, Lexical, Slate, ...) do routinely as part of their
   * own re-render, without dispatching a further `input` event. A version
   * number alone can't see that: the document version last bumped on the
   * `input` event still matches, but the cached node references are dead, so
   * `buildRange` would silently build ranges with no `getClientRects()` (§18.3).
   */
  isLive(): boolean {
    return this.segments.every((s) => s.node.isConnected);
  }

  static build(root: HTMLElement): ContentEditableModel {
    const segments: Segment[] = [];
    let out = '';
    let lastNewlineWasExplicitBr = false;

    const endsWithNewline = (): boolean =>
      out.length === 0 || out.endsWith('\n');

    const visit = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node as Text;
        segments.push({ node: t, start: out.length, length: t.data.length });
        out += t.data;
        if (t.data.length > 0) lastNewlineWasExplicitBr = false;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      const tag = el.tagName;

      if (tag === 'BR') {
        out += '\n';
        lastNewlineWasExplicitBr = true;
        return;
      }
      // Skip content that is not user prose.
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE') return;

      const isBlock = BLOCK_TAGS.has(tag);
      if (isBlock && !endsWithNewline()) out += '\n';
      for (const child of Array.from(el.childNodes)) visit(child);
      if (isBlock && !endsWithNewline()) {
        out += '\n';
        lastNewlineWasExplicitBr = false;
      }
    };

    for (const child of Array.from(root.childNodes)) visit(child);

    // A trailing newline from the *outermost* block wrap is an artifact of
    // serialization, not user content — drop one. An explicit trailing <br>
    // is real; keep it. Collapse 3+ blank lines to 2.
    let text = out;
    if (text.endsWith('\n') && !lastNewlineWasExplicitBr) {
      text = text.slice(0, -1);
    }
    text = text.replace(/\n{3,}/g, '\n\n');

    return new ContentEditableModel(text, segments);
  }

  /** Map a model offset to a concrete DOM point for Range construction. */
  toDomPoint(offset: number): DomPoint | null {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    if (this.segments.length === 0) return null;

    for (const seg of this.segments) {
      if (clamped >= seg.start && clamped <= seg.start + seg.length) {
        return { node: seg.node, offset: clamped - seg.start };
      }
    }
    // Past the last segment (trailing synthetic newline): clamp to its end.
    const last = this.segments[this.segments.length - 1];
    if (last) return { node: last.node, offset: last.length };
    return null;
  }

  /** Map a DOM point (from a Selection) to a model offset. */
  fromDomPoint(node: Node, nodeOffset: number): number | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const seg = this.segments.find((s) => s.node === node);
      if (seg) return seg.start + Math.min(nodeOffset, seg.length);
      return null;
    }
    // Element container point: the offset indexes childNodes. Find the model
    // offset of the child boundary.
    const children = Array.from(node.childNodes);
    const boundaryChild = children[nodeOffset] ?? null;
    if (boundaryChild) {
      const seg = this.firstSegmentInside(boundaryChild);
      if (seg) return seg.start;
    }
    const prevChild = children[nodeOffset - 1] ?? null;
    if (prevChild) {
      const seg = this.lastSegmentInside(prevChild);
      if (seg) return seg.start + seg.length;
    }
    return null;
  }

  buildRange(start: number, end: number): Range | null {
    const a = this.toDomPoint(start);
    const b = this.toDomPoint(end);
    if (!a || !b) return null;
    const doc = a.node.ownerDocument ?? document;
    const range = doc.createRange();
    try {
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
    } catch {
      return null;
    }
    return range;
  }

  private firstSegmentInside(node: Node): Segment | undefined {
    return this.segments.find((s) => s.node === node || node.contains(s.node));
  }

  private lastSegmentInside(node: Node): Segment | undefined {
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const s = this.segments[i];
      if (s && (s.node === node || node.contains(s.node))) return s;
    }
    return undefined;
  }
}
