/** Suggestion popover styles, injected into the Shadow DOM host (§9.7). */
export const POPOVER_CSS = `
.wr-pop {
  position: fixed;
  z-index: 2147483647;
  max-width: 344px;
  min-width: 248px;
  background: var(--wr-bg-elevated);
  color: var(--wr-text);
  border: 1px solid var(--wr-border);
  border-radius: var(--wr-radius-popover);
  box-shadow: var(--wr-shadow-3);
  padding: var(--wr-space-3) var(--wr-space-3) var(--wr-space-2);
  font-family: var(--wr-font-sans);
  font-size: var(--wr-text-md);
  line-height: var(--wr-leading);
  pointer-events: auto;
  transform-origin: var(--wr-pop-origin, top left);
  animation: wr-pop-in var(--wr-motion-base) var(--wr-ease-out);
}
@media (prefers-reduced-motion: reduce) {
  .wr-pop { animation: none; }
}
@keyframes wr-pop-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.96); }
  to { opacity: 1; transform: none; }
}

.wr-pop-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: var(--wr-space-2);
}
.wr-pop-cat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 650;
  font-size: var(--wr-text-xs);
  text-transform: uppercase;
  letter-spacing: var(--wr-tracking-caps);
}
.wr-pop-cat svg { width: 14px; height: 14px; }
.wr-pop-cat.error { color: var(--wr-spelling); }
.wr-pop-cat.warning { color: var(--wr-grammar); }
.wr-pop-cat.info { color: var(--wr-style); }
.wr-pop-cat.ai { color: var(--wr-tone); }
.wr-pop-close {
  margin-left: auto;
  appearance: none;
  border: none;
  background: none;
  color: var(--wr-text-tertiary);
  cursor: pointer;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: var(--wr-radius-xs);
  transition: background var(--wr-motion-fast) var(--wr-ease);
}
.wr-pop-close:hover { background: var(--wr-bg-hover); color: var(--wr-text); }

.wr-pop-msg { margin: 0 0 var(--wr-space-3); }
.wr-pop-orig {
  font-family: var(--wr-font-mono);
  font-size: 0.95em;
  background: var(--wr-bg-subtle);
  border-radius: var(--wr-radius-xs);
  padding: 1px 5px;
  text-decoration: line-through;
  text-decoration-color: var(--wr-text-tertiary);
}

.wr-pop-repls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: var(--wr-space-2);
}
.wr-pop-repl {
  appearance: none;
  border: 1px solid var(--wr-accent);
  background: var(--wr-accent);
  color: var(--wr-accent-contrast);
  border-radius: var(--wr-radius-control);
  padding: 6px 10px 6px 12px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  transition:
    transform var(--wr-motion-fast) var(--wr-ease-spring),
    filter var(--wr-motion-fast) var(--wr-ease);
}
.wr-pop-repl:hover { filter: brightness(1.06); }
.wr-pop-repl:active { transform: scale(0.97); }
.wr-pop-repl .wr-kbd {
  font-family: var(--wr-font-mono);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--wr-accent-contrast) 22%, transparent);
}
.wr-pop-repl.secondary {
  background: var(--wr-bg-elevated);
  color: var(--wr-text);
  border-color: var(--wr-border-strong);
  font-weight: 550;
}
.wr-pop-repl.secondary .wr-kbd {
  background: var(--wr-bg-subtle);
  color: var(--wr-text-secondary);
}
.wr-pop-repl.remove::after { content: 'remove'; opacity: 0.7; font-weight: 500; }

.wr-pop-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 4px;
  border-top: 1px solid var(--wr-border);
  padding-top: 6px;
  margin-top: 2px;
}
.wr-pop-action {
  appearance: none;
  background: none;
  border: none;
  color: var(--wr-text-secondary);
  font: inherit;
  font-size: var(--wr-text-sm);
  cursor: pointer;
  padding: 5px 8px;
  border-radius: var(--wr-radius-xs);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: background var(--wr-motion-fast) var(--wr-ease);
}
.wr-pop-action:hover { background: var(--wr-bg-hover); color: var(--wr-text); }
.wr-pop-action svg { width: 13px; height: 13px; }
.wr-pop-action.accent { color: var(--wr-accent); }

.wr-pop :focus-visible {
  outline: 2px solid var(--wr-focus-ring);
  outline-offset: 2px;
  border-radius: var(--wr-radius-xs);
}

/* "Explain more" panel — what / why / example (§3.7) */
.wr-pop-explain {
  margin: var(--wr-space-2) -2px 0;
  padding: var(--wr-space-2) var(--wr-space-2) 2px;
  border-radius: var(--wr-radius-sm);
  background: var(--wr-bg-subtle);
  font-size: var(--wr-text-sm);
  animation: wr-explain-in var(--wr-motion-base) var(--wr-ease-out);
}
@keyframes wr-explain-in {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: none; }
}
.wr-pop-explain dl { margin: 0; display: grid; gap: var(--wr-space-2); }
.wr-pop-explain dt {
  font-weight: 700;
  font-size: var(--wr-text-xs);
  text-transform: uppercase;
  letter-spacing: var(--wr-tracking-caps);
  color: var(--wr-text-tertiary);
  margin-bottom: 1px;
}
.wr-pop-explain dd { margin: 0; color: var(--wr-text-secondary); }
.wr-pop-explain dd code {
  font-family: var(--wr-font-mono);
  font-size: 0.95em;
  background: var(--wr-bg);
  border: 1px solid var(--wr-border);
  border-radius: 4px;
  padding: 0 4px;
}

/* "Find a better word" synonym chips (§11.3). */
.wr-pop-synonyms {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 6px;
  padding-top: var(--wr-space-2);
  margin-top: var(--wr-space-1);
  border-top: 1px solid var(--wr-border);
}
.wr-pop-syn-chip {
  appearance: none;
  border: 1px solid var(--wr-border);
  background: var(--wr-bg-subtle);
  color: var(--wr-text);
  border-radius: var(--wr-radius-pill);
  padding: 3px 10px;
  font: inherit;
  font-size: var(--wr-text-sm);
  cursor: pointer;
  transition: background var(--wr-motion-fast) var(--wr-ease);
}
.wr-pop-syn-chip:hover { background: var(--wr-accent-soft); }
.wr-pop-syn-empty { color: var(--wr-text-tertiary); font-size: var(--wr-text-sm); }
@media (forced-colors: active) {
  .wr-pop-syn-chip { border-color: CanvasText; }
}

/* Simple Mode (§9.5) — bigger, plainer suggestion card. */
[data-wr-simple='true'] .wr-pop {
  width: min(360px, calc(100vw - 24px));
  font-size: 15px;
  line-height: 1.55;
}
[data-wr-simple='true'] .wr-pop-msg { font-size: 15px; }
[data-wr-simple='true'] .wr-pop-repl {
  font-size: 16px;
  padding: 10px 12px;
  min-height: 44px;
}
[data-wr-simple='true'] .wr-pop-repl .wr-kbd { display: none; }
[data-wr-simple='true'] .wr-pop-action {
  font-size: 14px;
  padding: 9px 12px;
  min-height: 40px;
}
[data-wr-simple='true'] .wr-pop-cat { font-size: 13px; }
[data-wr-simple='true'] .wr-pop-close { width: 40px; height: 40px; }
[data-wr-simple='true'] .wr-pop-syn-chip {
  padding: 9px 16px;
  font-size: 15px;
  min-height: 40px;
}
`;
