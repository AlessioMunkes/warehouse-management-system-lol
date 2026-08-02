// ─────────────────────────────────────────────────────────────
// src/context/AuthContext.jsx
//
// token is now an httpOnly cookie managed by the browser.
// This file no longer touches the token at all — it only stores
// the safe user object (id, name, role) in localStorage for UI
// purposes. The actual auth credential is invisible to JavaScript.
//
// token expiry check removed — the cookie has its own
// maxAge set server-side and the server rejects expired cookies.
// ─────────────────────────────────────────────────────────────
import { createContext, useContext, useState } from 'react';
import { apiPost } from '../services/api';

const AuthContext = createContext(null);

// ── Restore the user object for the UI ──────────────────────────
// We keep the non-sensitive user info (name, role) in localStorage
// purely so the UI knows who is logged in after a page refresh.
// The actual auth token is in the httpOnly cookie — the browser
// handles it automatically, we never touch it here.
const readSavedUser = () => {
  const savedUser = localStorage.getItem('wms_user');
  if (!savedUser) return null;
  try {
    return JSON.parse(savedUser);
  } catch {
    localStorage.removeItem('wms_user');
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readSavedUser);
  const isLoading = false;

  // ── Login ─────────────────────────────────────────────────────
  // The server sets the httpOnly cookie in its response headers.
  // We just save the safe user object for the UI.
  const login = async (username, password) => {
    const data = await apiPost('/api/login', { username, password });
    localStorage.setItem('wms_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

const loginAsGuest = async (name) => {
  const data = await apiPost('/api/volunteers/sign-in', { name });
  localStorage.setItem('wms_user', JSON.stringify(data.user));
  setUser(data.user);
  return data.user;
}; 
  // ── Logout ────────────────────────────────────────────────────
  // Tell the server to clear the cookie, then clear the UI state.
  const logout = async () => {
    try {
      await apiPost('/api/login/logout', {});
    } catch {
      // If the server is unreachable, still clear the local state
    }
    localStorage.removeItem('wms_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, loginAsGuest, logout, isLoading }}>
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