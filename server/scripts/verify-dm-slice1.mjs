// Manual live-verification for Donation Management backend slice 1:
//   1. GET /api/donations/pending            (list endpoint: default scope, filter, 400, 403)
//   2. GET /api/donations/admin/pending-classifications (enriched Intake/Legacy columns)
//   3. Unified-resolve Option A passthrough  (legacy flag, explicit fields)
//   4. Unified-resolve fallback              (legacy flag, fields omitted)
//   5. Intake-linked flag resolution         (unaffected by the passthrough change)
// Throwaway rows are used for steps 3-5 and cleaned up; intake fixtures stay put.
//
// Usage: node scripts/verify-dm-slice1.mjs <state|list|legacy-explicit|legacy-fallback|intake|cleanup-legacy>
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

const getAdminUser = async () => {
  const res = await pool.query(
    `SELECT id, username, role FROM users WHERE role = 'admin' AND is_active = true ORDER BY id LIMIT 1;`
  );
  const user = res.rows[0];
  if (!user) throw new Error('No active admin user found in live DB.');
  console.log(`Authenticated as: id=${user.id} username=${user.username} role=${user.role}`);
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token };
};

const getManagerToken = async () => {
  const res = await pool.query(
    `SELECT id, username, role FROM users WHERE role = 'manager' AND is_active = true ORDER BY id LIMIT 1;`
  );
  const user = res.rows[0];
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
  return { status: res.status, json };
};

const stepState = async () => {
  await dbQuery('LIVE pending_donations', 'SELECT id, donor_name, donation_category, status, committed_donation_id, created_at FROM pending_donations ORDER BY id;');
  await dbQuery(
    'LIVE warehouse_manager_flags (intake-linkage view)',
    `SELECT f.id, f.product_id, p.name AS product_name, f.status, f.pending_donation_id, f.pending_donation_item_id
     FROM warehouse_manager_flags f LEFT JOIN products p ON p.id = f.product_id
     WHERE f.status IN ('pending','pending_classification') ORDER BY f.id DESC LIMIT 15;`
  );
};

const stepList = async () => {
  const { token } = await getAdminUser();
  const managerToken = await getManagerToken();

  const def = await httpJson('default scope, admin', 'GET', '/donations/pending', token);
  logJson('DEFAULT SCOPE summary', def.json.data.map((d) => ({
    id: d.id,
    status: d.status,
    donor_name: d.donor_name,
    item_counts: d.item_counts,
    items: d.items.map((i) => ({ id: i.id, line_no: i.line_no, description: i.description, status: i.status, rejection_reason: i.rejection_reason, flag_id: i.flag_id })),
  })));

  await httpJson('explicit CSV filter (deduped)', 'GET', '/donations/pending?statuses=commit_failed,%20commit_incomplete,commit_failed', token);
  await httpJson('unknown status (expect 400)', 'GET', '/donations/pending?statuses=awaiting_resolution,bogus', token);
  await httpJson('manager token (expect 403)', 'GET', '/donations/pending', managerToken);

  await httpJson('enriched pending-classifications (admin)', 'GET', '/donations/admin/pending-classifications', token);
};

const createLegacyFlagFixture = async (productSuffix) => {
  const { user } = await getAdminUser();
  const productRes = await pool.query(
    `INSERT INTO products (name, stock_keeping_unit, storage_type, default_unit, is_active)
     VALUES ($1, $2, 'dry', 'kg', false)
     RETURNING id, name;`,
    [`DM_SLICE1_${productSuffix}`, `DM-SLICE1-${productSuffix}`]
  );
  const flagRes = await pool.query(
    `INSERT INTO warehouse_manager_flags (product_id, quantity_kg, reason, target_location, created_by, status)
     VALUES ($1, 2, 'Slice 1 live verification legacy flag.', 'Intake Holding Area', $2, 'pending_classification')
     RETURNING id;`,
    [productRes.rows[0].id, user.id]
  );
  console.log(`\nCreated fixture: product #${productRes.rows[0].id} "${productRes.rows[0].name}", flag #${flagRes.rows[0].id}`);
  return { productId: productRes.rows[0].id, flagId: flagRes.rows[0].id };
};

const stepLegacyExplicit = async () => {
  const { productId, flagId } = await createLegacyFlagFixture('LEGACY_EXPLICIT');
  const { token } = await getAdminUser();

  await httpJson(`resolve legacy flag #${flagId} WITH explicit fields`, 'POST', `/donations/pending/flags/${flagId}/resolve`, token, {
    accepted: true,
    category: 'non_food',
    name: 'Canned Beans (slice1 explicit)',
    sku: 'BEANS-SLICE1',
    storageType: 'cold',
    defaultUnit: 'units',
  });

  // THE Option A assertion: product must carry the submitted values verbatim.
  await dbQuery('DB products AFTER explicit resolve (expect Canned Beans / BEANS-SLICE1 / cold / units)',
    'SELECT id, name, stock_keeping_unit AS sku, storage_type, default_unit FROM products WHERE id = $1;', [productId]);
  await dbQuery('DB warehouse_manager_flags AFTER explicit resolve (expect resolved)',
    'SELECT id, status FROM warehouse_manager_flags WHERE id = $1;', [flagId]);
};

const stepLegacyFallback = async () => {
  const { productId, flagId } = await createLegacyFlagFixture('LEGACY_FALLBACK');
  const { token } = await getAdminUser();

  await httpJson(`resolve legacy flag #${flagId} WITHOUT fields`, 'POST', `/donations/pending/flags/${flagId}/resolve`, token, {
    accepted: true,
    category: 'recipe_food',
  });

  // THE fallback assertion: historical placeholder behavior unchanged.
  await dbQuery('DB products AFTER fallback resolve (expect Flag N / FLAG-N / dry / kg)',
    'SELECT id, name, stock_keeping_unit AS sku, storage_type, default_unit FROM products WHERE id = $1;', [productId]);
};

const cleanupLegacyFixtures = async () => {
  // Match on flag reason: finalize renames the placeholder product/sku, so
  // the original DM_SLICE1_ name no longer exists after a successful resolve.
  const rows = await pool.query(
    `SELECT id AS flag_id FROM warehouse_manager_flags
     WHERE reason = 'Slice 1 live verification legacy flag.';`
  );
  if (rows.rows.length === 0) {
    console.log('\nNo legacy verification fixtures found to clean.');
    return;
  }
  const flagIds = rows.rows.map((r) => r.flag_id);
  const prodRows = await pool.query('SELECT DISTINCT product_id FROM warehouse_manager_flags WHERE id = ANY($1::int[]);', [flagIds]);
  const productIds = prodRows.rows.map((r) => r.product_id);
  const delDefaults = await pool.query('DELETE FROM donation_routing_defaults WHERE product_id = ANY($1::int[]) RETURNING product_id;', [productIds]);
  const delFlags = await pool.query('DELETE FROM warehouse_manager_flags WHERE id = ANY($1::int[]) RETURNING id;', [flagIds]);
  const delProducts = await pool.query('DELETE FROM products WHERE id = ANY($1::int[]) RETURNING id;', [productIds]);
  logJson('CLEANUP removed', {
    routing_defaults: delDefaults.rowCount,
    flags: delFlags.rowCount,
    products: delProducts.rowCount,
  });
};

// Intake-linked path: create a THROWAWAY pending donation with TWO flagged
// items (so the commit cannot auto-fire), resolve ONLY the first flag through
// the unified endpoint, then prove in the DB that: the flag resolved, the
// linked pending_donation_item resolved with the chosen category, the sibling
// flag + item stayed untouched, and the donation itself stayed awaiting_resolution.
const stepIntakeUnaffected = async () => {
  const { user, token } = await getAdminUser();

  const body = {
    donorName: 'DM Slice1 Intake Verification Donor',
    donorContact: 'dm-verify@example.com',
    donorConsentGiven: true,
    estimatedValueZar: 90,
    donationCategory: 'non_recipe_food',
    createdBy: user.id,
    draftSnapshot: JSON.stringify({ capturedAt: new Date().toISOString(), source: 'dm-slice1-verification' }),
    items: [1, 2].map((lineNo) => ({
      lineNo,
      description: `Slice1 intake line ${lineNo}`,
      // Genuinely unmatched: both productId AND requestedCategory are left
      // blank. Supplying a productId that has a donation_routing_defaults row
      // (e.g. 'Rice') makes determineRouting auto-resolve via product_default
      // (source='product_default', outcome e.g. ecd_fefo_stock) and never flag.
      // Leaving both blank forces routePendingItem to the BR-10 manual_review
      // path: the intake flow inserts an inactive placeholder product for the
      // flag (flags.product_id is NOT NULL) and creates 2 manager flags.
      productId: null,
      quantity: 3,
      unit: 'kg',
      estimatedValueZar: 45,
      requestedCategory: null,
    })),
  };

  const created = await httpJson('create 2-item intake pending (expect 201)', 'POST', '/donations/pending', token, body);
  const pendingId = created.json.data?.id;

  const flags = await dbQuery('DB flags for new pending donation', 'SELECT * FROM warehouse_manager_flags WHERE pending_donation_id = $1 ORDER BY id;', [pendingId]);
  if (flags.length !== 2) throw new Error(`Expected exactly 2 flags on pending ${pendingId}, saw ${flags.length}`);

  await httpJson(`resolve FIRST intake flag #${flags[0].id}`, 'POST', `/donations/pending/flags/${flags[0].id}/resolve`, token, {
    accepted: true,
    category: 'add_on_food',
    resolvedBy: user.id,
  });

  await dbQuery('DB pending_donation_items AFTER intake flag resolve',
    'SELECT id, line_no, description, status, resolved_category, routing_status, rejection_reason FROM pending_donation_items WHERE pending_donation_id = $1 ORDER BY line_no;', [pendingId]);
  await dbQuery('DB warehouse_manager_flags AFTER intake flag resolve',
    'SELECT id, status, pending_donation_id FROM warehouse_manager_flags WHERE pending_donation_id = $1 ORDER BY id;', [pendingId]);
  // THE intake assertion: one flag left open => NOT committing/committed.
  await dbQuery('DB pending_donations AFTER intake flag resolve (MUST still be awaiting_resolution)',
    'SELECT id, status, committed_donation_id FROM pending_donations WHERE id = $1;', [pendingId]);

  console.log(`\nRESULT: keep pending #${pendingId} as a live Tab-1/UI fixture (one flag still open).`);
};

const main = async () => {
  const step = process.argv[2];
  try {
    if (step === 'state') await stepState();
    else if (step === 'list') await stepList();
    else if (step === 'legacy-explicit') await stepLegacyExplicit();
    else if (step === 'legacy-fallback') await stepLegacyFallback();
    else if (step === 'cleanup-legacy') await cleanupLegacyFixtures();
    else if (step === 'intake') await stepIntakeUnaffected();
    else throw new Error('Unknown step. Use state|list|legacy-explicit|legacy-fallback|intake|cleanup-legacy');
  } finally {
    await pool.end();
  }
};

main().catch((err) => {
  console.error('\n!!! STEP FAILED !!!');
  console.error(err);
  process.exit(1);
});