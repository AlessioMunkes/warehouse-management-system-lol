// ─────────────────────────────────────────────────────────────
// server/scripts/verify-dm-pending-donations.mjs
//
// Live verification for the Pending Donations tab (D4 scope).
// Exercises real HTTP against the running server + real DB checks:
//
//   1. `default`  — GET /donations/pending with the tab's default 4-status
//                   scope, confirms shape (item_counts, routing_status,
//                   section_18a fields present) using existing fixtures.
//   2. `rejected` — creates a fresh intake donation, rejects one item,
//                   confirms the response carries status='rejected' +
//                   rejection_reason on that item (drives the
//                   struck-through row in the UI).
//   3. `failure`  — creates a commit_failed fixture directly via SQL
//                   (there's no clean HTTP path to force a real commit
//                   failure), confirms it appears in the default-scope
//                   list with status='commit_failed' so the UI's warning
//                   badge + cross-link has something real to render.
//   4. `cleanup`  — removes only the fixtures this script created.
//
// Usage: node scripts/verify-dm-pending-donations.mjs <default|rejected|failure|cleanup>
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const API = 'http://localhost:5000/api';
const FIXTURE_TAG = 'DM_PENDING_TAB_VERIFY';

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

// ── Step: default scope shape check ──────────────────────────
async function stepDefault(token) {
  const { json } = await httpJson(
    'default 4-status scope',
    'GET',
    '/donations/pending?statuses=awaiting_resolution,committing,commit_failed,commit_incomplete',
    token
  );

  if (!json.success || !Array.isArray(json.data)) {
    throw new Error('Expected { success: true, data: [...] } shape.');
  }

  console.log(`\n${json.data.length} donation(s) in default scope.`);

  const withItems = json.data.find((d) => (d.items || []).length > 0);
  if (!withItems) {
    console.log('No donation with items found to shape-check — run `intake`-style fixtures first (see verify-dm-slice1.mjs / verify-dm-flagged-items.mjs) if this is a fresh DB.');
    return;
  }

  const item = withItems.items[0];
  const requiredItemFields = ['line_no', 'description', 'quantity', 'unit', 'routing_status', 'status'];
  const missing = requiredItemFields.filter((f) => !(f in item));
  if (missing.length) {
    throw new Error(`Item row is missing expected fields for the UI: ${missing.join(', ')}`);
  }
  console.log('Item row carries all fields the tab renders (routing_status included).');

  if (!withItems.item_counts) {
    throw new Error('Donation row is missing item_counts (used for the summary chip).');
  }
  console.log('item_counts present:', withItems.item_counts);
}

// ── Step: rejected item ──────────────────────────────────────
async function stepRejected(token) {
  const createRes = await httpJson(
    'create 1-item intake pending (expect 201)',
    'POST',
    '/donations/pending',
    token,
    {
      donationCategory: 'non_recipe_food',
      donorName: `${FIXTURE_TAG} Rejected-Item Donor`,
      donorContact: 'dm-pending-verify@example.com',
      donorConsentGiven: true,
      items: [
        { description: `${FIXTURE_TAG} rejected line`, quantity: 2, unit: 'kg', estimatedValueZar: 30 },
      ],
      draftSnapshot: { source: 'dm-pending-tab-verification', capturedAt: new Date().toISOString() },
    }
  );

  if (createRes.status !== 201) throw new Error('Expected 201 creating the intake pending donation.');

  const pendingId = createRes.json.data.id;
  const flagId = createRes.json.data.items[0].flag_id;
  if (!flagId) throw new Error('Expected the single unmatched item to carry a flag_id.');

  const rejectRes = await httpJson(
    `reject the only flag (#${flagId}) — should trigger commit since it's the last one`,
    'POST',
    `/donations/pending/flags/${flagId}/resolve`,
    token,
    { accepted: false, reason: 'Verification: rejecting to prove the struck-through row.' }
  );
  if (rejectRes.status !== 200) throw new Error('Expected 200 rejecting the flag.');

  // Re-fetch through the same endpoint the tab uses, across all four statuses
  // (a fully-rejected single-item donation may commit immediately since
  // there's nothing left "awaiting" — confirm whichever state it lands in).
  const { json: listJson } = await httpJson(
    'confirm rejected item shape via GET /donations/pending',
    'GET',
    '/donations/pending?statuses=awaiting_resolution,committing,commit_failed,commit_incomplete',
    token
  );

  const donation = listJson.data.find((d) => d.id === pendingId);
  if (donation) {
    const item = donation.items.find((i) => i.flag_id === flagId || i.line_no === 1);
    if (!item || item.status !== 'rejected') {
      throw new Error(`Expected item.status === 'rejected', got: ${item?.status}`);
    }
    if (!item.rejection_reason) {
      throw new Error('Expected rejection_reason to be persisted and returned.');
    }
    console.log('\nRejected item confirmed in the default-scope list:', {
      status: item.status,
      rejection_reason: item.rejection_reason,
    });
  } else {
    // Donation may have moved to a status outside the 4-status scope (e.g.
    // 'committed' with nothing left to resolve) — check directly by id.
    const { rows } = await pool.query(
      `SELECT status FROM pending_donations WHERE id = $1;`,
      [pendingId]
    );
    console.log(`\nDonation #${pendingId} not in default scope; direct DB status = ${rows[0]?.status}. This is fine if the single rejected item was also the last one, since the donation exits the tab's scope once nothing is left pending.`);
  }

  console.log(`\nRESULT: keep pending #${pendingId} / flag #${flagId} as a live fixture showing a rejected item (if still in scope) or confirm normal exit-from-scope behavior.`);
}

// ── Step: commit_failed fixture ──────────────────────────────
async function stepFailure() {
  // There's no clean way to force a real commit failure through the HTTP
  // API without faking a DB-level fault, so this creates the row directly
  // via SQL — same tradeoff as the existing reconciliation-queue fixture
  // pattern implied by the retry-commit endpoint's existence.
  const donorName = `${FIXTURE_TAG} Commit-Failed Donor ${Date.now()}`;
  const { rows } = await pool.query(
    `INSERT INTO pending_donations
       (status, donor_name, donor_contact, donor_consent_given,
        estimated_value_zar, donation_category, draft_snapshot,
        commit_failed_at)
     VALUES ('commit_failed', $1, 'dm-pending-verify@example.com', true,
             50.00, 'non_recipe_food', $2, NOW())
     RETURNING id, status;`,
    [donorName, JSON.stringify({ source: 'dm-pending-tab-verification-failure-fixture' })]
  );
  const pendingId = rows[0].id;
  console.log(`Created commit_failed fixture: pending_donation #${pendingId}`);

  await pool.query(
    `INSERT INTO pending_donation_items
       (pending_donation_id, line_no, description, quantity, unit,
        estimated_value_zar, status, routing_status)
     VALUES ($1, 1, $2, 1, 'kg', 50.00, 'resolved', 'ecd_fefo_stock');`,
    [pendingId, `${FIXTURE_TAG} commit-failed line`]
  );

  const token = await getAdminToken();
  const { json } = await httpJson(
    'confirm commit_failed fixture appears in default scope',
    'GET',
    '/donations/pending?statuses=awaiting_resolution,committing,commit_failed,commit_incomplete',
    token
  );

  const donation = json.data.find((d) => d.id === pendingId);
  if (!donation) throw new Error('Expected the commit_failed fixture to appear in the default-scope response.');
  if (donation.status !== 'commit_failed') throw new Error(`Expected status commit_failed, got ${donation.status}`);

  console.log(`\nRESULT: pending #${pendingId} confirmed with status='commit_failed' — the UI's warning badge + Reconciliation cross-link has real data to render. Kept as a live fixture; the Reconciliation tab task can also exercise retry-commit against it.`);
}

// ── cleanup ───────────────────────────────────────────────────
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
  console.log(`Removing pending_donations: ${ids.join(', ')} (and their items/flags via cascade or explicit delete)`);

  await pool.query(`DELETE FROM warehouse_manager_flags WHERE pending_donation_id = ANY($1);`, [ids]);
  await pool.query(`DELETE FROM pending_donation_items WHERE pending_donation_id = ANY($1);`, [ids]);
  const { rowCount } = await pool.query(`DELETE FROM pending_donations WHERE id = ANY($1);`, [ids]);
  console.log(`Removed ${rowCount} pending_donations rows.`);
}

// ── main ────────────────────────────────────────────────────
async function main() {
  const step = process.argv[2];
  try {
    if (step === 'default') {
      const token = await getAdminToken();
      await stepDefault(token);
    } else if (step === 'rejected') {
      const token = await getAdminToken();
      await stepRejected(token);
    } else if (step === 'failure') {
      await stepFailure();
    } else if (step === 'cleanup') {
      await cleanup();
    } else {
      console.log('Usage: node scripts/verify-dm-pending-donations.mjs <default|rejected|failure|cleanup>');
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