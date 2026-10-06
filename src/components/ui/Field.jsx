export function Field({ label, hint, error, htmlFor, children }) {
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <span className="field-error">{error}</span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
}

export function Input({ icon: Icon, className = "", ...rest }) {
  const classes = ["control", Icon && "has-icon", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes}>
      {Icon && <Icon size={17} aria-hidden="true" />}
      <input {...rest} />
    </div>
  );
}

export function Select({ icon: Icon, className = "", children, ...rest }) {
  const classes = ["control", Icon && "has-icon", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes}>
      {Icon && <Icon size={17} aria-hidden="true" />}
      <select {...rest}>{children}</select>
    </div>
  );
}

export function Textarea({ className = "", ...rest }) {
  const classes = ["control", className].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <textarea {...rest} />
    </div>
  );
}

export function Switch({ id, checked, onChange, label }) {
  return (
    <label className="switch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
      {label && <span className="switch-label">{label}</span>}
    </label>
  );
}
