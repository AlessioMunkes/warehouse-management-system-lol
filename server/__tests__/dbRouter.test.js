// ─────────────────────────────────────────────────────────────
// server/__tests__/dbRouter.test.js
//
// Multi-warehouse database routing (script 49). Uses a fake Pool, so
// no database is needed. What matters here:
//   - single mode behaves exactly like one pg.Pool
//   - multi mode sends each query to the active warehouse's database
//   - concurrent requests never see each other's warehouse
//   - no active warehouse = failure, never a default database
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from 'vitest';
import {
  createDbRouter,
  parseWarehouseUrls,
  WarehouseContextError,
} from '../src/config/dbRouter.js';
import {
  runInWarehouse,
  currentWarehouse,
  isValidWarehouseCode,
} from '../src/config/warehouseContext.js';

// Records which connection string served each call.
const makeFakePool = () => {
  const created = [];
  class FakePool {
    constructor({ connectionString, ssl }) {
      this.connectionString = connectionString;
      this.ssl = ssl;
      this.handlers = {};
      this.ended = false;
      created.push(this);
    }
    async query(sql, params) {
      await Promise.resolve(); // cross an async boundary, like the real thing
      return { rows: [{ db: this.connectionString, sql, params }] };
    }
    async connect() {
      const db = this.connectionString;
      return {
        db,
        query: async (sql) => ({ rows: [{ db, sql }] }),
        release: vi.fn(),
      };
    }
    on(event, handler) {
      (this.handlers[event] ||= []).push(handler);
    }
    async end() {
      this.ended = true;
    }
  }
  return { FakePool, created };
};

const URLS = {
  cpt:             'postgres://cpt-db',
  gauteng:         'postgres://gauteng-db',
  'northern-cape': 'postgres://nc-db',
};

const multiRouter = () => {
  const { FakePool, created } = makeFakePool();
  const router = createDbRouter({
    PoolImpl: FakePool,
    ssl: false,
    warehouseUrls: URLS,
    getWarehouse: currentWarehouse,
  });
  return { router, created };
};

describe('warehouseContext', () => {
  it('has no warehouse outside runInWarehouse', () => {
    expect(currentWarehouse()).toBeNull();
  });

  it('keeps the warehouse across awaits', async () => {
    const seen = await runInWarehouse('cpt', async () => {
      await new Promise((r) => setTimeout(r, 5));
      await Promise.resolve();
      return currentWarehouse();
    });
    expect(seen).toBe('cpt');
    expect(currentWarehouse()).toBeNull();
  });

  it('rejects malformed codes', () => {
    expect(() => runInWarehouse('CPT', () => {})).toThrow(/Invalid warehouse code/);
    expect(() => runInWarehouse('', () => {})).toThrow();
    expect(() => runInWarehouse('../x', () => {})).toThrow();
    expect(isValidWarehouseCode('northern-cape')).toBe(true);
    expect(isValidWarehouseCode('a')).toBe(false);
    expect(isValidWarehouseCode(undefined)).toBe(false);
  });
});

describe('single-warehouse mode', () => {
  it('sends every query to DATABASE_URL without needing a warehouse', async () => {
    const { FakePool, created } = makeFakePool();
    const router = createDbRouter({
      PoolImpl: FakePool,
      ssl: false,
      databaseUrl: 'postgres://only-db',
      warehouseUrls: null,
      getWarehouse: currentWarehouse,
    });

    const { rows } = await router.query('SELECT 1');
    expect(rows[0].db).toBe('postgres://only-db');
    expect(router.isMultiWarehouse).toBe(false);
    expect(router.warehouseCodes).toEqual([]);

    // Even inside a warehouse context, single mode ignores it.
    const inside = await runInWarehouse('gauteng', () => router.query('SELECT 2'));
    expect(inside.rows[0].db).toBe('postgres://only-db');

    expect(created).toHaveLength(1);
  });

  it('refuses to build without a DATABASE_URL', () => {
    const { FakePool } = makeFakePool();
    expect(() =>
      createDbRouter({ PoolImpl: FakePool, ssl: false, warehouseUrls: null, getWarehouse: currentWarehouse })
    ).toThrow(/databaseUrl is required/);
  });
});

describe('multi-warehouse mode', () => {
  it('routes queries to the active warehouse', async () => {
    const { router } = multiRouter();
    const a = await runInWarehouse('cpt', () => router.query('SELECT 1'));
    const b = await runInWarehouse('gauteng', () => router.query('SELECT 1'));
    const c = await runInWarehouse('northern-cape', () => router.query('SELECT 1'));
    expect(a.rows[0].db).toBe('postgres://cpt-db');
    expect(b.rows[0].db).toBe('postgres://gauteng-db');
    expect(c.rows[0].db).toBe('postgres://nc-db');
  });

  it('never mixes warehouses between concurrent requests', async () => {
    const { router } = multiRouter();
    const codes = Object.keys(URLS);

    const request = (code, delay) =>
      runInWarehouse(code, async () => {
        await new Promise((r) => setTimeout(r, delay));
        const first = await router.query('SELECT 1');
        await new Promise((r) => setTimeout(r, 1));
        const second = await router.query('SELECT 2');
        return { code, dbs: [first.rows[0].db, second.rows[0].db] };
      });

    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) => request(codes[i % 3], (i * 7) % 5))
    );

    for (const r of results) {
      expect(r.dbs).toEqual([URLS[r.code], URLS[r.code]]);
    }
  });

  it('fails when no warehouse is active instead of picking a default', async () => {
    const { router, created } = multiRouter();
    await expect(router.query('SELECT 1')).rejects.toBeInstanceOf(WarehouseContextError);
    await expect(router.query('SELECT 1')).rejects.toThrow(/no active warehouse/);
    await expect(router.connect()).rejects.toBeInstanceOf(WarehouseContextError);
    expect(created).toHaveLength(0);
  });

  it('returns routing failures as rejections, not synchronous throws', () => {
    const { router } = multiRouter();
    let p;
    expect(() => { p = router.query('SELECT 1'); }).not.toThrow();
    return expect(p).rejects.toHaveProperty('status', 500);
  });

  it('fails for a warehouse that is not configured', async () => {
    const { router } = multiRouter();
    await expect(
      runInWarehouse('durban', () => router.query('SELECT 1'))
    ).rejects.toThrow(/Unknown warehouse "durban"/);
  });

  it('gives a transaction client from the active warehouse', async () => {
    const { router } = multiRouter();
    const client = await runInWarehouse('gauteng', () => router.connect());
    expect(client.db).toBe('postgres://gauteng-db');
    // The client stays bound to its database after the context ends.
    const { rows } = await client.query('BEGIN');
    expect(rows[0].db).toBe('postgres://gauteng-db');
  });

  it('creates one pool per warehouse, lazily, and reuses it', async () => {
    const { router, created } = multiRouter();
    await runInWarehouse('cpt', () => router.query('SELECT 1'));
    await runInWarehouse('cpt', () => router.query('SELECT 1'));
    expect(created).toHaveLength(1);
    await runInWarehouse('gauteng', () => router.query('SELECT 1'));
    expect(created.map((p) => p.connectionString)).toEqual([
      'postgres://cpt-db',
      'postgres://gauteng-db',
    ]);
  });

  it('applies error listeners to existing and future pools, tagged by warehouse', async () => {
    const { router, created } = multiRouter();
    await runInWarehouse('cpt', () => router.query('SELECT 1'));

    const handler = vi.fn();
    router.on('error', handler);
    await runInWarehouse('gauteng', () => router.query('SELECT 1'));

    const err = new Error('boom');
    created[0].handlers.error[0](err, 'client-a');
    created[1].handlers.error[0](err, 'client-b');
    expect(handler).toHaveBeenCalledWith(err, 'client-a', 'cpt');
    expect(handler).toHaveBeenCalledWith(err, 'client-b', 'gauteng');
  });

  it('end() closes every pool', async () => {
    const { router, created } = multiRouter();
    await runInWarehouse('cpt', () => router.query('SELECT 1'));
    await runInWarehouse('gauteng', () => router.query('SELECT 1'));
    await router.end();
    expect(created.every((p) => p.ended)).toBe(true);
  });

  it('exposes the configured codes and per-warehouse pools for scripts', async () => {
    const { router } = multiRouter();
    expect(router.isMultiWarehouse).toBe(true);
    expect(router.warehouseCodes).toEqual(['cpt', 'gauteng', 'northern-cape']);
    const { rows } = await router.poolForWarehouse('northern-cape').query('SELECT 1');
    expect(rows[0].db).toBe('postgres://nc-db');
    expect(() => router.poolForWarehouse('durban')).toThrow(WarehouseContextError);
  });
});

describe('parseWarehouseUrls', () => {
  it('returns null when unset or blank (single mode)', () => {
    expect(parseWarehouseUrls(undefined)).toBeNull();
    expect(parseWarehouseUrls('')).toBeNull();
    expect(parseWarehouseUrls('   ')).toBeNull();
  });

  it('parses a valid object and trims URLs', () => {
    expect(parseWarehouseUrls('{"cpt":" postgres://a ","gauteng":"postgres://b"}')).toEqual({
      cpt: 'postgres://a',
      gauteng: 'postgres://b',
    });
  });

  it.each([
    ['not json',                               /not valid JSON/],
    ['[]',                                     /JSON object/],
    ['null',                                   /JSON object/],
    ['{}',                                     /is empty/],
    ['{"CPT":"postgres://a"}',                 /not a valid warehouse code/],
    ['{"cpt":""}',                             /non-empty connection string/],
    ['{"cpt":42}',                             /non-empty connection string/],
    ['{"cpt":"postgres://a","jhb":"postgres://a"}', /same database/],
  ])('rejects %s', (raw, message) => {
    expect(() => parseWarehouseUrls(raw)).toThrow(message);
  });
});
