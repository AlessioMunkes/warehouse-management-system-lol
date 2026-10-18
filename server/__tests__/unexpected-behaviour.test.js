// QA regression probes: real services/routes, mocked persistence, no live database.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const kitRepo = vi.hoisted(() => ({ createKit: vi.fn(), logCompost: vi.fn(), listRecords: vi.fn() }));
const stockRepo = vi.hoisted(() => ({ manualAdjust: vi.fn() }));
const dispatchRepo = vi.hoisted(() => ({ getGateView: vi.fn(), collect: vi.fn(), getDispatchNote: vi.fn() }));
vi.mock('../src/repositories/collectionKit.repository.js', () => ({ default: kitRepo }));
vi.mock('../src/repositories/stock.repository.js', () => ({ default: stockRepo }));
vi.mock('../src/repositories/dispatch.repository.js', () => ({ default: dispatchRepo }));
const { default: kits } = await import('../src/services/collectionKit.service.js');
const { default: dispatch } = await import('../src/services/dispatch.service.js');
const { default: pool } = await import('../src/config/db.js');
const { withTransaction } = await import('../src/utils/transaction.js');
const { default: kitRouter } = await import('../src/routes/collectionKit.routes.js');
const { buildStockApp } = await import('./helpers/stockApp.js');

const kitApp = express();
kitApp.use(express.json(), cookieParser());
kitApp.use('/api/collection-kits', kitRouter);
const stockApp = buildStockApp();
const cookie = (role = 'manager') => `wms_token=${jwt.sign({ id: 7, role }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;
const compost = (body, role) => request(kitApp).post('/api/collection-kits/1/records').set('Cookie', cookie(role)).send(body);
const adjustment = body => request(stockApp).post('/api/stock/adjust').set('Cookie', cookie()).send(body);
const collectBody = { driverName: 'QA Driver', signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZz8AAAAASUVORK5CYII=' };
const worker = { id: 7, role: 'warehouse_worker' };

beforeEach(() => {
  vi.clearAllMocks();
  kitRepo.createKit.mockResolvedValue({ id: 1 });
  kitRepo.logCompost.mockImplementation(async args => ({ ok: true, record: { id: 1, ...args } }));
  kitRepo.listRecords.mockResolvedValue([]);
  stockRepo.manualAdjust.mockResolvedValue({ before: 10, after: 11 });
  dispatchRepo.getGateView.mockResolvedValue({ dispatch_date: '2026-10-14', slip_status: 'complete', dispatch_status: 'awaiting', ecd_is_active: true, ecd_approved_at: '2026-01-01', ecd_name: 'QA', items: [] });
  dispatchRepo.collect.mockResolvedValue({ event: { id: 1 } });
  dispatchRepo.getDispatchNote.mockResolvedValue({ id: 1 });
});
afterEach(() => vi.useRealTimers());

describe('compost HTTP validation and access', () => {
  it('allows a valid worker weigh-in', async () => {
    expect((await compost({ kgCompost: 5, loggedAt: '2026-10-14' }, 'warehouse_worker')).status).toBe(201);
    expect(kitRepo.logCompost).toHaveBeenCalledWith(expect.objectContaining({ kgCompost: 5, actorId: 7 }));
  });
  it('allows explicit zero, as the implemented rule specifies', async () => {
    expect((await compost({ kgCompost: 0 })).status).toBe(201);
  });
  it('rejects a negative weight', async () => {
    expect((await compost({ kgCompost: -1 })).status).toBe(400);
    expect(kitRepo.logCompost).not.toHaveBeenCalled();
  });
  it('blocks guests', async () => {
    expect((await compost({ kgCompost: 5 }, 'guest')).status).toBe(403);
    expect(kitRepo.logCompost).not.toHaveBeenCalled();
  });
  it('blocks unauthenticated writes', async () => {
    expect((await request(kitApp).post('/api/collection-kits/1/records').send({ kgCompost: 5 })).status).toBe(401);
  });
  it.each([null, '', false, true, [5]])('UB01 rejects malformed weight %j', async value => {
    const result = await compost({ kgCompost: value });
    expect(result.status, JSON.stringify(result.body)).toBe(400);
    expect(kitRepo.logCompost).not.toHaveBeenCalled();
  });
  it('UB02 rejects an impossible calendar date before persistence', async () => {
    expect((await compost({ kgCompost: 5, loggedAt: '2026-02-30' })).status, JSON.stringify(kitRepo.logCompost.mock.calls)).toBe(400);
    expect(kitRepo.logCompost).not.toHaveBeenCalled();
  });
  it('UB03 rejects a nonnumeric list limit', async () => {
    const result = await request(kitApp).get('/api/collection-kits/records?limit=abc').set('Cookie', cookie());
    expect(result.status, JSON.stringify(kitRepo.listRecords.mock.calls)).toBe(400);
    expect(kitRepo.listRecords).not.toHaveBeenCalled();
  });
});

describe('warehouse calendar', () => {
  it('UB04 defaults assignment to the SAST calendar date', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T22:30:00Z'));
    await kits.createKit({ ownerName: 'QA Owner' }, 7);
    expect(kitRepo.createKit.mock.calls[0][0].assignedAt).toBe('2026-10-14');
  });
  it('UB04 defaults compost logging to the SAST calendar date', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T22:30:00Z'));
    await kits.logCompost(1, { kgCompost: 5 }, 7);
    expect(kitRepo.logCompost.mock.calls[0][0].loggedAt).toBe('2026-10-14');
  });
});

describe('stock adjustment HTTP validation', () => {
  it('accepts a valid adjustment', async () => {
    expect((await adjustment({ productId: 1, quantityDelta: 1, reason: 'QA count' })).status).toBe(200);
  });
  it.each([true, [5]])('UB05 rejects malformed stock delta %j', async quantityDelta => {
    const result = await adjustment({ productId: 1, quantityDelta, reason: 'QA count' });
    expect(result.status, JSON.stringify(stockRepo.manualAdjust.mock.calls)).toBe(400);
    expect(stockRepo.manualAdjust).not.toHaveBeenCalled();
  });
  it('UB06 rejects a structured reason with 400 rather than crashing', async () => {
    expect((await adjustment({ productId: 1, quantityDelta: 1, reason: { text: 'QA count' } })).status).toBe(400);
    expect(stockRepo.manualAdjust).not.toHaveBeenCalled();
  });
});

describe('dispatch service input boundary', () => {
  it('accepts valid collection input', async () => {
    await expect(dispatch.collect(1, collectBody, worker)).resolves.toHaveProperty('event.id', 1);
  });
  it('blocks an inactive beneficiary', async () => {
    dispatchRepo.getGateView.mockResolvedValue({ ecd_is_active: false, ecd_name: 'QA' });
    await expect(dispatch.collect(1, collectBody, worker)).rejects.toMatchObject({ status: 409 });
    expect(dispatchRepo.collect).not.toHaveBeenCalled();
  });
  it('UB07 rejects a null loaded quantity instead of silently converting it to zero', async () => {
    let thrown;
    try { await dispatch.collect(1, { ...collectBody, lines: [{ itemId: 1, loadedQuantity: null }] }, worker); } catch (err) { thrown = err; }
    expect(thrown?.status, JSON.stringify(dispatchRepo.collect.mock.calls[0]?.[0]?.lines)).toBe(400);
    expect(dispatchRepo.collect).not.toHaveBeenCalled();
  });
  it('UB08 rejects a signature that contains no image', async () => {
    await expect(dispatch.collect(1, { ...collectBody, signature: 'data:image/not-an-image' }, worker)).rejects.toMatchObject({ status: 400 });
    expect(dispatchRepo.collect).not.toHaveBeenCalled();
  });
});

describe('transaction recovery', () => {
  it('rolls back and releases a client when work fails', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
    pool.connect.mockResolvedValueOnce(client);
    const original = new Error('work failed');
    await expect(withTransaction(async () => { throw original; })).rejects.toBe(original);
    expect(client.query.mock.calls.map(args => args[0])).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledOnce();
  });
  it('UB09 retains the original failure when rollback also fails', async () => {
    const original = new Error('original database failure');
    const client = { query: vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('rollback disconnected')), release: vi.fn() };
    pool.connect.mockResolvedValueOnce(client);
    let thrown;
    try { await withTransaction(async () => { throw original; }); } catch (err) { thrown = err; }
    expect(client.release).toHaveBeenCalledOnce();
    expect(Boolean(thrown === original || thrown?.cause === original || thrown?.errors?.includes(original)), `received: ${thrown?.message}; expected original: ${original.message}`).toBe(true);
  });
});
