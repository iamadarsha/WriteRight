/**
 * Styles for the inline underline layer, injected once into the Shadow DOM host
 * (§9.6).
 *
 * Two renderers, two mechanisms — and the colour rules must NOT be shared:
 *  - `<input>` / `<textarea>`: a style-matched mirror overlay wraps each flagged
 *    range in `<span class="wr-u wr-u-SEVERITY">` around the *mirrored (transparent)
 *    text*. The line here is a real `text-decoration: underline` — so these spans
 *    take a `text-decoration-color` ONLY. A `background-color` on them paints a
 *    solid block the full height of the text line, right over the real field —
 *    hiding everything the user types (§18.3 regression, fixed).
 *  - `contenteditable`: a separate zero-content `<div class="wr-ce-mark wr-u-SEVERITY">`
 *    positioned just under the text. Here the bold line *is* the element's own
 *    `background-color` fill — no text to hide.
 */

export const UNDERLINE_CSS = `
.wr-ta-mirror {
  position: absolute;
  margin: 0;
  border-style: solid;
  border-color: transparent;
  color: transparent;
  background: transparent;
  overflow: hidden;
  pointer-events: none;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  -webkit-text-fill-color: transparent;
  contain: strict;
}
.wr-ta-mirror .wr-u {
  border-radius: 1px;
  text-decoration-line: underline;
  text-decoration-style: solid;
  text-decoration-skip-ink: none;
  text-underline-offset: 2.5px;
  text-decoration-thickness: 2.5px;
}
/*
 * A straight, bold, solid-colour line (§18.3) — a plain background-colour
 * fill, not an image. Simpler than the wavy version this replaced, and not
 * just for taste: a solid background-color always paints the element's full
 * box with no origin/position/tiling maths to get subtly wrong, which is
 * exactly the class of bug (background-image positioned outside its own
 * clip region) this design sidesteps entirely.
 */
.wr-ce-mark {
  position: absolute;
  height: 3px;
  pointer-events: none;
  box-sizing: border-box;
  opacity: 1;
  border-radius: 1.5px;
}

/* Mirror path (input / textarea): colour the text-decoration line only.
   NEVER a background-color here — the span wraps the mirrored text. */
.wr-u-error { text-decoration-color: var(--wr-spelling); }
.wr-u-warning { text-decoration-color: var(--wr-grammar); }
.wr-u-info { text-decoration-color: var(--wr-style); }

/* Contenteditable path: the mark is a zero-content bar under the text, so its
   background-color IS the line. Scoped to .wr-ce-mark so it can't reach the
   mirror spans above. */
.wr-ce-mark.wr-u-error { background-color: var(--wr-spelling); }
.wr-ce-mark.wr-u-warning { background-color: var(--wr-grammar); }
.wr-ce-mark.wr-u-info { background-color: var(--wr-style); }
@media (prefers-reduced-motion: reduce) {
  .wr-ta-mirror .wr-u,
  .wr-ce-mark {
    transition: none !important;
  }
}
`;
