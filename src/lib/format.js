const rupees = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

export const formatMoney = (amount) => `NPR ${rupees.format(Number(amount) || 0)}`;

export function formatDate(value, opts = {}) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  });
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";

  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);

  let out;
  if (mins < 1) return "just now";
  if (mins < 60) out = `${mins}m`;
  else if (hours < 24) out = `${hours}h`;
  else if (days < 30) out = `${days}d`;
  else return formatDate(value);

  return diff < 0 ? `${out} ago` : `in ${out}`;
}

export const isToday = (value) =>
  !!value && new Date(value).toDateString() === new Date().toDateString();

// True when a timestamp is older than `days`. Kept in this module so the
// component tree never has to read the clock while rendering.
export function isStale(value, days = 2) {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() > days * 86400000;
}

export function greetingFor(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export const firstName = (name = "") => name.trim().split(/\s+/)[0] || "there";

export function titleCase(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/(^|[\s\-_/])\S/g, (c) => c.toUpperCase())
    .replace(/[_-]+/g, " ");
}

export const CONSULT_SLOTS = ["09:00 AM", "10:30 AM", "02:00 PM", "04:00 PM"];

// Demonstration-only payment options. No real gateway is contacted.
export const PAYMENT_METHODS = [
  { id: "esewa", label: "eSewa" },
  { id: "khalti", label: "Khalti" },
  { id: "bank", label: "Bank Transfer" },
];

export const mockTxnId = () =>
  `TXN-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

export const wait = (ms) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

export function toDateInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}