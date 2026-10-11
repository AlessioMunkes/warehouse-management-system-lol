// ─────────────────────────────────────────────────────────────
// client/src/lib/refreshCache.js
//
// "Refresh cache" in the account menu: throw away everything this
// device has kept a copy of, and load it all again.
//
// Three things are kept so the app opens fast and works with no signal:
//
//   the saved reads     the last answer to each GET, in IndexedDB
//                       (services/readCache.js)
//   the short memo      a minute-long in-memory cache of a few lists
//                       (services/api.js cachedGet)
//   the app itself      the screens and icons, kept by the service
//                       worker so the app opens offline
//
// All three go. The page then reloads, which fetches the app and its
// data fresh.
//
// WHAT IS DELIBERATELY NOT TOUCHED: work that is still waiting to be
// sent (the outbox) and half-filled forms (drafts). Those are not
// copies of anything; they are the only record of something a person
// did. A button that sounds harmless must not be able to lose them.
//
// It needs a connection. Clearing the app's own files with no signal
// would leave nothing to open until the signal came back.
// ─────────────────────────────────────────────────────────────
import { clearReadCache } from '../services/readCache';
import { clearApiCache } from '../services/api';

export const canRefreshCache = () =>
  typeof navigator === 'undefined' || navigator.onLine !== false;

export const refreshCache = async ({ reload = () => window.location.reload() } = {}) => {
  if (!canRefreshCache()) {
    throw new Error('You are offline. Connect first, then refresh.');
  }

  clearApiCache();
  await clearReadCache();

  // The service worker's copies of the app. Each step is allowed to
  // fail on its own: a browser without one of these still gets the
  // rest, and the reload below.
  try {
    if (typeof caches !== 'undefined') {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch { /* no cache storage on this device */ }
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    await registration?.update?.();
  } catch { /* no service worker */ }

  reload();
};

export default refreshCache;
