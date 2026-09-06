import type { PageAvailability } from '@/types/capability';
import { Icon } from './Icon';
import type { IconName } from '@/ui/icons';

interface StatusPillProps {
  availability: PageAvailability;
}

/** §1.6 "Ready / Limited / Unsupported" indicator. Icon + text, not colour-only. */
const PRESENTATION: Record<
  PageAvailability,
  { icon: IconName | 'dot'; label: string; tone: string }
> = {
  ready: { icon: 'dot', label: 'Ready', tone: 'ready' },
  limited: { icon: 'info', label: 'Limited', tone: 'limited' },
  unsupported: { icon: 'warning', label: 'Unsupported', tone: 'limited' },
  'disabled-site': { icon: 'eye-off', label: 'Off here', tone: 'muted' },
  'disabled-field': {
    icon: 'eye-off',
    label: 'Off for this field',
    tone: 'muted',
  },
  'disabled-global': { icon: 'eye-off', label: 'Paused', tone: 'muted' },
  'unavailable-privileged': {
    icon: 'eye-off',
    label: 'Unavailable here',
    tone: 'muted',
  },
};

export function StatusPill({
  availability,
}: StatusPillProps): React.JSX.Element {
  const p = PRESENTATION[availability];
  return (
    <span className={`wr-pill wr-pill-${p.tone}`} role="status">
      {p.icon === 'dot' ? (
        <span aria-hidden="true" className="wr-pill-icon" />
      ) : (
        <Icon name={p.icon} size={12} />
      )}
      {p.label}
    </span>
  );
}
