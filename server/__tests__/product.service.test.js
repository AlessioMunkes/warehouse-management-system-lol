// ─────────────────────────────────────────────────────────────
// server/__tests__/product.service.test.js
//
// product.repository.js is mocked, so these exercise the service's own
// rules against the real `products` shape: name, SKU and default unit
// are required, weight is optional but non-negative when given, blank
// is "not recorded" while zero is a real measurement, update is a
// partial patch, and a name/SKU clash 409s without a product counting
// as its own clash.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  listProducts:    vi.fn(),
  getProductById:  vi.fn(),
  findByNameOrSku: vi.fn(),
  createProduct:   vi.fn(),
  updateProduct:   vi.fn(),
  setActive:       vi.fn(),
};

vi.mock('../src/repositories/product.repository.js', () => ({ default: repoMock }));

const { default: productService } = await import('../src/services/product.service.js');

const PRODUCT_ID = 5;

const existingProduct = (over = {}) => ({
  id: PRODUCT_ID, name: 'Maize meal 10kg', sku: 'MM-10KG',
  weight_kg: 10, default_unit: 'bag', category: 'Dry goods',
  is_perishable: false, is_active: true,
  storage_type: 'dry', default_location_id: null,
  reorder_threshold: 0, ledger_unit: 'bag', ...over,
});

const body = (over = {}) => ({
  name: 'Maize meal 10kg', stockKeepingUnit: 'MM-10KG',
  defaultUnit: 'bag', weightKg: 10, category: 'Dry goods',
  isPerishable: false, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.findByNameOrSku.mockResolvedValue(null);
  repoMock.getProductById.mockResolvedValue(existingProduct());
  repoMock.createProduct.mockResolvedValue({ id: 900, ...existingProduct() });
  repoMock.updateProduct.mockResolvedValue(existingProduct());
  repoMock.setActive.mockResolvedValue(existingProduct({ is_active: false }));
  repoMock.listProducts.mockResolvedValue([]);
});

describe('listProducts', () => {
  it('treats the string "true" from a query param as true', async () => {
    await productService.listProducts({ includeInactive: 'true', search: '' });
    expect(repoMock.listProducts).toHaveBeenCalledWith({ includeInactive: true, search: null });
  });

  it('defaults to active products only and no search filter', async () => {
    await productService.listProducts({});
    expect(repoMock.listProducts).toHaveBeenCalledWith({ includeInactive: false, search: null });
  });

  it('trims a search term and passes it through', async () => {
    await productService.listProducts({ search: '  maize  ' });
    expect(repoMock.listProducts).toHaveBeenCalledWith({ includeInactive: false, search: 'maize' });
  });
});

describe('getProductById', () => {
  it('rejects a non-numeric id', async () => {
    await expect(productService.getProductById('abc')).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a zero or negative id', async () => {
    await expect(productService.getProductById(0)).rejects.toMatchObject({ status: 400 });
  });

  it('404s when the repository finds nothing', async () => {
    repoMock.getProductById.mockResolvedValue(null);
    await expect(productService.getProductById(999)).rejects.toMatchObject({ status: 404 });
  });
});

describe('createProduct', () => {
  it('requires a name', async () => {
    await expect(productService.createProduct(body({ name: '  ' })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('requires a SKU, because stock_keeping_unit is NOT NULL', async () => {
    await expect(productService.createProduct(body({ stockKeepingUnit: '' })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('accepts sku as an alias for stockKeepingUnit', async () => {
    await productService.createProduct({ name: 'Rice 5kg', sku: 'RC-5KG' });
    expect(repoMock.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ stockKeepingUnit: 'RC-5KG' })
    );
  });

  it('falls back to kg, the column default, when no unit is given', async () => {
    await productService.createProduct({ name: 'Rice 5kg', sku: 'RC-5KG' });
    expect(repoMock.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ defaultUnit: 'kg' })
    );
  });

  it('carries category and the perishable flag through to the repository', async () => {
    await productService.createProduct(body({ category: 'Fresh produce', isPerishable: true }));
    expect(repoMock.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'Fresh produce', isPerishable: true })
    );
  });

  it('rejects a negative weight', async () => {
    await expect(productService.createProduct(body({ weightKg: -3 })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a non-numeric weight', async () => {
    await expect(productService.createProduct(body({ weightKg: 'heavy' })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('treats a blank weight as "not recorded", not zero', async () => {
    await productService.createProduct(body({ weightKg: '' }));
    expect(repoMock.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ weightKg: null })
    );
  });

  it('keeps a zero weight as a real measurement', async () => {
    await productService.createProduct(body({ weightKg: 0 }));
    expect(repoMock.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ weightKg: 0 })
    );
  });

  it('409s on a name or SKU clash found up front', async () => {
    repoMock.findByNameOrSku.mockResolvedValue(existingProduct());
    await expect(productService.createProduct(body())).rejects.toMatchObject({ status: 409 });
  });

  it('409s on the unique-constraint race the pre-check cannot catch', async () => {
    repoMock.createProduct.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(productService.createProduct(body())).rejects.toMatchObject({ status: 409 });
  });

  // Regression test for a live 500: before unit validation was added,
  // defaultUnit: 'pallet' reached the INSERT unvalidated, hit
  // stock_levels_unit_check as a 23514, and product.controller.js's
  // respondError saw no err.status and returned a bare 500 with no
  // indication of what was actually wrong.
  it('rejects a unit outside STOCK_UNITS with a clean 400', async () => {
    await expect(productService.createProduct(body({ defaultUnit: 'pallet' })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a storage type outside dry/cold', async () => {
    await expect(productService.createProduct(body({ storageType: 'frozen' })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('keeps a zero reorder threshold as a real zero, not null', async () => {
    await productService.createProduct(body({ reorderThreshold: 0 }));
    expect(repoMock.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ reorderThreshold: 0 })
    );
  });

  it('maps a repo 23503 (storage location FK) to a clean 400', async () => {
    repoMock.createProduct.mockRejectedValue(Object.assign(new Error('fk'), { code: '23503' }));
    await expect(productService.createProduct(body())).rejects.toMatchObject({ status: 400 });
  });
});

describe('updateProduct — partial patch semantics', () => {
  it('rejects an empty patch rather than writing nothing', async () => {
    await expect(productService.updateProduct(PRODUCT_ID, {}))
      .rejects.toMatchObject({ status: 400 });
  });

  it('only forwards fields actually present in the body', async () => {
    await productService.updateProduct(PRODUCT_ID, { category: 'Fresh produce' });
    expect(repoMock.updateProduct).toHaveBeenCalledWith(PRODUCT_ID, { category: 'Fresh produce' });
  });

  it('lets a blank category clear the field', async () => {
    await productService.updateProduct(PRODUCT_ID, { category: '' });
    expect(repoMock.updateProduct).toHaveBeenCalledWith(PRODUCT_ID, { category: null });
  });

  it('does not check for a clash when neither name nor SKU is changing', async () => {
    await productService.updateProduct(PRODUCT_ID, { category: 'Cold chain' });
    expect(repoMock.findByNameOrSku).not.toHaveBeenCalled();
  });

  it('excludes the row being edited when it does check', async () => {
    await productService.updateProduct(PRODUCT_ID, { name: 'Maize meal 10kg' });
    expect(repoMock.findByNameOrSku).toHaveBeenCalledWith(
      'Maize meal 10kg', existingProduct().sku, { excludeId: PRODUCT_ID }
    );
  });

  it('409s when renaming into a name another product already has', async () => {
    repoMock.findByNameOrSku.mockResolvedValue(existingProduct({ id: 999 }));
    await expect(productService.updateProduct(PRODUCT_ID, { name: 'Taken name' }))
      .rejects.toMatchObject({ status: 409 });
  });

  it('404s when the row does not exist', async () => {
    repoMock.updateProduct.mockResolvedValue(null);
    await expect(productService.updateProduct(PRODUCT_ID, { category: 'X' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('rejects a blank name rather than clearing it', async () => {
    await expect(productService.updateProduct(PRODUCT_ID, { name: '   ' }))
      .rejects.toMatchObject({ status: 400 });
  });

  // Direct regression guard: this is the test that proves a name-only
  // patch was rebuilt on top of Alessio's partial-patch fix rather than
  // over it. Asserting the full shape (not just that name is present)
  // catches a patch that quietly forwards other keys alongside it.
  it('forwards an object with EXACTLY one key on a name-only patch', async () => {
    await productService.updateProduct(PRODUCT_ID, { name: 'Renamed Product' });
    const [, patchArg] = repoMock.updateProduct.mock.calls[0];
    expect(Object.keys(patchArg)).toEqual(['name']);
    expect(patchArg).toEqual({ name: 'Renamed Product' });
  });

  it('lets defaultLocationId: null clear the location — present-but-null differs from absent', async () => {
    await productService.updateProduct(PRODUCT_ID, { defaultLocationId: null });
    expect(repoMock.updateProduct).toHaveBeenCalledWith(PRODUCT_ID, { defaultLocationId: null });
  });
});

describe('setActive', () => {
  it('rejects anything that is not an explicit boolean', async () => {
    await expect(productService.setActive(PRODUCT_ID, 'yes'))
      .rejects.toMatchObject({ status: 400 });
  });

  it('accepts the string "false" a query param would produce', async () => {
    await productService.setActive(PRODUCT_ID, 'false');
    expect(repoMock.setActive).toHaveBeenCalledWith(PRODUCT_ID, false);
  });

  it('accepts a real boolean', async () => {
    await productService.setActive(PRODUCT_ID, true);
    expect(repoMock.setActive).toHaveBeenCalledWith(PRODUCT_ID, true);
  });

  it('404s when the row does not exist', async () => {
    repoMock.setActive.mockResolvedValue(null);
    await expect(productService.setActive(PRODUCT_ID, false))
      .rejects.toMatchObject({ status: 404 });
  });
});
