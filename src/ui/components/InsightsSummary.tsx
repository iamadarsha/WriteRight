import type { DocumentInsights } from '@/types/insights';
import { ScoreRing } from './ScoreRing';
import { Icon } from './Icon';
import type { IconName } from '@/ui/icons';

const CAT: Array<{
  key: 'error' | 'warning' | 'info';
  label: string;
  plural: string;
  icon: IconName;
  cls: string;
}> = [
  {
    key: 'error',
    label: 'error',
    plural: 'errors',
    icon: 'spelling',
    cls: 'error',
  },
  {
    key: 'warning',
    label: 'warning',
    plural: 'warnings',
    icon: 'grammar',
    cls: 'warning',
  },
  {
    key: 'info',
    label: 'style note',
    plural: 'style notes',
    icon: 'style',
    cls: 'info',
  },
];

function readTime(sec: number): string {
  return sec < 60 ? `${sec}s` : `${Math.round(sec / 60)} min`;
}

/** Score ring + issue breakdown + readability / tone for the popup (§8). */
export function InsightsSummary({
  insights,
  showScore = true,
  showTone = true,
}: {
  insights: DocumentInsights | null;
  showScore?: boolean;
  showTone?: boolean;
}): React.JSX.Element {
  if (!insights) {
    return (
      <div className="wr-insights wr-insights-loading">
        <div className="wr-skel wr-skel-ring" />
        <div className="wr-skel wr-skel-line" />
        <div className="wr-skel wr-skel-line short" />
      </div>
    );
  }

  const c = insights.suggestionCounts;
  const total = c.error + c.warning + c.info;

  return (
    <div className="wr-insights">
      <div className="wr-insights-top">
        {showScore ? (
          <ScoreRing score={insights.score.score} />
        ) : (
          <span className="wr-insights-noring" aria-hidden="true">
            <Icon name="check" size={20} />
          </span>
        )}
        <div className="wr-insights-headline">
          <b>{showScore ? 'Writing health' : 'WriteRight'}</b>
          <span>
            {total === 0
              ? 'Nothing flagged'
              : `${total} suggestion${total === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {total > 0 ? (
        <div className="wr-insights-chips">
          {CAT.filter((cat) => c[cat.key] > 0).map((cat) => (
            <span key={cat.key} className={`wr-chip ${cat.cls}`}>
              <Icon name={cat.icon} size={13} />
              {c[cat.key]} {c[cat.key] === 1 ? cat.label : cat.plural}
            </span>
          ))}
        </div>
      ) : null}

      <dl className="wr-insights-grid">
        <div>
          <dt>Readability</dt>
          <dd>
            {insights.readability.sufficientText
              ? insights.readability.grade
              : 'Add more text'}
          </dd>
        </div>
        {showTone ? (
          <div>
            <dt>Tone</dt>
            <dd>{insights.tone.label}</dd>
          </div>
        ) : null}
        <div>
          <dt>Words</dt>
          <dd>{insights.stats.words.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Reading time</dt>
          <dd>{readTime(insights.stats.readingTimeSeconds)}</dd>
        </div>
      </dl>
    </div>
  );
}
