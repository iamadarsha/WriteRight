import { useState } from 'react';
import { browser } from '#imports';
import type { AiSettings } from '@/types/settings';
import type { AiProbeResult, AiProviderId } from '@/ai/ai-types';
import type { SettingsPatch } from '@/types/messages';
import { Section } from './Section';
import { Toggle } from './Toggle';
import { useAiCapability } from '@/ui/hooks/useAiCapability';
import { sendToBackground } from '@/messaging';
import { checkLoopback, LOOPBACK_HOST_PERMISSIONS } from '@/ai/loopback';

const LOOPBACK_ORIGINS = [...LOOPBACK_HOST_PERMISSIONS];

const PROVIDERS: Array<{ value: AiSettings['provider']; label: string }> = [
  { value: 'auto', label: 'Automatic (use whatever is ready)' },
  { value: 'chrome', label: 'Chrome built-in (on-device)' },
  { value: 'ollama', label: 'Ollama (local)' },
  { value: 'lmstudio', label: 'LM Studio (local)' },
  { value: 'custom', label: 'Other local OpenAI-compatible server' },
];

interface Props {
  ai: AiSettings;
  aiEnabled: boolean;
  /** True when strict privacy mode has force-disabled AI (§4.1 #26). */
  locked?: boolean;
  update: (patch: SettingsPatch) => void | Promise<unknown>;
}

/**
 * Local-AI configuration (§4, §14.5). Everything here is inert until "Local AI
 * features" is on. Endpoints are loopback-only (enforced in loopback.ts);
 * host access to localhost is already covered by the extension's install-time
 * grant, so `ensureLoopbackPermission` below is a defensive no-op today, kept
 * in case a future build ever narrows host_permissions.
 */
export function AiSettingsSection({
  ai,
  aiEnabled,
  locked = false,
  update,
}: Props): React.JSX.Element {
  const { capability, refresh } = useAiCapability();
  const [probe, setProbe] = useState<Record<string, AiProbeResult | 'testing'>>(
    {},
  );
  const [models, setModels] = useState<Record<string, readonly string[]>>({});

  const patchAi = (p: Partial<AiSettings>): void => void update({ ai: p });

  async function ensureLoopbackPermission(): Promise<boolean> {
    try {
      const has = await browser.permissions.contains({
        origins: LOOPBACK_ORIGINS,
      });
      if (has) return true;
      return await browser.permissions.request({ origins: LOOPBACK_ORIGINS });
    } catch {
      // Some browsers don't gate loopback behind a prompt — proceed and let
      // the connection test surface any real failure.
      return true;
    }
  }

  async function testConnection(
    provider: AiProviderId,
    endpoint: string,
  ): Promise<void> {
    if (provider !== 'chrome') {
      const c = checkLoopback(endpoint);
      if (!c.ok) {
        setProbe((p) => ({
          ...p,
          [provider]: {
            id: provider,
            state: 'unavailable',
            detail: `Not a loopback address — ${c.reason}. WriteRight only connects to a model server on your own machine.`,
          },
        }));
        return;
      }
      const granted = await ensureLoopbackPermission();
      if (!granted) {
        setProbe((p) => ({
          ...p,
          [provider]: {
            id: provider,
            state: 'unavailable',
            detail: 'Permission to reach localhost was declined.',
          },
        }));
        return;
      }
    }
    setProbe((p) => ({ ...p, [provider]: 'testing' }));
    const res = await sendToBackground({
      type: 'AI_TEST_CONNECTION',
      provider,
      endpoint: provider === 'chrome' ? undefined : endpoint,
    });
    setProbe((p) => ({
      ...p,
      [provider]: res.ok
        ? res.data.probe
        : { id: provider, state: 'unavailable', detail: res.error },
    }));
    if (res.ok && res.data.probe.state === 'ready') {
      const list = await sendToBackground({
        type: 'AI_LIST_MODELS',
        provider,
        endpoint: provider === 'chrome' ? undefined : endpoint,
      });
      if (list.ok) setModels((m) => ({ ...m, [provider]: list.data.models }));
    }
    void refresh(true);
  }

  function probeLine(provider: string): React.JSX.Element | null {
    const p = probe[provider];
    if (!p) return null;
    if (p === 'testing') return <p className="wr-muted">Testing…</p>;
    return (
      <p className={p.state === 'ready' ? 'wr-ok' : 'wr-muted'}>
        {p.state === 'ready' ? '✓ ' : ''}
        {p.detail}
      </p>
    );
  }

  function endpointRow(
    provider: 'ollama' | 'lmstudio' | 'custom',
    endpoint: string,
    setEndpoint: (v: string) => void,
    model: string,
    setModel: (v: string) => void,
  ): React.JSX.Element {
    const known = models[provider] ?? [];
    return (
      <div className="wr-ai-provider">
        <div className="wr-toggle-row">
          <span className="wr-toggle-text">
            <span className="wr-toggle-label">Endpoint (loopback only)</span>
            <span className="wr-toggle-desc">
              e.g. http://localhost:{provider === 'ollama' ? '11434' : '1234'} —
              only localhost / 127.0.0.1 is accepted.
            </span>
          </span>
          <input
            className="wr-input"
            type="text"
            aria-label="Local AI endpoint"
            inputMode="url"
            value={endpoint}
            placeholder="http://localhost:11434"
            onChange={(e) => setEndpoint(e.currentTarget.value)}
          />
        </div>
        <div className="wr-toggle-row">
          <span className="wr-toggle-text">
            <span className="wr-toggle-label">Model</span>
          </span>
          {known.length > 0 ? (
            <select
              className="wr-select"
              aria-label="Local AI model"
              value={model}
              onChange={(e) => setModel(e.currentTarget.value)}
            >
              <option value="">First available</option>
              {known.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="wr-input"
              type="text"
              aria-label="Local AI model"
              value={model}
              placeholder="(auto)"
              onChange={(e) => setModel(e.currentTarget.value)}
            />
          )}
        </div>
        <button
          className="wr-btn"
          onClick={() => void testConnection(provider, endpoint)}
        >
          Test connection
        </button>
        {probeLine(provider)}
      </div>
    );
  }

  return (
    <Section
      title="Local AI"
      description="Optional. Generative rewrites and chat that run on-device or on a model server you run locally — never a paid cloud API. WriteRight works fully without this."
    >
      <Toggle
        label="Local AI features"
        description="Master switch. Off by default. When on, WriteRight can use Chrome's on-device model or a local Ollama / LM Studio server."
        checked={aiEnabled}
        disabled={locked}
        onChange={(v) => void update({ features: { ai: v } })}
      />
      {locked ? (
        <p className="wr-muted">
          Turned off by <strong>Strict privacy mode</strong>. Disable that in
          Privacy to use local AI.
        </p>
      ) : null}

      {!aiEnabled ? null : (
        <>
          <p
            className="wr-privacy-note"
            style={{ marginTop: 'var(--wr-space-2)' }}
          >
            <strong>Status:</strong> {capability?.label ?? 'Checking…'}
            {'  '}
            <button className="wr-link-btn" onClick={() => void refresh(true)}>
              Re-check
            </button>
          </p>

          <div className="wr-toggle-row">
            <span className="wr-toggle-text">
              <span className="wr-toggle-label">Preferred engine</span>
              <span className="wr-toggle-desc">
                “Automatic” tries Chrome on-device first, then any local server.
              </span>
            </span>
            <select
              className="wr-select"
              aria-label="Preferred local AI engine"
              value={ai.provider}
              onChange={(e) =>
                patchAi({
                  provider: e.currentTarget.value as AiSettings['provider'],
                })
              }
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {(ai.provider === 'chrome' || ai.provider === 'auto') && (
            <div className="wr-ai-provider">
              <p className="wr-toggle-label">Chrome built-in (on-device)</p>
              <p className="wr-toggle-desc">
                Uses the browser’s own on-device model. The first use may
                download the model; that download never includes your text.
              </p>
              <button
                className="wr-btn"
                onClick={() => void testConnection('chrome', '')}
              >
                Check availability
              </button>
              {probeLine('chrome')}
            </div>
          )}

          {(ai.provider === 'ollama' || ai.provider === 'auto') &&
            endpointRow(
              'ollama',
              ai.ollamaEndpoint,
              (v) => patchAi({ ollamaEndpoint: v }),
              ai.ollamaModel,
              (v) => patchAi({ ollamaModel: v }),
            )}

          {(ai.provider === 'lmstudio' || ai.provider === 'auto') &&
            endpointRow(
              'lmstudio',
              ai.lmStudioEndpoint,
              (v) => patchAi({ lmStudioEndpoint: v }),
              ai.lmStudioModel,
              (v) => patchAi({ lmStudioModel: v }),
            )}

          {ai.provider === 'custom' &&
            endpointRow(
              'custom',
              ai.customEndpoint,
              (v) => patchAi({ customEndpoint: v }),
              ai.customModel,
              (v) => patchAi({ customModel: v }),
            )}

          <Toggle
            label="Allow whole-field AI edits"
            description="Off by default. When on, a sidebar AI action with nothing selected runs on the entire field. With it off, a broad rewrite always needs a selection first (§4.5)."
            checked={ai.enhancedReview}
            onChange={(v) => patchAi({ enhancedReview: v })}
          />
          <Toggle
            label="Keep AI chat history on this device"
            description="Off by default. When on, the assistant transcript is stored locally between sessions."
            checked={ai.keepChatHistory}
            onChange={(v) => patchAi({ keepChatHistory: v })}
          />
        </>
      )}
    </Section>
  );
}
