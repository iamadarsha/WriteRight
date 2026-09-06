/**
 * AI router (§4.5).
 *
 * The router classifies a request *before* choosing an engine. There is no
 * rule that "no local finding → send to AI": generative work is only ever done
 * on an explicit user action, and only if a local generative engine is
 * actually available. When it is not, the router returns an honest limitation
 * message — never a cloud upsell (§4.9).
 */

import type {
  AiCapability,
  AiTask,
  AiTaskClass,
  AiProviderId,
} from './ai-types';

const GENERATIVE_TASKS: ReadonlySet<AiTask> = new Set<AiTask>([
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
  'chat',
]);

export function classifyTask(task: AiTask): AiTaskClass {
  return GENERATIVE_TASKS.has(task) ? 'generative' : 'unsupported';
}

export type RouteDecision =
  | { mode: 'generative'; provider: AiProviderId; model: string | null }
  | { mode: 'deterministic'; hint: string }
  | { mode: 'unsupported'; reason: string };

export interface RouteRequest {
  readonly task: AiTask;
  /** Characters of the text the action is about (0 for chat). */
  readonly selectionChars: number;
  /** True when the action would run on the whole field (nothing selected). */
  readonly whole?: boolean;
}

const MAX_SELECTION_CHARS = 8000;

export function route(
  req: RouteRequest,
  capability: AiCapability,
): RouteDecision {
  const klass = classifyTask(req.task);

  if (klass === 'unsupported') {
    return {
      mode: 'unsupported',
      reason: 'That is not something WriteRight can do.',
    };
  }

  if (req.task !== 'chat' && req.selectionChars === 0) {
    return {
      mode: 'deterministic',
      hint: 'Click into a text field with some text first.',
    };
  }
  // A broad rewrite (whole field, nothing selected) stays user-invoked by
  // default: it needs a selection, or the explicit "Allow whole-field AI
  // edits" setting (§4.5).
  if (req.task !== 'chat' && req.whole && !capability.enhancedReview) {
    return {
      mode: 'deterministic',
      hint: 'Select the part you want to change, or turn on "Allow whole-field AI edits" in Settings to let AI actions run on the whole field.',
    };
  }
  if (req.selectionChars > MAX_SELECTION_CHARS) {
    return {
      mode: 'deterministic',
      hint: `Selection is too large for a single AI pass (max ${MAX_SELECTION_CHARS} characters). Try a paragraph at a time.`,
    };
  }

  if (!capability.enabled) {
    return {
      mode: 'unsupported',
      reason:
        'Local AI is turned off. Your offline grammar and writing tools are still working.',
    };
  }

  const active = pickProvider(capability);
  if (!active) {
    return {
      mode: 'unsupported',
      reason: firstBlockingReason(capability),
    };
  }

  const probe = capability.providers.find((p) => p.id === active);
  return { mode: 'generative', provider: active, model: probe?.model ?? null };
}

function pickProvider(capability: AiCapability): AiProviderId | null {
  return capability.active;
}

/** Turn the probe states into one honest sentence (§4.9). */
function firstBlockingReason(capability: AiCapability): string {
  const chrome = capability.providers.find((p) => p.id === 'chrome');
  if (chrome?.state === 'downloadable') {
    return "Chrome's on-device AI needs a one-time model download. Open it once from Settings, or connect Ollama or LM Studio locally.";
  }
  if (chrome?.state === 'downloading') {
    return "Chrome's on-device AI is still downloading its model. Try again shortly.";
  }
  const anyLocal = capability.providers.find(
    (p) => p.id === 'ollama' || p.id === 'lmstudio' || p.id === 'custom',
  );
  if (anyLocal) return anyLocal.detail;
  return "Chrome's on-device AI is not ready on this device. You can connect Ollama or LM Studio locally.";
}
