import { useEffect, useState } from 'react';
import type { Diagnostics } from '@/types/messages';
import type { Dialect, ThemePreference } from '@/types/settings';
import { useSettings } from '@/ui/hooks/useSettings';
import { useAppliedTheme } from '@/ui/hooks/useAppliedTheme';
import { useSiteRules } from '@/ui/hooks/useSiteRules';
import { Toggle } from '@/ui/components/Toggle';
import { Section } from '@/ui/components/Section';
import { Icon } from '@/ui/components/Icon';
import { AiSettingsSection } from '@/ui/components/AiSettingsSection';
import { DictionarySection } from '@/ui/components/DictionarySection';
import { FORMAT_PRESETS } from '@/engine/format-presets';
import { sendToBackground } from '@/messaging';
import { originLabel } from '@/utils/url';
import type { IconName } from '@/ui/icons';

const DIALECTS: Array<{ value: Dialect; label: string }> = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'en-CA', label: 'English (Canada)' },
  { value: 'en-AU', label: 'English (Australia)' },
  { value: 'en-IN', label: 'English (India)' },
];

const THEMES: Array<{ value: ThemePreference; label: string; icon: IconName }> =
  [
    { value: 'system', label: 'System', icon: 'gauge' },
    { value: 'light', label: 'Light', icon: 'sparkle' },
    { value: 'dark', label: 'Dark', icon: 'eye-off' },
  ];

const NAV: Array<{ id: string; label: string; icon: IconName }> = [
  { id: 'general', label: 'General', icon: 'gauge' },
  { id: 'appearance', label: 'Appearance', icon: 'style' },
  { id: 'checks', label: 'Checks', icon: 'check' },
  { id: 'vocabulary', label: 'Vocabulary', icon: 'define' },
  { id: 'dictionary', label: 'Dictionary', icon: 'book' },
  { id: 'ai', label: 'Local AI', icon: 'sparkle' },
  { id: 'privacy', label: 'Privacy', icon: 'shield' },
  { id: 'sites', label: 'Sites', icon: 'eye-off' },
  { id: 'diagnostics', label: 'Diagnostics', icon: 'info' },
];

export function OptionsApp(): React.JSX.Element {
  const { settings, loading, update } = useSettings();
  const sites = useSiteRules();
  useAppliedTheme(settings);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [activeNav, setActiveNav] = useState('general');

  useEffect(() => {
    void sendToBackground({ type: 'GET_DIAGNOSTICS' }).then((res) => {
      if (res.ok) setDiagnostics(res.data);
    });
  }, [settings]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveNav(e.target.id);
        }
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );
    for (const { id } of NAV) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [loading]);

  if (loading) {
    return (
      <main className="wr-app wr-options">
        <p className="wr-muted">Loading settings…</p>
      </main>
    );
  }

  const disabledSites = sites.rules.filter((r) => !r.enabled);
  const fontPct = Math.round(settings.fontScale * 100);

  return (
    <main className="wr-app wr-options">
      <div className="wr-options-head">
        <h1>WriteRight</h1>
        <p className="wr-detail">
          Every setting is stored locally on this device. Nothing is synced.
        </p>
      </div>

      <div className="wr-options-layout">
        <nav className="wr-options-nav" aria-label="Settings sections">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className={activeNav === n.id ? 'active' : ''}
            >
              <Icon name={n.icon} size={15} />
              {n.label}
            </a>
          ))}
        </nav>

        <div>
          <div id="general">
            <Section title="General">
              <Toggle
                label="WriteRight is on"
                description="Master switch for every page."
                checked={settings.enabled}
                onChange={(v) => void update({ enabled: v })}
              />
              <div className="wr-toggle-row">
                <span className="wr-toggle-text">
                  <label className="wr-toggle-label" htmlFor="wr-dialect">
                    Dialect
                  </label>
                  <span className="wr-toggle-desc" id="wr-dialect-desc">
                    Which English the local engine checks against.
                  </span>
                </span>
                <select
                  id="wr-dialect"
                  className="wr-select"
                  aria-describedby="wr-dialect-desc"
                  value={settings.dialect}
                  onChange={(e) =>
                    void update({ dialect: e.currentTarget.value as Dialect })
                  }
                >
                  {DIALECTS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </Section>
          </div>

          <div id="appearance">
            <Section
              title="Appearance"
              description="How WriteRight's own surfaces look. Text on the page is never restyled."
            >
              <div className="wr-toggle-row">
                <span className="wr-toggle-text">
                  <span className="wr-toggle-label" id="wr-theme-label">
                    Theme
                  </span>
                </span>
                <div
                  className="wr-segmented"
                  role="group"
                  aria-labelledby="wr-theme-label"
                >
                  {THEMES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={settings.theme === t.value}
                      onClick={() => void update({ theme: t.value })}
                    >
                      <Icon name={t.icon} size={13} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="wr-toggle-row">
                <span className="wr-toggle-text">
                  <label className="wr-toggle-label" htmlFor="wr-fontscale">
                    Text size
                  </label>
                  <span className="wr-toggle-desc">
                    Scales WriteRight's popup, sidebar and settings text.
                  </span>
                </span>
                <span className="wr-range-row">
                  <input
                    id="wr-fontscale"
                    className="wr-range"
                    type="range"
                    min={85}
                    max={150}
                    step={5}
                    value={fontPct}
                    aria-label="Text size percent"
                    onChange={(e) =>
                      void update({
                        fontScale: Number(e.currentTarget.value) / 100,
                      })
                    }
                  />
                  <output htmlFor="wr-fontscale">{fontPct}%</output>
                </span>
              </div>
              <Toggle
                label="Reduce motion"
                description="Minimise animations and transitions."
                checked={settings.reducedMotion}
                onChange={(v) => void update({ reducedMotion: v })}
              />
              <Toggle
                label="Simple mode"
                description="Bigger text and buttons, plain-language labels, fewer options on screen. Good for new readers and language learners."
                checked={settings.simpleMode}
                onChange={(v) => void update({ simpleMode: v })}
              />
            </Section>
          </div>

          <div id="checks">
            <Section
              title="Checks"
              description="Turn each kind of underline on or off. WriteRight still runs the others."
            >
              <Toggle
                label="Spelling"
                description="Red underlines for misspelled words."
                checked={settings.features.spelling}
                onChange={(v) => void update({ features: { spelling: v } })}
              />
              <Toggle
                label="Grammar"
                description="Amber underlines: agreement, a/an, duplicate words, sentence case."
                checked={settings.features.grammar}
                onChange={(v) => void update({ features: { grammar: v } })}
              />
              <Toggle
                label="Punctuation & spacing"
                description="Repeated spaces or punctuation, a space before a full stop."
                checked={settings.features.punctuation}
                onChange={(v) => void update({ features: { punctuation: v } })}
              />
              <Toggle
                label="Style & wordiness"
                description="Purple underlines: wordy phrases, buzzwords, filler."
                checked={settings.features.styleWordiness}
                onChange={(v) =>
                  void update({ features: { styleWordiness: v } })
                }
              />
              <Toggle
                label="Writing health score"
                description="The 0–100 score in the popup and sidebar."
                checked={settings.features.writingScore}
                onChange={(v) => void update({ features: { writingScore: v } })}
              />
              <Toggle
                label="Tone hints"
                description="The estimate of how your writing comes across."
                checked={settings.features.toneHints}
                onChange={(v) => void update({ features: { toneHints: v } })}
              />
              <div className="wr-toggle-row">
                <span className="wr-toggle-text">
                  <label className="wr-toggle-label" htmlFor="wr-preset">
                    Default format preset
                  </label>
                  <span className="wr-toggle-desc" id="wr-preset-desc">
                    Steers guidance, the target tone, and which style rules run.
                    Sites can override this from the sidebar.
                  </span>
                </span>
                <select
                  id="wr-preset"
                  className="wr-select"
                  aria-describedby="wr-preset-desc"
                  value={settings.defaultPresetId ?? ''}
                  onChange={(e) =>
                    void update({
                      defaultPresetId: e.currentTarget.value || null,
                    })
                  }
                >
                  <option value="">No preset</option>
                  {FORMAT_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </Section>
          </div>

          <div id="vocabulary">
            <Section
              title="Vocabulary"
              description="An offline dictionary and thesaurus (Open English WordNet). No network, no account."
            >
              <Toggle
                label="Select text to define"
                description="Select a word on any page to see a “Define” button with its meaning, synonyms and antonyms. Also on Alt+D."
                checked={settings.features.defineOnSelect}
                onChange={(v) =>
                  void update({ features: { defineOnSelect: v } })
                }
              />
              <Toggle
                label="Suggest synonyms"
                description="Show a “Find a better word” option in the suggestion card and the define panel."
                checked={settings.features.synonyms}
                onChange={(v) => void update({ features: { synonyms: v } })}
              />
            </Section>
          </div>

          <div id="dictionary">
            <DictionarySection />
          </div>

          <div id="ai">
            <AiSettingsSection
              ai={settings.ai}
              aiEnabled={settings.features.ai && !settings.strictPrivacy}
              locked={settings.strictPrivacy}
              update={update}
            />
          </div>

          <div id="privacy">
            <Section
              title="Privacy"
              description="WriteRight has no server. Your text is analysed on this device."
            >
              <Toggle
                label="Strict privacy mode"
                description="Force local AI off and keep diagnostics off. WriteRight stays fully deterministic and offline."
                checked={settings.strictPrivacy}
                onChange={(v) => void update({ strictPrivacy: v })}
              />
              <div className="wr-privacy-note">
                <strong>Reads:</strong> the contents of ordinary text fields you
                type into, on sites where you have left it enabled.
                <br />
                <strong>Never touches:</strong> password / credential fields,
                hidden fields, code editors, browser-internal pages.
                <br />
                <strong>Leaves your device:</strong> nothing. No account, no
                telemetry, no crash reporting, no remote code.
              </div>
              <div
                className="wr-section-body"
                style={{ marginTop: 'var(--wr-space-3)' }}
              >
                {confirmReset ? (
                  <div className="wr-toggle-row">
                    <span className="wr-toggle-text">
                      <span className="wr-toggle-label">Reset everything?</span>
                      <span className="wr-toggle-desc">
                        Deletes your preferences, per-site settings, personal
                        dictionary and any AI chat history. This cannot be
                        undone.
                      </span>
                    </span>
                    <span style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="wr-btn wr-btn-danger"
                        onClick={() => {
                          void sendToBackground({ type: 'RESET_ALL_DATA' });
                          setConfirmReset(false);
                        }}
                      >
                        Reset
                      </button>
                      <button
                        className="wr-btn"
                        onClick={() => setConfirmReset(false)}
                      >
                        Cancel
                      </button>
                    </span>
                  </div>
                ) : (
                  <button
                    className="wr-btn wr-btn-danger"
                    onClick={() => setConfirmReset(true)}
                  >
                    <Icon name="trash" size={14} /> Reset all local data
                  </button>
                )}
              </div>
            </Section>
          </div>

          <div id="sites">
            <Section
              title="Sites"
              description="Sites where you have turned WriteRight off."
            >
              {disabledSites.length === 0 ? (
                <p className="wr-muted">No sites disabled.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {disabledSites.map((rule) => (
                    <li key={rule.origin} className="wr-toggle-row">
                      <span className="wr-toggle-text">
                        <span className="wr-toggle-label">
                          {originLabel(rule.origin)}
                        </span>
                      </span>
                      <span style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="wr-btn"
                          onClick={() =>
                            void sites.setEnabled(rule.origin, true)
                          }
                        >
                          Re-enable
                        </button>
                        <button
                          className="wr-link-btn"
                          onClick={() => void sites.forget(rule.origin)}
                        >
                          Forget
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <div id="diagnostics">
            <Section title="Diagnostics">
              {diagnostics ? (
                <dl className="wr-muted" style={{ display: 'grid', gap: 4 }}>
                  <div>Version: {diagnostics.version}</div>
                  <div>
                    Settings schema: v{diagnostics.settingsSchemaVersion}
                  </div>
                  <div>Browser target: {diagnostics.browser}</div>
                  <div>
                    Local engine:{' '}
                    {diagnostics.engineReady ? 'ready' : 'initialising'}
                  </div>
                </dl>
              ) : (
                <p className="wr-muted">Loading…</p>
              )}
            </Section>
          </div>
        </div>
      </div>
    </main>
  );
}
