// ─────────────────────────────────────────────────────────────
// server/src/features/quickbooks/client.js
//
// Every word spoken to QuickBooks Online, and nothing else. No database
// and no business rules: the service decides what to send, this sends
// it and turns Intuit's replies into plain values or one kind of error.
//
// `fetch` is injected (setFetch) so the tests can stand in for Intuit.
// Nothing here has been run against a real QuickBooks company from this
// codebase's tests; the request shapes follow Intuit's published API
// for OAuth 2.0 and the PurchaseOrder, Vendor, Item and Account
// entities.
// ─────────────────────────────────────────────────────────────
import { getQuickbooksConfig, MINOR_VERSION, SCOPE } from '../../config/quickbooks.js';

let doFetch = (...args) => globalThis.fetch(...args);
export const setFetch = (fn) => { doFetch = fn ?? ((...args) => globalThis.fetch(...args)); };

const TIMEOUT_MS = 15000;

// One error shape for everything that goes wrong here.
//   kind: 'auth'    the token is no good: reconnect
//         'refused' QuickBooks understood and said no (a validation rule)
//         'busy'    a rate limit or a fault on their side: try later
//         'network' it never arrived
const problem = (kind, message, status = 502, detail = null) => {
  const err = new Error(message);
  err.quickbooks = kind;
  err.status = status;
  if (detail) err.detail = detail;
  return err;
};

const request = async (url, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await doFetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw problem('network', err?.name === 'AbortError'
      ? 'QuickBooks did not answer in time.'
      : 'Could not reach QuickBooks.');
  } finally {
    clearTimeout(timer);
  }
  let body = null;
  const text = await res.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 500) }; }
  return { res, body };
};

// Intuit reports a fault as { Fault: { Error: [{ Message, Detail, code }] } }.
const faultText = (body) => {
  const first = body?.Fault?.Error?.[0];
  if (first) return [first.Message, first.Detail].filter(Boolean).join(': ');
  return body?.error_description || body?.error || null;
};

const check = ({ res, body }, what) => {
  if (res.ok) return body;
  const said = faultText(body);
  if (res.status === 401 || res.status === 403) throw problem('auth', 'QuickBooks no longer accepts this connection. Reconnect QuickBooks in Settings.', 502, said);
  if (res.status === 429 || res.status >= 500) throw problem('busy', 'QuickBooks is busy. Try again in a few minutes.', 502, said);
  throw problem('refused', said ? `QuickBooks refused ${what}: ${said}` : `QuickBooks refused ${what}.`, 422, said);
};

// ── Signing in ──────────────────────────────────────────────
export const authorizeUrl = (state) => {
  const c = getQuickbooksConfig();
  const url = new URL(c.authorizeUrl);
  url.searchParams.set('client_id', c.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('redirect_uri', c.redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
};

const tokenCall = async (params) => {
  const c = getQuickbooksConfig();
  const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
  const reply = await request(c.tokenUrl, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  // A refused refresh is the connection having lapsed, not a fault.
  if (!reply.res.ok && reply.res.status === 400) {
    throw problem('auth', 'QuickBooks no longer accepts this connection. Reconnect QuickBooks in Settings.', 502, faultText(reply.body));
  }
  const body = check(reply, 'the sign-in');
  if (!body?.access_token || !body?.refresh_token) throw problem('busy', 'QuickBooks sent back an incomplete sign-in. Try connecting again.');
  const now = Date.now();
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    tokenType: body.token_type || 'bearer',
    accessExpiresAt: new Date(now + Number(body.expires_in || 3600) * 1000),
    refreshExpiresAt: new Date(now + Number(body.x_refresh_token_expires_in || 8640000) * 1000),
  };
};

export const exchangeCode = (code) => {
  const c = getQuickbooksConfig();
  return tokenCall({ grant_type: 'authorization_code', code, redirect_uri: c.redirectUri });
};

export const refreshTokens = (refreshToken) => tokenCall({ grant_type: 'refresh_token', refresh_token: refreshToken });

// Best effort: a disconnect here must work even if Intuit does not answer.
export const revoke = async (token) => {
  try {
    const c = getQuickbooksConfig();
    const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
    await request(c.revokeUrl, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    return true;
  } catch {
    return false;
  }
};

// ── The accounting API ──────────────────────────────────────
const api = async ({ realmId, accessToken }, method, path, { query = {}, body = null } = {}, what = 'the request') => {
  const c = getQuickbooksConfig();
  const url = new URL(`${c.apiBase}/v3/company/${encodeURIComponent(realmId)}/${path}`);
  url.searchParams.set('minorversion', MINOR_VERSION);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const reply = await request(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return check(reply, what);
};

// A value inside a QuickBooks query string: a quote or a backslash in a
// supplier's name ("O'Brien & Sons") must be escaped, or the query is
// cut short at it.
export const quote = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const query = async (session, statement, entity) => {
  const body = await api(session, 'GET', 'query', { query: { query: statement } }, 'the lookup');
  return body?.QueryResponse?.[entity] ?? [];
};

/** The supplier in QuickBooks with exactly this display name, or null. */
export const findVendor = async (session, name) => {
  const rows = await query(session, `select Id, DisplayName, Active from Vendor where DisplayName = ${quote(name)}`, 'Vendor');
  return rows.find((v) => v.Active !== false) ?? null;
};

/** The product or service in QuickBooks with exactly this name, or null. */
export const findItem = async (session, name) => {
  const rows = await query(session, `select Id, Name, Active from Item where Name = ${quote(name)}`, 'Item');
  return rows.find((i) => i.Active !== false) ?? null;
};

/** The first Accounts Payable account, which a purchase order is raised against. */
export const findPayablesAccount = async (session) => {
  const rows = await query(session, "select Id, Name from Account where AccountType = 'Accounts Payable' and Active = true maxresults 1", 'Account');
  return rows[0] ?? null;
};

/** A purchase order already in QuickBooks under this number, or null. */
export const findPurchaseOrder = async (session, docNumber) => {
  const rows = await query(session, `select Id, DocNumber, SyncToken from PurchaseOrder where DocNumber = ${quote(docNumber)}`, 'PurchaseOrder');
  return rows[0] ?? null;
};

export const createPurchaseOrder = async (session, purchaseOrder) => {
  const body = await api(session, 'POST', 'purchaseorder', { body: purchaseOrder }, 'the purchase order');
  const made = body?.PurchaseOrder;
  if (!made?.Id) throw problem('busy', 'QuickBooks accepted the order but did not say what it saved. Check QuickBooks before sending it again.');
  return made;
};

/** The connected company's name, for the Settings screen. */
export const companyName = async (session) => {
  const body = await api(session, 'GET', `companyinfo/${encodeURIComponent(session.realmId)}`, {}, 'the company lookup');
  return body?.CompanyInfo?.CompanyName ?? null;
};

export default {
  setFetch, authorizeUrl, exchangeCode, refreshTokens, revoke, quote,
  findVendor, findItem, findPayablesAccount, findPurchaseOrder, createPurchaseOrder, companyName,
};
