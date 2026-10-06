import { useState } from "react";

const TINTS = [
  ["#0f766e", "#ccfbf1"],
  ["#b45309", "#fef3c7"],
  ["#7c3aed", "#ede9fe"],
  ["#be123c", "#ffe4e6"],
  ["#1d4ed8", "#dbeafe"],
  ["#15803d", "#dcfce7"],
];

function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tintFor(name = "") {
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.codePointAt(0)) % 100000;
  return TINTS[hash % TINTS.length];
}

export function Avatar({ src, name = "", size = "md", className = "" }) {
  const [failed, setFailed] = useState(false);
  const classes = ["avatar", `avatar-${size}`, className].filter(Boolean).join(" ");

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        className={classes}
        onError={() => setFailed(true)}
      />
    );
  }

  const [ink, wash] = tintFor(name);
  return (
    <span
      className={`${classes} avatar-fallback`}
      style={{ color: ink, background: wash, borderColor: wash }}
      title={name || undefined}
    >
      {initials(name)}
    </span>
  );
}