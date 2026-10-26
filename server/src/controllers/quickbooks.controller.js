// ─────────────────────────────────────────────────────────────
// server/src/controllers/quickbooks.controller.js
//
// HTTP for the QuickBooks connection. Thin: the rules are in
// services/quickbooks.service.js.
// ─────────────────────────────────────────────────────────────
import quickbooksService from '../services/quickbooks.service.js';
import { resolveAppBaseUrl } from '../config/appUrl.js';
import { sendError } from '../utils/httpError.js';

const SETTINGS_PATH = '/admin/settings';

// Back to Settings → Connections after the sign-in at Intuit, saying
// only whether it worked. The reason for a failure is in the server
// log, never in a URL.
const returnTo = (outcome) => {
  const safe = outcome === 'connected' ? 'connected' : 'error';
  const query = `section=connections&quickbooks=${safe}`;
  const origin = resolveAppBaseUrl('gmailReturn').url || '';
  if (!origin) return `${SETTINGS_PATH}?${query}`;
  try {
    const url = new URL(origin);
    url.pathname = SETTINGS_PATH;
    url.search = query;
    url.hash = '';
    return url.toString();
  } catch {
    return `${SETTINGS_PATH}?${query}`;
  }
};

const respond = (res, err, label, fallback) => {
  console.error(`[${label}]`, err.message);
  // A QuickBooks error's own message was written for the reader.
  if (err.quickbooks && err.message) return res.status(err.status || 500).json({ success: false, message: err.message });
  return sendError(res, err, fallback);
};

// GET /api/quickbooks/connect — an admin, sent on to Intuit to sign in.
const connect = async (req, res) => {
  try {
    const { redirectUrl } = quickbooksService.startConnect({ userId: req.user?.id ?? null });
    return res.redirect(302, redirectUrl);
  } catch (err) {
    return respond(res, err, 'quickbooksConnect', 'Could not start the QuickBooks sign-in.');
  }
};

// GET /api/quickbooks/callback — Intuit, coming back. No session: the
// state it carries is checked instead.
const callback = async (req, res) => {
  try {
    await quickbooksService.handleCallback({
      code: req.query.code ?? null,
      state: req.query.state ?? null,
      realmId: req.query.realmId ?? null,
      oauthError: req.query.error ?? null,
    });
    return res.redirect(302, returnTo('connected'));
  } catch (err) {
    console.error('[quickbooksCallback]', err.message);
    return res.redirect(302, returnTo('error'));
  }
};

// GET /api/quickbooks/status
const status = async (req, res) => {
  try {
    const data = await quickbooksService.status({ check: req.query.check === '1' });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return respond(res, err, 'quickbooksStatus', 'Could not read the QuickBooks connection.');
  }
};

// POST /api/quickbooks/disconnect
const disconnect = async (_req, res) => {
  try {
    return res.status(200).json({ success: true, data: await quickbooksService.disconnect() });
  } catch (err) {
    return respond(res, err, 'quickbooksDisconnect', 'Could not disconnect QuickBooks.');
  }
};

// GET /api/quickbooks/purchase-orders/:id — where this order stands.
const purchaseOrderState = async (req, res) => {
  try {
    return res.status(200).json({ success: true, data: await quickbooksService.syncState(req.params.id) });
  } catch (err) {
    return respond(res, err, 'quickbooksOrderState', 'Could not read this order’s QuickBooks status.');
  }
};

// POST /api/quickbooks/purchase-orders/:id/send — send it, or send it again.
const sendPurchaseOrder = async (req, res) => {
  try {
    const result = await quickbooksService.pushPurchaseOrder(req.params.id);
    if (result.state === 'off') {
      return res.status(409).json({ success: false, message: 'QuickBooks is not connected. Connect it in Settings.' });
    }
    return res.status(200).json({ success: true, data: { ...result, ...(await quickbooksService.syncState(req.params.id)) } });
  } catch (err) {
    return respond(res, err, 'quickbooksSend', 'Could not send this order to QuickBooks.');
  }
};

export default { connect, callback, status, disconnect, purchaseOrderState, sendPurchaseOrder };
