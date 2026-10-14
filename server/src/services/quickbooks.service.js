// ─────────────────────────────────────────────────────────────
// server/src/services/quickbooks.service.js
//
// QuickBooks Online: connect the company, then send each approved
// purchase order across so Finance does not have to capture it by hand.
//
// OFF UNTIL IT IS SET UP. With no keys on the server (config/
// quickbooks.js) or no company connected, every entry point here says
// so and does nothing; the Finance email carries on exactly as before.
//
// IT NEVER WRITES TO THE BOOKS ON A GUESS. A purchase order is only
// created when its supplier and every product on it are found in
// QuickBooks by exactly the same name. If any is missing, nothing is
// created: the order is marked "needs a match" with the names that
// were not found, Finance still has the email, and a manager sends it
// again once the supplier or item exists in QuickBooks. This system
// never creates a supplier, an item or an account over there.
//
// IT NEVER SENDS AN ORDER TWICE. Before creating, it asks QuickBooks
// for a purchase order with this order's number, and links to that one
// if it is there. So a retry after a timeout, or an order Finance
// already captured by hand, ends up linked, not duplicated.
//
// IT NEVER HOLDS UP THE WAREHOUSE. Approving an order returns as soon
// as the approval is saved; the send happens after, and a failure is
// recorded on the order for someone to retry.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import qbo from '../features/quickbooks/client.js';
import repo from '../repositories/quickbooks.repository.js';
import purchaseOrderRepo from '../repositories/purchaseOrder.repository.js';
import {
  environment, isConfigured, OAUTH_STATE_TTL_MS, parseEncryptionKey, SCOPE,
} from '../config/quickbooks.js';
import { currentWarehouse } from '../config/warehouseContext.js';
import { lineAmount } from '../utils/poMoney.js';
import { findPoNumbers } from '../utils/quickbooksImport.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// ── Token storage ───────────────────────────────────────────
// AES-256-GCM, the same scheme the Gmail connection uses: what is in
// the database is useless without the key on the server.
const encrypt = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', parseEncryptionKey(), iv);
  const data = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
};

const decrypt = (stored) => {
  const parts = String(stored).split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw fail(500, 'The stored QuickBooks credential cannot be read. Reconnect QuickBooks.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', parseEncryptionKey(), Buffer.from(parts[1], 'base64'));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
};

// ── Connecting ──────────────────────────────────────────────
// Intuit calls back with no session, so the state it carries is the
// only proof the flow was started here, by a signed-in admin, recently.
const states = new Map();
const sweepStates = () => {
  const now = Date.now();
  for (const [state, meta] of states) if (meta.expiresAt <= now) states.delete(state);
};

const startConnect = ({ userId } = {}) => {
  if (!isConfigured()) throw fail(503, 'QuickBooks is not set up on this server yet.');
  parseEncryptionKey();   // fail now, not after the admin has signed in at Intuit
  sweepStates();
  const state = crypto.randomBytes(32).toString('hex');
  states.set(state, { expiresAt: Date.now() + OAUTH_STATE_TTL_MS, userId: userId ?? null, warehouse: currentWarehouse() });
  return { state, redirectUrl: qbo.authorizeUrl(state) };
};

const warehouseForState = (state) => {
  const meta = state ? states.get(String(state)) : null;
  return meta && meta.expiresAt > Date.now() ? (meta.warehouse ?? null) : null;
};

// A callback can arrive twice for one sign-in (a browser that repeats the
// request, a prefetch, a double click on Intuit's page). The first
// finishes the connection; the second must not be told the sign-in has
// "expired" and send the admin back to Settings with an error, after the
// connection was in fact made. So the state is kept for its ten minutes
// with the outcome of the first call, and a repeat with the SAME code and
// company simply gets that outcome again. A different code on a used state
// is still refused: the state only ever vouches for one sign-in.
const handleCallback = async ({ code = null, state = null, realmId = null, oauthError = null } = {}) => {
  sweepStates();
  if (oauthError) throw fail(400, 'QuickBooks sign-in was cancelled or refused.');
  const meta = state ? states.get(String(state)) : null;
  if (!meta || meta.expiresAt <= Date.now()) throw fail(400, 'That QuickBooks sign-in has expired. Start again from Settings.');
  if (!code || !realmId) throw fail(400, 'QuickBooks did not send back what is needed to connect. Start again from Settings.');
  if (!/^[0-9]{1,32}$/.test(String(realmId))) throw fail(400, 'QuickBooks sent back a company this system cannot use.');

  if (meta.completion) {
    if (meta.code !== String(code) || meta.realmId !== String(realmId)) {
      throw fail(400, 'That QuickBooks sign-in has expired. Start again from Settings.');
    }
    return meta.completion;
  }
  meta.code = String(code);
  meta.realmId = String(realmId);
  meta.completion = (async () => {
    const tokens = await qbo.exchangeCode(String(code));
    await repo.saveConnection({
      realmId: String(realmId),
      tokenType: tokens.tokenType,
      scope: SCOPE,
      accessEncrypted: encrypt(tokens.accessToken),
      refreshEncrypted: encrypt(tokens.refreshToken),
      accessExpiresAt: tokens.accessExpiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
      userId: meta.userId,
    });
    return { realmId: String(realmId) };
  })();
  return meta.completion;
};

const disconnect = async () => {
  const connection = await repo.getConnection();
  if (!connection) return { disconnected: false };
  // Tell Intuit first, while there is still a token to revoke; the
  // connection is removed here whether or not they answer.
  try { await qbo.revoke(decrypt(connection.refresh_token_encrypted)); } catch { /* removed below regardless */ }
  await repo.deleteConnection();
  return { disconnected: true };
};

// ── A working session ───────────────────────────────────────
// Access tokens last about an hour. One is fetched again when it is
// within five minutes of expiring; two orders approved together share
// the one refresh, because Intuit replaces the refresh token each time
// and the loser of a race would be holding a dead one.
let refreshing = null;

const session = async () => {
  if (!isConfigured()) throw Object.assign(fail(503, 'QuickBooks is not set up on this server yet.'), { quickbooks: 'off' });
  const connection = await repo.getConnection();
  if (!connection) throw Object.assign(fail(409, 'QuickBooks is not connected. Connect it in Settings.'), { quickbooks: 'off' });

  const expires = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  if (expires - Date.now() > 5 * 60 * 1000) {
    return { realmId: connection.realm_id, accessToken: decrypt(connection.access_token_encrypted) };
  }

  if (!refreshing) {
    refreshing = (async () => {
      const tokens = await qbo.refreshTokens(decrypt(connection.refresh_token_encrypted));
      await repo.updateTokens(connection.id, {
        accessEncrypted: encrypt(tokens.accessToken),
        refreshEncrypted: encrypt(tokens.refreshToken),
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      });
      return tokens.accessToken;
    })().finally(() => { refreshing = null; });
  }
  return { realmId: connection.realm_id, accessToken: await refreshing };
};

// What Settings shows. Never a token, and never a thrown error: a
// status screen has to render whatever state the connection is in.
const status = async ({ check = false } = {}) => {
  const base = { configured: isConfigured(), environment: environment(), connected: false, working: false, realmId: null, company: null, error: null };
  if (!base.configured) return base;
  let connection;
  try { connection = await repo.getConnection(); } catch (err) { return { ...base, error: err.message }; }
  if (!connection) return base;

  const out = {
    ...base, connected: true, working: true, realmId: connection.realm_id,
    connectedAt: connection.created_at,
    // After about 100 days unused, Intuit retires the refresh token.
    reconnectBy: connection.refresh_token_expires_at,
  };
  if (connection.refresh_token_expires_at && new Date(connection.refresh_token_expires_at) <= new Date()) {
    return { ...out, working: false, error: 'The QuickBooks sign-in has expired. Reconnect it.' };
  }
  if (!check) return out;
  try {
    out.company = await qbo.companyName(await session());
  } catch (err) {
    out.working = false;
    out.error = err.quickbooks === 'auth' ? 'QuickBooks no longer accepts this connection. Reconnect it.' : err.message;
  }
  return out;
};

// ── Sending a purchase order ────────────────────────────────
const sending = new Set();
const dayOf = (value) => {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
};

// "17 Oct 2026", for a person reading the order in QuickBooks.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const readable = (value) => {
  const iso = dayOf(value);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

// QuickBooks' own shape for a purchase order. Exported for the tests.
export const buildPurchaseOrder = (po, { vendor, items, payables }) => ({
  DocNumber: po.po_number,
  TxnDate: dayOf(po.created_at),
  // Finance was asked to type our order number into the Memo when
  // capturing by hand, and the file import links on it. Kept here so
  // an order sent this way is found by the same number.
  PrivateNote: po.po_number,
  // QuickBooks keeps no delivery date on a purchase order: ShipDate is
  // refused and DueDate is accepted and silently dropped (checked against
  // a sandbox company). The Memo, the message to the supplier, is kept, so
  // the date travels there, after the number the file import looks for.
  Memo: [po.po_number, readable(po.expected_delivery_date) && `Expected delivery ${readable(po.expected_delivery_date)}`, po.notes]
    .filter(Boolean).join(' · ').slice(0, 4000),
  VendorRef: { value: String(vendor.Id), name: vendor.DisplayName },
  ...(payables ? { APAccountRef: { value: String(payables.Id), name: payables.Name } } : {}),
  Line: po.items.map((line) => {
    const item = items.get(line.id);
    const qty = Number(line.expected_quantity);
    const price = line.unit_price === null || line.unit_price === undefined ? 0 : Number(line.unit_price);
    return {
      DetailType: 'ItemBasedExpenseLineDetail',
      Amount: lineAmount(qty, price),
      Description: [line.product_name, line.default_unit ? `(${line.default_unit})` : null].filter(Boolean).join(' '),
      ItemBasedExpenseLineDetail: { ItemRef: { value: String(item.Id), name: item.Name }, Qty: qty, UnitPrice: price },
    };
  }),
});

const describeMissing = ({ supplier, products }) => {
  const parts = [];
  if (supplier) parts.push(`supplier "${supplier}"`);
  if (products.length) parts.push(`${products.length === 1 ? 'product' : 'products'} ${products.map((p) => `"${p}"`).join(', ')}`);
  return `Not found in QuickBooks by name: ${parts.join(' and ')}. Add ${parts.length > 1 || products.length > 1 ? 'them' : 'it'} in QuickBooks with exactly the same name, then send this order again.`;
};

/**
 * Send one order to QuickBooks. Never throws for an expected outcome;
 * returns what happened:
 *   { state: 'off' }                         not set up or not connected
 *   { state: 'synced', quickbooksPoId }      created, or found already there
 *   { state: 'needs_match', missing, message }   nothing was created
 *   { state: 'refused', message, items }     QuickBooks will not take it as it is;
 *                                            a person fixes it, then sends again
 *   { state: 'failed', message }             worth another try later
 *   { state: 'sending' }                     another send of this order is running
 */
const pushPurchaseOrder = async (rawId) => {
  const poId = Number(rawId);
  if (!Number.isInteger(poId) || poId <= 0) throw fail(400, 'A valid purchase order ID is required.');
  if (!isConfigured() || !(await repo.getConnection())) return { state: 'off' };

  const po = await purchaseOrderRepo.getPurchaseOrderById(poId);
  if (!po) throw fail(404, 'Purchase order not found.');
  if (po.quickbooks_po_id) return { state: 'synced', quickbooksPoId: po.quickbooks_po_id, already: true };
  if (po.status === 'pending') throw fail(409, 'Approve this order before sending it to QuickBooks.');
  if (po.status === 'returned') throw fail(409, 'A returned order is not sent to QuickBooks.');
  if (!po.items?.length) throw fail(409, 'This order has no lines to send.');

  if (sending.has(poId)) return { state: 'sending' };
  sending.add(poId);
  try {
    const s = await session();

    // Already there? An earlier attempt may have got through before a
    // timeout, or Finance captured it by hand.
    const existing = await qbo.findPurchaseOrder(s, po.po_number);
    if (existing) return await link(poId, existing);
    const byMemo = await findByMemo(s, po);
    if (byMemo.state) return await hold(poId, byMemo);
    if (byMemo.found) return await link(poId, byMemo.found);

    const vendor = await qbo.findVendor(s, po.supplier_name);
    const items = new Map();
    const missingProducts = [];
    const noAccount = [];
    for (const line of po.items) {
      const item = await qbo.findItem(s, line.product_name);
      if (!item) { missingProducts.push(line.product_name); continue; }
      items.set(line.id, item);
      // QuickBooks refuses a line whose item has no expense account, and
      // says only "Select an account for this transaction", not which.
      if (!item.ExpenseAccountRef) noAccount.push(line.product_name);
    }
    if (!vendor || missingProducts.length) {
      const missing = { supplier: vendor ? null : po.supplier_name, products: missingProducts };
      const message = describeMissing(missing);
      await repo.recordSync(poId, { state: 'needs_match', error: message, detail: { missing } });
      return { state: 'needs_match', missing, message };
    }
    if (noAccount.length) return await refuse(poId, describeNoAccount(noAccount), noAccount);

    const payables = await qbo.findPayablesAccount(s);
    const made = await qbo.createPurchaseOrder(s, buildPurchaseOrder(po, { vendor, items, payables }));
    return await link(poId, made);
  } catch (err) {
    if (err.quickbooks === 'off') return { state: 'off' };
    // QuickBooks understood the order and said no. Trying again tomorrow
    // would only be told no again: it waits for a person, like a name that
    // does not match. It cannot say which line, so every product on the
    // order is listed.
    if (err.quickbooks === 'refused') {
      const names = (await purchaseOrderRepo.getPurchaseOrderById(poId).catch(() => null))?.items?.map((l) => l.product_name) ?? [];
      return await refuse(poId, describeRefusal(err, names), names);
    }
    const message = err.quickbooks ? err.message : 'Could not send this order to QuickBooks.';
    if (!err.quickbooks) console.error('[quickbooks] push failed:', err.message);
    await repo.recordSync(poId, { state: 'failed', error: message, detail: { kind: err.quickbooks ?? 'error' } }).catch(() => {});
    return { state: 'failed', message };
  } finally {
    sending.delete(poId);
  }
};

// ── Finding an order Finance already captured ───────────────
// Finance types our number into the QuickBooks PO's private memo (the
// field the Open Purchase Order List calls Memo), under a number of
// QuickBooks' own. A memo is read exactly as the file import reads it, so
// the two paths agree on what counts: our number once in the memo and no
// other PO number. PrivateNote cannot be searched in a query, so the orders
// since a few days before ours was raised are read and filtered here.
const MEMO_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

const findByMemo = async (s, po) => {
  const since = dayOf(new Date(new Date(po.created_at).getTime() - MEMO_LOOKBACK_MS)) ?? dayOf(new Date());
  const ours = String(po.po_number).trim().toUpperCase();
  const rows = await qbo.listPurchaseOrdersSince(s, since);
  const matches = rows.filter((r) => {
    const numbers = findPoNumbers(r.PrivateNote);
    return numbers.length === 1 && numbers[0] === ours;
  });
  if (matches.length === 1) return { found: matches[0] };
  if (matches.length > 1) {
    const numbers = matches.map((m) => m.DocNumber || m.Id).join(', ');
    return {
      state: 'needs_match',
      message: `More than one QuickBooks purchase order has ${po.po_number} in its memo (${numbers}). Nothing was created. Delete or correct the extra one in QuickBooks, then send this order again.`,
      detail: { duplicates: matches.map((m) => String(m.DocNumber || m.Id)) },
    };
  }
  return {};
};

const hold = async (poId, { state, message, detail }) => {
  await repo.recordSync(poId, { state, error: message, detail });
  return { state, message };
};

const quoted = (names) => names.map((n) => `"${n}"`).join(', ');

const describeNoAccount = (names) => {
  const one = names.length === 1;
  return `QuickBooks needs an expense account on ${one ? 'this item' : 'these items'} before ${one ? 'it' : 'they'} can go on a purchase order: ${quoted(names)}. `
    + `In QuickBooks, open ${one ? 'it' : 'each'} under Products and services and set its Expense account, then send this order again.`;
};

const describeRefusal = (err, names) =>
  `${err.message}${names.length ? ` Check the items on this order in QuickBooks: ${quoted(names)}.` : ''} Then send this order again.`;

const refuse = async (poId, message, items) => {
  await repo.recordSync(poId, { state: 'refused', error: message, detail: { items } });
  return { state: 'refused', message, items };
};

const link = async (poId, remote) => {
  const quickbooksPoId = String(remote.DocNumber || remote.Id);
  const saved = await repo.saveLink(poId, { qboId: quickbooksPoId, syncToken: remote.SyncToken ?? null });
  if (!saved) {
    const message = `QuickBooks PO number ${quickbooksPoId} is already linked to another order here.`;
    await repo.recordSync(poId, { state: 'failed', error: message, detail: { kind: 'duplicate_link' } });
    return { state: 'failed', message };
  }
  await repo.recordSync(poId, { state: 'synced', detail: { quickbooksPoId, qboInternalId: String(remote.Id ?? '') } });
  return { state: 'synced', quickbooksPoId };
};

// After an approval: sent in the background, never awaited by the
// request that approved the order, and never allowed to throw into it.
// Resolves with what happened (see pushPurchaseOrder) so the Finance email
// that follows can say so, and never rejects. The approval itself does not
// wait for it.
const pushInBackground = (poId) => {
  if (!isConfigured()) return Promise.resolve(null);
  return Promise.resolve()
    .then(() => pushPurchaseOrder(poId))
    .catch((err) => {
      console.error('[quickbooks] background send failed:', err.message);
      return null;
    });
};

/** Set up on this server AND a company connected: orders go across by themselves. */
const isConnected = async () => {
  if (!isConfigured()) return false;
  try { return Boolean(await repo.getConnection()); } catch { return false; }
};

// Orders whose automatic send failed, to try again (see listUnsent): only
// ones approved while QuickBooks was connected, never an older backlog.
const pushUnsent = async () => {
  if (!isConfigured() || !(await repo.getConnection())) return { tried: 0, synced: 0 };
  const ids = await repo.listUnsent(20);
  let synced = 0;
  for (const id of ids) {
    const result = await pushPurchaseOrder(id).catch(() => ({ state: 'failed' }));
    if (result.state === 'synced') synced += 1;
    // The connection itself is the problem: the rest would fail the same way.
    if (result.state === 'off') break;
  }
  return { tried: ids.length, synced };
};

/** Where one order stands with QuickBooks, for its detail screen. */
const syncState = async (rawId) => {
  const poId = Number(rawId);
  if (!Number.isInteger(poId) || poId <= 0) throw fail(400, 'A valid purchase order ID is required.');
  const configured = isConfigured();
  const connected = configured && Boolean(await repo.getConnection());
  const row = connected ? await repo.getSync(poId) : null;
  const state = row?.qbo_id ? 'synced' : (row?.payload?.state ?? 'none');
  return {
    available: connected,
    state,
    quickbooksPoId: row?.qbo_id ?? null,
    message: state === 'synced' ? null : (row?.last_error ?? null),
    missing: row?.payload?.missing ?? null,
    attempts: row?.attempts ?? 0,
    updatedAt: row?.updated_at ?? null,
  };
};

export default {
  startConnect, handleCallback, disconnect, status, warehouseForState,
  pushPurchaseOrder, pushInBackground, pushUnsent, syncState, buildPurchaseOrder, isConnected,
};
