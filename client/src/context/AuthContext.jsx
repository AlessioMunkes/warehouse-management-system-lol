// ─────────────────────────────────────────────────────────────
// src/context/AuthContext.jsx
//
// The auth credential is an httpOnly cookie the browser manages;
// this file never touches it. What it does manage is the UI's idea
// of who is logged in.
//
// The bug this replaces: that idea came solely from localStorage,
// which has no expiry, while the cookie dies after 8 hours. Staff
// opened the app the next morning, saw themselves logged in, and
// every action failed with a 401. Nothing ever told them to log in
// again.
//
// So localStorage is now a CACHE, not the truth:
//
//   - On boot we ask the server (GET /api/me) who we actually are.
//   - A 401 means the session is genuinely over: clear it.
//   - A NETWORK failure is not a 401. On a warehouse tablet with
//     patchy signal, dropping the session every time the connection
//     blinks would be its own bug, so the cache is kept and the app
//     carries on in a degraded state.
//   - Any 401 from any later request tears the session down too,
//     via the handler registered on the api module.
// ─────────────────────────────────────────────────────────────
import { createContext, useContext, useEffect, useState } from 'react';
import { apiGet, apiPost, setUnauthorizedHandler, clearApiCache } from '../services/api';
import {
  getActiveWarehouse, setActiveWarehouse, clearActiveWarehouse, runWithWarehouse,
} from '../services/warehouse';

const AuthContext = createContext(null);

const CACHE_KEY = 'wms_user';

// ── Cached user, for first paint only ───────────────────────────
// Showing the header name instantly while /api/me is in flight is
// nicer than a blank bar, but this value is never trusted on its
// own — isLoading stays true until the server has answered, and
// ProtectedRoute holds the route closed until then.
const readCachedUser = () => {
  const saved = localStorage.getItem(CACHE_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    localStorage.removeItem(CACHE_KEY);
    return null;
  }
};

const writeCachedUser = (user) => {
  if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
  else      localStorage.removeItem(CACHE_KEY);
};

// ── Multi-warehouse ──────────────────────────────────────────────
// With one database the server never names a warehouse, so all of
// this is a no-op and requests carry no warehouse header.
//
// Staff: the selected warehouse follows what the server confirmed.
// Guests: their session names its one warehouse, so they send none.
const syncWarehouse = (user) => {
  if (!user) return;
  if (user.role === 'guest' || !user.warehouse) clearActiveWarehouse();
  else setActiveWarehouse(user.warehouse);
};

// GET /api/me, recovering from a stale or missing warehouse choice:
//   403 WAREHOUSE_FORBIDDEN  the saved site is no longer theirs: forget it
//   400 WAREHOUSE_REQUIRED   several sites and none chosen on this
//                            device: open the first. The badge in the
//                            header shows which, and the switcher
//                            changes it in one tap.
const fetchMe = async () => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await apiGet('/api/me');
    } catch (err) {
      if (attempt >= 2) throw err;
      if (err.code === 'WAREHOUSE_FORBIDDEN' && getActiveWarehouse()) {
        clearActiveWarehouse();
      } else if (err.code === 'WAREHOUSE_REQUIRED' && err.warehouses?.length) {
        setActiveWarehouse(err.warehouses[0]);
      } else {
        throw err;
      }
    }
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser]           = useState(readCachedUser);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  // Why the session ended, so the login screen can explain itself
  // instead of silently appearing.
  const [sessionMessage, setSessionMessage] = useState(null);

  // ── Verify the session on boot ────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      try {
        const data = await fetchMe();
        if (cancelled) return;
        syncWarehouse(data.user);
        writeCachedUser(data.user);
        setUser(data.user);
        setIsOffline(false);
      } catch (err) {
        if (cancelled) return;

        if (err.status === 401) {
          // Genuinely logged out — expired, deactivated, or signed out.
          writeCachedUser(null);
          setUser(null);
          setSessionMessage(err.message);
        } else {
          // Offline, or a 500. The server could not confirm either
          // way, so don't destroy a session that may well be fine —
          // bouncing a warehouse worker to a login screen they cannot
          // submit anyway helps nobody.
          setIsOffline(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    verifySession();
    return () => { cancelled = true; };
  }, []);

  // ── Catch 401s from anywhere else in the app ──────────────────
  // Covers the session expiring mid-shift rather than between shifts.
  useEffect(() => {
    setUnauthorizedHandler((message) => {
      writeCachedUser(null);
      setUser(null);
      setSessionMessage(message || 'Your session has ended. Please log in again.');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // ── Login ─────────────────────────────────────────────────────
  const login = async (username, password) => {
    console.log("[AUTH] login()", username);
    console.log("[AUTH] calling apiPost");
    const data = await apiPost('/api/login', { username, password });
    console.log("[AUTH] apiPost returned", data);
    let signedIn = data.user;

    // Multi-warehouse: go back to the site last used on this device if
    // this person can still use it, and read who they are THERE (their
    // role can differ per site). Otherwise the server's default.
    if (signedIn?.warehouses?.length) {
      const preferred = getActiveWarehouse();
      const allowed = signedIn.warehouses.map((w) => w.code);
      if (preferred && preferred !== signedIn.warehouse && allowed.includes(preferred)) {
        setActiveWarehouse(preferred);
        signedIn = (await fetchMe()).user;
      }
    }

    syncWarehouse(signedIn);
    writeCachedUser(signedIn);
    setUser(signedIn);
    setSessionMessage(null);
    console.log("[AUTH] returning user", signedIn);
    return signedIn;
  };

  // Multi-warehouse: move to another site this person can use. Clears
  // everything cached for the old site and re-reads who they are at
  // the new one, because their role there may differ. On failure the
  // previous site stays selected and the error is thrown to the caller.
  const switchWarehouse = async (code) => {
    const previous = getActiveWarehouse();
    if (!code || code === previous) return user;
    setActiveWarehouse(code);
    clearApiCache();
    try {
      const data = await apiGet('/api/me');
      syncWarehouse(data.user);
      writeCachedUser(data.user);
      setUser(data.user);
      return data.user;
    } catch (err) {
      setActiveWarehouse(previous);
      clearApiCache();
      throw err;
    }
  };

  // warehouse: the site a volunteer picked on the sign-in page, in
  // multi-warehouse mode. Sent with this one request only.
  const loginAsGuest = async (name, warehouse = null) => {
    const data = await runWithWarehouse(warehouse, () => apiPost('/api/volunteers/sign-in', { name }));
    syncWarehouse(data.user);
    writeCachedUser(data.user);
    setUser(data.user);
    setSessionMessage(null);
    return data.user;
  };

  // Claiming a pallet from a QR code also creates the session: the
  // server inserts the volunteer and sets the same wms_token cookie in
  // one response. This adopts that user without a second round trip.
  //
  // Not a login function — it does not call anything. It is how a
  // screen that already holds a freshly minted session hands it to the
  // context, so the rest of the app stops thinking nobody is signed in.
  const refreshFromClaim = (claimedUser) => {
    if (!claimedUser) return null;
    syncWarehouse(claimedUser);
    writeCachedUser(claimedUser);
    setUser(claimedUser);
    setSessionMessage(null);
    return claimedUser;
  };

  // ── Logout ────────────────────────────────────────────────────
  // Guests and staff end their sessions at different endpoints.
  //
  // /api/login/logout only clears the cookie. For a guest that is not
  // enough: their visit also has to be closed, or signed_out_at stays
  // null forever and their hours never reach the volunteer-hours report.
  // /api/volunteers/sign-out stamps the visit AND clears the same cookie,
  // taking the volunteer id from the token rather than from us.
  const logout = async () => {
    const endpoint = user?.role === 'guest'
      ? '/api/volunteers/sign-out'
      : '/api/login/logout';

    try {
      await apiPost(endpoint, {});
    } catch {
      // If the server is unreachable, still clear local state — the
      // user asked to be logged out and must not stay logged in on a
      // shared tablet just because the network dropped.
    }
    writeCachedUser(null);
    setUser(null);
    setSessionMessage(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, login, loginAsGuest, refreshFromClaim, logout, switchWarehouse, isLoading, isOffline, sessionMessage }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
