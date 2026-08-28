// ─────────────────────────────────────────────────────────────
// server/scripts/dm-fixture-audit.mjs
//
// READ-ONLY fixture-reconciliation audit for pending_donations.
// Lists every pending_donations row, classifies likely verification
// fixtures (by donor name/email/draft_snapshot source tags used by the
// scripts in this directory), and reports each row's items, linked
// warehouse_manager_flags and whether its committed_donation_id points
// at a real donations row. Deletes nothing — the fixture cleanup
// decision itself is still open and needs a human call.
//
// Usage: node scripts/dm-fixture-audit.mjs
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Source tags + name/email markers planted by the verify-* scripts.
const KNOWN_SOURCE_TAGS = [
  'dm-slice1-verification',
  'dm-slice2-verify',
  'dm-pending-tab-verification',
  'dm-pending-tab-verification-failure-fixture',
  'dm-reconciliation-verification-fixture',
  'pending-donation-verification',
];

const MARKER = /(verify|fixture)/i;

const isLikelyFixture = (row) => {
  const source = row.source ?? '';
  if (KNOWN_SOURCE_TAGS.some((tag) => source.includes(tag))) return true;
  if (MARKER.test(row.donor_name ?? '')) return true;
  if (MARKER.test(row.donor_contact ?? '')) return true;
  if (MARKER.test(source)) return true;
  return false;
};

async function main() {
  const { rows } = await pool.query(
    `SELECT pd.id, pd.status, pd.donor_name, pd.donor_contact,
            pd.committed_donation_id, pd.created_at,
            pd.draft_snapshot->>'source' AS source,
            (SELECT COUNT(*) FROM pending_donation_items i
              WHERE i.pending_donation_id = pd.id) AS item_count,
            (SELECT COUNT(*) FROM pending_donation_items i
              WHERE i.pending_donation_id = pd.id AND i.status = 'resolved') AS resolved_count,
            (SELECT COUNT(*) FROM pending_donation_items i
              WHERE i.pending_donation_id = pd.id AND i.status = 'rejected') AS rejected_count,
            (SELECT COUNT(*) FROM warehouse_manager_flags f
              WHERE f.pending_donation_id = pd.id) AS flag_count,
            (SELECT d.id IS NOT NULL FROM donations d
              WHERE d.id = pd.committed_donation_id) AS committed_donation_exists
     FROM pending_donations pd
     ORDER BY pd.id;`
  );

  console.log(`pending_donations rows found: ${rows.length}\n`);

  const fixtures = [];
  const nonFixtures = [];

  for (const row of rows) {
    const entry = {
      id: row.id,
      status: row.status,
      donor_name: row.donor_name,
      donor_contact: row.donor_contact,
      source: row.source,
      items: `${row.item_count} (${row.resolved_count} resolved, ${row.rejected_count} rejected)`,
      flags_linked: row.flag_count,
      committed_donation_id: row.committed_donation_id,
      committed_donation_exists: row.committed_donation_exists,
      created_at: row.created_at,
    };
    (isLikelyFixture(row) ? fixtures : nonFixtures).push(entry);
  }

  console.log(`===== Likely verification fixtures (${fixtures.length}) =====`);
  for (const f of fixtures) console.log(JSON.stringify(f, null, 2));

  console.log(`\n===== Not flagged as fixtures (${nonFixtures.length}) =====`);
  for (const r of nonFixtures) console.log(JSON.stringify(r, null, 2));

  const byStatus = {};
  for (const row of rows) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  console.log('\n===== Status summary =====');
  console.log(JSON.stringify(byStatus, null, 2));

  const brokenLinks = rows.filter(
    (r) => r.committed_donation_id != null && r.committed_donation_exists === false
  );
  console.log('\n===== Integrity checks =====');
  console.log(
    `committed_donation_id pointing at a missing donations row: ${brokenLinks.length ? brokenLinks.map((r) => r.id).join(', ') : 'none'}`
  );

  console.log('\nREAD-ONLY AUDIT — nothing was modified or deleted.');
  console.log('Fixture cleanup decision is still open: requires explicit human confirmation.');
}

main()
  .catch((err) => {
    console.error('AUDIT FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());