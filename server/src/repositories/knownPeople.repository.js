// ─────────────────────────────────────────────────────────────
// server/src/repositories/knownPeople.repository.js
//
// { names, keep }: the names of every person the system holds — staff, centre
// contacts, donors, benevolent callers, volunteers, supplier contacts —
// so a question can be scrubbed of them before it goes to the AI
// model (features/privacy/redact.js). Read at most every ten minutes
// per warehouse; a failure means an empty list, never a blocked
// question.
// ─────────────────────────────────────────────────────────────
import pool from '../config/db.js';
import { currentWarehouse } from '../config/warehouseContext.js';

const TTL_MS = 10 * 60 * 1000;
const cache = new Map();

// People only. donor_name is left out: it is often a company.
const PEOPLE_SQL = `
  SELECT trim(concat_ws(' ', first_name, last_name)) AS n FROM users
  UNION SELECT contact_name FROM ecd_centres
  UNION SELECT contact_name FROM suppliers
  UNION SELECT contact_name FROM supplier_prospects
  UNION SELECT trim(concat_ws(' ', donor_first_name, donor_last_name)) FROM donations
  UNION SELECT trim(concat_ws(' ', donor_first_name, donor_last_name)) FROM pending_donations
  UNION SELECT caller_name FROM community_requests
  UNION SELECT full_name FROM volunteers
  UNION SELECT trim(concat_ws(' ', volunteer_first_name, volunteer_last_name)) FROM volunteer_bookings
  UNION SELECT owner_name FROM collection_kits
  UNION SELECT driver_name FROM delivery_notes
  UNION SELECT driver_name FROM dispatch_events
  UNION SELECT collected_by_name FROM delivery_receipts`;

// Organisation and product names: a word in one of these ("Tiger",
// "Rice") stays in the question even if a person shares it.
const ORG_SQL = `
  SELECT name AS n FROM ecd_centres
  UNION SELECT name FROM suppliers
  UNION SELECT name FROM products
  UNION SELECT name FROM donors
  UNION SELECT name FROM programmes`;

export const listNames = async () => {
  let key = 'default';
  try { key = currentWarehouse?.() ?? 'default'; } catch { /* single database */ }
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.names;
  try {
    const [people, orgs] = await Promise.all([pool.query(PEOPLE_SQL), pool.query(ORG_SQL)]);
    const keep = new Set();
    for (const r of orgs.rows) for (const w of String(r.n ?? '').toLowerCase().split(/[^a-z0-9']+/)) if (w) keep.add(w);
    const names = people.rows.map((r) => r.n).filter((n) => n && n.trim().length >= 3);
    const value = { names, keep };
    cache.set(key, { at: Date.now(), names: value });
    return value;
  } catch (err) {
    console.warn('[knownPeople] could not load names:', err.message);
    return hit?.names ?? { names: [], keep: new Set() };
  }
};

export default { listNames };
