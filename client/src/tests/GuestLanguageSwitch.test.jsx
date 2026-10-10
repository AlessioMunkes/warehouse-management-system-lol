// ─────────────────────────────────────────────────────────────
// client/src/tests/GuestLanguageSwitch.test.jsx
//
// The guest's language control: the floor's own store and list, kept
// on the phone only, and still chosen after a reload.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('no network in tests')));
});
afterEach(() => cleanup());

const load = async () => ({
  GuestLanguageSwitch: (await import('../features/guest/GuestLanguageSwitch')).default,
  i18n: await import('../translations'),
});

describe('GuestLanguageSwitch', () => {
  it('names each language in its own language, with "Language" in all three as the label', async () => {
    const { GuestLanguageSwitch } = await load();
    render(<GuestLanguageSwitch />);

    const select = screen.getByLabelText('Language · Taal · Ulwimi');
    expect([...select.options].map((o) => o.textContent)).toEqual(['English', 'Afrikaans', 'isiXhosa']);
    expect(select.value).toBe('en');
  });

  it('keeps the choice after a reload, and never tries to save it to an account', async () => {
    const first = await load();
    render(<first.GuestLanguageSwitch />);
    fireEvent.change(screen.getByLabelText('Language · Taal · Ulwimi'), { target: { value: 'xh' } });
    expect(first.i18n.getLanguage()).toBe('xh');
    cleanup();

    // A reload: every module evaluated afresh, only the phone's storage kept.
    vi.resetModules();
    const second = await load();
    expect(second.i18n.getLanguage()).toBe('xh');
    render(<second.GuestLanguageSwitch />);
    expect(screen.getByLabelText('Language · Taal · Ulwimi').value).toBe('xh');

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
