/**
 * An animated 0–100 writing-health score ring (§12.3). SVG stroke-dashoffset
 * transition; colour bands green / amber / red; never implies the number is an
 * objective quality measure (§12.3) — that framing lives in the label beside it.
 */

function bandColor(score: number | null): string {
  if (score == null) return 'var(--wr-text-tertiary)';
  if (score >= 85) return 'var(--wr-success)';
  if (score >= 65) return 'var(--wr-grammar)';
  return 'var(--wr-error)';
}

export function ScoreRing({
  score,
  size = 52,
  label = 'Writing health score',
}: {
  score: number | null;
  size?: number;
  label?: string;
}): React.JSX.Element {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;
  return (
    <div
      className="wr-ring"
      style={{ width: size, height: size, color: bandColor(score) }}
      role="img"
      aria-label={
        score == null ? `${label}: pending` : `${label}: ${score} out of 100`
      }
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle
          className="wr-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={5}
        />
        <circle
          className="wr-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <b>{score ?? '–'}</b>
    </div>
  );
}
