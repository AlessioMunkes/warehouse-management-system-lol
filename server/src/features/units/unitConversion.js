// ─────────────────────────────────────────────────────────────
// server/src/features/units/unitConversion.js
//
// Turning a quantity in one unit into another.
//
// Stock is kept in one unit per product, and a slip or a delivery can
// name a different one: carrots are counted in crates and packed by the
// kilogram. An admin says what a crate, a bag, a box and a punnet weigh
// (Settings → Stock rules), and with that a quantity in any weight unit
// becomes a quantity in any other.
//
//   weight   kg, g, crate, bag, box, punnet
//   volume   l, ml
//   each     converts to nothing
//
// A size left at 0 is not set, and that unit converts to nothing. Where
// nothing converts, the quantity is used as it stands and the caller's
// unit-mismatch flag is raised, as it was before sizes existed.
//
// The same sum exists twice on purpose: convertQuantity for a movement
// being written, and toStockUnitSql for totals Postgres adds up.
// ─────────────────────────────────────────────────────────────

// The setting behind each unit an admin sizes, and how many kilograms
// one of that setting's own unit is (a punnet is entered in grams).
export const UNIT_SIZE_SETTINGS = Object.freeze({
  crate:  { key: 'units.crateKg',      toKg: 1 },
  bag:    { key: 'units.bagKg',        toKg: 1 },
  box:    { key: 'units.boxKg',        toKg: 1 },
  punnet: { key: 'units.punnetGrams',  toKg: 0.001 },
});

const VOLUME = { l: 1, ml: 0.001 };

// `sizes` is { crate, bag, box, punnet } as saved: whole numbers, 0 or
// missing for not set.
const kgPer = (unit, sizes = {}) => {
  if (unit === 'kg') return 1;
  if (unit === 'g') return 0.001;
  const sized = UNIT_SIZE_SETTINGS[unit];
  const size = sized ? Number(sizes[unit]) : NaN;
  return sized && Number.isFinite(size) && size > 0 ? size * sized.toKg : null;
};

// The quantity in `to`, or null when the two units do not convert.
export const convertQuantity = (quantity, from, to, sizes = {}) => {
  const amount = Number(quantity);
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  const ratio = kgPer(from, sizes) && kgPer(to, sizes)
    ? kgPer(from, sizes) / kgPer(to, sizes)
    : (VOLUME[from] && VOLUME[to] ? VOLUME[from] / VOLUME[to] : null);
  // Six places: enough for a gram in a crate, and it keeps 0.1 × 3 from
  // reaching the ledger as 0.30000000000000004.
  return ratio === null ? null : Math.round(amount * ratio * 1e6) / 1e6;
};

// The saved sizes, read on the caller's connection. Inside a savepoint:
// the caller is mid-transaction, and a failed read must not take a stock
// movement down with it. Anything unreadable is "not set".
export const readUnitSizes = async (client) => {
  const sizes = {};
  await client.query('SAVEPOINT unit_sizes');
  try {
    const { rows } = await client.query(
      `SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`,
      [Object.values(UNIT_SIZE_SETTINGS).map((s) => s.key)]
    );
    await client.query('RELEASE SAVEPOINT unit_sizes');
    for (const [unit, { key }] of Object.entries(UNIT_SIZE_SETTINGS)) {
      const saved = Number((rows ?? []).find((r) => r.key === key)?.value);
      if (Number.isFinite(saved) && saved > 0) sizes[unit] = saved;
    }
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT unit_sizes');
    console.error('[units] Not converting units; could not read their sizes:', err.message);
  }
  return sizes;
};

// ── The same sum in SQL ───────────────────────────────────────
const sizeSql = ({ key, toKg }) =>
  `(SELECT NULLIF((s.value #>> '{}')::numeric, 0) * ${toKg} FROM app_settings s WHERE s.key = '${key}')`;

const weightSql = (unit) => `CASE ${unit}
    WHEN 'kg' THEN 1 WHEN 'g' THEN 0.001
    ${Object.entries(UNIT_SIZE_SETTINGS).map(([name, setting]) => `WHEN '${name}' THEN ${sizeSql(setting)}`).join('\n    ')}
  END`;

const volumeSql = (unit) => `CASE ${unit} WHEN 'l' THEN 1 WHEN 'ml' THEN 0.001 END`;

// NULL when `from` does not convert to `to`. Both are SQL expressions
// written by the caller, never values from a request.
export const unitRatioSql = (from, to) => `(CASE WHEN ${from} = ${to} THEN 1
    ELSE COALESCE((${weightSql(from)}) / (${weightSql(to)}), (${volumeSql(from)}) / (${volumeSql(to)})) END)`;

// `quantity` in the unit `to`; left as it is where nothing converts,
// including a product with no stock row yet (`to` is NULL).
export const toStockUnitSql = (quantity, from, to) =>
  `(${quantity} * COALESCE(${unitRatioSql(from, to)}, 1))`;
