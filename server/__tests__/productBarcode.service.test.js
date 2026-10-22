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
  listAll: vi.fn(),
  recordScan: vi.fn(),
  listMatchCandidates: vi.fn(),
  saveFoodFacts: vi.fn(),
  listForProduct: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
};
const productRepoMock = { getProductById: vi.fn() };

vi.mock('../src/repositories/productBarcode.repository.js', () => ({ default: barcodeRepoMock }));
vi.mock('../src/repositories/product.repository.js', () => ({ default: productRepoMock }));

const offMock = { lookupProduct: vi.fn() };
vi.mock('../src/integrations/openFoodFacts.js', () => ({ default: offMock }));

const { default: service } = await import('../src/services/productBarcode.service.js');

const RICE = { id: 7, name: 'Rice 1kg', is_active: true, archived_at: null };

const linkedRow = (over = {}) => ({
  id: 3, product_id: 7, code: '0036000291452', units_per_scan: '12.000',
  product_name: 'Rice 1kg', sku: 'RICE-1KG', default_unit: 'each',
  is_active: true, archived_at: null, ...over,
});

beforeEach(() => {
  for (const fn of [...Object.values(barcodeRepoMock), ...Object.values(productRepoMock), offMock.lookupProduct]) fn.mockReset();
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
      code: '4006381333931', format: 'ean13', gs1: null, match: null,
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

describe('lookup of a GS1 case label', () => {
  it('finds the product by its GTIN and hands back the use-by date and batch', async () => {
    barcodeRepoMock.findByCode.mockResolvedValue(null);
    const result = await service.lookup('(01)10036000291459(17)261231(10)AB12');
    expect(barcodeRepoMock.findByCode).toHaveBeenCalledWith('10036000291459');
    expect(result.gs1).toEqual({ useBy: '2026-12-31', batch: 'AB12' });
  });
});

describe('listAll', () => {
  it('gives every link as a match keyed by its code', async () => {
    barcodeRepoMock.listAll.mockResolvedValue([linkedRow()]);
    expect(await service.listAll()).toEqual([
      expect.objectContaining({ code: '0036000291452', productId: 7, unitsPerScan: 12, available: true }),
    ]);
  });
});

describe('recordScan', () => {
  it('records a known screen and outcome against who scanned', async () => {
    await service.recordScan({ screen: 'packing', outcome: 'not_on_list', productId: 7, referenceId: 12 }, 3);
    expect(barcodeRepoMock.recordScan).toHaveBeenCalledWith({
      screen: 'packing', outcome: 'not_on_list', productId: 7, referenceId: 12, userId: 3,
    });
  });

  it('refuses a screen or outcome it does not know', async () => {
    await expect(service.recordScan({ screen: 'office', outcome: 'counted' })).rejects.toMatchObject({ status: 400 });
    await expect(service.recordScan({ screen: 'packing', outcome: 'maybe' })).rejects.toMatchObject({ status: 400 });
    expect(barcodeRepoMock.recordScan).not.toHaveBeenCalled();
  });
});

describe('suggest', () => {
  it('says which product already has the code, without asking outside', async () => {
    barcodeRepoMock.findByCode.mockResolvedValue(linkedRow());
    const result = await service.suggest('036000291452');
    expect(result.linkedTo).toEqual({ productId: 7, productName: 'Rice 1kg' });
    expect(offMock.lookupProduct).not.toHaveBeenCalled();
  });

  it('asks Open Food Facts about a code nobody has linked', async () => {
    barcodeRepoMock.findByCode.mockResolvedValue(null);
    offMock.lookupProduct.mockResolvedValue({ name: 'Koo Baked beans 410 g', weightKg: 0.41 });
    barcodeRepoMock.listMatchCandidates.mockResolvedValue([]);
    const result = await service.suggest('4006381333931');
    expect(offMock.lookupProduct).toHaveBeenCalledWith('4006381333931');
    expect(result).toMatchObject({ linkedTo: null, suggestion: { name: 'Koo Baked beans 410 g' } });
  });
});

const BRAND_B = {
  name: 'Brand B Baked beans in tomato sauce 410 g', productName: 'Baked beans in tomato sauce',
  brand: 'Brand B', quantity: '410 g', weightKg: 0.41, categories: ['canned-foods', 'baked-beans'],
};

describe('matches', () => {
  it('suggests the stock item that holds another brand of the same food', async () => {
    barcodeRepoMock.findByCode.mockResolvedValue(null);
    offMock.lookupProduct.mockResolvedValue(BRAND_B);
    barcodeRepoMock.listMatchCandidates.mockResolvedValue([
      { id: 1, name: 'Baked Beans 410g', sku: 'BEANS-410', weight_kg: '0.410',
        barcodes: [{ foodName: 'Baked beans', foodBrand: 'Brand A', foodWeightKg: '0.410', foodCategories: ['canned-foods', 'baked-beans'] }] },
      { id: 2, name: 'Rice 1kg', sku: 'RICE', weight_kg: '1.000', barcodes: [] },
    ]);
    const result = await service.matches('4006381333931');
    expect(result.food).toEqual({ name: BRAND_B.name, quantity: '410 g' });
    expect(result.matches).toEqual([expect.objectContaining({ productId: 1, reasons: ['size', 'name', 'kind'] })]);
  });

  it('suggests nothing when Open Food Facts does not know the code', async () => {
    barcodeRepoMock.findByCode.mockResolvedValue(null);
    offMock.lookupProduct.mockResolvedValue(null);
    const result = await service.matches('4006381333931');
    expect(result).toEqual({ code: '4006381333931', linkedTo: null, food: null, matches: [] });
    expect(barcodeRepoMock.listMatchCandidates).not.toHaveBeenCalled();
  });

  it('says which product already has a linked code', async () => {
    barcodeRepoMock.findByCode.mockResolvedValue(linkedRow());
    const result = await service.matches('036000291452');
    expect(result.linkedTo).toEqual({ productId: 7, productName: 'Rice 1kg' });
    expect(offMock.lookupProduct).not.toHaveBeenCalled();
  });
});

describe('remembering what a linked code is', () => {
  it('keeps what Open Food Facts says about a code once it is linked, without holding up the link', async () => {
    productRepoMock.getProductById.mockResolvedValue(RICE);
    barcodeRepoMock.create.mockResolvedValue({ id: 40 });
    offMock.lookupProduct.mockResolvedValue(BRAND_B);
    await service.link(7, { code: '4006381333931' }, 1);
    await vi.waitFor(() => expect(barcodeRepoMock.saveFoodFacts).toHaveBeenCalledWith(40, BRAND_B));
  });
});
