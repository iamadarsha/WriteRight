import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

export function Section({
  title,
  description,
  children,
}: SectionProps): React.JSX.Element {
  return (
    <section className="wr-section">
      <h2 className="wr-section-title">{title}</h2>
      {description ? <p className="wr-section-desc">{description}</p> : null}
      <div className="wr-section-body">{children}</div>
    </section>
  );
}
