// Live verification for the Pending Donations tab (D4 scope).
// Sets up a commit_failed donation with a rejected item (so the tab can prove
// it renders the failure-state badge + the struck-through rejected row + reason),
// then asserts the GET /api/donations/pending?statuses=... endpoint returns it
// in the shape the PendingDonationsTab component consumes.

import dotenv from 'dotenv';
import pg from 'pg';
import https from 'https';
import http from 'http';

dotenv.config({ path: new URL('../.env', import.meta.url) });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const BASE = process.env.VITE_API_URL || 'http://localhost:5000';
let cookieHeader = '';

const request = (method, path, body, token) => {
  const url = new URL(BASE + path);
  const data = body ? JSON.stringify(body) : null;
  const headers = { 'Content-Type': 'application/json', Cookie: `wms_token=${token}` };
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(url, { method, headers }, (res) => {
      // (cookies are signed up-front, no need to capture here)
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: chunks ? JSON.parse(chunks) : {} }); }
        catch (e) { resolve({ status: res.statusCode, headers: res.headers, body: chunks }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
};

// Get an admin token by signing a JWT directly from the live DB user
// (mirrors server/scripts/verify-dm-flagged-items.mjs).
import jwt from 'jsonwebtoken';

const login = async () => {
  const res = await pool.query(
    `SELECT id, username, role FROM users WHERE role = 'admin' AND is_active = true ORDER BY id LIMIT 1;`
  );
  const user = res.rows[0];
  if (!user) { console.error('No active admin user found in live DB.'); process.exit(1); }
  console.log(`Authenticated as: id=${user.id} username=${user.username} role=${user.role}`);
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

const run = async () => {
  const token = await login();

    // Create a donation pushed directly to commit_failed with a rejected item.
  const pdRes = await pool.query(
    `INSERT INTO pending_donations
          (donor_name, donor_contact, donor_tax_reference, donor_consent_given,
      estimated_value_zar, donation_category, status, created_by, draft_snapshot)
     VALUES ($1, $2, $3, true, $4, $5, 'commit_failed', 1, $6)
     RETURNING id`,
    ['Pending Donations Tab Verify Donor', 'verify@example.com', 'TX-999', '25.00', 'recipe_food', { source: 'dm-slice2-verify' }]
  );
  const donationId = pdRes.rows[0].id;

  await pool.query(`INSERT INTO pending_donation_items (pending_donation_id, line_no, description, quantity, unit, status, routing_status, rejection_reason) VALUES ($1, 1, $2, 2, 'kg', 'rejected', 'rejected', $3)`, [donationId, 'Rejected line item', 'Damaged beyond use']);
  await pool.query(`INSERT INTO pending_donation_items (pending_donation_id, line_no, description, quantity, unit, status, routing_status) VALUES ($1, 2, $2, 1, 'kg', 'resolved', 'accepted')`, [donationId, 'Accepted line item']);

  console.log(`Created commit_failed donation #${donationId} with a rejected item.`);

  // Hit the endpoint the tab consumes (D4 scope: all four statuses).
  const statuses = encodeURIComponent(['awaiting_resolution', 'committing', 'commit_failed', 'commit_incomplete'].join(','));
    const res = await request('GET', `/api/donations/pending?statuses=${statuses}`, null, token);

  console.log(`GET /api/donations/pending?statuses=... -> ${res.status}`);
  const data = res.body?.data || [];
  const found = data.find((d) => d.id === donationId);
  if (!found) {
    console.error('!!! commit_failed donation NOT in response !!!');
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('commit_failed donation in response:');
  console.log(JSON.stringify(found, null, 2));

  // Assertions against what the tab renders.
  const ok = [];
  ok.push(['donation status is commit_failed', found.status === 'commit_failed']);
  ok.push(['items array present', Array.isArray(found.items) && found.items.length === 2]);
  const rej = found.items.find((i) => i.status === 'rejected');
  const acc = found.items.find((i) => i.status === 'resolved');
  ok.push(['rejected item present', !!rej]);
  ok.push(['rejected item has rejection_reason', rej?.rejection_reason === 'Damaged beyond use']);
  ok.push(['resolved item present', !!acc]);
  ok.push(['item_counts.resolved=1', found.item_counts?.resolved === 1]);
  ok.push(['donor name present', found.donor_name === 'Pending Donations Tab Verify Donor']);

  console.log('\n--- Assertions ---');
  ok.forEach(([name, pass]) => console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`));

  const failed = ok.filter(([, p]) => !p);
  console.log(`\n${ok.length - failed.length}/${ok.length} assertions passed`);
  if (failed.length > 0) {
    console.error('!!! VERIFICATION FAILED !!!');
    process.exit(1);
  }
  console.log('RESULT: Pending Donations tab scope (D4) verified — commit_failed + rejected item renders correctly.');
  await pool.end();
};

run().catch((e) => { console.error(e); process.exit(1); });


