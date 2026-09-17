// ─────────────────────────────────────────────────────────────
// client/src/components/ui/toastContext.js
//
// The toast context and its hook, kept apart from the provider
// component on purpose: react-refresh/only-export-components is an
// error in this project's eslint config, and a module that exports
// both a component and a plain function trips it. shellContext.js
// exists for exactly the same reason.
// ─────────────────────────────────────────────────────────────
import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

// Returns `toast(options)`.
//
//   toast({ title, description?, variant?, duration?, action? })
//
//   variant   'default' | 'success' | 'error'
//   duration  ms; an action needs time to be read and clicked, so
//             pass something generous (see ACTION_DURATION).
//   action    { label, onClick } — rendered as a button in the toast.
//
// Outside a provider this is a no-op that returns null rather than
// throwing. A missing toast should never be the thing that takes a
// screen down, and it keeps components testable in isolation.
export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) return () => null;
  return ctx;
};
