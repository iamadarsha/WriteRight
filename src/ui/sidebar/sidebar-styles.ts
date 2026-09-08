/** Universal in-page sidebar styles, injected into the Shadow DOM host (§15.1). */
export const SIDEBAR_CSS = `
.wr-sb {
  position: fixed;
  top: 0;
  right: 0;
  height: 100%;
  width: var(--wr-sb-width, 380px);
  min-width: 316px;
  max-width: 560px;
  background: var(--wr-bg);
  color: var(--wr-text);
  border-left: 1px solid var(--wr-border);
  box-shadow: var(--wr-shadow-4);
  display: flex;
  flex-direction: column;
  font-family: var(--wr-font-sans);
  font-size: var(--wr-text-md);
  line-height: var(--wr-leading);
  pointer-events: auto;
  transform: translateX(0);
  transition: transform var(--wr-motion-slow) var(--wr-ease-out);
}
.wr-sb[hidden] { display: flex; transform: translateX(102%); }
@media (prefers-reduced-motion: reduce) { .wr-sb { transition: none; } }

.wr-sb-resize {
  position: absolute;
  left: -4px;
  top: 0;
  width: 8px;
  height: 100%;
  cursor: ew-resize;
  z-index: 1;
}
.wr-sb-resize::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 50%;
  width: 2px;
  height: 32px;
  border-radius: 2px;
  background: var(--wr-border-strong);
  transform: translateY(-50%);
  opacity: 0;
  transition: opacity var(--wr-motion-fast) var(--wr-ease);
}
.wr-sb-resize:hover::after { opacity: 1; }

/* ---- header: score ring + title ---- */
.wr-sb-header {
  display: flex;
  align-items: center;
  gap: var(--wr-space-3);
  padding: var(--wr-space-4) var(--wr-space-4) var(--wr-space-3);
  border-bottom: 1px solid var(--wr-border);
}
.wr-sb-score {
  --sz: 46px;
  width: var(--sz);
  height: var(--sz);
  flex: none;
  position: relative;
  display: grid;
  place-items: center;
}
.wr-sb-score svg { position: absolute; inset: 0; }
.wr-sb-score circle { fill: none; stroke-width: 4; }
.wr-sb-score .track {
  stroke: color-mix(in srgb, var(--wr-score-color, var(--wr-accent)) 16%, transparent);
}
.wr-sb-score .fill {
  stroke: var(--wr-score-color, var(--wr-accent));
  stroke-linecap: round;
  transition: stroke-dasharray var(--wr-motion-slow) var(--wr-ease-out),
    stroke var(--wr-motion-base) var(--wr-ease);
}
.wr-sb-score b {
  font-weight: 700;
  font-size: var(--wr-text-lg);
  font-variant-numeric: tabular-nums;
}
.wr-sb-score.wr-sb-score-off {
  border-radius: 50%;
  background: var(--wr-accent-soft);
  color: var(--wr-accent);
}
.wr-sb-title { font-weight: 650; flex: 1; min-width: 0; }
.wr-sb-title small {
  display: block;
  font-weight: 400;
  color: var(--wr-text-secondary);
  font-size: var(--wr-text-sm);
  margin-top: 1px;
}
.wr-sb-close {
  appearance: none;
  border: none;
  background: none;
  color: var(--wr-text-tertiary);
  cursor: pointer;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--wr-radius-sm);
  transition: background var(--wr-motion-fast) var(--wr-ease),
    color var(--wr-motion-fast) var(--wr-ease);
}
.wr-sb-close:hover { background: var(--wr-bg-hover); color: var(--wr-text); }
.wr-sb-close svg { width: 16px; height: 16px; }

/* ---- tabs with a sliding indicator ---- */
.wr-sb-tabs {
  display: flex;
  position: relative;
  border-bottom: 1px solid var(--wr-border);
  padding: 0 var(--wr-space-2);
  gap: 2px;
}
.wr-sb-tab {
  appearance: none;
  border: none;
  background: none;
  color: var(--wr-text-secondary);
  font: inherit;
  font-size: var(--wr-text-sm);
  padding: 11px 10px;
  cursor: pointer;
  white-space: nowrap;
  border-radius: var(--wr-radius-xs) var(--wr-radius-xs) 0 0;
  transition: color var(--wr-motion-fast) var(--wr-ease),
    background var(--wr-motion-fast) var(--wr-ease),
    flex-grow var(--wr-motion-base) var(--wr-ease);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
.wr-sb-tab svg { width: 16px; height: 16px; opacity: 0.8; }
.wr-sb-tab:hover { color: var(--wr-text); background: var(--wr-bg-hover); }
.wr-sb-tab[aria-selected='true'] { color: var(--wr-text); font-weight: 600; }
.wr-sb-tab[aria-selected='true'] svg { opacity: 1; }
/* Compact: only the selected tab shows its label; others are icon-only. */
.wr-sb-tab .wr-sb-tab-label {
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  transition: max-width var(--wr-motion-base) var(--wr-ease),
    opacity var(--wr-motion-fast) var(--wr-ease);
}
.wr-sb-tab[aria-selected='true'] .wr-sb-tab-label {
  max-width: 100px;
  opacity: 1;
}
.wr-sb-tab-ink {
  position: absolute;
  bottom: -1px;
  height: 2px;
  background: var(--wr-accent);
  border-radius: 2px;
  transition: left var(--wr-motion-base) var(--wr-ease-out),
    width var(--wr-motion-base) var(--wr-ease-out);
}
.wr-sb-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: var(--wr-radius-pill);
  background: var(--wr-bg-subtle);
  color: var(--wr-text-secondary);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.wr-sb-tab[aria-selected='true'] .wr-sb-badge {
  background: var(--wr-accent-soft);
  color: var(--wr-accent);
}

/* ---- body ---- */
.wr-sb-body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--wr-space-4);
  animation: wr-sb-fade var(--wr-motion-base) var(--wr-ease-out);
}
@keyframes wr-sb-fade {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
.wr-sb-empty {
  color: var(--wr-text-tertiary);
  text-align: center;
  padding: var(--wr-space-8) var(--wr-space-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--wr-space-2);
}
.wr-sb-empty svg { width: 30px; height: 30px; opacity: 0.5; }
.wr-sb-empty.ok { color: var(--wr-success); }

.wr-sb-skel {
  height: 62px;
  border-radius: var(--wr-radius-card);
  background: linear-gradient(
    100deg,
    var(--wr-bg-subtle) 30%,
    var(--wr-bg-hover) 50%,
    var(--wr-bg-subtle) 70%
  );
  background-size: 220% 100%;
  animation: wr-shimmer 1.3s linear infinite;
  margin-bottom: var(--wr-space-2);
}
@keyframes wr-shimmer { from { background-position: 180% 0; } to { background-position: -80% 0; } }

/* ---- suggestion cards ---- */
.wr-sb-group-title {
  font-size: var(--wr-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--wr-tracking-caps);
  color: var(--wr-text-tertiary);
  margin: var(--wr-space-4) 0 var(--wr-space-2);
}
.wr-sb-group-title:first-child { margin-top: 0; }
.wr-sb-sug {
  position: relative;
  border: 1px solid var(--wr-border);
  border-radius: var(--wr-radius-card);
  padding: var(--wr-space-3);
  margin-bottom: var(--wr-space-2);
  background: var(--wr-bg-elevated);
  box-shadow: var(--wr-shadow-1);
  transition: border-color var(--wr-motion-fast) var(--wr-ease),
    box-shadow var(--wr-motion-fast) var(--wr-ease);
  animation: wr-sb-fade var(--wr-motion-base) var(--wr-ease-out);
}
.wr-sb-sug:hover { box-shadow: var(--wr-shadow-2); }
.wr-sb-sug::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--wr-sug-accent, var(--wr-style));
}
.wr-sb-sug.error { --wr-sug-accent: var(--wr-spelling); }
.wr-sb-sug.warning { --wr-sug-accent: var(--wr-grammar); }
.wr-sb-sug.info { --wr-sug-accent: var(--wr-style); }
/* Category-specific hues override the severity default. */
.wr-sb-sug.src-readability { --wr-sug-accent: var(--wr-readability); }
.wr-sb-sug.src-tone { --wr-sug-accent: var(--wr-tone); }
.wr-sb-sug-cat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--wr-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--wr-tracking-caps);
  color: var(--wr-sug-accent);
}
.wr-sb-sug-cat svg { width: 13px; height: 13px; }
.wr-sb-sug-msg { margin: var(--wr-space-1) 0 var(--wr-space-2); }
.wr-sb-sug-orig {
  font-family: var(--wr-font-mono);
  font-size: 0.95em;
  text-decoration: line-through;
  text-decoration-color: var(--wr-text-tertiary);
  color: var(--wr-text-tertiary);
}
.wr-sb-sug-actions { display: flex; flex-wrap: wrap; gap: 6px; }

.wr-sb-btn {
  appearance: none;
  border: 1px solid var(--wr-border-strong);
  background: var(--wr-bg-elevated);
  color: var(--wr-text);
  border-radius: var(--wr-radius-control);
  padding: 6px 11px;
  font: inherit;
  font-size: var(--wr-text-sm);
  font-weight: 550;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background var(--wr-motion-fast) var(--wr-ease),
    border-color var(--wr-motion-fast) var(--wr-ease),
    transform var(--wr-motion-fast) var(--wr-ease-spring);
}
.wr-sb-btn svg { width: 13px; height: 13px; }
.wr-sb-btn:hover { background: var(--wr-bg-hover); }
.wr-sb-btn:active { transform: scale(0.97); }
.wr-sb-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.wr-sb-btn.primary {
  background: var(--wr-accent);
  border-color: var(--wr-accent);
  color: var(--wr-accent-contrast);
  font-weight: 600;
}
.wr-sb-btn.primary:hover { background: var(--wr-accent-hover); }
.wr-sb-btn.link {
  border: none;
  background: none;
  color: var(--wr-accent);
  padding: 6px 4px;
}
.wr-sb-btn.link:hover { background: var(--wr-accent-soft); }
.wr-sb-btn.subtle { border-color: transparent; background: var(--wr-bg-subtle); }

/* ---- statistics ---- */
.wr-sb-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--wr-space-2);
}
.wr-sb-stat {
  padding: var(--wr-space-3);
  border-radius: var(--wr-radius-card);
  background: var(--wr-bg-subtle);
}
.wr-sb-stat b {
  display: block;
  font-size: var(--wr-text-2xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.wr-sb-stat span { color: var(--wr-text-secondary); font-size: var(--wr-text-sm); }
.wr-sb-section-h {
  font-weight: 650;
  margin: var(--wr-space-5) 0 var(--wr-space-2);
  display: flex;
  align-items: center;
  gap: 6px;
}
.wr-sb-section-h svg { width: 15px; height: 15px; color: var(--wr-text-tertiary); }
.wr-sb-metric {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--wr-space-3);
  padding: 7px 0;
  border-bottom: 1px solid var(--wr-border);
}
.wr-sb-metric:last-child { border-bottom: none; }
.wr-sb-metric b { font-variant-numeric: tabular-nums; font-weight: 600; }
.wr-sb-note { color: var(--wr-text-secondary); font-size: var(--wr-text-sm); margin: var(--wr-space-1) 0; }

/* ---- tone meter ---- */
.wr-sb-tone-label { font-size: var(--wr-text-lg); font-weight: 650; margin-bottom: var(--wr-space-1); }
.wr-sb-tone-row {
  display: grid;
  grid-template-columns: 96px 1fr 34px;
  align-items: center;
  gap: var(--wr-space-2);
  margin: 6px 0;
  font-size: var(--wr-text-sm);
}
.wr-sb-tone-row span:last-child {
  text-align: right;
  color: var(--wr-text-tertiary);
  font-variant-numeric: tabular-nums;
}
.wr-sb-tone-bar { height: 7px; background: var(--wr-bg-subtle); border-radius: var(--wr-radius-pill); overflow: hidden; }
.wr-sb-tone-bar i {
  display: block;
  height: 100%;
  background: var(--wr-accent);
  border-radius: inherit;
  transition: width var(--wr-motion-slow) var(--wr-ease-out);
}
.wr-sb-tone-row.top .wr-sb-tone-bar i { background: var(--wr-accent); }
.wr-sb-select {
  width: 100%;
  padding: 8px 32px 8px 11px;
  border: 1px solid var(--wr-border-strong);
  border-radius: var(--wr-radius-control);
  background: var(--wr-bg-elevated);
  color: inherit;
  font: inherit;
  margin-top: var(--wr-space-2);
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: right 14px center, right 9px center;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}
.wr-sb-guidance {
  margin: var(--wr-space-2) 0 0;
  padding-left: var(--wr-space-4);
  color: var(--wr-text-secondary);
  font-size: var(--wr-text-sm);
}
.wr-sb-guidance li { margin: 4px 0; }

/* ---- rewrite diff ---- */
.wr-sb-diff {
  border: 1px solid var(--wr-border);
  border-radius: var(--wr-radius-card);
  padding: var(--wr-space-3);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 280px;
  overflow: auto;
  font-size: var(--wr-text-sm);
  line-height: 1.6;
  margin: var(--wr-space-2) 0;
  background: var(--wr-bg-subtle);
}
.wr-sb-diff ins {
  background: color-mix(in srgb, var(--wr-success) 24%, transparent);
  text-decoration: none;
  border-radius: 3px;
  padding: 0 1px;
}
.wr-sb-diff del {
  background: color-mix(in srgb, var(--wr-error) 22%, transparent);
  border-radius: 3px;
  padding: 0 1px;
}
.wr-sb-diff-actions { display: flex; gap: var(--wr-space-2); margin-top: var(--wr-space-2); }

/* ---- "analyze text" fallback for unsupported editors (§3.9, §5.1) ---- */
.wr-sb-analyze-in {
  width: 100%;
  min-height: 120px;
  resize: vertical;
  font: inherit;
  color: var(--wr-text);
  background: var(--wr-bg);
  border: 1px solid var(--wr-border-strong);
  border-radius: var(--wr-radius-control);
  padding: var(--wr-space-3);
  margin: var(--wr-space-2) 0;
}

/* ---- launcher: fixed pill (no field to anchor to yet) ---- */
.wr-launcher {
  position: fixed;
  right: 18px;
  bottom: 18px;
  pointer-events: auto;
  border: 1px solid var(--wr-border);
  background: var(--wr-bg-elevated);
  color: var(--wr-text);
  border-radius: var(--wr-radius-pill);
  box-shadow: var(--wr-shadow-3);
  padding: 9px 15px 9px 12px;
  font-family: var(--wr-font-sans);
  font-size: var(--wr-text-sm);
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: transform var(--wr-motion-base) var(--wr-ease-spring),
    box-shadow var(--wr-motion-base) var(--wr-ease);
  animation: wr-launcher-in var(--wr-motion-slow) var(--wr-ease-spring);
}
/* [hidden] out-specifies the plain class rule, so it reliably wins over the
   unconditional "display: flex" above — author CSS beats the User-Agent
   default [hidden] rule once a selector sets its own display. */
.wr-launcher[hidden] { display: none; }
/* ---- launcher: anchored to the focused field's own corner (§8) ----
   A small, translucent icon-only glyph, Grammarly-style — no label, no dot, and
   crucially NO opaque background in its resting state, so it never blocks the
   text it sits near. It straddles the field's bottom-right corner (positioned
   inline by SidebarLauncher). Only hover / focus gives it a real button look. */
.wr-launcher.anchored {
  right: auto;
  bottom: auto;
  width: 20px;
  height: 20px;
  padding: 0;
  gap: 0;
  border: none;
  /* A small disc — small enough and placed past the field edge so it isn't
     "competing", but a real, theme-safe surface (a bare glyph vanishes on a
     page whose colour happens to match). */
  background: var(--wr-bg-elevated);
  box-shadow: 0 0 0 1px var(--wr-border), 0 1px 3px rgba(0, 0, 0, 0.22);
  border-radius: 50%;
  justify-content: center;
  opacity: 0.7;
  transition: opacity var(--wr-motion-base) var(--wr-ease),
    transform var(--wr-motion-base) var(--wr-ease-spring),
    box-shadow var(--wr-motion-base) var(--wr-ease);
}
.wr-launcher.anchored svg { width: 12px; height: 12px; }
/* Fuller weight on hover / focus, or once there's a count to flag — idle it
   stays understated (§8, per Grammarly/QuillBot's own field icon). */
.wr-launcher.anchored:has(.wr-launcher-count:not([hidden])) { opacity: 1; }
.wr-launcher.anchored:hover,
.wr-launcher.anchored:focus-visible {
  opacity: 1;
  box-shadow: 0 0 0 1px var(--wr-border), var(--wr-shadow-2);
}
.wr-launcher.anchored .wr-launcher-dot { display: none; }
.wr-launcher.anchored .wr-launcher-label { display: none; }
.wr-launcher.anchored .wr-launcher-count {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 13px;
  height: 13px;
  padding: 0 2px;
  border-radius: 999px;
  background: var(--wr-grammar);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 13px;
  box-shadow: 0 0 0 1.5px var(--wr-bg), 0 1px 2px rgba(0, 0, 0, 0.4);
}
@keyframes wr-launcher-in {
  from { opacity: 0; transform: translateY(10px) scale(0.9); }
  to { opacity: 1; transform: none; }
}
.wr-launcher:hover { transform: translateY(-1px); box-shadow: var(--wr-shadow-4); }
.wr-launcher:active { transform: scale(0.97); }
.wr-launcher svg { width: 15px; height: 15px; }
.wr-launcher .wr-launcher-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--wr-success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--wr-success) 25%, transparent);
}
.wr-launcher .wr-launcher-dot.warn {
  background: var(--wr-grammar);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--wr-grammar) 25%, transparent);
}
.wr-launcher .wr-launcher-dot.off {
  background: var(--wr-text-tertiary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--wr-text-tertiary) 20%, transparent);
}
.wr-launcher.resume {
  color: var(--wr-text-secondary);
  border-style: dashed;
}
.wr-launcher.resume svg { opacity: 0.6; }
.wr-launcher .wr-launcher-count {
  font-variant-numeric: tabular-nums;
  background: var(--wr-bg-subtle);
  border-radius: var(--wr-radius-pill);
  padding: 1px 7px;
  font-size: 11px;
}

.wr-sb :focus-visible {
  outline: 2px solid var(--wr-focus-ring);
  outline-offset: 2px;
  border-radius: var(--wr-radius-xs);
}

/* ---- Assistant (AI) panel (§4.6, §4.7) ---- */
.wr-sb-ai-status {
  display: flex;
  align-items: center;
  gap: var(--wr-space-2);
  font-size: var(--wr-text-sm);
  font-weight: 600;
  padding: 8px 11px;
  border-radius: var(--wr-radius-control);
  background: var(--wr-bg-subtle);
  border: 1px solid var(--wr-border);
  margin-bottom: var(--wr-space-3);
}
.wr-sb-ai-status svg { width: 14px; height: 14px; color: var(--wr-tone); flex: none; }
.wr-sb-ai-status.ready svg { color: var(--wr-success); }
.wr-sb-ai-privacy {
  border: 1px solid var(--wr-border);
  border-radius: var(--wr-radius-card);
  padding: var(--wr-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--wr-space-2);
  background: var(--wr-bg-subtle);
}
.wr-sb-ai-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin: var(--wr-space-2) 0;
}
.wr-sb-ai-actions .wr-sb-btn { width: 100%; justify-content: flex-start; }

/* Compact tone-mode strip on the Suggestions tab (§4.6). */
.wr-sb-rw-shortcut {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: var(--wr-space-2) 0 var(--wr-space-3);
  margin-bottom: var(--wr-space-2);
  border-bottom: 1px solid var(--wr-border);
}
.wr-sb-rw-shortcut-label {
  font-size: var(--wr-text-sm);
  color: var(--wr-text-tertiary);
  margin-right: 2px;
}
.wr-sb-rw-shortcut .wr-sb-btn {
  padding: 3px 8px;
  font-size: var(--wr-text-sm);
}
.wr-sb-ai-busy {
  display: flex;
  align-items: center;
  gap: var(--wr-space-2);
  font-size: var(--wr-text-sm);
  color: var(--wr-text-secondary);
  padding: var(--wr-space-2) 0;
}
.wr-sb-ai-busy::before {
  content: '';
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--wr-border);
  border-top-color: var(--wr-accent);
  animation: wr-spin 0.7s linear infinite;
}
@keyframes wr-spin { to { transform: rotate(360deg); } }
.wr-sb-ai-err { color: var(--wr-error); }
.wr-sb-ai-progress {
  height: 6px;
  border-radius: 3px;
  background: var(--wr-bg-subtle);
  overflow: hidden;
  margin: var(--wr-space-2) 0;
}
.wr-sb-ai-progress-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--wr-accent);
  transition: width var(--wr-motion-base) var(--wr-ease);
}
.wr-sb-ai-progress.indeterminate .wr-sb-ai-progress-fill {
  width: 40%;
  animation: wr-sb-ai-progress-slide 1.2s ease-in-out infinite;
}
@keyframes wr-sb-ai-progress-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
@media (prefers-reduced-motion: reduce) {
  .wr-sb-ai-progress.indeterminate .wr-sb-ai-progress-fill { animation: none; width: 100%; opacity: 0.5; }
}
.wr-sb-ai-preview {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--wr-bg-subtle);
  border: 1px solid var(--wr-border);
  border-radius: var(--wr-radius-card);
  padding: var(--wr-space-3);
  font-size: var(--wr-text-sm);
  line-height: 1.6;
  margin: var(--wr-space-2) 0;
  max-height: 40vh;
  overflow-y: auto;
}
/* Blinking caret while tokens are still streaming in (§4.8). */
.wr-sb-ai-preview.streaming::after {
  content: '';
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 1px;
  vertical-align: text-bottom;
  background: var(--wr-accent);
  animation: wr-sb-caret 1s step-end infinite;
}
@keyframes wr-sb-caret {
  50% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .wr-sb-ai-preview.streaming::after { animation: none; }
}
.wr-sb-chat-log {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 36vh;
  overflow-y: auto;
  margin: var(--wr-space-2) 0;
  padding-right: 2px;
}
.wr-sb-chat-turn {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: var(--wr-space-2) var(--wr-space-3);
  border-radius: var(--wr-radius-card);
  font-size: var(--wr-text-sm);
  line-height: 1.5;
  max-width: 92%;
  animation: wr-sb-fade var(--wr-motion-fast) var(--wr-ease-out);
}
.wr-sb-chat-turn.user {
  align-self: flex-end;
  background: var(--wr-accent);
  color: var(--wr-accent-contrast);
  border-bottom-right-radius: 4px;
}
.wr-sb-chat-turn.assistant {
  align-self: flex-start;
  background: var(--wr-bg-subtle);
  border: 1px solid var(--wr-border);
  border-bottom-left-radius: 4px;
}
.wr-sb-chat-form { display: flex; gap: 6px; align-items: flex-end; }
.wr-sb-chat-input {
  flex: 1;
  resize: vertical;
  min-height: 2.6em;
  max-height: 30vh;
  font: inherit;
  color: var(--wr-text);
  background: var(--wr-bg);
  border: 1px solid var(--wr-border-strong);
  border-radius: var(--wr-radius-control);
  padding: 8px 10px;
}
.wr-sb-chat-input:focus { border-color: var(--wr-accent); outline: none; }
.wr-sb-chat-form .wr-sb-btn { padding: 8px 12px; }
.wr-sb-typing {
  letter-spacing: 3px;
  color: var(--wr-text-tertiary);
  animation: wr-typing 1.2s ease-in-out infinite;
}
@keyframes wr-typing { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }

/* Simple Mode (§9.5) — bigger text and targets, plainer, calmer. */
[data-wr-simple='true'] .wr-sb { font-size: 15px; line-height: 1.6; }
[data-wr-simple='true'] .wr-sb-tab { padding: 10px 12px; }
[data-wr-simple='true'] .wr-sb-tab svg { width: 20px; height: 20px; }
[data-wr-simple='true'] .wr-sb-tab-label { font-size: 14px; }
[data-wr-simple='true'] .wr-sb-sug { padding: 14px; }
[data-wr-simple='true'] .wr-sb-sug-msg { font-size: 15px; }
[data-wr-simple='true'] .wr-sb-btn {
  font-size: 15px;
  padding: 9px 14px;
  min-height: 42px;
}
[data-wr-simple='true'] .wr-sb-btn.link { min-height: 0; }
[data-wr-simple='true'] .wr-sb-group-title { font-size: 13px; }
[data-wr-simple='true'] .wr-sb-close { width: 40px; height: 40px; }
[data-wr-simple='true'] .wr-sb-score b { font-size: 18px; }

/*
 * Forced-colors / high-contrast (§9.5). Keep the accent-bar cues, the active
 * tab, and the primary action legible when the OS overrides our palette.
 */
@media (forced-colors: active) {
  .wr-sb { border-left: 1px solid CanvasText; }
  .wr-sb-sug { border-color: CanvasText; }
  .wr-sb-sug::before { background: CanvasText; forced-color-adjust: none; }
  .wr-sb-btn.primary {
    background: Highlight;
    color: HighlightText;
    border-color: Highlight;
  }
  .wr-sb-tab[aria-selected='true'] { color: Highlight; }
  .wr-sb-tab-ink { background: Highlight; forced-color-adjust: none; }
  .wr-sb-score .fill { stroke: Highlight; forced-color-adjust: none; }
}
`;
