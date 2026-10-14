// ─────────────────────────────────────────────────────────────
// server/src/features/units/pluralUnit.js
//
// A unit as it reads after a number: "1 crate", "15 crates", "30 kg".
// The weights and volumes (kg, g, l, ml) and "each" never change; the
// counted containers do. Anything not known is left as it came, so a
// free-typed unit is never mangled. The client has the same list
// (client/src/lib/stockWording.js).
// ─────────────────────────────────────────────────────────────
const PLURAL = { bag: 'bags', box: 'boxes', crate: 'crates', punnet: 'punnets' };
const SINGULAR = Object.fromEntries(Object.entries(PLURAL).map(([one, many]) => [many, one]));

export const pluralUnit = (unit, n) => {
  if (!unit) return '';
  return Number(n) === 1 ? (SINGULAR[unit] ?? unit) : (PLURAL[unit] ?? unit);
};

export default { pluralUnit };
