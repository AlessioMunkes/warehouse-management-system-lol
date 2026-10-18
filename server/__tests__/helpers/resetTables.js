// ─────────────────────────────────────────────────────────────
// server/__tests__/helpers/resetTables.js
//
// Empties tables for an integration suite, without losing the shared
// reference rows other suites read.
//
// TRUNCATE ... CASCADE follows foreign keys, and donation_category_routing
// points at users (updated_by), so emptying users also empties it. The
// four category rows are configuration, not test data: donationAdmin and
// donationIntake need them. They are read first and put back after.
// ─────────────────────────────────────────────────────────────
export const resetTables = async (pool, tables) => {
  const { rows } = await pool.query(
    'SELECT category, routing_outcome, storage_area, description, is_active FROM donation_category_routing',
  );
  await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
  for (const r of rows) {
    await pool.query(
      `INSERT INTO donation_category_routing (category, routing_outcome, storage_area, description, is_active)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (category) DO NOTHING`,
      [r.category, r.routing_outcome, r.storage_area, r.description, r.is_active],
    );
  }
};

export default resetTables;
