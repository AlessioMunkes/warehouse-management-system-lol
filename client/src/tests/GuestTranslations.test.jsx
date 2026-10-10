// ─────────────────────────────────────────────────────────────
// client/src/tests/GuestTranslations.test.jsx
//
// The guest screens read their words from translations/messages.js.
// Nothing a volunteer sees may be blank or a raw key name, whatever
// language is chosen; nothing may be left in English by accident; and
// every {placeholder} must survive translation.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MESSAGES } from '../translations/messages';
import { translator, setLanguage } from '../translations';

vi.mock('../services/guestSlipAPI', () => ({
  fetchMySlip: vi.fn(),
  fetchAvailableSlips: vi.fn(),
  fetchSlipByCode: vi.fn(),
  claimSlipByCode: vi.fn(),
  claimSlipById: vi.fn(),
  releaseMySlip: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { firstName: 'Thabo', role: 'guest' } }) }));

const api = await import('../services/guestSlipAPI');
const GuestHomePage = (await import('../pages/GuestHomePage')).default;

const guestKeys = Object.keys(MESSAGES.en).filter((k) => k.startsWith('guest.'));

afterEach(() => setLanguage('en'));

describe('guest translation keys', () => {
  it('has every guest key in every language', () => {
    for (const lang of ['af', 'xh']) {
      const missing = guestKeys.filter((k) => !(k in MESSAGES[lang]));
      expect(missing, lang).toEqual([]);
    }
  });

  it.each(['en', 'af', 'xh'])('never shows a blank or a key name in %s', (lang) => {
    const t = translator(lang);
    for (const key of guestKeys) {
      const entry = MESSAGES.en[key];
      const text = typeof entry === 'object' ? t.n(key, 2) : t(key, { name: 'X', n: 2, done: 1, all: 2, day: 'today', kind: 'a creche', product: 'Rice', beneficiary: 'Y', qty: '5', children: '3' });
      expect(text, key).toBeTruthy();
      expect(text, key).not.toBe(key);
    }
  });

  // Words that are the same in every language on purpose.
  const SAME_IN_EVERY_LANGUAGE = ['guest.brand.role'];
  const braces = (entry) => (typeof entry === 'object' ? `${entry.one} ${entry.other}` : entry).match(/\{\w+\}/g)?.sort() ?? [];

  it.each(['af', 'xh'])('leaves no guest text in English by accident in %s', (lang) => {
    const untranslated = guestKeys.filter((k) => !SAME_IN_EVERY_LANGUAGE.includes(k)
      && JSON.stringify(MESSAGES[lang][k]) === JSON.stringify(MESSAGES.en[k]));
    expect(untranslated).toEqual([]);
  });

  it.each(['af', 'xh'])('keeps every {placeholder} and the one/other shape in %s', (lang) => {
    for (const key of guestKeys) {
      const en = MESSAGES.en[key];
      const tr = MESSAGES[lang][key];
      expect(typeof tr, key).toBe(typeof en);
      if (typeof en === 'object') {
        expect(braces(tr.one), `${key}.one`).toEqual(braces(en.one));
        expect(braces(tr.other), `${key}.other`).toEqual(braces(en.other));
      } else {
        expect(braces(tr), key).toEqual(braces(en));
      }
    }
  });

  it('falls back to English when a language is missing the key altogether', () => {
    const key = 'guest.home.continue';
    const saved = MESSAGES.af[key];
    delete MESSAGES.af[key];
    try {
      expect(translator('af')(key)).toBe('Continue packing');
    } finally {
      MESSAGES.af[key] = saved;
    }
  });

  it('falls back to English for a missing count-dependent entry too', () => {
    const key = 'guest.card.thingsToPack';
    const saved = MESSAGES.xh[key];
    delete MESSAGES.xh[key];
    try {
      expect(translator('xh').n(key, 1)).toBe('1 thing to pack');
      expect(translator('xh').n(key, 4)).toBe('4 things to pack');
    } finally {
      MESSAGES.xh[key] = saved;
    }
  });

  it('every guest key the guest files ask for exists in English', () => {
    const files = [
      ...readdirSync(join(__dirname, '../pages')).filter((f) => f.startsWith('Guest')).map((f) => join(__dirname, '../pages', f)),
      ...readdirSync(join(__dirname, '../features/guest')).map((f) => join(__dirname, '../features/guest', f)),
      join(__dirname, '../services/guestSlipAPI.js'),
    ];
    const used = new Set();
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/['`](guest\.[a-zA-Z_.]+[a-zA-Z_])['`]/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(50);
    expect([...used].filter((k) => !(k in MESSAGES.en) && !k.startsWith('guest.kind.'))).toEqual([]);
  });

  it('renders a guest screen in isiXhosa with no raw keys', async () => {
    api.fetchMySlip.mockRejectedValue(Object.assign(new Error('none'), { status: 404 }));
    api.fetchAvailableSlips.mockResolvedValue([]);
    setLanguage('xh');
    const { container } = render(<MemoryRouter><GuestHomePage /></MemoryRouter>);

    expect(await screen.findByText(MESSAGES.xh['guest.home.listTitle'])).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/guest\.[a-z]/);
  });
});
