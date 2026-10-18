// ─────────────────────────────────────────────────────────────
// client/src/features/notifications/phoneAlertSubscription.js
//
// Phone notifications for warehouse workers (Web Push). The service
// worker side is public/push-sw.js; the sending side is the server's
// push.service.js.
//
// A phone can only get them when:
//   - the browser supports push, and the app's service worker is
//     running (it is not in `npm run dev`; use a build);
//   - on an iPhone, the app has been added to the Home Screen and
//     opened from there (Safari tabs never get push);
//   - the person said yes when asked. The ask has to come from a tap,
//     so it's behind a button, never on page load.
// ─────────────────────────────────────────────────────────────
import { getPushPublicKey, removePushSubscription, savePushSubscription } from '../../services/pushAPI';

const isIOS = () => typeof navigator !== 'undefined'
  && (/iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const isInstalled = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

const hasPushApis = () => typeof window !== 'undefined'
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// 'unsupported' | 'install-first' | 'blocked' | 'ask' | 'granted'
export const phoneAlertSupport = () => {
  if (isIOS() && !isInstalled()) return 'install-first';
  if (!hasPushApis()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission === 'granted') return 'granted';
  return 'ask';
};

// The service worker, or null if none is running (dev, or it failed to
// install). Doesn't wait forever: `ready` never settles without one.
const serviceWorker = async (waitMs = 4000) => {
  if (!hasPushApis()) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (!existing) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => { setTimeout(() => resolve(null), waitMs); }),
  ]);
};

// The VAPID key arrives base64url; subscribe() wants the raw bytes.
const keyBytes = (base64url) => {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export const currentPhoneSubscription = async () => {
  const reg = await serviceWorker(1500);
  return reg ? reg.pushManager.getSubscription() : null;
};

// Asks (from a tap), subscribes this phone and tells the server it's
// the signed-in person's. Resolves to { ok, reason }.
export const turnOnPhoneAlerts = async () => {
  const support = phoneAlertSupport();
  if (support === 'install-first' || support === 'unsupported' || support === 'blocked') {
    return { ok: false, reason: support };
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission === 'denied' ? 'blocked' : 'dismissed' };

  const reg = await serviceWorker();
  if (!reg) return { ok: false, reason: 'no-worker' };
  const publicKey = await getPushPublicKey();
  if (!publicKey) return { ok: false, reason: 'server-off' };

  let subscription = await reg.pushManager.getSubscription();
  // A subscription made with a different server key can't receive
  // this server's pushes; start again.
  const expected = keyBytes(publicKey);
  const current = subscription?.options?.applicationServerKey;
  if (subscription && current && !sameBytes(new Uint8Array(current), expected)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expected });
  }
  await savePushSubscription(subscription.toJSON());
  return { ok: true };
};

// Stop this phone getting alerts for this person. The browser keeps its
// permission, so turning them back on is one tap with no prompt.
export const turnOffPhoneAlerts = async () => {
  const subscription = await currentPhoneSubscription();
  if (!subscription) return;
  try { await removePushSubscription(subscription.endpoint); } catch { /* signed out already */ }
  await subscription.unsubscribe();
};

// On sign-in: if this phone already has alerts on, hand them to the
// person now signed in (a shared floor phone). Silent; never asks.
export const handPhoneAlertsTo = async () => {
  if (phoneAlertSupport() !== 'granted') return;
  const subscription = await currentPhoneSubscription();
  if (subscription) await savePushSubscription(subscription.toJSON());
};

// On sign-out: the phone stops getting alerts for the person leaving.
// The browser subscription stays, so the next person's sign-in picks
// it up again (handPhoneAlertsTo).
export const releasePhoneAlerts = async () => {
  if (!hasPushApis()) return;
  const subscription = await currentPhoneSubscription();
  if (subscription) await removePushSubscription(subscription.endpoint);
};
