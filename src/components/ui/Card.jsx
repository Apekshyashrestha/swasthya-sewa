export function Card({ interactive = false, className = "", children, ...rest }) {
  const classes = ["card", interactive && "card-hover", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className="section-head">
      <div>
        {title && <div className="section-title">{title}</div>}
        {subtitle && <div className="section-sub">{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ flush = false, className = "", children }) {
  const classes = ["card-body", flush && "card-body-flush", className]
    .filter(Boolean)
    .join(" ");
  return <div className={classes}>{children}</div>;
}
