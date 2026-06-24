import { type ReactNode, useId } from "react";

export function SectionTitle(props: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{props.title}</h2>
        {props.subtitle ? <p className="supporting compact">{props.subtitle}</p> : null}
      </div>
      {props.actions ? <div className="section-actions">{props.actions}</div> : null}
    </div>
  );
}

export function SummaryStrip(props: {
  label: string;
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <section
      aria-label={props.label}
      className="summary-strip"
      role="region"
    >
      {props.items.map((item) => (
        <div className="summary-chip" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </section>
  );
}

export function Drawer(props: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  width?: "regular" | "wide";
}) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div className="drawer-backdrop" role="presentation">
      <div
        aria-describedby={props.description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={
          props.width === "wide" ? "drawer-panel drawer-panel-wide" : "drawer-panel"
        }
        role="dialog"
      >
        <div className="drawer-header">
          <div>
            <h2 id={titleId}>{props.title}</h2>
            {props.description ? (
              <p className="supporting compact" id={descriptionId}>
                {props.description}
              </p>
            ) : null}
          </div>
          <button className="ghost-button" onClick={props.onClose} type="button">
            Close
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

export function EmptyPanel(props: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="empty-panel">
      <h3>{props.title}</h3>
      <p className="supporting">{props.description}</p>
      {props.actions ? <div className="empty-actions">{props.actions}</div> : null}
    </div>
  );
}

export function ProtocolBadge({ value }: { value: string }) {
  return <span className="protocol-badge">{value}</span>;
}

export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`status-badge status-${value.toLowerCase()}`}>
      {value}
    </span>
  );
}

export function TagTokens({
  tags,
  fallback = "No tags",
}: {
  tags: string[];
  fallback?: string;
}) {
  if (tags.length === 0) {
    return <span className="tag-token tag-token-muted">{fallback}</span>;
  }

  return (
    <>
      {tags.map((tag) => (
        <span className="tag-token" key={tag}>
          {tag}
        </span>
      ))}
    </>
  );
}

export function MiniStat(props: {
  label: string;
  value: ReactNode;
  tone?: "accent" | "default";
}) {
  return (
    <div className={props.tone === "accent" ? "mini-stat mini-stat-accent" : "mini-stat"}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
