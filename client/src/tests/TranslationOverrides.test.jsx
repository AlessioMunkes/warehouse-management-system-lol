// Settings → Wording: an admin's own Afrikaans / isiXhosa wording
// wins over the built-in wording, on keyed text and on page phrases.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = {
  getOverrides: vi.fn(async () => ({ key: { af: {}, xh: {} }, phrase: { af: {}, xh: {} } })),
  saveOverride: vi.fn(async (change) => change),
  resetOverride: vi.fn(async () => ({ reset: true })),
};
vi.mock('../services/translationAPI', () => ({ default: api, ...api }));
vi.mock('@/components/ui/toastContext', () => ({ useToast: () => vi.fn() }));

const { translator, setTranslationOverrides } = await import('../translations');
const { buildTables, translatePhrase } = await import('../translations/floorTranslator');
const { MESSAGES } = await import('../translations/messages');
const { PHRASES } = await import('../translations/phrases');
const { default: TranslationsSection } = await import('../features/settings/TranslationsSection');
const { buildEntries } = await import('../features/settings/translationEntries');

afterEach(() => { setTranslationOverrides(null); vi.clearAllMocks(); });

describe('keyed wording', () => {
  it('uses the admin’s wording over the built-in one, and only in that language', () => {
    const builtIn = translator('af')('common.cancel');
    setTranslationOverrides({ key: { af: { 'common.cancel': 'Los dit' } } });
    expect(translator('af')('common.cancel')).toBe('Los dit');
    expect(translator('xh')('common.cancel')).toBe(MESSAGES.xh['common.cancel']);
    expect(translator('en')('common.cancel')).toBe('Cancel');
    setTranslationOverrides(null);
    expect(translator('af')('common.cancel')).toBe(builtIn);
  });

  it('overrides counted wording a half at a time', () => {
    setTranslationOverrides({ key: { af: { 'guest.done.problems#one': 'een ding gemeld' } } });
    const t = translator('af');
    expect(t.n('guest.done.problems', 1)).toBe('een ding gemeld');
    expect(t.n('guest.done.problems', 2)).toBe(MESSAGES.af['guest.done.problems'].other);
  });
});

describe('page phrases', () => {
  it('puts the admin’s wording into the phrase table', () => {
    const table = buildTables(PHRASES, { af: { 'Start counting': 'Tel nou' } });
    expect(translatePhrase('Start counting', 'af', table)).toBe('Tel nou');
    expect(translatePhrase('Start counting', 'xh', table)).toBe('Qala ukubala');
  });

  it('adds a phrase the table never had, for that language only', () => {
    const table = buildTables(PHRASES, { xh: { 'A brand new line': 'Umgca omtsha' } });
    expect(translatePhrase('A brand new line', 'xh', table)).toBe('Umgca omtsha');
    expect(translatePhrase('A brand new line', 'af', table)).toBeNull();
  });
});

describe('the list of wording', () => {
  it('has every keyed message (counted ones in halves) and every phrase', () => {
    const rows = buildEntries(PHRASES);
    expect(rows.find((r) => r.source === 'common.cancel')).toMatchObject({ kind: 'key', english: 'Cancel' });
    expect(rows.filter((r) => r.source.startsWith('guest.done.problems#'))).toHaveLength(2);
    expect(rows.filter((r) => r.kind === 'phrase')).toHaveLength(PHRASES.length);
    expect(rows.find((r) => r.source === 'packing.itemsPacked')?.placeholders.sort()).toEqual(['all', 'done']);
  });
});

describe('TranslationsSection', () => {
  it('saves new wording with the placeholders it must keep', async () => {
    const user = userEvent.setup();
    render(<TranslationsSection />);
    await user.type(await screen.findByLabelText('Search the wording'), 'common.cancel');
    const input = await screen.findByLabelText('Afrikaans for “Cancel”');
    await user.clear(input);
    await user.type(input, 'Los dit');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.saveOverride).toHaveBeenCalledWith({
      language: 'af', kind: 'key', source: 'common.cancel', text: 'Los dit', placeholders: [],
    }));
    expect(await screen.findByText('Changed')).toBeInTheDocument();
    // Open screens in this browser follow at once.
    expect(translator('af')('common.cancel')).toBe('Los dit');
  });

  it('resets wording to the built-in one', async () => {
    api.getOverrides.mockResolvedValueOnce({ key: { af: { 'common.cancel': 'Los dit' }, xh: {} }, phrase: { af: {}, xh: {} } });
    const user = userEvent.setup();
    render(<TranslationsSection />);
    await user.selectOptions(await screen.findByLabelText('Show'), 'changed');
    expect(screen.getByText('1 piece of wording')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(api.resetOverride).toHaveBeenCalledWith({ language: 'af', kind: 'key', source: 'common.cancel' }));
    await act(async () => {});
    expect(screen.getByText('Nothing matches.')).toBeInTheDocument();
  });

  it('shows the server’s reason when wording is refused', async () => {
    api.saveOverride.mockRejectedValueOnce(new Error('Keep {all} {done} in the wording: the app fills them in.'));
    const user = userEvent.setup();
    render(<TranslationsSection />);
    await user.type(await screen.findByLabelText('Search the wording'), 'packing.itemsPacked');
    const input = (await screen.findAllByRole('textbox', { name: /^Afrikaans for/ }))[0];
    await user.clear(input);
    await user.type(input, 'gepak');
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Keep \{all\} \{done\}/);
  });
});
