import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Neither library is exercised here; both pull in browser APIs jsdom lacks.
vi.mock('jspdf', () => ({ default: vi.fn() }));
vi.mock('html2canvas', () => ({ default: vi.fn() }));

const { default: PdfShell } = await import('../features/receipts/components/PdfShell');

describe('PdfShell', () => {
  it('renders as a direct child of body so print can hide its siblings', () => {
    const { container } = render(
      <div data-testid="app-tree">
        <PdfShell title="T" filename="f" onClose={() => {}}>
          <p>note body</p>
        </PdfShell>
      </div>
    );

    const modal = document.querySelector('.pdf-modal');
    expect(modal).not.toBeNull();

    // The whole print fix depends on this. `body > *:not(.pdf-modal)` only
    // hides the app if the modal is NOT inside it.
    expect(modal.parentElement).toBe(document.body);
    expect(container.querySelector('.pdf-modal')).toBeNull();

    expect(screen.getByText('note body')).toBeTruthy();
  });

  it('marks the note with data-pdf-root', () => {
    render(<PdfShell title="T" filename="f" onClose={() => {}}><p>x</p></PdfShell>);
    expect(document.querySelector('[data-pdf-root]')).not.toBeNull();
  });
});
