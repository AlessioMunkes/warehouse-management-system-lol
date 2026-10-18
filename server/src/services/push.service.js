// ─────────────────────────────────────────────────────────────
// server/src/services/push.service.js
//
// Phone notifications (Web Push) for warehouse workers: a manager puts
// slips on the floor, the phones in the workers' pockets buzz, and a
// tap opens the Packing tab.
//
// Off unless VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set (see
// env.example). Everything here is best effort: a push that can't be
// sent is logged and dropped, never an error for the manager who
// generated the slips. The in-app bell holds the same news either way.
// ─────────────────────────────────────────────────────────────
import webpush from 'web-push';
import repo from '../repositories/pushSubscription.repository.js';
import { ROLES } from '../middleware/auth.middleware.js';

const fail = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

let configured = null;
const isConfigured = () => {
  if (configured !== null) return configured;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
  if (configured) {
    webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@localhost', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }
  return configured;
};

// The key a phone needs to subscribe; null when push is switched off.
const publicKey = () => (isConfigured() ? process.env.VAPID_PUBLIC_KEY : null);

const MAX_FIELD = 2048;
const isText = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_FIELD;

const subscribe = async (user, subscription, userAgent) => {
  if (!isConfigured()) throw fail(503, 'Phone notifications are not set up on this server.');
  const endpoint = subscription?.endpoint;
  const keys = subscription?.keys ?? {};
  if (!isText(endpoint) || !/^https:\/\//.test(endpoint) || !isText(keys.p256dh) || !isText(keys.auth)) {
    throw fail(400, 'That is not a valid push subscription.');
  }
  await repo.save({
    userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 300) : null,
  });
};

const unsubscribe = async (user, endpoint) => {
  if (!isText(endpoint)) throw fail(400, 'Which phone? The subscription endpoint is required.');
  await repo.removeForUser(user.id, endpoint);
};

// How long a push service keeps trying a phone that's switched off.
// Floor news is about today's packing, so a day is plenty.
const TTL_SECONDS = 12 * 60 * 60;

// Sends to every phone of these roles. Resolves to how many were sent;
// never throws.
const sendToRoles = async (roles, payload) => {
  if (!isConfigured()) return 0;
  let targets;
  try {
    targets = await repo.listForRoles(roles);
  } catch (err) {
    console.error('[push] could not read subscriptions:', err.message);
    return 0;
  }
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(targets.map(async (t) => {
    try {
      await webpush.sendNotification(
        { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
        body,
        { TTL: TTL_SECONDS, urgency: 'high', topic: payload.tag?.slice(0, 32) }
      );
      await repo.markSuccess(t.endpoint).catch(() => {});
      return true;
    } catch (err) {
      // 404/410: the phone unsubscribed or the app was removed.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await repo.removeByEndpoint(t.endpoint).catch(() => {});
      } else {
        console.error('[push] send failed:', err.statusCode ?? '', err.message);
      }
      return false;
    }
  }));
  return results.filter((r) => r.status === 'fulfilled' && r.value).length;
};

// Today in Cape Town, as the Packing tab reads it: the floor only
// lists today's slips, so only those are worth buzzing a phone about.
const todayInSA = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

// pg reads a DATE column as local midnight, so a Date is read back in
// local time; a string is already 'YYYY-MM-DD'.
const dateOnly = (d) => {
  if (d instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return String(d ?? '').slice(0, 10);
};

const isForToday = (dispatchDate) => dateOnly(dispatchDate) === todayInSA();

const PACKING_URL = '/noc/packing';

// "New work on the floor" for the warehouse workers' phones. Called
// after the change is committed; fire and forget.
const notifyFloor = ({ title, body, url = PACKING_URL, tag = 'floor-slips' }) =>
  sendToRoles([ROLES.WORKER], { title, body, url, tag });

export default {
  publicKey, subscribe, unsubscribe, sendToRoles, notifyFloor, isForToday, todayInSA,
};
