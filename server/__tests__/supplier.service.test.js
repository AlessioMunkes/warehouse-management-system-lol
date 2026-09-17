// ─────────────────────────────────────────────────────────────
// server/__tests__/supplier.service.test.js
//
// Specification tests for supplier.service.js with the repository
// mocked. Every assertion here is a rule someone decided, not
// behaviour observed after the fact.
//
// Note the deliberate asymmetry between the supplier tests and the
// prospect tests: suppliers are validated hard, prospects barely at
// all. If a future change makes the prospect pad reject things, these
// tests should fail — that strictness is the bug, not the test.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/repositories/supplier.repository.js', () => ({
  default: {
    listSuppliers:          vi.fn(),
    getSupplierById:        vi.fn(),
    findSupplierByName:     vi.fn(),
    getSupplierStats:       vi.fn(),
    getRecentPurchaseOrders: vi.fn(),
    insertSupplier:         vi.fn(),
    updateSupplier:         vi.fn(),
    setSupplierActive:      vi.fn(),
    listProspects:          vi.fn(),
    getProspectById:        vi.fn(),
    insertProspect:         vi.fn(),
    updateProspect:         vi.fn(),
    deleteProspect:         vi.fn(),
    convertProspect:        vi.fn(),
  },
}));

const repo = (await import('../src/repositories/supplier.repository.js')).default;
const service = (await import('../src/services/supplier.service.js')).default;

const SUPPLIER = {
  id: 1, name: 'Peninsula Fresh Wholesalers', is_active: true,
  contact_email: 'orders@peninsulafresh.co.za',
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.findSupplierByName.mockResolvedValue(null);
  repo.insertSupplier.mockImplementation(async (p) => ({ id: 99, ...p, is_active: true }));
});

describe('registerSupplier', () => {
  it('requires a name', async () => {
    await expect(service.registerSupplier({}, 2)).rejects.toMatchObject({ status: 400 });
  });

  it('treats a whitespace-only name as missing', async () => {
    await expect(service.registerSupplier({ name: '   ' }, 2)).rejects.toMatchObject({ status: 400 });
  });

  it('trims the name before storing it', async () => {
    await service.registerSupplier({ name: '  Cape Cold Storage  ' }, 2);
    expect(repo.insertSupplier).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Cape Cold Storage' }), 2
    );
  });

  it('rejects a duplicate name with 409, not a database error', async () => {
    repo.findSupplierByName.mockResolvedValue(SUPPLIER);
    await expect(service.registerSupplier({ name: 'Peninsula Fresh Wholesalers' }, 2))
      .rejects.toMatchObject({ status: 409 });
    expect(repo.insertSupplier).not.toHaveBeenCalled();
  });

  // suppliers.name UNIQUE is case-sensitive; this check is not.
  // Without it Postgres accepts both spellings and the supplier's
  // price history splits across two ids.
  it('detects a duplicate that differs only by case', async () => {
    repo.findSupplierByName.mockResolvedValue(SUPPLIER);
    await expect(service.registerSupplier({ name: 'peninsula fresh wholesalers' }, 2))
      .rejects.toMatchObject({ status: 409 });
    expect(repo.findSupplierByName).toHaveBeenCalledWith('peninsula fresh wholesalers');
  });

  it('says so when the clashing supplier is inactive', async () => {
    repo.findSupplierByName.mockResolvedValue({ ...SUPPLIER, is_active: false });
    await expect(service.registerSupplier({ name: 'Peninsula Fresh Wholesalers' }, 2))
      .rejects.toThrow(/inactive/);
  });

  it('stores empty optional fields as null rather than empty strings', async () => {
    await service.registerSupplier({ name: 'X', contactPhone: '', address: '   ' }, 2);
    expect(repo.insertSupplier).toHaveBeenCalledWith(
      expect.objectContaining({ contactPhone: null, address: null }), 2
    );
  });

  it('lowercases the contact email', async () => {
    await service.registerSupplier({ name: 'X', contactEmail: 'Orders@Example.CO.ZA' }, 2);
    expect(repo.insertSupplier).toHaveBeenCalledWith(
      expect.objectContaining({ contactEmail: 'orders@example.co.za' }), 2
    );
  });

  it('rejects an email with no domain', async () => {
    await expect(service.registerSupplier({ name: 'X', contactEmail: 'orders@example' }, 2))
      .rejects.toMatchObject({ status: 400 });
  });

  it('accepts a zero-day lead time', async () => {
    await service.registerSupplier({ name: 'X', expectedLeadTimeDays: 0 }, 2);
    expect(repo.insertSupplier).toHaveBeenCalledWith(
      expect.objectContaining({ expectedLeadTimeDays: 0 }), 2
    );
  });

  it('rejects a lead time above the 365-day ceiling', async () => {
    await expect(service.registerSupplier({ name: 'X', expectedLeadTimeDays: 400 }, 2))
      .rejects.toMatchObject({ status: 400 });
  });

  it('rejects a fractional lead time', async () => {
    await expect(service.registerSupplier({ name: 'X', expectedLeadTimeDays: 2.5 }, 2))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe('updateSupplier', () => {
  beforeEach(() => {
    repo.getSupplierById.mockResolvedValue(SUPPLIER);
    repo.updateSupplier.mockImplementation(async (id, patch) => ({ ...SUPPLIER, ...patch }));
  });

  it('404s on a supplier that does not exist', async () => {
    repo.getSupplierById.mockResolvedValue(null);
    await expect(service.updateSupplier(1, { name: 'X' })).rejects.toMatchObject({ status: 404 });
  });

  // A PATCH omitting a field must leave it alone. Sending every
  // column would null out anything the form did not render.
  it('only sends fields that were actually present in the body', async () => {
    await service.updateSupplier(1, { contactPhone: '021 555 0000' });
    expect(repo.updateSupplier).toHaveBeenCalledWith(1, { contactPhone: '021 555 0000' });
  });

  it('allows an explicit null to clear a field', async () => {
    await service.updateSupplier(1, { agreementRef: null });
    expect(repo.updateSupplier).toHaveBeenCalledWith(1, { agreementRef: null });
  });

  it('rejects an empty patch rather than issuing a no-op UPDATE', async () => {
    await expect(service.updateSupplier(1, {})).rejects.toMatchObject({ status: 400 });
  });

  it('does not treat the supplier itself as a name clash', async () => {
    await service.updateSupplier(1, { name: 'Peninsula Fresh Wholesalers' });
    expect(repo.findSupplierByName).toHaveBeenCalledWith(
      'Peninsula Fresh Wholesalers', { excludeId: 1 }
    );
  });

  it('rejects a non-integer id with 400', async () => {
    await expect(service.updateSupplier('abc', { name: 'X' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('setSupplierStatus', () => {
  beforeEach(() => {
    repo.getSupplierById.mockResolvedValue(SUPPLIER);
    repo.setSupplierActive.mockImplementation(async (id, active) => ({ ...SUPPLIER, is_active: active }));
  });

  it('requires a boolean', async () => {
    await expect(service.setSupplierStatus(1, { isActive: 'no' })).rejects.toMatchObject({ status: 400 });
  });

  // Deactivation is never blocked on open purchase orders. Same
  // principle as the dispatch gate: the system records what happened,
  // it does not prevent it. The UI warns; the service complies.
  it('deactivates without checking for open purchase orders', async () => {
    const result = await service.setSupplierStatus(1, { isActive: false }, 2);
    expect(result.is_active).toBe(false);
    expect(repo.setSupplierActive).toHaveBeenCalledWith(1, false, 2);
  });

  it('is a no-op when the status already matches', async () => {
    await service.setSupplierStatus(1, { isActive: true }, 2);
    expect(repo.setSupplierActive).not.toHaveBeenCalled();
  });
});

describe('listSuppliers', () => {
  it('treats the string "false" as false', async () => {
    await service.listSuppliers({ includeInactive: 'false' });
    expect(repo.listSuppliers).toHaveBeenCalledWith(
      expect.objectContaining({ includeInactive: false })
    );
  });

  it('treats the string "true" as true', async () => {
    await service.listSuppliers({ includeInactive: 'true' });
    expect(repo.listSuppliers).toHaveBeenCalledWith(
      expect.objectContaining({ includeInactive: true })
    );
  });
});

describe('addProspect — deliberately permissive', () => {
  beforeEach(() => {
    repo.insertProspect.mockImplementation(async (p) => ({ id: 5, status: 'open', ...p }));
  });

  it('accepts a bare name and nothing else', async () => {
    const result = await service.addProspect({ name: 'That bakery on Voortrekker' }, 2);
    expect(result.name).toBe('That bakery on Voortrekker');
  });

  it('still requires a name', async () => {
    await expect(service.addProspect({ notes: 'cheap rice' }, 2)).rejects.toMatchObject({ status: 400 });
  });

  it('does not require contact details', async () => {
    await service.addProspect({ name: 'Someone Grizel met at a expo' }, 2);
    expect(repo.insertProspect).toHaveBeenCalledWith(
      expect.objectContaining({ contactEmail: null, contactPhone: null }), 2
    );
  });

  it('allows duplicate names — this is a notepad, not a register', async () => {
    await service.addProspect({ name: 'Bokomo' }, 2);
    await service.addProspect({ name: 'Bokomo' }, 3);
    expect(repo.insertProspect).toHaveBeenCalledTimes(2);
  });
});

describe('updateProspect', () => {
  beforeEach(() => {
    repo.getProspectById.mockResolvedValue({ id: 5, name: 'Lead', status: 'open' });
    repo.updateProspect.mockImplementation(async (id, patch) => ({ id, ...patch }));
  });

  it('accepts the three open statuses', async () => {
    for (const status of ['open', 'contacted', 'rejected']) {
      await expect(service.updateProspect(5, { status })).resolves.toBeTruthy();
    }
  });

  // Conversion happens in a transaction alongside the supplier
  // insert. A PATCH setting this would produce a prospect claiming a
  // conversion that never happened; the database CHECK would reject
  // it, but a sentence is better than a constraint violation.
  it('refuses to set status to converted directly', async () => {
    await expect(service.updateProspect(5, { status: 'converted' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('refuses to edit an already-converted prospect', async () => {
    repo.getProspectById.mockResolvedValue({ id: 5, name: 'Lead', status: 'converted' });
    await expect(service.updateProspect(5, { notes: 'x' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('removeProspect', () => {
  it('deletes an open prospect', async () => {
    repo.getProspectById.mockResolvedValue({ id: 5, status: 'open' });
    repo.deleteProspect.mockResolvedValue(true);
    await expect(service.removeProspect(5)).resolves.toMatchObject({ deleted: true });
  });

  it('will not delete a converted prospect — it is the provenance record', async () => {
    repo.getProspectById.mockResolvedValue({ id: 5, status: 'converted' });
    await expect(service.removeProspect(5)).rejects.toMatchObject({ status: 409 });
    expect(repo.deleteProspect).not.toHaveBeenCalled();
  });
});

describe('convertProspect', () => {
  const PROSPECT = {
    id: 5, name: 'Ubuntu Bakery Supplies', status: 'open',
    contact_name: 'Sipho', contact_email: 'hello@ubuntubakery.co.za',
    contact_phone: '021 555 0311', what_they_supply: 'Bread and rolls',
    notes: 'Delivers early', lead_source: 'Grizel — food expo',
  };

  beforeEach(() => {
    repo.getProspectById.mockResolvedValue(PROSPECT);
    repo.convertProspect.mockImplementation(async (id, payload) => ({
      ok: true, supplier: { id: 99, ...payload }, prospect: { ...PROSPECT, status: 'converted' },
    }));
  });

  it('carries the prospect fields onto the new supplier', async () => {
    const { supplier } = await service.convertProspect(5, {}, 2);
    expect(supplier.name).toBe('Ubuntu Bakery Supplies');
    expect(supplier.contactEmail).toBe('hello@ubuntubakery.co.za');
    expect(supplier.category).toBe('Bread and rolls');
  });

  // "Who told us about these people" is exactly what nobody can
  // remember two years later.
  it('preserves the lead source in the supplier notes', async () => {
    const { supplier } = await service.convertProspect(5, {}, 2);
    expect(supplier.notes).toContain('Grizel — food expo');
  });

  it('lets the registration form override prospect values', async () => {
    const { supplier } = await service.convertProspect(5, { name: 'Ubuntu Bakery (Pty) Ltd' }, 2);
    expect(supplier.name).toBe('Ubuntu Bakery (Pty) Ltd');
  });

  it('409s when the prospect is already converted', async () => {
    repo.getProspectById.mockResolvedValue({ ...PROSPECT, status: 'converted' });
    await expect(service.convertProspect(5, {}, 2)).rejects.toMatchObject({ status: 409 });
    expect(repo.convertProspect).not.toHaveBeenCalled();
  });

  it('409s when a supplier of that name already exists', async () => {
    repo.findSupplierByName.mockResolvedValue(SUPPLIER);
    await expect(service.convertProspect(5, {}, 2)).rejects.toMatchObject({ status: 409 });
  });

  // Two managers converting the same lead at the same moment: the
  // pre-check passes for both, and the transaction's FOR UPDATE lock
  // is what actually decides it. The loser must get 409, not 500.
  it('409s when the repository reports losing the race', async () => {
    repo.convertProspect.mockResolvedValue({ ok: false, code: 'already_converted' });
    await expect(service.convertProspect(5, {}, 2)).rejects.toMatchObject({ status: 409 });
  });
});
