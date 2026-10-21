// ─────────────────────────────────────────────────────────────
// server/__tests__/productBarcode.service.test.js
//
// Both repositories are mocked, so these exercise the service's own
// rules: an unknown code is a normal answer (match: null), not an
// error; a link is stored in the normalised form; linking the same
// code to the same product twice is fine, to a different product is a
// 409 naming it; a product out of the catalogue cannot take a link.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const barcodeRepoMock = {
  findByCode: vi.fn(),
  listForProduct: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
};
const productRepoMock = { getProductById: vi.fn() };

vi.mock('../src/repositories/productBarcode.repository.js', () => ({ default: barcodeRepoMock }));
vi.mock('../src/repositories/product.repository.js', () => ({ default: productRepoMock }));

const { default: service } = await import('../src/services/productBarcode.service.js');

const RICE = { id: 7, name: 'Rice 1kg', is_active: true, archived_at: null };

const linkedRow = (over = {}) => ({
  id: 3, product_id: 7, code: '0036000291452', units_per_scan: '12.000',
  product_name: 'Rice 1kg', sku: 'RICE-1KG', default_unit: 'each',
  is_active: true, archived_at: null, ...over,
});

beforeEach(() => {
  for (const fn of [...Object.values(barcodeRepoMock), ...Object.values(productRepoMock)]) fn.mockReset();
});

describe('lookup', () => {
  it('finds a code scanned as UPC-A under the EAN-13 it was stored as', async () => {
    barcodeRepoMock.findByCode.mockResolvedValue(linkedRow());
    const result = await service.lookup('036000291452');
    expect(barcodeRepoMock.findByCode).toHaveBeenCalledWith('0036000291452');
    expect(result.match).toMatchObject({ productId: 7, productName: 'Rice 1kg', unitsPerScan: 12, available: true });
  });

  it('answers an unknown code with match: null, not an error', async () => {
    barcodeRepoMock.findByCode.mockResolvedValue(null);
    await expect(service.lookup('4006381333931')).resolves.toEqual({
      code: '4006381333931', format: 'ean13', match: null,
    });
  });

  it('says a code on a product that left the catalogue is not available', async () => {
    barcodeRepoMock.findByCode.mockResolvedValue(linkedRow({ is_active: false }));
    expect((await service.lookup('036000291452')).match.available).toBe(false);
  });

  it('refuses a misread with a 400', async () => {
    await expect(service.lookup('4006381333932')).rejects.toMatchObject({ status: 400 });
    expect(barcodeRepoMock.findByCode).not.toHaveBeenCalled();
  });
});

describe('link', () => {
  it('stores the normalised code with who linked it', async () => {
    productRepoMock.getProductById.mockResolvedValue(RICE);
    barcodeRepoMock.create.mockResolvedValue({ id: 1 });
    await service.link(7, { code: '036000291452', unitsPerScan: '12' }, 42);
    expect(barcodeRepoMock.create).toHaveBeenCalledWith({
      productId: 7, code: '0036000291452', unitsPerScan: 12, supplierId: null, createdBy: 42,
    });
  });

  it('defaults to one unit per scan', async () => {
    productRepoMock.getProductById.mockResolvedValue(RICE);
    barcodeRepoMock.create.mockResolvedValue({ id: 1 });
    await service.link(7, { code: '4006381333931' }, 1);
    expect(barcodeRepoMock.create.mock.calls[0][0].unitsPerScan).toBe(1);
  });

  it('refuses zero, negative or absurd units per scan', async () => {
    productRepoMock.getProductById.mockResolvedValue(RICE);
    for (const unitsPerScan of [0, -1, 'abc', 10001]) {
      await expect(service.link(7, { code: '4006381333931', unitsPerScan }, 1)).rejects.toMatchObject({ status: 400 });
    }
  });

  it('treats the same link made twice as done', async () => {
    productRepoMock.getProductById.mockResolvedValue(RICE);
    barcodeRepoMock.create.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    barcodeRepoMock.findByCode.mockResolvedValue(linkedRow());
    await expect(service.link(7, { code: '036000291452' }, 1)).resolves.toMatchObject({ product_id: 7 });
  });

  it('names the other product when the code already means something else', async () => {
    productRepoMock.getProductById.mockResolvedValue(RICE);
    barcodeRepoMock.create.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    barcodeRepoMock.findByCode.mockResolvedValue(linkedRow({ product_id: 9, product_name: 'Sugar 2kg' }));
    await expect(service.link(7, { code: '036000291452' }, 1))
      .rejects.toMatchObject({ status: 409, message: 'That barcode is already linked to Sugar 2kg.' });
  });

  it('will not link to a product out of the catalogue', async () => {
    productRepoMock.getProductById.mockResolvedValue({ ...RICE, archived_at: '2026-01-01' });
    await expect(service.link(7, { code: '4006381333931' }, 1)).rejects.toMatchObject({ status: 409 });
    expect(barcodeRepoMock.create).not.toHaveBeenCalled();
  });

  it('404s an unknown product', async () => {
    productRepoMock.getProductById.mockResolvedValue(null);
    await expect(service.link(99, { code: '4006381333931' }, 1)).rejects.toMatchObject({ status: 404 });
  });
});

describe('unlink', () => {
  it('404s a barcode that is not on this product', async () => {
    barcodeRepoMock.remove.mockResolvedValue(null);
    await expect(service.unlink(7, 3, 1)).rejects.toMatchObject({ status: 404 });
    expect(barcodeRepoMock.remove).toHaveBeenCalledWith({ productId: 7, barcodeId: 3, actorId: 1 });
  });
});
