import { useEffect, useId, useMemo, useRef, useState } from "react";

// Type-ahead picker used where a native <select> would be too slow to scan.
// The chosen entry is always one of `options`, so the caller receives a real id
// rather than whatever text happens to be in the box.
export function Combobox({
  id,
  icon: Icon,
  value,
  options,
  onChange,
  placeholder = "Select",
  searchPlaceholder,
  emptyText = "No matches found",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;
  const selectedLabel = selected?.label ?? "";

  // Follow the selection when it changes from outside the box: resetting the
  // form, or opening an existing record for editing. Adjusting during render
  // avoids an effect, which would flash the previous text first.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setQuery(selectedLabel);
    setActive(0);
  }

  // Clicking away closes the menu. Listening on mousedown rather than blur keeps
  // a click on an option working, since that click fires after the input blurs.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(term) ||
        (o.meta ?? "").toLowerCase().includes(term)
    );
  }, [options, query]);

  const choose = (option) => {
    onChange?.(option.value);
    setQuery(option.label);
    setActive(0);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => {
        const next = i + delta;
        if (next < 0) return matches.length - 1;
        if (next >= matches.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Enter") {
      // Swallow Enter so confirming a suggestion never submits the form.
      event.preventDefault();
      if (open && matches[active]) choose(matches[active]);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setQuery(selectedLabel);
    }
  };

  const classes = ["control", "combo", Icon && "has-icon", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} ref={rootRef}>
      {Icon && <Icon size={17} aria-hidden="true" />}
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck="false"
        value={query}
        placeholder={open && searchPlaceholder ? searchPlaceholder : placeholder}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className="combo-menu" id={listId} role="listbox">
          {matches.length === 0 ? (
            <p className="combo-empty">{emptyText}</p>
          ) : (
            matches.map((option, index) => (
              <button
                type="button"
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={[
                  "combo-option",
                  index === active && "is-active",
                  option.value === value && "is-selected",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
              >
                <span className="combo-option-label">{option.label}</span>
                {option.meta && (
                  <span className="combo-option-meta">{option.meta}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}