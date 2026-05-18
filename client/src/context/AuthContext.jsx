// ─────────────────────────────────────────────────────────────
// src/context/AuthContext.jsx
//
// Manages the logged-in user across the entire app.
// Any component can call useAuth() to get the current user
// or call login() / logout().
//
// On page refresh, the user stays logged in because the token
// and user info are saved in localStorage.
//
// Usage in any component:
//   import { useAuth } from '../context/AuthContext'
//   const { user, login, logout } = useAuth()
// ─────────────────────────────────────────────────────────────

import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiPost } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [isLoading, setIsLoading] = useState(true); // true while we check localStorage on startup

  // ── On app startup: check if a session already exists ────────
  // If the user refreshes the page, we restore their session from localStorage
  // instead of kicking them back to the login screen.
  useEffect(() => {
    const savedToken = localStorage.getItem('wms_token');
    const savedUser  = localStorage.getItem('wms_user');

    if (savedToken && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        // Corrupted data in localStorage — clear it
        localStorage.removeItem('wms_token');
        localStorage.removeItem('wms_user');
      }
    }

    setIsLoading(false);
  }, []);

  // ── Login ─────────────────────────────────────────────────────
  // Calls the real backend API.
  // On success: saves the token + user to localStorage and sets state.
  // On failure: throws the error so the LoginPage can show the message.
  const login = async (username, password) => {
    const data = await apiPost('/api/login', { username, password });
    // data = { success, token, user: { id, username, firstName, lastName, role } }

    localStorage.setItem('wms_token', data.token);
    localStorage.setItem('wms_user', JSON.stringify(data.user));

    setUser(data.user);
    return data.user;
  };

  // ── Logout ────────────────────────────────────────────────────
  // Clears everything — state and localStorage.
  const logout = () => {
    localStorage.removeItem('wms_token');
    localStorage.removeItem('wms_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

// ── Hook — shortcut for components to consume the context ─────
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
