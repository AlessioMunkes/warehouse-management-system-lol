// Settings > Documents: the letterhead and the Section 18A threshold
// are set by an admin, and every printed note uses that letterhead.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const updateSettings = vi.fn(async () => []);
vi.mock('../services/settingsAPI', () => ({ updateSettings, listSettings: vi.fn(), default: {} }));
vi.mock('@/components/ui/toastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('../services/api', async (orig) => ({
  ...(await orig()),
  apiGet: vi.fn(async (url) => (url === '/api/settings/letterhead'
    ? { data: { name: 'Ladles of Love, Gauteng', addressLines: ['1 Main Rd', 'Johannesburg'] } }
    : { data: null })),
}));
vi.mock('jspdf', () => ({ default: vi.fn() }));
vi.mock('html2canvas-pro', () => ({ default: vi.fn() }));

const { default: AppSettingsSection } = await import('../features/settings/AppSettingsSection');
const { default: NoteSheet } = await import('../features/receipts/NoteSheet');

const NAME = { key: 'documents.letterheadName', section: 'organisation', type: 'text', label: 'Letterhead name', help: 'Top of notes.', default: 'Ladles of Love, Cape Town Warehouse', maxLength: 120, value: 'Ladles of Love, Cape Town Warehouse' };
const ADDRESS = { key: 'documents.letterheadAddress', section: 'organisation', type: 'text', multiline: true, label: 'Letterhead address', help: 'One line per line.', default: 'a', maxLength: 300, value: 'Unit 4\nEpping' };
const THRESHOLD = { key: 'donations.section18aThreshold', section: 'organisation', label: 'Section 18A certificate from', help: 'Rand.', default: 1000, min: 0, max: 1000000, unit: 'rand', value: 1000 };

describe('Settings > Documents', () => {
  it('edits wording as text and the threshold as a number, saved together', async () => {
    const user = userEvent.setup();
    render(<AppSettingsSection title="Organisation" settings={[NAME, ADDRESS, THRESHOLD]} onSaved={vi.fn()} />);
    expect(screen.getByLabelText('Letterhead address').tagName).toBe('TEXTAREA');
    await user.clear(screen.getByLabelText('Letterhead name'));
    await user.type(screen.getByLabelText('Letterhead name'), 'Ladles of Love, Gauteng');
    await user.clear(screen.getByLabelText('Section 18A certificate from'));
    await user.type(screen.getByLabelText('Section 18A certificate from'), '2500');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({
      'documents.letterheadName': 'Ladles of Love, Gauteng',
      'donations.section18aThreshold': 2500,
    }));
  });
});

describe('printed notes', () => {
  it('carry the letterhead set under Settings', async () => {
    render(<NoteSheet title="Delivery Note" toolbarTitle="DELIVERY NOTE #1" onClose={() => {}}><p>lines</p></NoteSheet>);
    expect(await screen.findByText('Ladles of Love, Gauteng')).toBeInTheDocument();
    expect(screen.getByText('Johannesburg')).toBeInTheDocument();
  });
});
