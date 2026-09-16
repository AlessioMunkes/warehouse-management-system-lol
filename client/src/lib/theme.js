// ─────────────────────────────────────────────────────────────
// client/src/lib/theme.js
//
// Light/dark, kept the same way the reduced-motion setting is kept:
// per device in localStorage, seeded from the OS, and written onto
// <html> as a class so plain CSS can answer without every component
// reading a hook.
//
// WHY lib/ RATHER THAN shellContext.js
// The motion setting lives in a taskdashboard component because only
// that shell sets it. This one is read by main.jsx before React
// exists, so it cannot live inside a feature folder without the entry
// point reaching into one.
//
// WHY main.jsx AND NOT AN EFFECT
// An effect runs after the first paint. For someone who keeps the app
// dark that is a full white screen on every load — which is the thing
// they turned dark mode on to avoid. applyTheme() is called once in
// main.jsx before createRoot(), so the first frame is already right.
//
// NO COMPONENT IN THIS FILE, for the same reason navSections.js has
// none: a module that exports both a component and its constants is
// not Fast Refresh clean, and eslint says so. The provider is in
// components/layout/ThemeProvider.jsx.
// ─────────────────────────────────────────────────────────────
import { createContext, useContext } from 'react';

export const THEME_KEY = 'stf_theme';

export const applyTheme = (theme) => {
  try {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  } catch { /* no document — nothing to mark */ }
};

// prefers-color-scheme is the honest default: someone who set it at the
// OS level has already said what they want, and a first visit should
// not argue with them.
export const readStoredTheme = () => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch { /* private mode, blocked storage — fall through */ }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

export const writeStoredTheme = (theme) => {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* nothing we can do */ }
};

export const hasStoredTheme = () => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'dark' || stored === 'light';
  } catch {
    return false;
  }
};

export const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);
