#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// server/scripts/warehouse-admin.mjs — people across warehouses
//
// The rare jobs no warehouse admin can do from inside the app, because
// they reach beyond one site. Run from the server folder:
//
//   npm run warehouse-admin -- whois <username>
//       Which warehouses have this username, in what role, active or not.
//
//   npm run warehouse-admin -- create-admin <code> --username <u> --first <name> --last <name> [--email <e>]
//       A new site's first admin. Prints a one-time password to hand over.
//
//   npm run warehouse-admin -- grant <username> --to <code> --role <role> [--from <code>]
//       Give someone who works at one site access to another. Copies
//       their name and password, so they sign in once and see both.
//
//   npm run warehouse-admin -- revoke <username> --at <code>
//       Take a site away. The account there is deactivated, not deleted:
//       their past receipts and dispatches still point at it.
//
// Every change is written to that site's audit_log.
// Uses the same WAREHOUSE_DB_URLS as the app (server/.env).
//
// Why a username must be unique across sites: login matches the
// username in every warehouse. Two different people called "thabo"
// with the same password would share one session. So create-admin
// refuses a username used anywhere, and grant copies one person.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import pg     from 'pg';
import { parseWarehouseUrls } from '../src/config/dbRouter.js';
import { ROLE_VALUES } from '../src/utils/userAccountFields.js';

const BCRYPT_COST = 10; // same as user.service.js
const ssl = process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false };

const fail = (msg) => { console.error(`\n✗ ${msg}`); process.exit(1); };

const args = process.argv.slice(2);
const command = args[0];
const positional = args[1] && !args[1].startsWith('--') ? args[1] : null;
const option = (name, { required = false } = {}) => {
  const i = args.indexOf(name);
  const value = i === -1 ? null : args[i + 1];
  if (required && (!value || value.startsWith('--'))) fail(`${name} is required.`);
  return value && !value.startsWith('--') ? value.trim() : null;
};

let urls;
try {
  urls = parseWarehouseUrls(process.env.WAREHOUSE_DB_URLS);
} catch (err) {
  fail(err.message);
}
if (!urls) {
  fail('WAREHOUSE_DB_URLS is not set. These commands are for multi-warehouse mode; ' +
       'with one database, manage users in the app.');
}
const CODES = Object.keys(urls);
const checkCode = (code, label) => {
  if (!code) fail(`${label} is required.`);
  if (!CODES.includes(code)) fail(`No warehouse "${code}". Configured: ${CODES.join(', ')}.`);
  return code;
};

const clients = new Map();
const db = async (code) => {
  if (!clients.has(code)) {
    const client = new pg.Client({ connectionString: urls[code], ssl });
    try {
      await client.connect();
    } catch (err) {
      fail(`[${code}] cannot connect: ${err.message}`);
    }
    clients.set(code, client);
  }
  return clients.get(code);
};
const closeAll = () => Promise.all([...clients.values()].map((c) => c.end().catch(() => {})));

const USER_SQL = `SELECT id, username, first_name, last_name, email, role, is_active, password_hash
                    FROM users WHERE lower(username) = lower($1)`;

/** { code: row } for every warehouse where this username exists. */
const findEverywhere = async (username) => {
  const found = {};
  for (const code of CODES) {
    const { rows } = await (await db(code)).query(USER_SQL, [username]);
    if (rows[0]) found[code] = rows[0];
  }
  return found;
};

const audit = (client, { userId, action, reason, after }) => client.query(
  `INSERT INTO audit_log (entity_type, entity_id, action, actor_id, reason, after_data)
   VALUES ('user', $1, $2, NULL, $3, $4)`,
  [String(userId), action, reason, after ? JSON.stringify(after) : null],
);

// ── whois ─────────────────────────────────────────────────────
const whois = async () => {
  const username = positional || fail('Usage: whois <username>');
  const found = await findEverywhere(username);
  if (!Object.keys(found).length) {
    console.log(`\n"${username}" is not used at any warehouse.`);
    return;
  }
  console.log(`\n"${username}":`);
  for (const [code, u] of Object.entries(found)) {
    console.log(`  ${code.padEnd(16)} ${u.role.padEnd(18)} ${u.is_active ? 'active' : 'deactivated'}   (${u.first_name} ${u.last_name}, id ${u.id})`);
  }
};

// ── create-admin ──────────────────────────────────────────────
const createAdmin = async () => {
  const code = checkCode(positional, 'The warehouse code');
  const username = option('--username', { required: true });
  const first = option('--first', { required: true });
  const last = option('--last', { required: true });
  const email = option('--email');
  if (username.length > 50) fail('Username must be 50 characters or fewer.');

  const taken = await findEverywhere(username);
  if (Object.keys(taken).length) {
    fail(`"${username}" is already used at: ${Object.keys(taken).join(', ')}. ` +
         `Choose another username, or use "grant" to give that person access to ${code}.`);
  }

  // Readable one-time password: 12 characters from an unambiguous alphabet.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const password = Array.from(crypto.randomBytes(12), (b) => alphabet[b % alphabet.length]).join('');
  const hash = await bcrypt.hash(password, BCRYPT_COST);

  const client = await db(code);
  await client.query('BEGIN');
  try {
    const { rows: [user] } = await client.query(
      `INSERT INTO users (username, first_name, last_name, email, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, 'admin', $5, true) RETURNING id`,
      [username, first, last, email, hash],
    );
    await audit(client, {
      userId: user.id,
      action: 'warehouse_admin_created',
      reason: 'Created by scripts/warehouse-admin.mjs create-admin',
      after: { username, role: 'admin', warehouse: code },
    });
    await client.query('COMMIT');
    console.log(`\n✓ ${first} ${last} is now an admin at "${code}".`);
    console.log(`  Username:           ${username}`);
    console.log(`  One-time password:  ${password}`);
    console.log('\n  Hand this over in person or by phone, not by email. It is not stored');
    console.log('  anywhere and will not be shown again. Ask them to change it after their');
    console.log('  first login, and to appoint a second admin for the site.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    fail(`[${code}] ${err.message}. Nothing was created.`);
  }
};

// ── grant ─────────────────────────────────────────────────────
const grant = async () => {
  const username = positional || fail('Usage: grant <username> --to <code> --role <role> [--from <code>]');
  const to = checkCode(option('--to', { required: true }), '--to');
  const role = option('--role', { required: true });
  if (!ROLE_VALUES.includes(role)) fail(`--role must be one of: ${ROLE_VALUES.join(', ')}.`);

  const found = await findEverywhere(username);
  const activeSources = Object.entries(found).filter(([c, u]) => c !== to && u.is_active);

  let from = option('--from');
  if (from) {
    checkCode(from, '--from');
    if (!found[from]?.is_active) fail(`"${username}" has no active account at "${from}".`);
  } else if (activeSources.length === 1) {
    [[from]] = activeSources;
  } else if (activeSources.length === 0) {
    fail(`"${username}" has no active account at any other warehouse. ` +
         'For someone new, their site admin creates them in the app.');
  } else {
    fail(`"${username}" is active at ${activeSources.map(([c]) => c).join(' and ')}. Say which with --from.`);
  }
  const source = found[from];

  const client = await db(to);
  const existing = found[to];
  if (existing?.is_active) fail(`"${username}" already has access to "${to}" (${existing.role}).`);

  await client.query('BEGIN');
  try {
    let userId;
    if (existing) {
      // A deactivated account at this site: bring it back rather than
      // creating a second row, so their history there stays theirs.
      await client.query(
        `UPDATE users SET is_active = true, role = $2, password_hash = $3,
                          first_name = $4, last_name = $5
          WHERE id = $1`,
        [existing.id, role, source.password_hash, source.first_name, source.last_name],
      );
      userId = existing.id;
    } else {
      const { rows: [user] } = await client.query(
        `INSERT INTO users (username, first_name, last_name, email, role, password_hash, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
        [source.username, source.first_name, source.last_name, source.email, role, source.password_hash],
      );
      userId = user.id;
    }
    await audit(client, {
      userId,
      action: 'warehouse_access_granted',
      reason: `Granted by scripts/warehouse-admin.mjs grant (account copied from "${from}")`,
      after: { username: source.username, role, warehouse: to, from },
    });
    await client.query('COMMIT');
    console.log(`\n✓ ${source.first_name} ${source.last_name} (${source.username}) now has ${role} access to "${to}".`);
    console.log(`  Same password as at "${from}". The switcher appears at their next login.`);
    console.log('  If they later change their password at one site, the other keeps the old one');
    console.log('  and only the site whose password they type opens. Run grant again to re-sync.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    fail(`[${to}] ${err.message}. Nothing was changed.`);
  }
};

// ── revoke ────────────────────────────────────────────────────
const revoke = async () => {
  const username = positional || fail('Usage: revoke <username> --at <code>');
  const at = checkCode(option('--at', { required: true }), '--at');
  const client = await db(at);
  const { rows: [user] } = await client.query(USER_SQL, [username]);
  if (!user?.is_active) fail(`"${username}" has no active account at "${at}".`);

  if (user.role === 'admin') {
    const { rows: [{ n }] } = await client.query(
      `SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND is_active AND id <> $1`, [user.id],
    );
    if (n === 0) fail(`"${username}" is the last active admin at "${at}". Appoint another admin there first.`);
  }

  await client.query('BEGIN');
  try {
    await client.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);
    await audit(client, {
      userId: user.id,
      action: 'warehouse_access_revoked',
      reason: 'Revoked by scripts/warehouse-admin.mjs revoke',
      after: { username: user.username, warehouse: at },
    });
    await client.query('COMMIT');
    console.log(`\n✓ "${user.username}" no longer has access to "${at}". Their account there is deactivated;`);
    console.log('  their past work stays attributed to them. A session they have open now ends at its next');
    console.log('  check; when they sign in again, that site is no longer offered.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    fail(`[${at}] ${err.message}. Nothing was changed.`);
  }
};

const commands = { whois, 'create-admin': createAdmin, grant, revoke };
if (!commands[command]) {
  fail('Use one of: whois, create-admin, grant, revoke. See the top of scripts/warehouse-admin.mjs.');
}

commands[command]()
  .catch((err) => fail(err.message))
  .finally(closeAll);
