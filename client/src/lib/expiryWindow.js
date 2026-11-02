// ─────────────────────────────────────────────────────────────
// client/src/lib/expiryWindow.js
//
// Where an expiry turns urgent (red): the first expiry warning in
// Settings, the same window the warning emails and the manager's action
// list use. The server sends it with the stock list (stockAPI.getManifest);
// until then it is Settings' default.
// ─────────────────────────────────────────────────────────────

let urgentDays = 14;

export const getUrgentExpiryDays = () => urgentDays;

export const setUrgentExpiryDays = (days) => {
  const n = Number(days);
  if (Number.isInteger(n) && n > 0) urgentDays = n;
};
