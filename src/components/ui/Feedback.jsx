export function EmptyState({ icon: Icon, title, text, action, compact = false }) {
  return (
    <div
      className="empty"
      style={compact ? { padding: "var(--sp-7) var(--sp-4)" } : undefined}
    >
      {Icon && (
        <span className="empty-icon">
          <Icon size={24} aria-hidden="true" />
        </span>
      )}
      {title && <div className="empty-title">{title}</div>}
      {text && <div className="empty-text">{text}</div>}
      {action}
    </div>
  );
}

const WIDTHS = ["100%", "92%", "76%", "88%", "64%", "80%"];

export function LoadingBlock({ rows = 3, label }) {
  return (
    <div className="stack stack-3">
      {label && (
        <div className="row row-2 t-sm t-muted">
          <span className="spinner" aria-hidden="true" />
          {label}
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: 14, width: WIDTHS[i % WIDTHS.length] }}
        />
      ))}
    </div>
  );
}
