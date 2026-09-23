// ─────────────────────────────────────────────────────────────
// src/tests/MultiWarehouse.test.jsx
//
// Script 51, client side of multi-warehouse:
//   - every /api request carries the chosen warehouse, nothing else does
//   - with one database nothing is ever sent
//   - login returns to the site last used; boot recovers a stale choice
//   - switching re-reads the user at the new site and clears the cache
//   - guests never send a warehouse (their session names it)
//   - an offline submission replays to the warehouse it was made in
//   - the header shows the site; the volunteer page asks which site
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ── A minimal in-memory IndexedDB: just what services/outbox.js uses ──
const installMemoryIndexedDB = () => {
  const stores = new Map();
  const later = (fn) => setTimeout(fn, 0);
  const request = (produce) => {
    const req = { onsuccess: null, onerror: null, result: undefined };
    later(() => { req.result = produce(); req.onsuccess?.({ target: req }); });
    return req;
  };
  const makeStore = (name) => {
    if (!stores.has(name)) stores.set(name, { rows: new Map(), next: 1 });
    const s = stores.get(name);
    return {
      add: (row) => request(() => { const id = s.next++; s.rows.set(id, { ...row, id }); return id; }),
      put: (row) => request(() => { s.rows.set(row.id, { ...row }); return row.id; }),
      get: (id) => request(() => (s.rows.has(id) ? { ...s.rows.get(id) } : undefined)),
      getAll: () => request(() => [...s.rows.values()].map((r) => ({ ...r }))),
      delete: (id) => request(() => { s.rows.delete(id); }),
    };
  };
  const db = {
    objectStoreNames: { contains: (n) => stores.has(n) },
    createObjectStore: (n) => { makeStore(n); return makeStore(n); },
    transaction: (name) => {
      const tx = { oncomplete: null, onerror: null, onabort: null, objectStore: () => makeStore(name) };
      setTimeout(() => setTimeout(() => tx.oncomplete?.(), 0), 0);
      return tx;
    },
  };
  globalThis.indexedDB = {
    open: () => {
      const req = { onupgradeneeded: null, onsuccess: null, onerror: null, result: db };
      later(() => { req.onupgradeneeded?.(); req.onsuccess?.(); });
      return req;
    },
  };
};
installMemoryIndexedDB();

// Every request the app makes lands here.
const sent = [];
let respond = () => ({ status: 200, body: {} });
const fakeFetch = vi.fn(async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const headers = new Headers(init.headers);
  const call = { url, method: init.method || 'GET', warehouse: headers.get('X-Warehouse'), body: init.body };
  sent.push(call);
  const { status, body } = respond(call);
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
});
globalThis.fetch = fakeFetch;

const warehouse = await import('../services/warehouse');
warehouse.installWarehouseFetch();
const api = await import('../services/api');
const outbox = await import('../services/outbox');
const { AuthProvider, useAuth } = await import('../context/AuthContext');
const { default: WarehouseSwitcher } = await import('../features/taskdashboard/components/WarehouseSwitcher');
const { default: GuestLoginPage } = await import('../pages/GuestLoginPage');

const CPT = { code: 'cpt', name: 'Cape Town' };
const GP = { code: 'gauteng', name: 'Gauteng' };
const staffAt = (code, role) => ({
  id: code === 'cpt' ? 4 : 21, username: 'grizel', firstName: 'Grizel', lastName: 'M', role,
  warehouse: code, warehouses: [CPT, GP],
});
const ROLES = { cpt: 'admin', gauteng: 'warehouse_worker' };

beforeEach(() => {
  localStorage.clear();
  warehouse.resetWarehouseForTests();
  sent.length = 0;
  fakeFetch.mockClear();
  respond = () => ({ status: 200, body: {} });
});
afterEach(() => vi.restoreAllMocks());

describe('the fetch wrapper', () => {
  it('sends nothing when no warehouse is chosen (one database)', async () => {
    await api.apiGet('/api/stock');
    expect(sent[0].warehouse).toBeNull();
  });

  it('adds the chosen warehouse to every /api request, including raw fetch', async () => {
    warehouse.setActiveWarehouse('gauteng');
    await api.apiGet('/api/stock');
    await fetch('/api/suppliers', { method: 'POST', body: new FormData() });
    await fetch('/assets/logo.png');
    expect(sent.map((c) => [c.url, c.warehouse])).toEqual([
      ['/api/stock', 'gauteng'],
      ['/api/suppliers', 'gauteng'],
      ['/assets/logo.png', null],
    ]);
  });

  it('never overrides a header a request already sets', async () => {
    warehouse.setActiveWarehouse('gauteng');
    await fetch('/api/x', { headers: { 'X-Warehouse': 'cpt' } });
    expect(sent[0].warehouse).toBe('cpt');
  });

  it('runWithWarehouse sends one call elsewhere without changing the choice', async () => {
    warehouse.setActiveWarehouse('gauteng');
    await warehouse.runWithWarehouse('cpt', () => api.apiPost('/api/a', {}));
    await api.apiGet('/api/b');
    expect(sent.map((c) => c.warehouse)).toEqual(['cpt', 'gauteng']);
    expect(warehouse.getActiveWarehouse()).toBe('gauteng');
  });

  it('remembers the choice across reloads', () => {
    warehouse.setActiveWarehouse('cpt');
    expect(localStorage.getItem('wms_warehouse')).toBe('cpt');
  });
});

describe('api.js errors', () => {
  it('carry the warehouse code and list from the server', async () => {
    respond = () => ({ status: 400, body: { code: 'WAREHOUSE_REQUIRED', message: 'Choose a warehouse.', warehouses: ['cpt', 'gauteng'] } });
    await expect(api.apiGet('/api/me')).rejects.toMatchObject({ status: 400, code: 'WAREHOUSE_REQUIRED', warehouses: ['cpt', 'gauteng'] });
  });
});

describe('the offline outbox', () => {
  it('replays a queued delivery to the warehouse it was recorded in', async () => {
    warehouse.setActiveWarehouse('gauteng');
    expect(await outbox.enqueue({ endpoint: '/api/deliveries', body: { idempotencyKey: 'k1' }, label: 'Order 1', kind: 'delivery' })).toBe(true);
    warehouse.setActiveWarehouse('cpt'); // the worker switched before the signal came back
    await outbox.flush(api.apiPost);
    expect(sent.map((c) => [c.url, c.warehouse])).toEqual([['/api/deliveries', 'gauteng']]);
    expect(await outbox.list()).toEqual([]);
  });
});

// ── AuthContext ────────────────────────────────────────────────
const Consumer = () => {
  const { user, isLoading, login, switchWarehouse, loginAsGuest } = useAuth();
  return (
    <div>
      <div data-testid="state">{isLoading ? 'loading' : user ? `${user.warehouse ?? '-'}:${user.role}` : 'none'}</div>
      <button onClick={() => login('grizel', 'pw')}>login</button>
      <button onClick={() => switchWarehouse('gauteng')}>to-gauteng</button>
      <button onClick={() => loginAsGuest('Thabo', 'gauteng')}>guest</button>
    </div>
  );
};
const renderAuth = () => render(<AuthProvider><Consumer /></AuthProvider>);

// A server that knows Grizel at two sites and answers per X-Warehouse.
const twoSiteServer = ({ loggedIn = true } = {}) => (call) => {
  if (call.url === '/api/login') return { status: 200, body: { success: true, user: { ...staffAt('cpt', 'admin'), warehouses: [{ ...CPT, role: 'admin' }, { ...GP, role: 'warehouse_worker' }] } } };
  if (call.url === '/api/me') {
    if (!loggedIn) return { status: 401, body: { message: 'Access denied.' } };
    if (!call.warehouse) return { status: 400, body: { code: 'WAREHOUSE_REQUIRED', message: 'Choose a warehouse.', warehouses: ['cpt', 'gauteng'] } };
    if (!ROLES[call.warehouse]) return { status: 403, body: { code: 'WAREHOUSE_FORBIDDEN', message: 'No access.' } };
    return { status: 200, body: { success: true, user: staffAt(call.warehouse, ROLES[call.warehouse]) } };
  }
  if (call.url === '/api/volunteers/sign-in') return { status: 201, body: { success: true, user: { id: 7, firstName: 'Thabo', role: 'guest' } } };
  return { status: 200, body: {} };
};

describe('AuthContext with several warehouses', () => {
  it('on boot with no saved site, opens the first one', async () => {
    respond = twoSiteServer();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('cpt:admin'));
    expect(warehouse.getActiveWarehouse()).toBe('cpt');
  });

  it('on boot forgets a saved site that is no longer allowed', async () => {
    respond = twoSiteServer();
    warehouse.setActiveWarehouse('northern-cape');
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('cpt:admin'));
  });

  it('login returns to the site last used on this device, with that site\'s role', async () => {
    respond = twoSiteServer({ loggedIn: false });
    warehouse.setActiveWarehouse('gauteng');
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('none'));
    respond = twoSiteServer();
    fireEvent.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('gauteng:warehouse_worker'));
  });

  it('switching re-reads the user at the new site and empties the cache', async () => {
    respond = twoSiteServer();
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('cpt:admin'));
    let calls = 0;
    await api.cachedGet('suppliers', 60_000, async () => { calls += 1; return []; });
    await act(async () => { fireEvent.click(screen.getByText('to-gauteng')); });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('gauteng:warehouse_worker'));
    await api.cachedGet('suppliers', 60_000, async () => { calls += 1; return []; });
    expect(calls).toBe(2);
    expect(warehouse.getActiveWarehouse()).toBe('gauteng');
  });

  it('a volunteer signs in at the site they chose, then sends no warehouse', async () => {
    respond = twoSiteServer({ loggedIn: false });
    warehouse.setActiveWarehouse('cpt'); // left over from staff on a shared tablet
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('none'));
    sent.length = 0;
    respond = twoSiteServer();
    fireEvent.click(screen.getByText('guest'));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('-:guest'));
    expect(sent.find((c) => c.url === '/api/volunteers/sign-in').warehouse).toBe('gauteng');
    expect(warehouse.getActiveWarehouse()).toBeNull();
  });
});

describe('AuthContext with one database', () => {
  it('never stores or sends a warehouse', async () => {
    respond = (call) => (call.url === '/api/me'
      ? { status: 200, body: { success: true, user: { id: 1, firstName: 'J', role: 'manager' } } }
      : { status: 200, body: {} });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('-:manager'));
    expect(warehouse.getActiveWarehouse()).toBeNull();
    expect(sent.every((c) => c.warehouse === null)).toBe(true);
  });
});

// ── WarehouseSwitcher ──────────────────────────────────────────
const renderSwitcher = () => render(
  <MemoryRouter initialEntries={['/somewhere']}>
    <AuthProvider>
      <Routes>
        <Route path="/somewhere" element={<WarehouseSwitcher />} />
        <Route path="*" element={<div data-testid="landed">landed</div>} />
      </Routes>
    </AuthProvider>
  </MemoryRouter>
);

describe('WarehouseSwitcher', () => {
  it('renders nothing with one database', async () => {
    respond = (call) => (call.url === '/api/me'
      ? { status: 200, body: { success: true, user: { id: 1, firstName: 'J', role: 'manager' } } }
      : { status: 200, body: {} });
    const { container } = renderSwitcher();
    await waitFor(() => expect(sent.some((c) => c.url === '/api/me')).toBe(true));
    expect(container.textContent).toBe('');
  });

  it('shows the site name, with nothing to click, for one site', async () => {
    respond = (call) => (call.url === '/api/me'
      ? { status: 200, body: { success: true, user: { ...staffAt('cpt', 'admin'), warehouses: [CPT] } } }
      : { status: 200, body: {} });
    renderSwitcher();
    expect(await screen.findByTestId('warehouse-badge')).toHaveTextContent('Cape Town');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('switches site, re-reads the user there, and goes to that site\'s home screen', async () => {
    respond = twoSiteServer();
    renderSwitcher();
    fireEvent.click(await screen.findByRole('button', { name: /Warehouse: Cape Town/ }));
    fireEvent.click(await screen.findByText('Gauteng'));
    await screen.findByTestId('landed');
    expect(warehouse.getActiveWarehouse()).toBe('gauteng');
    expect(sent.filter((c) => c.url === '/api/me').at(-1).warehouse).toBe('gauteng');
  });
});

// ── Volunteer sign-in page ─────────────────────────────────────
const renderGuestPage = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <AuthProvider>
      <Routes>
        <Route path="/guest" element={<GuestLoginPage />} />
        <Route path="/guest-home" element={<div data-testid="home">home</div>} />
      </Routes>
    </AuthProvider>
  </MemoryRouter>
);

describe('GuestLoginPage', () => {
  const server = (multi) => (call) => {
    if (call.url === '/api/public/warehouses') {
      return { status: 200, body: { success: true, multiWarehouse: multi, warehouses: multi ? [CPT, GP] : [] } };
    }
    if (call.url === '/api/me') return { status: 401, body: { message: 'no' } };
    if (call.url === '/api/volunteers/sign-in') return { status: 201, body: { success: true, user: { id: 7, firstName: 'T', role: 'guest' } } };
    return { status: 200, body: {} };
  };

  it('asks which warehouse, and signs in there', async () => {
    respond = server(true);
    renderGuestPage('/guest');
    const select = await screen.findByLabelText('WAREHOUSE');
    fireEvent.change(screen.getByLabelText('FULL NAME'), { target: { value: 'Thabo' } });
    fireEvent.click(screen.getByRole('button', { name: 'LOGIN' }));
    expect(await screen.findByText(/CHOOSE THE WAREHOUSE/)).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'gauteng' } });
    fireEvent.click(screen.getByRole('button', { name: 'LOGIN' }));
    await screen.findByTestId('home');
    expect(sent.find((c) => c.url === '/api/volunteers/sign-in').warehouse).toBe('gauteng');
  });

  it('does not ask when the poster link names the site', async () => {
    respond = server(true);
    renderGuestPage('/guest?w=gauteng');
    await waitFor(() => expect(sent.some((c) => c.url === '/api/public/warehouses')).toBe(true));
    expect(screen.queryByLabelText('WAREHOUSE')).toBeNull();
    fireEvent.change(screen.getByLabelText('FULL NAME'), { target: { value: 'Thabo' } });
    fireEvent.click(screen.getByRole('button', { name: 'LOGIN' }));
    await screen.findByTestId('home');
    expect(sent.find((c) => c.url === '/api/volunteers/sign-in').warehouse).toBe('gauteng');
  });

  it('asks nothing with one database', async () => {
    respond = server(false);
    renderGuestPage('/guest');
    await waitFor(() => expect(sent.some((c) => c.url === '/api/public/warehouses')).toBe(true));
    expect(screen.queryByLabelText('WAREHOUSE')).toBeNull();
    fireEvent.change(screen.getByLabelText('FULL NAME'), { target: { value: 'Thabo' } });
    fireEvent.click(screen.getByRole('button', { name: 'LOGIN' }));
    await screen.findByTestId('home');
    expect(sent.find((c) => c.url === '/api/volunteers/sign-in').warehouse).toBeNull();
  });
});
