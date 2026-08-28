// ─────────────────────────────────────────────────────────────
// server/scripts/verify-dm-reconciliation.mjs
//
// Live verification for the Reconciliation tab.
//
//   1. `incomplete` — creates a commit_incomplete fixture directly via
//                     SQL with 2 items (1 resolved, 1 still awaiting),
//                     so the tab has a real "N of M items resolved"
//                     case to render (no existing fixture covers this —
//                     #24/#25 from the Pending Donations task are both
//                     commit_failed with 0 or fully-decided items).
//   2. `retry`      — exercises POST /donations/pending/:id/retry-commit
//                     against a real commit_failed fixture (donation #24
//                     from the Pending Donations verification, which has
//                     zero items — retrying it should either succeed
//                     trivially or fail in a well-understood way; either
//                     outcome is reported, not assumed).
//   3. `cleanup`    — removes only the fixture this script created
//                     (does not touch #24/#25, which belong to the prior
//                     task and are left for the fixture-reconciliation
//                     pass to decide on).
//
// Usage: node scripts/verify-dm-reconciliation.mjs <incomplete|retry|cleanup>
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const API = 'http://localhost:5000/api';
const FIXTURE_TAG = 'DM_RECONCILIATION_VERIFY';

const logJson = (label, value) => {
  console.log(`\n===== ${label} =====`);
  console.log(JSON.stringify(value, null, 2));
};

async function getAdminToken() {
  const { rows } = await pool.query(
    `SELECT id, username, role FROM users WHERE role = 'admin' ORDER BY id LIMIT 1;`
  );
  if (!rows[0]) throw new Error('No admin user found to authenticate as.');
  const user = rows[0];
  console.log(`Authenticated as: id=${user.id} username=${user.username} role=${user.role}`);
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function httpJson(label, method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `wms_token=${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  logJson(`RESPONSE ${res.status} ${method} ${path} (${label})`, json);
  return { status: res.status, json };
}

// ── Step: commit_incomplete fixture with a partial item split ────
async function stepIncomplete() {
  const donorName = `${FIXTURE_TAG} Incomplete Donor ${Date.now()}`;
  const { rows } = await pool.query(
    `INSERT INTO pending_donations
       (status, donor_name, donor_contact, donor_consent_given,
        estimated_value_zar, donation_category, draft_snapshot,
        commit_incomplete_at)
     VALUES ('commit_incomplete', $1, 'dm-reconciliation-verify@example.com', true,
             75.00, 'recipe_food', $2, NOW())
     RETURNING id, status;`,
    [donorName, JSON.stringify({ source: 'dm-reconciliation-verification-fixture' })]
  );
  const pendingId = rows[0].id;
  console.log(`Created commit_incomplete fixture: pending_donation #${pendingId}`);

  await pool.query(
    `INSERT INTO pending_donation_items
       (pending_donation_id, line_no, description, quantity, unit,
        estimated_value_zar, status, routing_status)
     VALUES ($1, 1, $2, 2, 'kg', 45.00, 'resolved', 'ecd_fefo_stock');`,
    [pendingId, `${FIXTURE_TAG} resolved line (committed before failure)`]
  );
  await pool.query(
    `INSERT INTO pending_donation_items
       (pending_donation_id, line_no, description, quantity, unit,
        estimated_value_zar, status, routing_status)
     VALUES ($1, 2, $2, 1, 'kg', 30.00, 'awaiting_resolution', 'manual_review');`,
    [pendingId, `${FIXTURE_TAG} still-open line (this is why the commit is incomplete)`]
  );

  const token = await getAdminToken();
  const { json } = await httpJson(
    'confirm commit_incomplete fixture appears via getPendingDonations reuse (Option A)',
    'GET',
    '/donations/pending?statuses=commit_failed,commit_incomplete',
    token
  );

  const donation = json.data.find((d) => d.id === pendingId);
  if (!donation) throw new Error('Expected the commit_incomplete fixture to appear in the reconciliation-scoped list.');
  if (donation.status !== 'commit_incomplete') throw new Error(`Expected status commit_incomplete, got ${donation.status}`);
  if (!donation.items || donation.items.length !== 2) throw new Error('Expected 2 items on the fixture.');

  const resolvedCount = donation.items.filter((i) => i.status === 'resolved' || i.status === 'committed').length;
  console.log(`\nItem breakdown confirmed: ${resolvedCount} of ${donation.items.length} resolved — this drives the "N of M items already resolved" line in the UI.`);

  console.log(`\nRESULT: keep pending #${pendingId} as a live Reconciliation-tab fixture proving the commit_incomplete item-count case.`);
}

// ── Step: real retry against an existing commit_failed fixture ───
async function stepRetry() {
  const token = await getAdminToken();

  // Find a real commit_failed donation from prior fixtures (e.g. #24/#25
  // from the Pending Donations task) rather than assuming an id.
  const { json: listJson } = await httpJson(
    'find an existing commit_failed donation to retry',
    'GET',
    '/donations/pending?statuses=commit_failed',
    token
  );

  const target = listJson.data?.[0];
  if (!target) {
    console.log('\nNo commit_failed donation found to retry. Run the Pending Donations task fixtures first, or create one with this script\'s `incomplete` step (edit status to commit_failed) if needed.');
    return;
  }

  console.log(`\nAttempting retry-commit on pending #${target.id} (status: ${target.status}, ${target.items?.length ?? 0} item(s)).`);

  const { status, json } = await httpJson(
    `retry commit for pending #${target.id}`,
    'POST',
    `/donations/pending/${target.id}/retry-commit`,
    token
  );

  if (status === 200) {
    console.log(`\nRetry SUCCEEDED for pending #${target.id}. Confirming new status via direct DB check...`);
    const { rows } = await pool.query(`SELECT status, committed_donation_id FROM pending_donations WHERE id = $1;`, [target.id]);
    console.log('DB state after retry:', rows[0]);
  } else {
    console.log(`\nRetry did NOT succeed (status ${status}). This is a legitimate, reportable outcome — not papered over. Message: ${json.message}`);
    console.log('Likely cause: this donation has 0 items or an incomplete item/donation-item pairing, which the service correctly refuses to force through blindly (see assertDonationItemPairingIsComplete in pendingDonation.service.js).');
  }
}

// ── cleanup (this script's own fixture only) ──────────────────────
async function cleanup() {
  const { rows } = await pool.query(
    `SELECT id FROM pending_donations WHERE donor_name LIKE $1 OR draft_snapshot::text LIKE $1;`,
    [`%${FIXTURE_TAG}%`]
  );
  if (!rows.length) {
    console.log('No fixtures found to clean.');
    return;
  }
  const ids = rows.map((r) => r.id);
  console.log(`Removing pending_donations: ${ids.join(', ')}`);

  await pool.query(`DELETE FROM warehouse_manager_flags WHERE pending_donation_id = ANY($1);`, [ids]);
  await pool.query(`DELETE FROM pending_donation_items WHERE pending_donation_id = ANY($1);`, [ids]);
  const { rowCount } = await pool.query(`DELETE FROM pending_donations WHERE id = ANY($1);`, [ids]);
  console.log(`Removed ${rowCount} pending_donations rows.`);
}

async function main() {
  const step = process.argv[2];
  try {
    if (step === 'incomplete') {
      await stepIncomplete();
    } else if (step === 'retry') {
      await stepRetry();
    } else if (step === 'cleanup') {
      await cleanup();
    } else {
      console.log('Usage: node scripts/verify-dm-reconciliation.mjs <incomplete|retry|cleanup>');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('\n!!! STEP FAILED !!!');
    console.error(err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();