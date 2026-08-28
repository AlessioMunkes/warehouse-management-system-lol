// Manual live-verification for the Flagged Items tab (Donation Management).
// Exercises the three resolution paths exactly as the client does through
// donationManagementAPI.resolveFlag(), i.e. POST to the unified endpoint
//   POST /api/donations/pending/flags/:flagId/resolve   (D1/D2)
// with an admin wms_token cookie:
//   1. Accept an intake-linked flag  -> pending_donation_item resolves; if
//      it is the last open flag the pending donation commits.
//   2. Reject an intake-linked flag  -> item flips to rejected, reason kept.
//   3. Resolve a legacy flag (no intake link) with explicit name/sku/
//      storageType/defaultUnit/category -> product row persists verbatim
//      (Option A), not Flag N/FLAG-N.
// Throwaway rows are used; the final intake pending is left as a live UI
// fixture for the Flagged Items tab.
//
// Usage: node scripts/verify-dm-flagged-items.mjs <legacy|intake>
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const API = 'http://localhost:5000/api';

const logJson = (label, value) => {
  console.log(`\n===== ${label} =====`);
  console.log(JSON.stringify(value, null, 2));
};

const dbQuery = async (label, sql, params = []) => {
  const result = await pool.query(sql, params);
  logJson(label, result.rows);
  return result.rows;
};

const getAdminToken = async () => {
  const res = await pool.query(
    `SELECT id, username, role FROM users WHERE role = 'admin' AND is_active = true ORDER BY id LIMIT 1;`
  );
  const user = res.rows[0];
  if (!user) throw new Error('No active admin user found in live DB.');
  console.log(`Authenticated as: id=${user.id} username=${user.username} role=${user.role}`);
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

const httpJson = async (label, method, url, token, body) => {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: `wms_token=${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json;
  try { json = await res.json(); } catch { json = '<non-json>'; }
  logJson(`RESPONSE ${res.status} ${method} ${url} (${label})`, json);
  return { status: res.status, json: json.data ?? json };
};
// ── Legacy resolve with explicit fields ──────────────────────────
const stepLegacy = async () => {
  const token = await getAdminToken();

  const ts = Date.now();
  const productRes = await pool.query(
    `INSERT INTO products (name, stock_keeping_unit, storage_type, is_active, is_decantable, code_type, default_unit, is_perishable)
     VALUES ($1, $2, 'dry', true, false, 'fixed', 'kg', false)
     RETURNING id, name;`,
    [`DM_FLAGGED_LEGACY_${ts}`, `DM-FLAGGED-LEGACY-${ts}`]
  );
  const productId = productRes.rows[0].id;
  const flagRes = await pool.query(
    `INSERT INTO warehouse_manager_flags (product_id, quantity_kg, reason, target_location, created_by, status)
     VALUES ($1, 2, 'Flagged Items legacy verification.', 'Intake Holding Area', $2, 'pending_classification')
     RETURNING id;`,
    [productId, 1]
  );
  const flagId = flagRes.rows[0].id;
  console.log(`\nCreated legacy fixture: product #${productId}, flag #${flagId}`);

  const submitted = {
    accepted: true,
    category: 'non_food',
    name: 'Verified Legacy Tin',
    sku: 'VERIFIED-LEGACY',
    storageType: 'cold',
    defaultUnit: 'units',
  };
  const res = await httpJson(`resolve legacy flag #${flagId} with explicit fields`, 'POST', `/donations/pending/flags/${flagId}/resolve`, token, submitted);
  logJson('LEGACY RESPONSE SHAPE (expect product/flag/message, NOT pendingDonationId)', res.json);

  await dbQuery('DB products AFTER legacy resolve (expect Verified Legacy Tin / VERIFIED-LEGACY / cold / units)',
    'SELECT id, name, stock_keeping_unit AS sku, storage_type, default_unit, is_active FROM products WHERE id = $1;', [productId]);
  await dbQuery('DB flags AFTER legacy resolve (expect resolved)', 'SELECT id, status FROM warehouse_manager_flags WHERE id = $1;', [flagId]);
};
// ── Intake accept + reject through the unified endpoint ──────────
const stepIntake = async () => {
  const token = await getAdminToken();

  const body = {
    donorName: 'DM Flagged-Tab Intake Donor',
    donorContact: 'flagged-tab@example.com',
    donorConsentGiven: true,
    estimatedValueZar: 90,
    donationCategory: 'non_recipe_food',
    createdBy: 1,
    draftSnapshot: JSON.stringify({ capturedAt: new Date().toISOString(), source: 'flagged-items-verification' }),
    items: [1, 2].map((lineNo) => ({
      lineNo,
      // Unique per run: reusing fixed descriptions collides on the products
      // name unique constraint once a previous run's placeholder products
      // (renamed to the item description on accept) still exist.
      description: `Flagged tab intake line ${lineNo} (${Date.now()})`,
      productId: null,       // genuinely unmatched -> manual_review -> flag
      quantity: 3,
      unit: 'kg',
      estimatedValueZar: 45,
      requestedCategory: null,
    })),
  };

  const created = await httpJson('create 2-item intake pending (expect 201)', 'POST', '/donations/pending', token, body);
  const pendingId = created.json?.id;

  const flags = await dbQuery('flags for new pending donation', 'SELECT * FROM warehouse_manager_flags WHERE pending_donation_id = $1 ORDER BY id;', [pendingId]);
  if (flags.length !== 2) throw new Error(`Expected 2 flags, saw ${flags.length}`);

  // --- Reject the FIRST intake flag ---
  const rejectRes = await httpJson(`REJECT intake flag #${flags[0].id} (unified endpoint)`, 'POST', `/donations/pending/flags/${flags[0].id}/resolve`, token, {
    accepted: false,
    reason: 'Stated condition mismatch during intake verification.',
  });
  logJson('REJECT RESPONSE SHAPE', rejectRes.json);
  await dbQuery('DB pending_donation_items AFTER reject (expect line 1 REJECTED with reason; line 2 still awaiting)',
    'SELECT id, line_no, status, resolved_category, rejection_reason FROM pending_donation_items WHERE pending_donation_id = $1 ORDER BY line_no;', [pendingId]);
  await dbQuery('DB flags AFTER reject (flag1 resolved > flag2 pending)', 'SELECT id, status FROM warehouse_manager_flags WHERE pending_donation_id = $1 ORDER BY id;', [pendingId]);
  await dbQuery('DB pending_donations AFTER reject (must still be awaiting_resolution)', 'SELECT id, status, committed_donation_id FROM pending_donations WHERE id = $1;', [pendingId]);

  // --- ACCEPT the SECOND intake flag (last open -> commits) ---
  const acceptRes = await httpJson(`ACCEPT intake flag #${flags[1].id} (unified endpoint)`, 'POST', `/donations/pending/flags/${flags[1].id}/resolve`, token, {
    accepted: true,
    category: 'add_on_food',
  });
  logJson('ACCEPT RESPONSE SHAPE', acceptRes.json);
  await dbQuery('item after ACCEPT (line2 resolved add_on_food; line1 still rejected|)',
    'SELECT id, line_no, status, resolved_category, rejection_reason FROM pending_donation_items WHERE pending_donation_id = $1 ORDER BY line_no;', [pendingId]);
  await dbQuery('flags after ACCEPT (both resolved)', 'SELECT id, status FROM warehouse_manager_flags WHERE pending_donation_id = $1 ORDER BY id;', [pendingId]);
  await dbQuery('pending donation after ACCEPT (committed_donation_id set once last flag resolved)',
    'SELECT id, status, committed_donation_id FROM pending_donations WHERE id = $1;', [pendingId]);

  console.log(`\nRESULT: keep intake pending #${pendingId} as a live Flagged-Items tab fixture (committed).`);
};
const main = async () => {
  const step = process.argv[2];
  try {
    if (step === 'legacy') await stepLegacy();
    else if (step === 'intake') await stepIntake();
    else throw new Error('Unknown step. Use legacy|intake');
  } finally {
    await pool.end();
  }
};

main().catch((err) => {
  console.error('\n!!! STEP FAILED !!!');
  console.error(err);
  process.exit(1);
});