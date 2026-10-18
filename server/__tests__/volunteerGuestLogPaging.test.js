// ─────────────────────────────────────────────────────────────
// server/__tests__/volunteerGuestLogPaging.test.js
//
// GET /api/volunteers — the guest log a batch at a time. The route reads
// one row more than asked for, so it can say whether there is a next
// batch instead of silently stopping at the cap.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { authCookie } from './helpers/testAuth.js';

vi.mock('../src/config/db.js', () => ({ default: { query: vi.fn() } }));

const listGuestLog = vi.fn();
vi.mock('../src/repositories/volunteer.repository.js', () => ({
  default: {
    signOutVolunteer: vi.fn(),
    getVolunteerById: vi.fn(),
    listGuestLog: (...args) => listGuestLog(...args),
  },
}));

const { buildVolunteerApp } = await import('./helpers/volunteerApp.js');
const app = buildVolunteerApp();
const MANAGER = { id: 2, role: 'manager', username: 'manager001' };

const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, full_name: `V${i + 1}` }));
const get = (qs = '') => request(app).get(`/api/volunteers${qs}`).set('Cookie', authCookie(MANAGER));

beforeEach(() => vi.clearAllMocks());

describe('GET /api/volunteers batches', () => {
  it('reads one extra row, and reports there is more without sending it', async () => {
    listGuestLog.mockResolvedValue(rows(3));
    const res = await get('?limit=2&offset=4');
    expect(listGuestLog).toHaveBeenCalledWith(expect.objectContaining({ limit: 3, offset: 4 }));
    expect(res.body.data).toHaveLength(2);
    expect(res.body.hasMore).toBe(true);
  });

  it('says there is no more when the batch is not full', async () => {
    listGuestLog.mockResolvedValue(rows(1));
    const res = await get('?limit=2');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.hasMore).toBe(false);
  });

  it('is the latest 500 with no limit, and never more than 500', async () => {
    listGuestLog.mockResolvedValue([]);
    await get();
    expect(listGuestLog.mock.calls[0][0]).toMatchObject({ limit: 501, offset: 0 });
    await get('?limit=99999&offset=-5');
    expect(listGuestLog.mock.calls[1][0]).toMatchObject({ limit: 501, offset: 0 });
  });
});
