import type { ReactNode } from 'react';
import { useId } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

/**
 * Accessible switch (§9.5). Native checkbox for semantics + keyboard; the visual
 * track is CSS. State is conveyed by role/checked and the label, never colour
 * alone (§9.3).
 */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: ToggleProps): React.JSX.Element {
  const id = useId();
  const descId = description ? `${id}-desc` : undefined;
  return (
    <div className="wr-toggle-row">
      <div className="wr-toggle-text">
        <label htmlFor={id} className="wr-toggle-label">
          {label}
        </label>
        {description ? (
          <p id={descId} className="wr-toggle-desc">
            {description}
          </p>
        ) : null}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="wr-toggle-input"
        checked={checked}
        disabled={disabled}
        aria-describedby={descId}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span className="wr-toggle-track" aria-hidden="true">
        <span className="wr-toggle-thumb" />
      </span>
    </div>
  );
}
