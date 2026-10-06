import { titleCase } from "../../lib/format.js";

const TONES = ["neutral", "success", "warning", "danger", "info", "brand"];

export function Badge({ tone = "neutral", dot = true, className = "", children }) {
  const safe = TONES.includes(tone) ? tone : "neutral";
  const classes = ["badge", `badge-${safe}`, className].filter(Boolean).join(" ");
  return (
    <span className={classes}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

const STATUS_MAP = {
  PENDING: { tone: "warning", label: "Pending" },
  PAYMENT_PENDING: { tone: "warning", label: "Payment pending" },
  CONFIRMED: { tone: "success", label: "Confirmed" },
  CANCELLED: { tone: "danger", label: "Cancelled" },
  COMPLETED: { tone: "info", label: "Completed" },
  PAID: { tone: "success", label: "Paid" },
};

export function StatusBadge({ status }) {
  const key = String(status ?? "").toUpperCase();
  const config = STATUS_MAP[key] ?? {
    tone: "neutral",
    label: titleCase(status ?? "Unknown"),
  };
  return (
    <Badge tone={config.tone} dot={false}>
      {config.label}
    </Badge>
  );
}
