// ─────────────────────────────────────────────────────────────
// src/tests/ImpactReportPDF.test.jsx
//
// The Impact report prints in the layout every other note uses
// (NoteSheet), not the older PdfShell letterhead, and its figures are
// in tables with their units and notes.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { firstName: 'Grizel', lastName: 'M' } }),
}));

const { default: ImpactCalculatorPDF } = await import('../features/reporting/ImpactCalculatorPDF');

const STATS = [
  { label: 'Children fed', unit: 'children', value: 1234.4, available: true, caption: 'At 12 ECD centres.' },
  { label: 'Compost returned', unit: 'kg', value: 0, available: false, caveat: 'No compost logged yet.' },
];
const TYPES = [
  { metric: 'children_reached', label: 'Children (ECDs)', unit: 'children', stat: { value: 1234 } },
  { metric: 'adults_reached', label: 'Adults (soup kitchens)', unit: 'adults', stat: { notReady: true } },
];

describe('Impact report PDF', () => {
  it('uses the shared note layout, not the old letterhead', () => {
    render(<ImpactCalculatorPDF pdfStats={STATS} beneficiaryTypeStats={TYPES}
      dateRange={{ from: '2026-09-01', to: '2026-09-30' }} onClose={() => {}} />);

    const sheet = document.querySelector('.pdfnote-document');
    expect(sheet).not.toBeNull();
    expect(document.querySelector('.pdf-document')).toBeNull();
    expect(within(sheet).getByRole('heading', { name: 'Impact Report' })).toBeInTheDocument();
    expect(within(sheet).getByText('Prepared by')).toBeInTheDocument();
  });

  it('prints each figure with its unit, and says when one is not available', () => {
    render(<ImpactCalculatorPDF pdfStats={STATS} beneficiaryTypeStats={TYPES}
      dateRange={{ from: '2026-09-01', to: '2026-09-30' }} onClose={() => {}} />);

    expect(screen.getAllByText(/^1[\s,]?234 children$/).length).toBe(2);
    expect(screen.getByText('At 12 ECD centres.')).toBeInTheDocument();
    expect(screen.getByText('No compost logged yet.')).toBeInTheDocument();
    expect(screen.getByText(/Children are headcounted/)).toBeInTheDocument();
  });
});
