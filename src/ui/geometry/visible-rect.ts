/**
 * The viewport rectangle within which an element's own content is actually
 * visible (§18.3).
 *
 * `Range.getClientRects()` reports where text is laid out, not where it is
 * *shown*: a field whose content is clipped by a `max-height; overflow:auto`
 * ancestor still lays every line out at full height, so rects for lines
 * scrolled out of that window sit wherever the geometry puts them — often far
 * up or down the page. An absolutely-positioned overlay that trusts those rects
 * paints underline marks scattered across unrelated content (chatgpt.com: the
 * ProseMirror composer grows tall inside a small `overflow:auto` parent).
 *
 * `visibleClipRect(el)` returns the intersection of the viewport with every
 * scroll/clip ancestor between `el` and the document body — the box any overlay
 * drawn for `el`'s content must stay inside.
 */

export interface ClipRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Does any computed `overflow*` value establish a clipping box? */
const CLIPS = /\b(hidden|scroll|auto|clip)\b/;

function clips(cs: CSSStyleDeclaration): boolean {
  // Read the shorthand too: a stylesheet's `overflow: auto` doesn't always
  // surface on `overflowX`/`overflowY` in every engine (and jsdom).
  return CLIPS.test(`${cs.overflow} ${cs.overflowX} ${cs.overflowY}`);
}

export function visibleClipRect(el: Element): ClipRect {
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  let left = 0;
  let top = 0;
  let right = win?.innerWidth ?? Number.MAX_SAFE_INTEGER;
  let bottom = win?.innerHeight ?? Number.MAX_SAFE_INTEGER;
  if (!win) return { left, top, right, bottom };

  let node: Element | null = el;
  while (node && node !== doc.documentElement && node !== doc.body) {
    const cs = win.getComputedStyle(node);
    if (clips(cs)) {
      const r = node.getBoundingClientRect();
      // A 0×0 rect means the node is mid-layout / detaching — don't let it
      // collapse the clip to nothing.
      if (r.width > 0 || r.height > 0) {
        left = Math.max(left, r.left);
        top = Math.max(top, r.top);
        right = Math.min(right, r.right);
        bottom = Math.min(bottom, r.bottom);
      }
    }
    node = node.parentElement;
  }
  return { left, top, right, bottom };
}

/** Clamp `rect` to `clip`; returns `null` when they do not overlap. */
export function intersectRect(rect: DOMRect, clip: ClipRect): ClipRect | null {
  const left = Math.max(rect.left, clip.left);
  const top = Math.max(rect.top, clip.top);
  const right = Math.min(rect.right, clip.right);
  const bottom = Math.min(rect.bottom, clip.bottom);
  if (right - left < 1 || bottom - top < 1) return null;
  return { left, top, right, bottom };
}
