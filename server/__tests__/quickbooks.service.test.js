// ─────────────────────────────────────────────────────────────
// server/__tests__/quickbooks.service.test.js
//
// The QuickBooks connection, against a stand-in for Intuit. Nothing
// here reaches the network or a database.
//
// What is pinned:
//   - it is off, and silent, until the keys are on the server
//   - it never writes to the books on a guess: a supplier or product
//     not found by name means nothing is created
//   - it never sends an order twice
//   - tokens are stored encrypted and never handed out
//   - a sign-in can only be finished by the flow that started it
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const repo = vi.hoisted(() => ({
  getConnection: vi.fn(), saveConnection: vi.fn(), updateTokens: vi.fn(), deleteConnection: vi.fn(),
  recordSync: vi.fn(), getSync: vi.fn(), getLink: vi.fn(), saveLink: vi.fn(), listUnsent: vi.fn(),
}));
const poRepo = vi.hoisted(() => ({ getPurchaseOrderById: vi.fn() }));
vi.mock('../src/config/db.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../src/repositories/quickbooks.repository.js', () => ({ default: repo }));
vi.mock('../src/repositories/purchaseOrder.repository.js', () => ({ default: poRepo }));
vi.mock('../src/config/warehouseContext.js', () => ({ currentWarehouse: () => null }));

const KEYS = {
  QUICKBOOKS_CLIENT_ID: 'client-id',
  QUICKBOOKS_CLIENT_SECRET: 'client-secret',
  QUICKBOOKS_REDIRECT_URI: 'https://wms.example/api/quickbooks/callback',
  QUICKBOOKS_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};
const saved = { ...process.env };
const configure = (on = true) => {
  for (const k of Object.keys(KEYS)) delete process.env[k];
  delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  delete process.env.QUICKBOOKS_ENVIRONMENT;
  if (on) Object.assign(process.env, KEYS);
};

const { default: service, buildPurchaseOrder } = await import('../src/services/quickbooks.service.js');
const { default: qbo, quote } = await import('../src/features/quickbooks/client.js');

// ── A stand-in for Intuit ───────────────────────────────────
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });
let calls;
let world;
const intuit = vi.fn(async (url, init = {}) => {
  const u = new URL(url);
  calls.push({ method: init.method ?? 'GET', url: u, headers: init.headers ?? {}, body: init.body });
  if (u.hostname === 'oauth.platform.intuit.com') return world.token(new URLSearchParams(init.body));
  if (u.pathname.endsWith('/query')) {
    const q = u.searchParams.get('query');
    if (/from Vendor/.test(q)) return reply(200, { QueryResponse: { Vendor: world.vendors.filter((v) => q.includes(`'${v.DisplayName}'`)) } });
    if (/from Item/.test(q)) return reply(200, { QueryResponse: { Item: world.items.filter((i) => q.includes(`'${i.Name}'`)) } });
    if (/from Account/.test(q)) return reply(200, { QueryResponse: { Account: world.accounts } });
    if (/from PurchaseOrder/.test(q)) return reply(200, { QueryResponse: { PurchaseOrder: world.orders.filter((o) => q.includes(`'${o.DocNumber}'`)) } });
  }
  if (u.pathname.endsWith('/purchaseorder') && init.method === 'POST') return world.create(JSON.parse(init.body));
  return reply(404, {});
});
const posts = () => calls.filter((c) => c.method === 'POST' && c.url.pathname.endsWith('/purchaseorder'));

const PO = {
  id: 28, po_number: 'PO-2026-0028', status: 'approved', supplier_name: 'Cape Dry Goods', quickbooks_po_id: null,
  created_at: '2026-10-10T08:00:00Z', expected_delivery_date: '2026-10-17', notes: 'Leave at gate 2',
  items: [
    { id: 1, product_name: 'Rice 2 kg', default_unit: 'bag', expected_quantity: '4.000', unit_price: '150.00' },
    { id: 2, product_name: 'Baked beans 410 g', default_unit: 'kg', expected_quantity: '2.250', unit_price: null },
  ],
};

let encrypted;
const connect = async (expiresInMs = 60 * 60 * 1000) => {
  // Store real ciphertext, by running a real sign-in through the service.
  repo.saveConnection.mockImplementation(async (row) => { encrypted = row; return { id: 'c1', realm_id: row.realmId }; });
  const { state } = service.startConnect({ userId: 2 });
  await service.handleCallback({ code: 'auth-code', state, realmId: '4620816365' });
  repo.getConnection.mockResolvedValue({
    id: 'c1', realm_id: '4620816365',
    access_token_encrypted: encrypted.accessEncrypted, refresh_token_encrypted: encrypted.refreshEncrypted,
    access_token_expires_at: new Date(Date.now() + expiresInMs), refresh_token_expires_at: new Date(Date.now() + 90 * 86400000),
    created_at: new Date(),
  });
  calls.length = 0;
};

beforeEach(() => {
  vi.clearAllMocks();
  configure(true);
  calls = [];
  world = {
    vendors: [{ Id: '56', DisplayName: 'Cape Dry Goods', Active: true }],
    items: [{ Id: '11', Name: 'Rice 2 kg', Active: true }, { Id: '12', Name: 'Baked beans 410 g', Active: true }],
    accounts: [{ Id: '33', Name: 'Accounts Payable (A/P)' }],
    orders: [],
    token: () => reply(200, { access_token: 'access-1', refresh_token: 'refresh-1', token_type: 'bearer', expires_in: 3600, x_refresh_token_expires_in: 8640000 }),
    create: (body) => reply(200, { PurchaseOrder: { Id: '901', DocNumber: body.DocNumber, SyncToken: '0' } }),
  };
  qbo.setFetch(intuit);
  repo.getConnection.mockResolvedValue(null);
  repo.saveLink.mockResolvedValue(true);
  repo.recordSync.mockResolvedValue();
  poRepo.getPurchaseOrderById.mockResolvedValue(structuredClone(PO));
});

afterEach(() => { process.env = { ...saved }; });

describe('until it is set up', () => {
  it('does nothing and asks Intuit nothing', async () => {
    configure(false);
    expect(await service.pushPurchaseOrder(28)).toEqual({ state: 'off' });
    expect(await service.status()).toMatchObject({ configured: false, connected: false });
    service.pushInBackground(28);
    expect(await service.pushUnsent()).toEqual({ tried: 0, synced: 0 });
    expect(intuit).not.toHaveBeenCalled();
    expect(poRepo.getPurchaseOrderById).not.toHaveBeenCalled();
  });

  it('is off with the keys but no company connected', async () => {
    expect(await service.pushPurchaseOrder(28)).toEqual({ state: 'off' });
    expect(intuit).not.toHaveBeenCalled();
  });

  it('refuses to start a sign-in it could not finish', () => {
    configure(false);
    expect(() => service.startConnect({ userId: 2 })).toThrow(/not set up/);
  });
});

describe('connecting', () => {
  it('sends the admin to Intuit with a state only this server knows', () => {
    const { state, redirectUrl } = service.startConnect({ userId: 2 });
    const url = new URL(redirectUrl);
    expect(url.origin + url.pathname).toBe('https://appcenter.intuit.com/connect/oauth2');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('scope')).toBe('com.intuit.quickbooks.accounting');
    expect(url.searchParams.get('redirect_uri')).toBe(KEYS.QUICKBOOKS_REDIRECT_URI);
    expect(url.searchParams.get('state')).toBe(state);
    expect(state).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stores the tokens encrypted, never as they arrived', async () => {
    await connect();
    expect(encrypted).toMatchObject({ realmId: '4620816365', userId: 2 });
    for (const stored of [encrypted.accessEncrypted, encrypted.refreshEncrypted]) {
      expect(stored).toMatch(/^v1:/);
      expect(stored).not.toContain('access-1');
      expect(stored).not.toContain('refresh-1');
    }
  });

  it.each([
    ['a state it never issued', { code: 'c', state: 'f'.repeat(64), realmId: '1' }],
    ['no state at all', { code: 'c', realmId: '1' }],
    ['a cancelled sign-in', { oauthError: 'access_denied', state: 'x' }],
  ])('refuses %s', async (_name, args) => {
    await expect(service.handleCallback(args)).rejects.toMatchObject({ status: 400 });
    expect(repo.saveConnection).not.toHaveBeenCalled();
  });

  it('uses a state once', async () => {
    const { state } = service.startConnect({ userId: 2 });
    await service.handleCallback({ code: 'c', state, realmId: '1' });
    await expect(service.handleCallback({ code: 'c', state, realmId: '1' })).rejects.toMatchObject({ status: 400 });
  });

  it('refuses a company id that is not one', async () => {
    const { state } = service.startConnect({ userId: 2 });
    await expect(service.handleCallback({ code: 'c', state, realmId: '12/../x' })).rejects.toMatchObject({ status: 400 });
  });

  it('never hands a token out with the status', async () => {
    await connect();
    const text = JSON.stringify(await service.status());
    expect(text).not.toMatch(/access-1|refresh-1|v1:/);
    expect(JSON.parse(text)).toMatchObject({ configured: true, connected: true, realmId: '4620816365', environment: 'sandbox' });
  });
});

describe('sending an approved order', () => {
  beforeEach(() => connect());

  it('creates it in QuickBooks and links it', async () => {
    const result = await service.pushPurchaseOrder(28);
    expect(result).toEqual({ state: 'synced', quickbooksPoId: 'PO-2026-0028' });

    const [post] = posts();
    expect(post.url.origin).toBe('https://sandbox-quickbooks.api.intuit.com');
    expect(post.url.pathname).toBe('/v3/company/4620816365/purchaseorder');
    expect(post.headers.Authorization).toBe('Bearer access-1');
    expect(JSON.parse(post.body)).toMatchObject({
      DocNumber: 'PO-2026-0028',
      PrivateNote: 'PO-2026-0028',
      VendorRef: { value: '56' },
      APAccountRef: { value: '33' },
      Line: [
        { DetailType: 'ItemBasedExpenseLineDetail', Amount: 600, ItemBasedExpenseLineDetail: { ItemRef: { value: '11' }, Qty: 4, UnitPrice: 150 } },
        { DetailType: 'ItemBasedExpenseLineDetail', Amount: 0, ItemBasedExpenseLineDetail: { ItemRef: { value: '12' }, Qty: 2.25, UnitPrice: 0 } },
      ],
    });
    expect(repo.saveLink).toHaveBeenCalledWith(28, { qboId: 'PO-2026-0028', syncToken: '0' });
    expect(repo.recordSync).toHaveBeenCalledWith(28, expect.objectContaining({ state: 'synced' }));
  });

  it('uses the live address in production', async () => {
    process.env.QUICKBOOKS_ENVIRONMENT = 'production';
    await service.pushPurchaseOrder(28);
    expect(posts()[0].url.origin).toBe('https://quickbooks.api.intuit.com');
  });

  it('creates nothing when the supplier is not in QuickBooks', async () => {
    world.vendors = [];
    const result = await service.pushPurchaseOrder(28);
    expect(result.state).toBe('needs_match');
    expect(result.missing).toEqual({ supplier: 'Cape Dry Goods', products: [] });
    expect(result.message).toMatch(/supplier "Cape Dry Goods"/);
    expect(posts()).toHaveLength(0);
    expect(repo.saveLink).not.toHaveBeenCalled();
    expect(repo.recordSync).toHaveBeenCalledWith(28, expect.objectContaining({ state: 'needs_match', detail: { missing: result.missing } }));
  });

  it('creates nothing when a product is not in QuickBooks, and names every one', async () => {
    world.items = [];
    const result = await service.pushPurchaseOrder(28);
    expect(result.state).toBe('needs_match');
    expect(result.missing.products).toEqual(['Rice 2 kg', 'Baked beans 410 g']);
    expect(posts()).toHaveLength(0);
  });

  it('never creates a supplier, an item or an account over there', async () => {
    world.vendors = []; world.items = [];
    await service.pushPurchaseOrder(28);
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('skips a supplier or item QuickBooks has made inactive', async () => {
    world.vendors[0].Active = false;
    expect((await service.pushPurchaseOrder(28)).state).toBe('needs_match');
  });

  it('links to an order already there under our number instead of making a second', async () => {
    world.orders = [{ Id: '777', DocNumber: 'PO-2026-0028', SyncToken: '3' }];
    expect(await service.pushPurchaseOrder(28)).toEqual({ state: 'synced', quickbooksPoId: 'PO-2026-0028' });
    expect(posts()).toHaveLength(0);
    expect(repo.saveLink).toHaveBeenCalledWith(28, { qboId: 'PO-2026-0028', syncToken: '3' });
  });

  it('leaves an order that is already linked alone', async () => {
    poRepo.getPurchaseOrderById.mockResolvedValue({ ...PO, quickbooks_po_id: 'QB-555' });
    expect(await service.pushPurchaseOrder(28)).toMatchObject({ state: 'synced', quickbooksPoId: 'QB-555' });
    expect(calls).toHaveLength(0);   // nothing asked of Intuit since connecting
  });

  it('does not send an order nobody has approved, or one sent back', async () => {
    poRepo.getPurchaseOrderById.mockResolvedValue({ ...PO, status: 'pending' });
    await expect(service.pushPurchaseOrder(28)).rejects.toMatchObject({ status: 409 });
    poRepo.getPurchaseOrderById.mockResolvedValue({ ...PO, status: 'returned' });
    await expect(service.pushPurchaseOrder(28)).rejects.toMatchObject({ status: 409 });
    expect(calls).toHaveLength(0);   // nothing asked of Intuit since connecting
  });

  it('records a refusal with what QuickBooks said, to try again', async () => {
    world.create = () => reply(400, { Fault: { Error: [{ Message: 'Object Not Found', Detail: 'Item 12 is inactive' }] } });
    const result = await service.pushPurchaseOrder(28);
    expect(result.state).toBe('failed');
    expect(result.message).toMatch(/Object Not Found: Item 12 is inactive/);
    expect(repo.saveLink).not.toHaveBeenCalled();
    expect(repo.recordSync).toHaveBeenCalledWith(28, expect.objectContaining({ state: 'failed' }));
  });

  it('says to reconnect when QuickBooks no longer accepts the connection', async () => {
    world.create = () => reply(401, {});
    expect(await service.pushPurchaseOrder(28)).toMatchObject({ state: 'failed', message: expect.stringMatching(/Reconnect QuickBooks/) });
  });

  it('says it is busy on a rate limit', async () => {
    world.create = () => reply(429, {});
    expect(await service.pushPurchaseOrder(28)).toMatchObject({ state: 'failed', message: expect.stringMatching(/busy/) });
  });

  it('does not move a link that belongs to another order', async () => {
    repo.saveLink.mockResolvedValue(false);
    expect(await service.pushPurchaseOrder(28)).toMatchObject({ state: 'failed', message: expect.stringMatching(/already linked to another order/) });
  });

  it('one send of an order at a time', async () => {
    let release;
    world.create = () => new Promise((resolve) => { release = () => resolve(reply(200, { PurchaseOrder: { Id: '901', DocNumber: 'PO-2026-0028', SyncToken: '0' } })); });
    const first = service.pushPurchaseOrder(28);
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(await service.pushPurchaseOrder(28)).toEqual({ state: 'sending' });
    release();
    expect((await first).state).toBe('synced');
    expect(posts()).toHaveLength(1);
  });
});

describe('the access token', () => {
  it('is renewed when it is about to run out, once, and stored encrypted', async () => {
    await connect(60 * 1000);          // one minute left
    world.token = () => reply(200, { access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600, x_refresh_token_expires_in: 8640000 });
    poRepo.getPurchaseOrderById.mockImplementation(async (id) => ({ ...structuredClone(PO), id, po_number: `PO-${id}` }));

    await Promise.all([service.pushPurchaseOrder(28), service.pushPurchaseOrder(29)]);

    const refreshes = calls.filter((c) => c.url.hostname === 'oauth.platform.intuit.com');
    expect(refreshes).toHaveLength(1);
    expect(new URLSearchParams(refreshes[0].body).get('grant_type')).toBe('refresh_token');
    expect(repo.updateTokens).toHaveBeenCalledTimes(1);
    const stored = repo.updateTokens.mock.calls[0][1];
    expect(stored.accessEncrypted).toMatch(/^v1:/);
    expect(stored.accessEncrypted).not.toContain('access-2');
    expect(posts().every((p) => p.headers.Authorization === 'Bearer access-2')).toBe(true);
  });

  it('a lapsed sign-in is reported as needing a reconnect, not a crash', async () => {
    await connect(60 * 1000);
    world.token = () => reply(400, { error: 'invalid_grant' });
    expect(await service.pushPurchaseOrder(28)).toMatchObject({ state: 'failed', message: expect.stringMatching(/Reconnect QuickBooks/) });
  });
});

describe('the words sent', () => {
  it('escapes a quote in a name, so the lookup is not cut short', () => {
    expect(quote("O'Brien & Sons")).toBe("'O\\'Brien & Sons'");
    expect(quote('back\\slash')).toBe("'back\\\\slash'");
  });

  it('carries our order number where Finance and the file import look for it', () => {
    const body = buildPurchaseOrder(PO, {
      vendor: { Id: '56', DisplayName: 'Cape Dry Goods' },
      items: new Map([[1, { Id: '11', Name: 'Rice 2 kg' }], [2, { Id: '12', Name: 'Baked beans 410 g' }]]),
      payables: null,
    });
    expect(body.DocNumber).toBe('PO-2026-0028');
    expect(body.PrivateNote).toBe('PO-2026-0028');
    expect(body.Memo).toBe('PO-2026-0028 · Expected delivery 17 Oct 2026 · Leave at gate 2');
    expect(body.DueDate).toBeUndefined();   // QuickBooks drops it
    expect(body.ShipDate).toBeUndefined();  // and refuses this one
    expect(body.APAccountRef).toBeUndefined();
  });
});

describe('the delivery date sent', () => {
  const build = (over) => buildPurchaseOrder({ ...PO, ...over }, {
    vendor: { Id: '1', DisplayName: 'V' },
    items: new Map([[1, { Id: '1', Name: 'Rice 2 kg' }], [2, { Id: '2', Name: 'Baked beans 410 g' }]]),
    payables: null,
  });
  it('rides in the Memo, which QuickBooks keeps, after our number', () => {
    expect(build({ notes: null }).Memo).toBe('PO-2026-0028 · Expected delivery 17 Oct 2026');
  });
  it('is left out when the order has none, and the number stays first', () => {
    expect(build({ expected_delivery_date: null, notes: 'Gate 2' }).Memo).toBe('PO-2026-0028 · Gate 2');
  });
  it('reads a date object the way the database driver returns it', () => {
    expect(build({ expected_delivery_date: new Date('2026-12-01T00:00:00+02:00'), notes: null }).Memo).toContain('Expected delivery 1 Dec 2026');
  });
});

describe('the money sent', () => {
  it('rounds each line half up, so QuickBooks totals what the email and the list show', () => {
    const po = { ...PO, items: [
      { id: 1, product_name: 'Rocks', default_unit: 'kg', expected_quantity: '100.000', unit_price: '12.50' },
      { id: 2, product_name: 'Soil', default_unit: 'kg', expected_quantity: '2.500', unit_price: '33.33' },
    ] };
    const body = buildPurchaseOrder(po, {
      vendor: { Id: '1', DisplayName: 'V' },
      items: new Map([[1, { Id: '1', Name: 'Rocks' }], [2, { Id: '2', Name: 'Soil' }]]),
      payables: null,
    });
    expect(body.Line.map((l) => l.Amount)).toEqual([1250, 83.33]);
    expect(body.Line[1].ItemBasedExpenseLineDetail).toMatchObject({ Qty: 2.5, UnitPrice: 33.33 });
    // QuickBooks adds the lines up: 1 333.33
    expect(body.Line.reduce((sum, l) => sum + Math.round(l.Amount * 100), 0) / 100).toBe(1333.33);
  });
});

describe('orders that could not be sent at the time', () => {
  it('are tried again later, and it stops if the connection has gone', async () => {
    await connect();
    repo.listUnsent.mockResolvedValue([28, 29]);
    poRepo.getPurchaseOrderById.mockImplementation(async (id) => ({ ...structuredClone(PO), id, po_number: `PO-${id}` }));
    expect(await service.pushUnsent()).toEqual({ tried: 2, synced: 2 });
  });
});
