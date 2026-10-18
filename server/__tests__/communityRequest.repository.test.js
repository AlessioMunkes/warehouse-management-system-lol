// The rules that live in SQL are checked against a fake client: every
// transition names the status it expects in its WHERE (so a lost race
// updates nothing), the handler is only ever filled, never overwritten,
// and the lines are replaced as one unit.
//
// Against a real database the same transitions run in
// __tests__/integration/communityRequest.integration.test.js.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/config/db.js', () => ({ default: { query: vi.fn() } }));

const { default: repo } = await import('../src/repositories/communityRequest.repository.js');

const squash = (s) => String(s).replace(/\s+/g, ' ').trim();

const makeClient = (rowCount = 1) => {
  const calls = [];
  return {
    calls,
    query: vi.fn(async (sql, params) => {
      calls.push({ sql: squash(sql), params });
      return { rowCount, rows: rowCount ? [{ id: 5 }] : [] };
    }),
  };
};

describe('lockRequest', () => {
  it('locks the row for the rest of the transaction', async () => {
    const client = makeClient();
    await repo.lockRequest(5, client);
    expect(client.calls[0].sql).toMatch(/FOR UPDATE$/);
    expect(client.calls[0].params).toEqual([5]);
  });

  it('returns null when the row does not exist', async () => {
    expect(await repo.lockRequest(9, makeClient(0))).toBeNull();
  });
});

describe('markApproved', () => {
  it('only moves a pending request, recording who and when, and clears any flag', async () => {
    const client = makeClient();
    expect(await repo.markApproved(5, 3, client)).toBe(true);
    const { sql, params } = client.calls[0];
    expect(sql).toMatch(/outcome = 'approved'/);
    expect(sql).toMatch(/approved_by = \$2/);
    expect(sql).toMatch(/approved_at = NOW\(\)/);
    expect(sql).toMatch(/items_short_at = NULL/);
    expect(sql).toMatch(/WHERE id = \$1 AND outcome = 'pending'/);
    expect(params).toEqual([5, 3]);
  });

  it('reports false when nothing was pending', async () => {
    expect(await repo.markApproved(5, 3, makeClient(0))).toBe(false);
  });
});

describe('replaceItems', () => {
  it('deletes the old lines and inserts the new ones in one pass', async () => {
    const client = makeClient();
    await repo.replaceItems(5, [
      { productId: 7, unit: 'kg', quantity: 3 },
      { productId: 9, unit: 'bag', quantity: 2 },
    ], client);
    expect(client.calls[0].sql).toMatch(/^DELETE FROM community_request_items WHERE request_id = \$1/);
    expect(client.calls[1].sql).toMatch(/^INSERT INTO community_request_items/);
    expect(client.calls[1].params).toEqual([5, [7, 9], ['kg', 'bag'], [3, 2]]);
  });
});

describe('markDeclined', () => {
  it('works from pending or approved only, keeps a claimer and fills an empty handler', async () => {
    const client = makeClient();
    await repo.markDeclined(5, { reason: 'No', userId: 3 }, client);
    const { sql, params } = client.calls[0];
    expect(sql).toMatch(/handled_by = COALESCE\(handled_by, \$3\)/);
    expect(sql).toMatch(/outcome IN \('pending'::request_outcome, 'approved'::request_outcome\)/);
    expect(sql).toMatch(/resolved_at = NOW\(\)/);
    expect(params).toEqual([5, 'No', 3]);
  });
});

describe('claimApproved', () => {
  it('claims only an approved, unflagged, unclaimed request — the WHERE is the race guard', async () => {
    const client = makeClient();
    expect(await repo.claimApproved(5, 7, client)).toBe(true);
    const { sql, params } = client.calls[0];
    expect(sql).toMatch(/outcome = 'approved'/);
    expect(sql).toMatch(/items_short_at IS NULL/);
    expect(sql).toMatch(/handled_by IS NULL/);
    expect(params).toEqual([5, 7]);
  });

  it('reports false when someone else got there first', async () => {
    expect(await repo.claimApproved(5, 7, makeClient(0))).toBe(false);
  });
});

describe('markConfirmed', () => {
  it('only from approved and unflagged; keeps the claimer; stamps the time', async () => {
    const client = makeClient();
    await repo.markConfirmed(5, { outcome: 'partially_fulfilled', userId: 7 }, client);
    const { sql, params } = client.calls[0];
    expect(sql).toMatch(/handled_by = COALESCE\(handled_by, \$3\)/);
    expect(sql).toMatch(/resolved_at = NOW\(\)/);
    expect(sql).toMatch(/outcome = 'approved'/);
    expect(sql).toMatch(/items_short_at IS NULL/);
    expect(params).toEqual([5, 'partially_fulfilled', 7]);
  });
});

describe('setAssignee', () => {
  it('only on an approved request', async () => {
    const client = makeClient();
    await repo.setAssignee(5, 9, client);
    expect(client.calls[0].sql).toMatch(/outcome = 'approved'/);
    expect(client.calls[0].params).toEqual([5, 9]);
  });
});

describe('getRequestById', () => {
  it('returns the approved items and the people behind it', async () => {
    const client = makeClient();
    await repo.getRequestById(5, client);
    const { sql } = client.calls[0];
    expect(sql).toMatch(/json_agg\(json_build_object/);
    expect(sql).toMatch(/'quantityApproved'/);
    expect(sql).toMatch(/'shortAt'/);
    expect(sql).toMatch(/cr\.items_short_at/);
    expect(sql).toMatch(/assigned_to_first_name/);
  });
});
