export function StatCard({
  icon: Icon,
  tone = "brand",
  label,
  value,
  meta,
  onClick,
  className = "",
}) {
  const classes = ["stat-card", className].filter(Boolean).join(" ");
  const content = (
    <>
      {Icon && (
        <div className="stat-top">
          <span className={`stat-icon tone-${tone}`}>
            <Icon size={20} aria-hidden="true" />
          </span>
        </div>
      )}
      <div className="stat-value">{value}</div>
      {label && <div className="stat-name">{label}</div>}
      {meta && <div className="stat-foot">{meta}</div>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}
