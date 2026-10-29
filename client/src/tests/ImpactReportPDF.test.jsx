// ─────────────────────────────────────────────────────────────
// src/tests/ImpactReportPDF.test.jsx
//
// The Impact report is the one PDF that keeps the illustrated poster
// (PdfShell), not the table layout the other notes use (NoteSheet):
// a 2x2 grid of cards with their pictures, then beneficiaries by type.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ImpactCalculatorPDF from '../features/reporting/ImpactCalculatorPDF';

const STATS = [
  { label: 'Children fed', unit: 'children', value: 1234.4, available: true, caption: 'At 12 ECD centres.', image: '/images/child-bowl.svg' },
  { label: 'Compost returned', unit: 'kg', value: 0, available: false, caveat: 'No compost logged yet.', image: '/images/farmer-compost.svg' },
];
const TYPES = [
  { metric: 'children_reached', label: 'Children (ECDs)', unit: 'children', stat: { value: 1234 } },
  { metric: 'adults_reached', label: 'Adults (soup kitchens)', unit: 'adults', stat: { notReady: true } },
];
const renderPdf = () => render(<ImpactCalculatorPDF pdfStats={STATS} beneficiaryTypeStats={TYPES}
  dateRange={{ from: '2026-09-01', to: '2026-09-30' }} onClose={() => {}} />);

describe('Impact report PDF', () => {
  it('is the illustrated poster, not the table layout', () => {
    renderPdf();
    expect(document.querySelector('.pdf-poster')).not.toBeNull();
    expect(document.querySelector('.pdfnote-document')).toBeNull();
    expect(document.querySelectorAll('.pdf-poster-card')).toHaveLength(2);
    const pictures = [...document.querySelectorAll('.pdf-poster-illustration img')].map((img) => img.getAttribute('src'));
    expect(pictures).toEqual(['/images/child-bowl.svg', '/images/farmer-compost.svg']);
  });

  it('shows each figure, says when one is not available, and explains the counts', () => {
    renderPdf();
    expect(screen.getByText(/^1[\s,]?234$/)).toBeInTheDocument();
    expect(screen.getByText('At 12 ECD centres.')).toBeInTheDocument();
    expect(screen.getByText('No compost logged yet.')).toBeInTheDocument();
    expect(screen.getByText('Beneficiaries by type')).toBeInTheDocument();
    expect(screen.getByText(/Adults are counted as one meal each/)).toBeInTheDocument();
  });
});
