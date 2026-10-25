// ─────────────────────────────────────────────────────────────
// src/tests/PrintLabels.test.jsx
//
// Print labels on a stock item (products/PrintLabels.jsx): the item gets
// its own code for the amount one label stands for, linked with that
// amount as units per scan before the sheet opens; a counted item takes
// whole numbers only; nothing is linked or printed while something is
// wrong.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/productBarcodeAPI', () => ({ linkBarcode: vi.fn() }));
vi.mock('../features/labels/labelSheetPdf', async (importOriginal) => ({
  ...(await importOriginal()),
  openBlankForSheet: vi.fn(() => ({ closed: false, close: vi.fn() })),
  openLabelSheet: vi.fn(() => ({ opened: true, labelCount: 21 })),
}));

const api = await import('../services/productBarcodeAPI');
const sheet = await import('../features/labels/labelSheetPdf');
const { default: PrintLabels } = await import('../features/products/PrintLabels');

const BUTTERNUT = { id: 4, name: 'Butternut', defaultUnit: 'crate', isPerishable: true };
const RICE = { id: 12, name: 'Rice', defaultUnit: 'kg', isPerishable: false };

beforeEach(() => {
  vi.clearAllMocks();
  api.linkBarcode.mockImplementation(async (id, { code, unitsPerScan }) => ({ id: 1, productId: id, code, unitsPerScan }));
});

describe('printing labels for a stock item', () => {
  it('links one crate of butternut as its own code, then prints a sheet of 21', async () => {
    const onLinked = vi.fn();
    const user = userEvent.setup();
    render(<PrintLabels product={BUTTERNUT} onLinked={onLinked} />);

    await user.click(screen.getByRole('button', { name: 'Print labels' }));
    await waitFor(() => expect(api.linkBarcode).toHaveBeenCalledWith(4, { code: 'LOL4N1', unitsPerScan: 1 }));
    expect(onLinked).toHaveBeenCalledWith(expect.objectContaining({ code: 'LOL4N1' }));
    const [args] = sheet.openLabelSheet.mock.calls[0];
    expect(args).toMatchObject({ title: 'Butternut', useBy: true });
    expect(args.labels).toEqual([expect.objectContaining({ code: 'LOL4N1', count: 21 })]);
    expect(args.labels[0].caption).toMatch(/^1 crate · Printed /);
    expect(await screen.findByText(/21 labels for 1 crate, code LOL4N1\./)).toBeInTheDocument();
  });

  it('lets a weighed item be any amount: a 10 kg sack of rice', async () => {
    const user = userEvent.setup();
    render(<PrintLabels product={RICE} />);
    const amount = screen.getByLabelText('Each label is');
    await user.clear(amount);
    await user.type(amount, '10');
    const howMany = screen.getByLabelText('How many labels');
    await user.clear(howMany);
    await user.type(howMany, '5');
    await user.click(screen.getByRole('button', { name: 'Print labels' }));
    await waitFor(() => expect(api.linkBarcode).toHaveBeenCalledWith(12, { code: 'LOL12K10000', unitsPerScan: 10 }));
    expect(sheet.openLabelSheet.mock.calls[0][0]).toMatchObject({ useBy: false });
    expect(sheet.openLabelSheet.mock.calls[0][0].labels[0]).toMatchObject({ count: 5 });
  });

  it('refuses part of a crate, or no labels, and prints nothing', async () => {
    const user = userEvent.setup();
    render(<PrintLabels product={BUTTERNUT} />);
    const amount = screen.getByLabelText('Each label is');
    await user.clear(amount);
    await user.type(amount, '1.5');
    const howMany = screen.getByLabelText('How many labels');
    await user.clear(howMany);
    await user.type(howMany, '0');
    await user.click(screen.getByRole('button', { name: 'Print labels' }));
    expect(screen.getByText('A whole number of crates, 1 or more.')).toBeInTheDocument();
    expect(screen.getByText('From 1 to 500 labels.')).toBeInTheDocument();
    expect(api.linkBarcode).not.toHaveBeenCalled();
    expect(sheet.openBlankForSheet).not.toHaveBeenCalled();
  });

  it('says so when the browser blocks the sheet', async () => {
    sheet.openLabelSheet.mockReturnValueOnce({ opened: false, labelCount: 21 });
    const user = userEvent.setup();
    render(<PrintLabels product={BUTTERNUT} />);
    await user.click(screen.getByRole('button', { name: 'Print labels' }));
    expect(await screen.findByText(/Allow pop-ups for this site/)).toBeInTheDocument();
  });
});
