    // Manual live-DB verification for the pending-donation workflow.
// Usage: node scripts/verify-pending-donation.mjs <step> [args]
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

const step1_checkServerAndDb = async () => {
  // Show live routing rules so we can pick a category that will NOT auto-match
  await dbQuery(
    'LIVE donation_category_routing rows',
    'SELECT category, routing_outcome, storage_area, is_active FROM donation_category_routing ORDER BY category;'
  );
  await dbQuery(
    'LIVE users (id/username/role)',
    'SELECT id, username, role, is_active FROM users ORDER BY id LIMIT 20;'
  );
  await dbQuery(
    'LIVE pending_donations columns',
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_name = 'pending_donation_items' ORDER BY ordinal_position;`
  );
};

const step1b_findProduct = async () => {
  const rows = await dbQuery(
    'LIVE products with NO donation_routing_defaults row (safe for manual_review path)',
    `SELECT p.id, p.name, p.storage_type
     FROM products p
     LEFT JOIN donation_routing_defaults drd ON drd.product_id = p.id
     WHERE drd.product_id IS NULL AND p.is_active = true
     ORDER BY p.id LIMIT 5;`
  );
  return rows;
};

const step2_createPending = async () => {
  // Sign a token directly (same secret/payload shape as login route)
  const userRes = await pool.query(
    `SELECT id, username, role FROM users WHERE role IN ('admin','manager') AND is_active = true ORDER BY id LIMIT 1;`
  );
  const user = userRes.rows[0];
  if (!user) throw new Error('No active admin/manager user found in live DB.');
  console.log(`\nAuthenticated as: id=${user.id} username=${user.username} role=${user.role}`);
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  const body = {
    donorName: 'Live Verification Donor',
    donorContact: 'verify@example.com',
    donorTaxReference: null,
    donorConsentGiven: true,
    estimatedValueZar: 150,
    donationCategory: 'non_recipe_food', // valid top-level category for commit
    notes: 'Manual live-DB verification run',
    section18aStatus: null,
    section18aQualifying: null,
    draftSnapshot: JSON.stringify({ capturedAt: new Date().toISOString(), source: 'manual-verification' }),
    items: [
      {
        lineNo: 1,
        description: 'Unmatched mystery item for manual review',
        productId: 1, // Rice: exists in live DB (flags.product_id is NOT NULL), but has NO donation_routing_defaults row
        quantity: 5,
        unit: 'kg',
        estimatedValueZar: 150,
        requestedCategory: 'mystery_unmatched_item', // not in donation_category_routing -> manual_review -> flag (fits varchar(30))
      },
    ],
  };

  logJson('REQUEST BODY POST /api/donations/pending', body);

  const res = await fetch(`${API}/donations/pending`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `wms_token=${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  logJson(`RESPONSE STATUS ${res.status}`, json);
  return json;
};

const step3_queryRows = async () => {
  const pd = await dbQuery(
    'DB pending_donations (latest row)',
    'SELECT * FROM pending_donations ORDER BY id DESC LIMIT 1;'
  );
  const pendingId = pd[0]?.id;
  if (!pendingId) throw new Error('No pending_donations row found.');

  const items = await dbQuery(
    `DB pending_donation_items for pending_donation_id=${pendingId}`,
    'SELECT * FROM pending_donation_items WHERE pending_donation_id = $1;',
    [pendingId]
  );
  const flags = await dbQuery(
    `DB warehouse_manager_flags for pending_donation_id=${pendingId}`,
    'SELECT * FROM warehouse_manager_flags WHERE pending_donation_id = $1;',
    [pendingId]
  );
  return { pendingId, flagId: flags[0]?.id };
};

const step4_resolveFlag = async (flagId) => {
  const userRes = await pool.query(
    `SELECT id, username, role FROM users WHERE role IN ('admin','manager') AND is_active = true ORDER BY id LIMIT 1;`
  );
  const user = userRes.rows[0];
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  const body = { accepted: true, category: 'non_recipe_food' };
  logJson(`REQUEST BODY POST /api/donations/pending/flags/${flagId}/resolve`, body);

  const res = await fetch(`${API}/donations/pending/flags/${flagId}/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `wms_token=${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  logJson(`RESPONSE STATUS ${res.status}`, json);
};

const step5_verifyCommit = async () => {
  const pd = await dbQuery(
    'DB pending_donations (latest row, post-resolve)',
    'SELECT * FROM pending_donations ORDER BY id DESC LIMIT 1;'
  );
  const pendingId = pd[0]?.id;
  const donationId = pd[0]?.committed_donation_id;

  await dbQuery(
    `DB pending_donation_items for pending_donation_id=${pendingId}`,
    'SELECT * FROM pending_donation_items WHERE pending_donation_id = $1;',
    [pendingId]
  );

  const donation = await dbQuery(
    `DB donations row id=${donationId}`,
    'SELECT * FROM donations WHERE id = $1;',
    [donationId]
  );

  const donationItems = await dbQuery(
    `DB donation_items for donation_id=${donationId}`,
    'SELECT * FROM donation_items WHERE donation_id = $1;',
    [donationId]
  );

  // Side-by-side linkage proof
  const link = await pool.query(
    `SELECT pdi.id AS pending_item_id,
            pdi.committed_donation_item_id,
            di.id AS donation_item_id
     FROM pending_donation_items pdi
     LEFT JOIN donation_items di ON di.id = pdi.committed_donation_item_id
     WHERE pdi.pending_donation_id = $1;`,
    [pendingId]
  );
  logJson('LINKAGE CHECK pending_item.committed_donation_item_id <-> donation_items.id', link.rows);
};

const main = async () => {
  const step = process.argv[2];
  try {
    if (step === 'inspect') await step1_checkServerAndDb();
    else if (step === 'product') await step1b_findProduct();
    else if (step === 'create') await step2_createPending();
    else if (step === 'query') await step3_queryRows();
    else if (step === 'resolve') await step4_resolveFlag(process.argv[3]);
    else if (step === 'verify') await step5_verifyCommit();
    else throw new Error('Unknown step. Use inspect|create|query|resolve <flagId>|verify');
  } finally {
    await pool.end();
  }
};

main().catch((err) => {
  console.error('\n!!! STEP FAILED !!!');
  console.error(err);
  process.exit(1);
});