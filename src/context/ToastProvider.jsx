import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { ToastContext } from "./ToastContext.js";

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message, tone = "info", duration = 3600) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, message, tone }]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), duration)
      );
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toast: push,
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error", 5200),
      info: (m) => push(m, "info"),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-region" role="region" aria-live="polite">
          {toasts.map((t) => {
            const Icon = ICONS[t.tone] ?? Info;
            return (
              <div key={t.id} className={`toast toast-${t.tone}`}>
                <Icon
                  size={18}
                  className={`toast-icon-${t.tone}`}
                  aria-hidden="true"
                />
                <div className="grow t-sm">{t.message}</div>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 26, height: 26 }}
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}