// ─────────────────────────────────────────────────────────────
// client/src/features/staff/resumeParam.js
//
// Reads a value from the address bar once and removes it, e.g.
// /staff/dispatch?pallet=115 from "Carry on" on the dashboard. Removing
// it means Back and a refresh don't reopen the same job.
// ─────────────────────────────────────────────────────────────
export const takeUrlParam = (name) => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(name);
  if (value === null) return null;
  params.delete(name);
  const rest = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
  return value;
};
