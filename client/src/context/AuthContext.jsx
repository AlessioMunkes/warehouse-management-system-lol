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
import { apiGet, apiPost, setUnauthorizedHandler } from '../services/api';

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
        const data = await apiGet('/api/me');
        if (cancelled) return;
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
    writeCachedUser(data.user);
    setUser(data.user);
    setSessionMessage(null);
    console.log("[AUTH] returning user", data.user);
    return data.user;
  };

  const loginAsGuest = async (name) => {
    const data = await apiPost('/api/volunteers/sign-in', { name });
    writeCachedUser(data.user);
    setUser(data.user);
    setSessionMessage(null);
    return data.user;
  };

  // ── Logout ────────────────────────────────────────────────────
  const logout = async () => {
    try {
      await apiPost('/api/login/logout', {});
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
      value={{ user, login, loginAsGuest, logout, isLoading, isOffline, sessionMessage }}
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