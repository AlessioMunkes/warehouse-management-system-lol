// ─────────────────────────────────────────────────────────────
// client/src/components/layout/ThemeProvider.jsx
//
// The component half of lib/theme.js — split out so neither file
// exports a component alongside its constants (react-refresh), the
// same split navSections.js and AppNav.jsx already use.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  ThemeContext, applyTheme, readStoredTheme, writeStoredTheme, hasStoredTheme,
} from '@/lib/theme';

export default function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStoredTheme);

  const setTheme = (next) => {
    setThemeState(next);
    applyTheme(next);
    writeStoredTheme(next);
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  // main.jsx already applied it before the first paint; this re-marks
  // after a hot reload and keeps the class honest if anything else
  // ever clears it.
  useEffect(() => { applyTheme(theme); }, [theme]);

  // Follow the OS only while the person has expressed no preference of
  // their own. Once they touch the toggle, the machine switching at
  // sunset must not undo the choice they just made.
  useEffect(() => {
    if (hasStoredTheme()) return undefined;
    let media;
    try { media = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return undefined; }
    const onChange = (event) => setThemeState(event.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
