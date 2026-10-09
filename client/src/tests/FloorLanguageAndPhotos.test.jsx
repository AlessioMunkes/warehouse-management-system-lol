// ─────────────────────────────────────────────────────────────
// client/src/tests/FloorLanguageAndPhotos.test.jsx
//
// The floor's language choice and its photo button.
//
// The translation table is checked as a whole, because the mistakes
// that matter are structural: a key one language lacks, or a {name}
// that was dropped in translation and now shows nothing.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const apiPatch = vi.fn();
const apiGet = vi.fn();
vi.mock('../services/api', () => ({
  apiPatch: (...a) => apiPatch(...a), apiGet: (...a) => apiGet(...a),
  apiPost: vi.fn(), newIdempotencyKey: () => 'key-0001-made-up', API_BASE: '',
}));
const shrinkPhoto = vi.fn();
const uploadPhoto = vi.fn();
vi.mock('../services/photoAPI', () => ({
  shrinkPhoto: (...a) => shrinkPhoto(...a), uploadPhoto: (...a) => uploadPhoto(...a), listPhotos: vi.fn(),
}));

const { MESSAGES } = await import('../translations/messages');
const { translator, setLanguage, getLanguage, LANGUAGES } = await import('../translations');
const { default: LanguagePicker } = await import('../features/staff/LanguagePicker');
const { default: PhotoButton } = await import('../features/staff/PhotoButton');
const { default: DashboardGreeting } = await import('../features/dashboard/DashboardGreeting');

const placeholders = (text) => (String(text).match(/\{\w+\}/g) ?? []).sort().join(',');

beforeEach(() => { vi.clearAllMocks(); act(() => setLanguage('en')); });

describe('the translation table', () => {
  const keys = Object.keys(MESSAGES.en);

  it.each(['af', 'xh'])('%s has every piece of text English has, and nothing extra', (code) => {
    expect(Object.keys(MESSAGES[code]).sort()).toEqual([...keys].sort());
  });

  it.each(['af', 'xh'])('%s keeps every value that is filled in, in both the one and the many wording', (code) => {
    for (const key of keys) {
      const source = MESSAGES.en[key];
      const translated = MESSAGES[code][key];
      if (typeof source === 'string') {
        expect(typeof translated, key).toBe('string');
        expect(placeholders(translated), key).toBe(placeholders(source));
      } else {
        expect(Object.keys(translated).sort(), key).toEqual(['one', 'other']);
        expect(placeholders(translated.other), key).toBe(placeholders(source.other));
      }
      expect(JSON.stringify(translated), key).not.toBe('""');
    }
  });

  it('offers the three languages, each named in its own language', () => {
    expect(LANGUAGES).toEqual([
      { code: 'en', name: 'English' }, { code: 'af', name: 'Afrikaans' }, { code: 'xh', name: 'isiXhosa' },
    ]);
  });
});

describe('translator', () => {
  it('fills in values and picks the wording for one or many', () => {
    const t = translator('en');
    expect(t('packing.itemsPacked', { done: 3, all: 8 })).toBe('3/8 items packed');
    expect(t.n('slip.stillNeeded', 1)).toBe('1 item still needs to be confirmed or flagged.');
    expect(t.n('slip.stillNeeded', 4)).toBe('4 items still need to be confirmed or flagged.');
    expect(translator('af')('packing.claim')).toBe('Eis op');
    expect(translator('xh')('packing.claim')).toBe('Thatha');
  });

  it('shows English for anything a language lacks, and the key itself for a typo', () => {
    const t = translator('zz');
    expect(t('packing.claim')).toBe('Claim');
    expect(t('no.such.key')).toBe('no.such.key');
    // A server message passed through as if it were a key comes back as it is.
    expect(translator('xh')('Only 12 on hand. Remove that much or less.')).toBe('Only 12 on hand. Remove that much or less.');
  });
});

describe('LanguagePicker', () => {
  it('changes the screens at once and saves the choice to the account', async () => {
    apiPatch.mockResolvedValue({ success: true });
    render(<><LanguagePicker /><DashboardGreeting name="Mcebisi" /></>);
    expect(screen.getByText('What would you like to work on today?')).toBeTruthy();

    // A drop-down labelled "Choose your language", each choice in its own language.
    const select = screen.getByLabelText('Choose your language');
    expect(select.tagName).toBe('SELECT');
    expect([...select.options].map((o) => o.textContent)).toEqual(['English', 'Afrikaans', 'isiXhosa']);

    fireEvent.change(select, { target: { value: 'af' } });
    expect(await screen.findByText('Waaraan wil jy vandag werk?')).toBeTruthy();
    expect(getLanguage()).toBe('af');
    expect(apiPatch).toHaveBeenCalledWith('/api/me/language', { language: 'af' });
    expect(screen.getByLabelText('Kies jou taal').value).toBe('af');

    fireEvent.change(screen.getByLabelText('Kies jou taal'), { target: { value: 'xh' } });
    expect(await screen.findByText('Ungathanda ukusebenza entwenini namhlanje?')).toBeTruthy();
    expect(screen.getByLabelText('Khetha ulwimi lwakho').value).toBe('xh');
  });

  it('keeps the choice on the phone, and says so, when it cannot be saved', async () => {
    apiPatch.mockRejectedValue(Object.assign(new Error('no signal'), { isNetworkError: true }));
    render(<LanguagePicker />);
    fireEvent.change(screen.getByLabelText('Choose your language'), { target: { value: 'xh' } });
    expect(await screen.findByText(/Kugcinwe kule foni/)).toBeTruthy();
    expect(getLanguage()).toBe('xh');
  });
});

describe('PhotoButton', () => {
  const file = new File(['x'], 'damage.jpg', { type: 'image/jpeg' });
  const choose = (f = file) => fireEvent.change(document.querySelector('input[type=file]'), { target: { files: [f] } });

  it('shrinks the picture, saves it against the record, and counts it', async () => {
    shrinkPhoto.mockResolvedValue('data:image/jpeg;base64,AAAA');
    uploadPhoto.mockResolvedValue({ id: 5 });
    render(<PhotoButton entityType="picking_slip_item" entityId={12} hint="A picture helps." />);
    expect(screen.getByText('A picture helps.')).toBeTruthy();

    choose();
    await waitFor(() => expect(uploadPhoto).toHaveBeenCalledWith({ entityType: 'picking_slip_item', entityId: 12, dataUrl: 'data:image/jpeg;base64,AAAA' }));
    expect(await screen.findByText('1 photo saved')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add another photo' })).toBeTruthy();

    choose();
    expect(await screen.findByText('2 photos saved')).toBeTruthy();
  });

  it('says the photo is on the phone when there was no signal', async () => {
    shrinkPhoto.mockResolvedValue('data:image/jpeg;base64,AAAA');
    uploadPhoto.mockResolvedValue({ queued: true });
    render(<PhotoButton entityType="purchase_order" entityId={3} />);
    choose();
    expect(await screen.findByText(/Photo saved on this phone/)).toBeTruthy();
  });

  it('says so when what was chosen is not a photo, or the save fails', async () => {
    shrinkPhoto.mockRejectedValueOnce(new Error('not-a-photo'));
    render(<PhotoButton entityType="purchase_order" entityId={3} />);
    choose(new File(['x'], 'notes.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('That is not a photo. Use the camera or choose a picture.')).toBeTruthy();
    expect(uploadPhoto).not.toHaveBeenCalled();

    shrinkPhoto.mockResolvedValue('data:image/jpeg;base64,AAAA');
    uploadPhoto.mockRejectedValue(Object.assign(new Error('The photo is too large. Take it again.'), { status: 413 }));
    choose();
    expect(await screen.findByText('The photo is too large. Take it again.')).toBeTruthy();
  });

  it('reads in the chosen language', async () => {
    act(() => setLanguage('xh'));
    render(<PhotoButton entityType="purchase_order" entityId={3} hintKey="photo.hintDelivery" />);
    expect(screen.getByRole('button', { name: 'Yongeza ifoto' })).toBeTruthy();
    expect(screen.getByText(MESSAGES.xh['photo.hintDelivery'])).toBeTruthy();
  });
});
