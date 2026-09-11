// ─────────────────────────────────────────────────────────────
// client/src/components/ui/toast.jsx
//
// A small toast stack. No dependency: the project had no toast
// library, and adding one for four call sites is not worth the
// bundle or the second set of styling conventions.
//
// Bottom-right on desktop. On the worker flow the tab bar is fixed at
// the bottom, so the stack sits above it — --stf-tabbar-h is defined
// on .stf-shell in staff.css, and the fallback covers every screen
// that has no tab bar.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { ToastContext } from './toastContext';

const DEFAULT_DURATION = 4500;

// An undo has to survive being read, understood and clicked. Four
// seconds is enough to notice a toast and not enough to act on it.
export const ACTION_DURATION = 9000;

const VARIANT = {
  default: { icon: Info,          cls: 'border-[#cfc7bd] bg-white' },
  success: { icon: CheckCircle2,  cls: 'border-[#2f855a] bg-[#f2fbf5]' },
  error:   { icon: AlertTriangle, cls: 'border-[#ef3a40] bg-[#fff4f2]' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // Timers are held in a ref, not state: clearing them must not
  // trigger a render, and on unmount every one has to be cancelled or
  // a dismiss fires against a gone component.
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const held = timers.current;
    return () => {
      for (const timer of held.values()) clearTimeout(timer);
      held.clear();
    };
  }, []);

  const toast = useCallback((options = {}) => {
    const {
      title, description, variant = 'default', action,
      duration = action ? ACTION_DURATION : DEFAULT_DURATION,
    } = options;

    // Date.now() alone collides when two toasts are raised in the
    // same millisecond — which is exactly what a save-then-confirm
    // pair does. React then renders two children with the same key.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setToasts((prev) => [...prev, { id, title, description, variant, action }]);

    if (duration > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
    }
    return id;
  }, [dismiss]);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* aria-live polite, not assertive: these confirm something the
          user just did. Interrupting a screen reader mid-sentence to
          say "saved" is worse than waiting for a pause. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        style={{ bottom: 'calc(var(--stf-tabbar-h, 0px) + 1rem)' }}
      >
        {toasts.map((t) => {
          const { icon: Icon, cls } = VARIANT[t.variant] ?? VARIANT.default;
          return (
            <div
              key={t.id}
              role={t.variant === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start gap-3 rounded-[4px] border-2 p-3 shadow-md ${cls}`}
            >
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />

              <div className="min-w-0 flex-1">
                {t.title && <p className="text-sm font-semibold leading-snug">{t.title}</p>}
                {t.description && (
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{t.description}</p>
                )}
                {t.action && (
                  <button
                    type="button"
                    onClick={() => { dismiss(t.id); t.action.onClick?.(); }}
                    className="mt-2 text-xs font-semibold underline underline-offset-2 hover:text-[#ef3a40]"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
