// resolveRequest's handled_by rule lives in SQL, so it is checked against
// a fake client: the statement must COALESCE (keep a claimer, fill an
// empty handler) and bind the resolver as that fallback.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/config/db.js', () => ({ default: { query: vi.fn() } }));

const { default: repo } = await import('../src/repositories/communityRequest.repository.js');

const makeClient = () => {
  const calls = [];
  return {
    calls,
    query: vi.fn(async (sql, params) => {
      calls.push({ sql, params });
      return /^\s*UPDATE/.test(sql) ? { rowCount: 1, rows: [] } : { rows: [{ id: 5 }] };
    }),
  };
};

describe('resolveRequest handled_by', () => {
  it('keeps an existing claimer and falls back to the resolver for an unclaimed row', async () => {
    const client = makeClient();
    await repo.resolveRequest(5, { outcome: 'fulfilled', outcomeNote: 'ok', handledBy: 7 }, client);
    const update = client.calls[0];
    expect(update.sql).toMatch(/handled_by\s*=\s*COALESCE\(handled_by,\s*\$3\)/);
    expect(update.params).toEqual(['fulfilled', 'ok', 7, 5]);
  });

  it('returns null when the row does not exist', async () => {
    const client = { query: vi.fn(async () => ({ rowCount: 0, rows: [] })) };
    expect(await repo.resolveRequest(9, { outcome: 'declined', handledBy: 7 }, client)).toBeNull();
  });
});
