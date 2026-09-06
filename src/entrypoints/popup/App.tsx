import { browser } from '#imports';
import { useSettings } from '@/ui/hooks/useSettings';
import { usePopupState } from '@/ui/hooks/usePopupState';
import { useAppliedTheme } from '@/ui/hooks/useAppliedTheme';
import { useActiveTabInsights } from '@/ui/hooks/useActiveTabInsights';
import { useAiCapability } from '@/ui/hooks/useAiCapability';
import { Toggle } from '@/ui/components/Toggle';
import { StatusPill } from '@/ui/components/StatusPill';
import { InsightsSummary } from '@/ui/components/InsightsSummary';
import { Icon } from '@/ui/components/Icon';
import { sendToActiveTabContent } from '@/messaging';
import { originLabel } from '@/utils/url';

/**
 * The toolbar popup (§1.6, §8): capability indicator, writing-health summary
 * (score / issues / readability / tone), global pause + per-site toggles, and
 * a way into the sidebar and settings.
 */
export function PopupApp(): React.JSX.Element {
  const { settings, update } = useSettings();
  const popup = usePopupState();
  const { insights } = useActiveTabInsights();
  const { capability: aiCapability } = useAiCapability();
  useAppliedTheme(settings);

  const openOptions = (): void => void browser.runtime.openOptionsPage();
  const openSidebar = (): void => {
    void sendToActiveTabContent({ type: 'OPEN_SIDEBAR' });
    window.close();
  };

  const active = settings.enabled && popup.pageEligible;

  const availability =
    popup.status?.availability ??
    (!settings.enabled
      ? 'disabled-global'
      : !popup.pageEligible
        ? 'unavailable-privileged'
        : popup.site && !popup.site.siteEnabled
          ? 'disabled-site'
          : 'limited');

  const detail =
    popup.status?.detail ??
    (!settings.enabled
      ? 'WriteRight is paused everywhere.'
      : !popup.pageEligible
        ? 'WriteRight can’t run on this browser page. Your writing here is untouched.'
        : 'Checking this page…');

  return (
    <div className="wr-app wr-popup">
      <header className="wr-header">
        <span className="wr-brand">
          <span className="wr-brand-mark" aria-hidden="true">
            <Icon name="check" size={13} />
          </span>
          WriteRight
        </span>
        <StatusPill availability={availability} />
      </header>

      <div className="wr-body">
        {active ? (
          <InsightsSummary
            insights={insights}
            showScore={settings.features.writingScore}
            showTone={settings.features.toneHints}
          />
        ) : (
          <div className="wr-callout">
            <Icon name={settings.enabled ? 'info' : 'eye-off'} size={16} />
            <p>{detail}</p>
          </div>
        )}

        {active ? (
          <div className="wr-checks" role="group" aria-label="Checks">
            {(
              [
                ['spelling', 'Spelling'],
                ['grammar', 'Grammar'],
                ['punctuation', 'Punctuation'],
                ['styleWordiness', 'Style'],
                ['defineOnSelect', 'Define'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="wr-check"
                aria-pressed={settings.features[key]}
                onClick={() =>
                  void update({ features: { [key]: !settings.features[key] } })
                }
              >
                <Icon
                  name={settings.features[key] ? 'check' : 'close'}
                  size={12}
                />
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {active && settings.features.ai && aiCapability ? (
          <p className="wr-ai-line">
            <Icon name={aiCapability.active ? 'check' : 'sparkle'} size={13} />
            {aiCapability.label}
          </p>
        ) : null}

        {popup.pageEligible && popup.origin ? (
          <>
            <p className="wr-origin">{originLabel(popup.origin)}</p>
            <Toggle
              label="Enable on this site"
              description={
                popup.site && !popup.site.siteEnabled
                  ? 'Turned off here. WriteRight will not read or check text on this site.'
                  : 'WriteRight checks text fields on this site.'
              }
              checked={popup.site?.siteEnabled ?? true}
              disabled={!settings.enabled}
              onChange={(v) => void popup.setSiteEnabled(v)}
            />
          </>
        ) : null}

        <Toggle
          label="WriteRight is on"
          description="Master switch. When off, WriteRight is inactive on every page."
          checked={settings.enabled}
          onChange={(v) => void update({ enabled: v })}
        />

        <p className="wr-privacy-note">
          Spelling, grammar, readability and tone all run on your device. No
          account, no subscription, no telemetry.
        </p>
      </div>

      <footer className="wr-footer">
        <button className="wr-link-btn" onClick={openOptions}>
          <Icon name="gauge" size={14} /> Settings
        </button>
        {active ? (
          <button className="wr-btn wr-btn-primary" onClick={openSidebar}>
            <Icon name="sparkle" size={14} /> Open sidebar
          </button>
        ) : (
          <button className="wr-link-btn" onClick={() => void popup.refresh()}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        )}
      </footer>
    </div>
  );
}
