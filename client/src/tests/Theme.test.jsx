// ─────────────────────────────────────────────────────────────
// src/tests/Theme.test.jsx
//
// Three things worth holding still.
//
// 1. The toggle writes the class AND the storage key. Either one alone
//    is a theme that forgets itself on reload, or one that remembers a
//    setting it never applies.
// 2. The OS listener stops mattering the moment the person chooses.
//    Without that, sunset quietly undoes the choice they just made.
// 3. Light mode did not move. The whole design of script 45 rests on
//    every :root token being a hex that was already in the app, so the
//    last test reads the stylesheet and checks exactly that. If someone
//    later "tidies" --ink to a rounder number, this fails and says so.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeToggle from '../components/layout/ThemeToggle';
import ThemeProvider from '../components/layout/ThemeProvider';
import { THEME_KEY, applyTheme, readStoredTheme } from '../lib/theme';
import { readFileSync } from 'node:fs';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('the theme setting', () => {
  it('puts the class on the document and the choice in storage', async () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);

    await userEvent.click(screen.getByRole('button', { name: /switch to dark mode/i }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');

    await userEvent.click(screen.getByRole('button', { name: /switch to light mode/i }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('reads a stored choice back', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    expect(readStoredTheme()).toBe('dark');
    localStorage.setItem(THEME_KEY, 'light');
    expect(readStoredTheme()).toBe('light');
  });

  it('survives blocked storage instead of taking the app down with it', () => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    try {
      expect(['light', 'dark']).toContain(readStoredTheme());
    } finally {
      Storage.prototype.getItem = real;
    }
  });

  it('applyTheme is what actually marks the document', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('light mode, which this script must not have changed', () => {
  // Every one of these was a hardcoded utility somewhere in the app
  // before script 45. The token is only safe because it resolves to the
  // same colour it replaced.
  const EXPECTED = {
    '--canvas': '#faf8f5',
    '--surface': '#ffffff',
    '--surface-2': '#f3efe9',
    '--ink': '#2b3336',
    '--ink-soft': '#676767',
    '--ink-faint': '#a39d8f',
    '--on-ink': '#ffffff',
    '--line': '#e9e3dd',
    '--line-strong': '#d9d1cb',
    '--brand': '#ef3a40',
    '--on-brand': '#ffffff',
    '--gold': '#979168',
  };

  // A relative path, read against vitest's cwd (client/). Not
  // `index.css?raw`: vitest runs with css: false, so a stylesheet
  // imported as a module comes back as an empty string and every
  // assertion below would pass against nothing. Not import.meta.url
  // either — it is not a file: URL once Vite has served this module.
  const indexCss = readFileSync('src/styles/index.css', 'utf8');

  it('found the stylesheet at all', () => {
    expect(indexCss.length).toBeGreaterThan(1000);
    expect(indexCss).toContain('--color-canvas: var(--canvas)');
  });

  // The :root that follows the token @theme block — script 45's own,
  // not the shadcn one further up the file.
  const root = indexCss.slice(indexCss.indexOf(':root {', indexCss.indexOf('--color-canvas: var(--canvas)')));
  const block = root.slice(0, root.indexOf('}'));

  Object.entries(EXPECTED).forEach(([token, hex]) => {
    it(`${token} is still ${hex}`, () => {
      expect(block).toMatch(new RegExp(`${token}\\s*:\\s*${hex}\\s*;`, 'i'));
    });
  });
});
