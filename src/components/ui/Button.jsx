export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  block = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}) {
  const classes = [
    "btn",
    `btn-${variant}`,
    size === "sm" && "btn-sm",
    size === "lg" && "btn-lg",
    block && "btn-block",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const dim = size === "sm" ? 15 : 17;

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="spinner" aria-hidden="true" />
      ) : Icon ? (
        <Icon size={dim} aria-hidden="true" />
      ) : null}
      {children}
      {!loading && IconRight ? <IconRight size={dim} aria-hidden="true" /> : null}
    </button>
  );
}
