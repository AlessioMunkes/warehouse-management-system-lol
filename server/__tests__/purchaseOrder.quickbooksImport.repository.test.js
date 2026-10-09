// ─────────────────────────────────────────────────────────────
// server/__tests__/purchaseOrder.quickbooksImport.repository.test.js
//
// The QuickBooks links import against a fake pg client that answers the
// two state lookups from an in-memory table and records every other
// statement. Mocks can't see SQL errors, so the same flows also run
// against a real database in integration/quickbooksImport.*.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

// `pos` = [{ id, po_number }], `links` = [{ entity_id, qbo_id, po_number }]
const makeDb = ({ pos = [], links = [], failOn = null } = {}) => {
  const calls = [];
  const query = vi.fn(async (sql, params) => {
    const text = sql.replace(/\s+/g, ' ').trim();
    calls.push({ sql: text, params });
    if (failOn && failOn.test(text)) throw Object.assign(new Error('boom'), { code: failOn.code });
    if (/^SELECT id, po_number FROM purchase_orders/i.test(text)) {
      return { rows: pos.filter((p) => params[0].includes(p.po_number)) };
    }
    if (/^SELECT qom\.entity_id/i.test(text)) {
      const [ids, qbs] = params;
      return { rows: links.filter((l) => ids.includes(l.entity_id) || qbs.includes(l.qbo_id)) };
    }
    return { rows: [] };
  });
  return { calls, query, release: vi.fn() };
};

let db;
const poolMock = { connect: vi.fn(async () => db), query: (...a) => db.query(...a) };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const { default: repo } = await import('../src/repositories/purchaseOrder.repository.js');

const POS = [
  { id: 101, po_number: 'PO-2026-0101' },
  { id: 102, po_number: 'PO-2026-0102' },
  { id: 103, po_number: 'PO-2026-0103' },
];
const pair = (poNumber, quickbooksNumber, overwrite = false) => ({ poNumber, quickbooksNumber, overwrite });
const sqlOf = (re) => db.calls.filter((c) => re.test(c.sql));

beforeEach(() => vi.clearAllMocks());

describe('previewQuickbooksLinks — statuses', () => {
  it('classifies every case from two lookups', async () => {
    db = makeDb({
      pos: POS,
      links: [
        { entity_id: 102, qbo_id: 'QB-OLD', po_number: 'PO-2026-0102' },   // 0102 already linked
        { entity_id: 103, qbo_id: 'QB-3', po_number: 'PO-2026-0103' },     // QB-3 held by 0103
      ],
    });

    const out = await repo.previewQuickbooksLinks([
      pair('PO-2026-0101', 'QB-1'),      // free → will link
      pair('PO-2026-0103', 'QB-3'),      // same link → unchanged
      pair('PO-2026-0102', 'QB-2'),      // PO linked elsewhere → conflict
      pair('PO-2026-0101', 'QB-3'),      // number held by another PO → conflict
      pair('PO-2026-9999', 'QB-9'),      // not found
    ]);

    expect(out.map((o) => o.status)).toEqual(['will_link', 'unchanged', 'conflict', 'conflict', 'not_found']);
    expect(out[2]).toMatchObject({ linkedQuickbooksNumber: 'QB-OLD', linkedToPoNumber: null });
    expect(out[3]).toMatchObject({ linkedQuickbooksNumber: null, linkedToPoNumber: 'PO-2026-0103' });
  });

  it('reports both sides when the PO and the number are each linked elsewhere', async () => {
    db = makeDb({
      pos: POS,
      links: [
        { entity_id: 101, qbo_id: 'QB-A', po_number: 'PO-2026-0101' },
        { entity_id: 102, qbo_id: 'QB-B', po_number: 'PO-2026-0102' },
      ],
    });
    const [out] = await repo.previewQuickbooksLinks([pair('PO-2026-0101', 'QB-B')]);
    expect(out).toMatchObject({
      status: 'conflict', linkedQuickbooksNumber: 'QB-A', linkedToPoNumber: 'PO-2026-0102',
    });
  });
});

describe('query count does not depend on the number of rows', () => {
  const rows = (n) => Array.from({ length: n }, (_, i) =>
    pair(`PO-2026-${String(1000 + i).padStart(4, '0')}`, `QB-${i}`));
  const world = (n) => ({
    pos: rows(n).map((r, i) => ({ id: 1000 + i, po_number: r.poNumber })),
  });

  it('preview: 5 rows and 300 rows use the same two statements', async () => {
    db = makeDb(world(5));
    await repo.previewQuickbooksLinks(rows(5));
    const small = db.calls.length;

    db = makeDb(world(300));
    await repo.previewQuickbooksLinks(rows(300));
    expect(db.calls.length).toBe(small);
    expect(small).toBe(2);
  });

  it('apply: 5 rows and 300 rows use the same number of statements', async () => {
    db = makeDb(world(5));
    await repo.applyQuickbooksLinks(rows(5), 7);
    const small = db.calls.length;

    db = makeDb(world(300));
    const results = await repo.applyQuickbooksLinks(rows(300), 7);
    expect(results).toHaveLength(300);
    expect(db.calls.length).toBe(small);
    // BEGIN, lock+lookup, links lookup, delete, insert, audit, COMMIT
    expect(small).toBe(7);
  });
});

describe('applyQuickbooksLinks', () => {
  it('locks the purchase orders before reading their links', async () => {
    db = makeDb({ pos: POS });
    await repo.applyQuickbooksLinks([pair('PO-2026-0101', 'QB-1')], 7);
    expect(sqlOf(/FOR UPDATE/)).toHaveLength(1);
    const order = db.calls.map((c) => c.sql);
    expect(order.findIndex((s) => /FOR UPDATE/.test(s)))
      .toBeLessThan(order.findIndex((s) => /^SELECT qom\./.test(s)));
  });

  it('links a free pair and writes the same audit action as the manual edit', async () => {
    db = makeDb({ pos: POS });
    const out = await repo.applyQuickbooksLinks([pair('PO-2026-0101', 'QB-1')], 7);

    expect(out).toEqual([{ status: 'linked' }]);
    expect(sqlOf(/^INSERT INTO quickbooks_object_map/)[0].params).toEqual([[101], ['QB-1']]);
    const audit = sqlOf(/^INSERT INTO audit_log/)[0];
    expect(audit.sql).toContain("'quickbooks_ref_set'");
    expect(audit.params).toEqual([[101], ['QB-1'], 7]);
    expect(db.calls.at(-1).sql).toBe('COMMIT');
  });

  it('leaves an unchanged pair alone and writes nothing', async () => {
    db = makeDb({ pos: POS, links: [{ entity_id: 101, qbo_id: 'QB-1', po_number: 'PO-2026-0101' }] });
    const out = await repo.applyQuickbooksLinks([pair('PO-2026-0101', 'QB-1')], 7);
    expect(out).toEqual([{ status: 'unchanged' }]);
    expect(sqlOf(/^(DELETE|INSERT)/)).toHaveLength(0);
  });

  it('skips a conflict unless overwrite is set', async () => {
    db = makeDb({ pos: POS, links: [{ entity_id: 102, qbo_id: 'QB-OLD', po_number: 'PO-2026-0102' }] });
    const out = await repo.applyQuickbooksLinks([pair('PO-2026-0102', 'QB-2')], 7);
    expect(out[0]).toMatchObject({ status: 'skipped_conflict', linkedQuickbooksNumber: 'QB-OLD' });
    expect(sqlOf(/^(DELETE|INSERT)/)).toHaveLength(0);
  });

  it('overwrites a ticked conflict and audits the displaced PO too', async () => {
    db = makeDb({ pos: POS, links: [{ entity_id: 103, qbo_id: 'QB-3', po_number: 'PO-2026-0103' }] });
    const out = await repo.applyQuickbooksLinks([pair('PO-2026-0101', 'QB-3', true)], 7);

    expect(out).toEqual([{ status: 'overwritten' }]);
    expect(new Set(sqlOf(/^DELETE FROM quickbooks_object_map/)[0].params[0])).toEqual(new Set([101, 103]));
    expect(sqlOf(/^INSERT INTO quickbooks_object_map/)[0].params).toEqual([[101], ['QB-3']]);
    expect(sqlOf(/^INSERT INTO audit_log/)[0].params).toEqual([[101, 103], ['QB-3', null], 7]);
  });

  it('re-validates against the database, not against what a preview said', async () => {
    // The caller never says "will link": a number someone linked after
    // the preview is a conflict at apply time and is skipped.
    db = makeDb({ pos: POS, links: [{ entity_id: 103, qbo_id: 'QB-1', po_number: 'PO-2026-0103' }] });
    const out = await repo.applyQuickbooksLinks([pair('PO-2026-0101', 'QB-1')], 7);
    expect(out[0]).toMatchObject({ status: 'skipped_conflict', linkedToPoNumber: 'PO-2026-0103' });
  });

  it('reports a PO that no longer exists as not found and links nothing for it', async () => {
    db = makeDb({ pos: POS });
    const out = await repo.applyQuickbooksLinks([pair('PO-2026-9999', 'QB-9')], 7);
    expect(out).toEqual([{ status: 'not_found' }]);
    expect(sqlOf(/^INSERT/)).toHaveLength(0);
  });

  it('rolls everything back when a write fails, and never commits', async () => {
    const failOn = /^INSERT INTO audit_log/;
    failOn.code = 'XX000';
    db = makeDb({ pos: POS, failOn });

    await expect(repo.applyQuickbooksLinks([
      pair('PO-2026-0101', 'QB-1'), pair('PO-2026-0102', 'QB-2'),
    ], 7)).rejects.toThrow('boom');

    const sqls = db.calls.map((c) => c.sql);
    expect(sqls.at(-1)).toBe('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
    expect(db.release).toHaveBeenCalled();
  });
});
