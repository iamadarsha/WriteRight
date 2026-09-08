/**
 * Styles for the select-to-define pill + panel, injected once into the Shadow
 * DOM host's UI layer (§11.3, §9). Motion is guarded behind
 * `prefers-reduced-motion` (§9.2).
 */

export const DEFINE_CSS = `
.wr-def-pill {
  position: fixed;
  z-index: 3;
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--wr-border);
  border-radius: var(--wr-radius-pill);
  background: var(--wr-bg-elevated);
  color: var(--wr-text);
  box-shadow: var(--wr-shadow-3);
  font: 600 var(--wr-text-sm) / 1 var(--wr-font-sans);
  cursor: pointer;
  transition: transform var(--wr-motion-fast) var(--wr-ease-spring),
    box-shadow var(--wr-motion-fast) var(--wr-ease);
  animation: wr-def-pill-in var(--wr-motion-base) var(--wr-ease-out);
}
/* The [hidden] attribute selector out-specifies the plain class rule above,
   so this reliably wins over "display: inline-flex" — setting .hidden = true
   alone does NOT hide an element once its own CSS sets display unconditionally;
   author styles beat the User-Agent default [hidden] { display: none } rule. */
.wr-def-pill[hidden] { display: none; }
.wr-def-pill:hover { transform: translateY(-1px); box-shadow: var(--wr-shadow-4); }
.wr-def-pill:active { transform: scale(0.97); }
.wr-def-pill svg { width: 14px; height: 14px; }
.wr-def-pill .wr-def-pill-word {
  max-width: 12ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--wr-text-secondary);
}
@keyframes wr-def-pill-in {
  from { opacity: 0; transform: translateY(4px) scale(0.96); }
  to { opacity: 1; transform: none; }
}

.wr-def-panel {
  position: fixed;
  z-index: 4;
  pointer-events: auto;
  /* Small by default (§8) — just enough for one sense; grows only once
     expanded, rather than opening as a full dialog every time. */
  width: min(260px, calc(100vw - 24px));
  max-height: min(60vh, 460px);
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--wr-border);
  border-radius: var(--wr-radius-popover);
  background: var(--wr-bg-elevated);
  color: var(--wr-text);
  /* A small selection-anchored card — the popover's peer, not the sidebar's
     (§9.7). Floating elevation, not drawer elevation. */
  box-shadow: var(--wr-shadow-3);
  font: var(--wr-text-md) / var(--wr-leading) var(--wr-font-sans);
  transition: width var(--wr-motion-base) var(--wr-ease-out);
  transform-origin: var(--wr-def-origin, top left);
  animation: wr-def-panel-in var(--wr-motion-base) var(--wr-ease-out);
}
@keyframes wr-def-panel-in {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: none; }
}
.wr-def-panel.expanded { width: min(340px, calc(100vw - 24px)); }
.wr-def-expand {
  appearance: none;
  width: 100%;
  border: none;
  background: none;
  color: var(--wr-text-secondary);
  font: inherit;
  font-size: var(--wr-text-sm);
  font-weight: 550;
  cursor: pointer;
  padding: 8px 0 2px;
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-top: 1px solid var(--wr-border);
}
.wr-def-expand:hover { color: var(--wr-text); }
.wr-def-expand svg { width: 13px; height: 13px; }
.wr-def-head {
  position: sticky;
  top: 0;
  display: flex;
  align-items: baseline;
  gap: var(--wr-space-2);
  padding: var(--wr-space-3) var(--wr-space-4) var(--wr-space-2);
  background: var(--wr-bg-elevated);
  border-bottom: 1px solid var(--wr-border);
}
.wr-def-word {
  font-size: var(--wr-text-xl);
  font-weight: 650;
  letter-spacing: -0.01em;
}
.wr-def-from {
  font-size: var(--wr-text-sm);
  color: var(--wr-text-tertiary);
}
.wr-def-close {
  margin-left: auto;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--wr-radius-xs);
  background: transparent;
  color: var(--wr-text-secondary);
  cursor: pointer;
  transition: background var(--wr-motion-fast) var(--wr-ease),
    color var(--wr-motion-fast) var(--wr-ease);
}
.wr-def-close:hover { background: var(--wr-bg-hover); color: var(--wr-text); }
.wr-def-close svg { width: 15px; height: 15px; }

.wr-def-body { padding: var(--wr-space-2) var(--wr-space-4) var(--wr-space-4); }
.wr-def-sense {
  padding: var(--wr-space-2) 0;
  border-top: 1px solid var(--wr-border);
}
.wr-def-sense:first-child { border-top: 0; }
.wr-def-pos {
  display: inline-block;
  font-size: var(--wr-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--wr-tracking-caps);
  color: var(--wr-accent);
  margin-bottom: 3px;
}
.wr-def-gloss { margin: 0; }
.wr-def-example {
  margin: 5px 0 0;
  padding-left: 9px;
  border-left: 2px solid var(--wr-border);
  color: var(--wr-text-secondary);
  font-style: italic;
}
.wr-def-rel { margin-top: 7px; display: flex; flex-wrap: wrap; gap: 5px 6px; }
.wr-def-rel-label {
  font-size: var(--wr-text-xs);
  font-weight: 600;
  color: var(--wr-text-tertiary);
  align-self: center;
  margin-right: 2px;
}
.wr-def-chip {
  appearance: none;
  border: 1px solid var(--wr-border);
  background: var(--wr-bg-subtle);
  color: var(--wr-text);
  border-radius: var(--wr-radius-pill);
  padding: 3px 9px;
  font: inherit;
  font-size: var(--wr-text-sm);
  cursor: pointer;
  transition: background var(--wr-motion-fast) var(--wr-ease);
}
.wr-def-chip:hover { background: var(--wr-bg-hover); }
.wr-def-chip.ant { border-style: dashed; }
.wr-def-note {
  padding: var(--wr-space-4);
  color: var(--wr-text-secondary);
  text-align: center;
}
.wr-def-skel {
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--wr-bg-subtle) 25%,
    var(--wr-bg-hover) 37%,
    var(--wr-bg-subtle) 63%
  );
  background-size: 400% 100%;
  animation: wr-def-shimmer 1.4s ease-in-out infinite;
  margin: var(--wr-space-2) var(--wr-space-4);
}
@keyframes wr-def-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

/* Simple Mode (§9.5) — noticeably bigger text and targets, plainer, calmer. */
[data-wr-simple='true'] .wr-def-pill {
  padding: 10px 16px;
  font-size: 15px;
  gap: 8px;
}
[data-wr-simple='true'] .wr-def-pill svg { width: 19px; height: 19px; }
[data-wr-simple='true'] .wr-def-panel {
  width: min(420px, calc(100vw - 24px));
  font-size: 16px;
  line-height: 1.6;
}
[data-wr-simple='true'] .wr-def-head { padding: 16px 18px 10px; }
[data-wr-simple='true'] .wr-def-body { padding: 8px 18px 18px; }
[data-wr-simple='true'] .wr-def-word { font-size: 26px; }
[data-wr-simple='true'] .wr-def-pos { font-size: 13px; }
[data-wr-simple='true'] .wr-def-gloss { font-size: 17px; }
[data-wr-simple='true'] .wr-def-sense { padding: 12px 0; }
[data-wr-simple='true'] .wr-def-chip {
  padding: 9px 16px;
  font-size: 15px;
  min-height: 40px;
}
[data-wr-simple='true'] .wr-def-close { width: 40px; height: 40px; }
[data-wr-simple='true'] .wr-def-close svg { width: 19px; height: 19px; }
[data-wr-simple='true'] .wr-def-example { font-style: normal; }

@media (prefers-reduced-motion: reduce) {
  .wr-def-pill, .wr-def-panel { animation: none; transition: none; }
  .wr-def-skel { animation: none; }
}
[data-wr-reduced-motion='true'] .wr-def-pill,
[data-wr-reduced-motion='true'] .wr-def-panel,
[data-wr-reduced-motion='true'] .wr-def-skel { animation: none; transition: none; }

@media (forced-colors: active) {
  .wr-def-pill, .wr-def-panel { border-color: CanvasText; }
  .wr-def-pos { color: LinkText; }
  .wr-def-chip { border-color: CanvasText; }
}
`;
