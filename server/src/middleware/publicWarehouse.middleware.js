// ─────────────────────────────────────────────────────────────
// server/src/middleware/publicWarehouse.middleware.js
//
// Which warehouse a request WITHOUT a staff login belongs to.
//
// Staff requests get their warehouse from the session (auth.middleware).
// A handful of pages are reached with no login at all: a pallet's QR
// code or short code, an emailed invite, a donor's Section 18A form,
// the volunteer sign-in page, and Gmail's OAuth callback. With one
// database per warehouse, each of those still has to run against the
// right one.
//
// Links carry a secret token that exists in exactly one warehouse's
// database, so the token itself says where it belongs: this looks it
// up in every warehouse and runs the request in the one that has it.
// No link needs to change, so QR codes already stuck on pallets and
// invites already emailed keep working when multi-warehouse mode is
// switched on.
//
// A hint (?w=<code> or the X-Warehouse header) only breaks a tie. It
// never overrides a token lookup, so a stale header from whoever used
// a shared tablet before cannot send a public link to the wrong site.
//
// Volunteer sign-in has no token, so it needs the hint: the poster's
// link carries ?w=, or the sign-in page asks which warehouse.
//
// With one database (WAREHOUSE_DB_URLS unset) this does nothing.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import pool from '../config/db.js';
import { runInWarehouse, isValidWarehouseCode } from '../config/warehouseContext.js';
import { isMultiWarehouse, warehouseCodes } from '../config/warehouses.js';
import gmailService from '../services/gmail.service.js';

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
// A malformed %-escape is just a bad link, not a server fault.
const safeDecode = (value) => { try { return decodeURIComponent(value); } catch { return value; } };
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

// Each rule: which requests it covers, and how to find their warehouse.
//   probe(match, req)  SQL run in every warehouse; a row back = "it's here"
//   hintOnly           no token to look up; the hint decides
//   resolve(req)       the warehouse is known some other way
export const RULES = [
  {
    name: 'slip short code',
    methods: ['GET', 'POST'],
    path: /^\/api\/slip\/code\/([0-9a-fA-F]{6})(?:\/claim)?\/?$/,
    probe: (m) => ['SELECT 1 FROM picking_slips WHERE RIGHT(public_token::text, 6) = LOWER($1) LIMIT 1', [m[1]]],
    ambiguous: 'This code matches pallets at more than one warehouse. Scan the QR code on the pallet instead.',
  },
  {
    name: 'slip token',
    methods: ['GET', 'POST'],
    path: new RegExp(`^/api/slip/(${UUID})(?:/claim)?/?$`),
    probe: (m) => ['SELECT 1 FROM picking_slips WHERE public_token = $1::uuid', [m[1]]],
  },
  {
    name: 'invite',
    methods: ['GET', 'POST'],
    path: /^\/api\/invites\/([A-Za-z0-9_-]{20,})(\/accept)?\/?$/,
    // GET resolves, POST only to /accept; other POSTs are staff routes.
    when: (m, req) => req.method === 'GET' ? !m[2] : Boolean(m[2]),
    probe: (m) => ['SELECT 1 FROM user_invites WHERE token_hash = $1', [sha256(m[1].trim())]],
  },
  {
    name: 'section 18A form',
    methods: ['GET', 'POST'],
    path: /^\/api\/donations\/section-18a\/form\/([^/]+)\/?$/,
    probe: (m) => ['SELECT 1 FROM donations WHERE section_18a_form_token_hash = $1', [sha256(safeDecode(m[1]))]],
  },
  {
    name: 'volunteer sign-in',
    methods: ['POST'],
    path: /^\/api\/volunteers\/sign-in\/?$/,
    hintOnly: true,
  },
  {
    name: 'gmail callback',
    methods: ['GET'],
    path: /^\/api\/gmail\/callback\/?$/,
    resolve: (req) => gmailService.warehouseForState(req.query?.state),
  },
];

const matchRule = (req) => {
  for (const rule of RULES) {
    if (!rule.methods.includes(req.method)) continue;
    const m = req.path.match(rule.path);
    if (m && (!rule.when || rule.when(m, req))) return { rule, m };
  }
  return null;
};

const readHint = (req) => {
  const raw = String(req.query?.w || req.get('X-Warehouse') || '').trim().toLowerCase();
  return isValidWarehouseCode(raw) && warehouseCodes().includes(raw) ? raw : null;
};

// Probing costs one query per warehouse on a request with no login,
// so it gets its own limiter on top of the routes' own. Counts every
// request (a probe costs the same whether or not it finds anything).
// Generous, because a warehouse's tablets usually share one public IP.
const probeLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             120,
  standardHeaders: 'draft-8',
  legacyHeaders:   false,
  message: {
    success: false,
    message: 'Too many attempts. Please wait a minute, or ask a staff member for help.',
  },
});

/** Warehouses where the probe finds the token. Throws if every lookup failed. */
export const findWarehouses = async (sql, params) => {
  const codes = warehouseCodes();
  const outcomes = await Promise.allSettled(
    codes.map((code) => runInWarehouse(code, () => pool.query(sql, params)))
  );
  if (outcomes.every((o) => o.status === 'rejected')) {
    throw new Error(outcomes[0].reason?.message || 'Every warehouse lookup failed.');
  }
  outcomes.forEach((o, i) => {
    if (o.status === 'rejected') {
      console.error(`[publicWarehouse] lookup failed in "${codes[i]}":`, o.reason?.message);
    }
  });
  return codes.filter((_, i) => outcomes[i].status === 'fulfilled' && outcomes[i].value.rows.length > 0);
};

const choose = async ({ rule, m }, req) => {
  const hint = readHint(req);

  if (rule.resolve) {
    // Unknown (e.g. an expired OAuth state): let the route answer in
    // its own words. It rejects the request before touching a database.
    const code = rule.resolve(req);
    return { code: code && warehouseCodes().includes(code) ? code : null };
  }

  if (rule.hintOnly) {
    if (hint) return { code: hint };
    if (warehouseCodes().length === 1) return { code: warehouseCodes()[0] };
    return {
      status: 400,
      body: { code: 'WAREHOUSE_REQUIRED', message: 'Choose which warehouse you are at.' },
    };
  }

  const [sql, params] = rule.probe(m, req);
  const found = await findWarehouses(sql, params);
  if (found.length === 1) return { code: found[0] };
  if (found.length === 0) {
    return { status: 404, body: { success: false, message: 'This link was not found. It may have been typed incorrectly.' } };
  }
  if (hint && found.includes(hint)) return { code: hint };
  return {
    status: 409,
    body: {
      code: 'WAREHOUSE_REQUIRED',
      message: rule.ambiguous || 'This link matches more than one warehouse.',
      warehouses: found,
    },
  };
};

const publicWarehouse = (req, res, next) => {
  if (!isMultiWarehouse()) return next();
  const hit = matchRule(req);
  if (!hit) return next();

  const run = async () => {
    let decision;
    try {
      decision = await choose(hit, req);
    } catch (err) {
      console.error(`[publicWarehouse] ${hit.rule.name}:`, err.message);
      return res.status(503).json({ message: 'The service is temporarily unavailable. Please try again shortly.' });
    }
    if (decision.status) return res.status(decision.status).json(decision.body);
    if (!decision.code) return next();
    return runInWarehouse(decision.code, next);
  };

  if (hit.rule.probe) return probeLimiter(req, res, run);
  return run();
};

export default publicWarehouse;
