// ─────────────────────────────────────────────────────────────
// src/tests/BarcodeReader.test.jsx
//
// useBarcodeReader.js, through ProductScanBar:
//   - with no signal, a code on the phone's own copy of every link is
//     still named; one it has never seen says so, in plain words
//   - every scan leaves a record of what it was, for the report
//   - a GS1 case label hands its use-by date to the screen
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/productBarcodeAPI', () => ({
  lookupBarcode: vi.fn(),
  linkBarcode: vi.fn(),
  getAllBarcodes: vi.fn(),
  recordScan: vi.fn(),
}));

const api = await import('../services/productBarcodeAPI');
const { forgetKnownBarcodes } = await import('../features/scan/useBarcodeReader');
const { default: ProductScanBar } = await import('../features/scan/ProductScanBar');

const RICE = { code: '4006381333931', productId: 7, productName: 'Rice 1kg', defaultUnit: 'kg', unitsPerScan: 1, available: true };
const offline = () => Object.assign(new Error('Could not reach the server.'), { isNetworkError: true });

beforeEach(() => {
  vi.clearAllMocks();
  forgetKnownBarcodes();
  api.getAllBarcodes.mockResolvedValue([RICE]);
  api.lookupBarcode.mockRejectedValue(offline());
  api.recordScan.mockResolvedValue(undefined);
});

const scan = (user, code) => user.type(screen.getByLabelText('Barcode'), `${code}{Enter}`);

describe('scanning with no signal', () => {
  it('names a code from the phone’s own copy without asking the server', async () => {
    const onMatch = vi.fn(() => 'Rice 1kg: 1.');
    const user = userEvent.setup();
    render(<ProductScanBar onMatch={onMatch} />);
    await waitFor(() => expect(api.getAllBarcodes).toHaveBeenCalled());

    await scan(user, '4006381333931');
    expect(await screen.findByText('Rice 1kg: 1.')).toBeInTheDocument();
    expect(onMatch).toHaveBeenCalledWith(expect.objectContaining({ productId: 7 }), { useBy: null, batch: null });
    expect(api.lookupBarcode).not.toHaveBeenCalled();
  });

  it('says plainly when the phone has never seen the code', async () => {
    const user = userEvent.setup();
    render(<ProductScanBar onMatch={vi.fn()} />);
    await waitFor(() => expect(api.getAllBarcodes).toHaveBeenCalled());

    await scan(user, '96385074');
    expect(await screen.findByText(/No signal, and this phone has not seen this barcode before/)).toBeInTheDocument();
  });
});

describe('scan records', () => {
  it('records a count, and a real product the list does not want, with where it was', async () => {
    let wanted = true;
    const onMatch = vi.fn(() => (wanted ? 'counted' : { tone: 'warn', text: 'Not on this pallet.' }));
    const user = userEvent.setup();
    render(<ProductScanBar onMatch={onMatch} screen="packing" referenceId={12} />);
    await waitFor(() => expect(api.getAllBarcodes).toHaveBeenCalled());

    await scan(user, '4006381333931');
    await waitFor(() => expect(api.recordScan).toHaveBeenCalledWith({
      screen: 'packing', outcome: 'counted', productId: 7, referenceId: 12,
    }));
    wanted = false;
    await scan(user, '4006381333931');
    await waitFor(() => expect(api.recordScan).toHaveBeenLastCalledWith({
      screen: 'packing', outcome: 'not_on_list', productId: 7, referenceId: 12,
    }));
  });

  it('records a misread, and nothing at all when the screen does not say where it is', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ProductScanBar onMatch={vi.fn()} screen="receiving" />);
    await scan(user, '4006381333932');
    await waitFor(() => expect(api.recordScan).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'misread' })));
    unmount();

    api.recordScan.mockClear();
    render(<ProductScanBar onMatch={vi.fn()} />);
    await scan(user, '4006381333932');
    expect(await screen.findByText(/not a barcode the system can read/)).toBeInTheDocument();
    expect(api.recordScan).not.toHaveBeenCalled();
  });
});

describe('a GS1 case label', () => {
  it('hands the use-by date and batch to the screen with the product', async () => {
    api.getAllBarcodes.mockResolvedValue([{ ...RICE, code: '10036000291459' }]);
    const onMatch = vi.fn(() => 'ok');
    const user = userEvent.setup();
    render(<ProductScanBar onMatch={onMatch} />);
    await waitFor(() => expect(api.getAllBarcodes).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Barcode'), '(01)10036000291459(17)261231(10)AB12{Enter}');
    await waitFor(() => expect(onMatch).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 7 }), { useBy: '2026-12-31', batch: 'AB12' },
    ));
  });
});
