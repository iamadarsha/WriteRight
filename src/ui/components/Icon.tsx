import { iconDef, type IconName } from '@/ui/icons';

/**
 * Inline SVG icon for the React extension pages. Decorative by default
 * (`aria-hidden`); pass `title` to give it an accessible name.
 */
export function Icon({
  name,
  size = 16,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}): React.JSX.Element {
  const def = iconDef(name);
  const stroke = (def.mode ?? 'stroke') === 'stroke';
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {def.paths.map((d, i) =>
        stroke ? (
          <path
            key={i}
            d={d}
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path key={i} d={d} fill="currentColor" />
        ),
      )}
      {(def.shapes ?? []).map(([tag, attrs], i) => {
        const common =
          !('fill' in attrs) && stroke
            ? { stroke: 'currentColor', strokeWidth: 1.75 }
            : {};
        if (tag === 'circle') {
          return <circle key={`s${i}`} {...attrs} {...common} />;
        }
        return null;
      })}
    </svg>
  );
}
