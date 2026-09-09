// ─────────────────────────────────────────────────────────────
// server/__tests__/product.service.test.js
//
// product.repository.js is mocked, so these tests exercise the
// service's own rules: only name + defaultUnit are required, weight
// is optional-but-positive-if-present, and a name/SKU clash 409s on
// both create and update — same split user.service.test.js uses.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  listProducts:    vi.fn(),
  getProductById:  vi.fn(),
  findByNameOrSku: vi.fn(),
  insertProduct:   vi.fn(),
  updateProduct:   vi.fn(),
  setProductActive: vi.fn(),
};

vi.mock('../src/repositories/product.repository.js', () => ({ default: repoMock }));

const { default: productService } = await import('../src/services/product.service.js');

const PRODUCT_ID = 5;

const existingProduct = (over = {}) => ({
  id: PRODUCT_ID, name: 'Maize meal 10kg', sku: 'MM-10KG',
  default_unit: 'bag', weight_kg: 10, category: 'Dry goods',
  is_perishable: false, is_active: true, ...over,
});

const body = (over = {}) => ({
  name: 'Maize meal 10kg', sku: 'MM-10KG', defaultUnit: 'bag',
  weightKg: 10, category: 'Dry goods', isPerishable: false, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.findByNameOrSku.mockResolvedValue(null);
  repoMock.getProductById.mockResolvedValue(existingProduct());
  repoMock.insertProduct.mockResolvedValue({ id: 900, ...existingProduct() });
  repoMock.updateProduct.mockResolvedValue(existingProduct());
  repoMock.setProductActive.mockResolvedValue(existingProduct());
});

describe('listProducts', () => {
  it('treats the string "true" from a query param as true', async () => {
    repoMock.listProducts.mockResolvedValue([]);
    await productService.listProducts({ includeInactive: 'true', search: '' });
    expect(repoMock.listProducts).toHaveBeenCalledWith({ includeInactive: true, search: null });
  });

  it('defaults to excluding inactive products and no search filter', async () => {
    repoMock.listProducts.mockResolvedValue([]);
    await productService.listProducts({});
    expect(repoMock.listProducts).toHaveBeenCalledWith({ includeInactive: false, search: null });
  });
});

describe('getProduct', () => {
  it('rejects a non-numeric id', async () => {
    await expect(productService.getProduct('abc')).rejects.toMatchObject({ status: 400 });
  });

  it('404s when the repository finds nothing', async () => {
    repoMock.getProductById.mockResolvedValue(null);
    await expect(productService.getProduct(999)).rejects.toMatchObject({ status: 404 });
  });
});

describe('createProduct — validation', () => {
  it('requires a name', async () => {
    await expect(productService.createProduct(body({ name: '  ' })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('requires a default unit', async () => {
    await expect(productService.createProduct(body({ defaultUnit: '' })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a zero weight', async () => {
    await expect(productService.createProduct(body({ weightKg: 0 })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a negative weight', async () => {
    await expect(productService.createProduct(body({ weightKg: -3 })))
      .rejects.toMatchObject({ status: 400 });
  });

  it('accepts a blank weight as "not recorded", not zero', async () => {
    await productService.createProduct(body({ weightKg: '' }));
    expect(repoMock.insertProduct).toHaveBeenCalledWith(expect.objectContaining({ weightKg: null }));
  });

  it('409s on a name clash', async () => {
    repoMock.findByNameOrSku.mockResolvedValue(existingProduct({ name: 'Maize meal 10kg' }));
    await expect(productService.createProduct(body())).rejects.toMatchObject({ status: 409 });
  });

  it('names the SKU specifically when that is what clashed', async () => {
    repoMock.findByNameOrSku.mockResolvedValue(existingProduct({ name: 'Different name' }));
    await expect(productService.createProduct(body()))
      .rejects.toMatchObject({ message: expect.stringContaining('SKU') });
  });
});

describe('updateProduct — partial patch semantics', () => {
  it('404s when the target product does not exist', async () => {
    repoMock.getProductById.mockResolvedValue(null);
    await expect(productService.updateProduct(PRODUCT_ID, { name: 'X' }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('rejects an empty patch rather than writing nothing', async () => {
    await expect(productService.updateProduct(PRODUCT_ID, {})).rejects.toMatchObject({ status: 400 });
  });

  it('only sends fields actually present in the body', async () => {
    await productService.updateProduct(PRODUCT_ID, { category: 'Fresh produce' });
    const patch = repoMock.updateProduct.mock.calls[0][1];
    expect(patch).toEqual({ category: 'Fresh produce' });
  });

  it('409s when renaming into a name/SKU someone else already has', async () => {
    repoMock.findByNameOrSku.mockResolvedValue(existingProduct({ id: 999 }));
    await expect(productService.updateProduct(PRODUCT_ID, { name: 'Taken name' }))
      .rejects.toMatchObject({ status: 409 });
  });

  it('excludes the product\'s own row when checking for a clash', async () => {
    await productService.updateProduct(PRODUCT_ID, { name: 'Maize meal 10kg' });
    expect(repoMock.findByNameOrSku).toHaveBeenCalledWith(
      'Maize meal 10kg', existingProduct().sku, { excludeId: PRODUCT_ID }
    );
  });

  it('does not re-check for a clash when neither name nor sku changed', async () => {
    await productService.updateProduct(PRODUCT_ID, { category: 'Cold chain' });
    expect(repoMock.findByNameOrSku).not.toHaveBeenCalled();
  });
});

describe('setProductStatus', () => {
  it('requires isActive to be a boolean', async () => {
    await expect(productService.setProductStatus(PRODUCT_ID, { isActive: 'yes' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('404s when the target product does not exist', async () => {
    repoMock.getProductById.mockResolvedValue(null);
    await expect(productService.setProductStatus(PRODUCT_ID, { isActive: false }))
      .rejects.toMatchObject({ status: 404 });
  });

  it('is a no-op (no write) when the status already matches', async () => {
    repoMock.getProductById.mockResolvedValue(existingProduct({ is_active: false }));
    const result = await productService.setProductStatus(PRODUCT_ID, { isActive: false });
    expect(repoMock.setProductActive).not.toHaveBeenCalled();
    expect(result.is_active).toBe(false);
  });

  it('writes the new status when it actually changes', async () => {
    await productService.setProductStatus(PRODUCT_ID, { isActive: false });
    expect(repoMock.setProductActive).toHaveBeenCalledWith(PRODUCT_ID, false);
  });
});
