import { describe, it, expect, beforeEach, vi } from 'vitest';
const eventRepoMock = { createEvent: vi.fn(), findById: vi.fn(), findAll: vi.fn(), updateEvent: vi.fn() };
const auditMock = vi.fn();
vi.mock('../src/repositories/loveActivismEvent.repository.js', () => ({ default: eventRepoMock }));
vi.mock('../src/repositories/auditLog.repository.js', () => ({ logAudit: auditMock }));
const makeClient = () => { const sql = []; return { sql, query: vi.fn(async (s) => { sql.push(s); return { rows: [] }; }), release: vi.fn() }; };
const poolMock = { connect: vi.fn() };
vi.mock('../src/config/db.js', () => ({ default: poolMock }));
const mod = await import('../src/services/loveActivismEvent.service.js');
const svc = mod.default;
const ACTOR = { id: 5 };
const CREATED = { event_id: 'e1', event_name: 'Food Drive', description: null, event_date: '2026-10-01', status: 'DRAFT', created_by: 5, created_at: '2026-09-08T10:00:00Z', updated_at: '2026-09-08T10:00:00Z' };
beforeEach(() => { vi.clearAllMocks(); poolMock.connect.mockResolvedValue(makeClient()); });

describe('createEvent', () => {
  it('creates an event with defaults and audits', async () => {
    eventRepoMock.createEvent.mockResolvedValueOnce(CREATED);
    const result = await svc.createEvent({ eventName: 'Food Drive', eventDate: '2026-10-01' }, ACTOR);
    expect(result).toEqual(CREATED);
    expect(eventRepoMock.createEvent).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'Food Drive', status: 'DRAFT', createdBy: 5 }), expect.anything());
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'CREATE', actorId: 5 }));
  });
  it('uses the supplied status', async () => {
    eventRepoMock.createEvent.mockResolvedValueOnce({ ...CREATED, status: 'SCHEDULED' });
    await svc.createEvent({ eventName: 'Food Drive', eventDate: '2026-10-01', status: 'SCHEDULED' }, ACTOR);
    expect(eventRepoMock.createEvent).toHaveBeenCalledWith(expect.objectContaining({ status: 'SCHEDULED' }), expect.anything());
  });
  it('rejects missing event name', async () => {
    await expect(svc.createEvent({ eventDate: '2026-10-01' }, ACTOR)).rejects.toMatchObject({ status: 400 });
    expect(eventRepoMock.createEvent).not.toHaveBeenCalled();
  });
  it('rejects invalid event date', async () => {
    await expect(svc.createEvent({ eventName: 'Food Drive', eventDate: '2026-13-40' }, ACTOR)).rejects.toMatchObject({ status: 400 });
  });
  it('rejects invalid status', async () => {
    await expect(svc.createEvent({ eventName: 'x', eventDate: '2026-10-01', status: 'WEIRD' }, ACTOR)).rejects.toMatchObject({ status: 400 });
  });
  it('rejects missing actor', async () => {
    await expect(svc.createEvent({ eventName: 'x', eventDate: '2026-10-01' }, null)).rejects.toMatchObject({ status: 400 });
  });
});

describe('getEvent', () => {
  it('returns the event when found', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(CREATED);
    expect(await svc.getEvent('e1')).toEqual(CREATED);
  });
  it('returns 404 when not found', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(null);
    await expect(svc.getEvent('x')).rejects.toMatchObject({ status: 404 });
  });
});

describe('listEvents', () => {
  it('returns all events', async () => {
    eventRepoMock.findAll.mockResolvedValueOnce([CREATED]);
    expect(await svc.listEvents({})).toEqual([CREATED]);
  });
    it('rejects invalid status filter', async () => {
    await expect(svc.listEvents({ status: 'WEIRD' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('updateEvent', () => {
  it('updates mutable fields and audits', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(CREATED);
    eventRepoMock.updateEvent.mockResolvedValueOnce({ ...CREATED, event_name: 'Renamed' });
    const result = await svc.updateEvent('e1', { eventName: 'Renamed' }, ACTOR);
    expect(result.event_name).toBe('Renamed');
    expect(eventRepoMock.updateEvent).toHaveBeenCalledWith('e1', { eventName: 'Renamed' }, expect.anything());
    expect(auditMock).toHaveBeenCalled();
  });
  it('strips status from changes', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(CREATED);
    eventRepoMock.updateEvent.mockResolvedValueOnce(CREATED);
    await svc.updateEvent('e1', { eventName: 'Renamed', status: 'CANCELLED' }, ACTOR);
    expect(eventRepoMock.updateEvent).toHaveBeenCalledWith(expect.anything(), { eventName: 'Renamed' }, expect.anything());
  });
  it('returns existing row when no mutable fields', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(CREATED);
    expect(await svc.updateEvent('e1', { status: 'CANCELLED' }, ACTOR)).toEqual(CREATED);
    expect(eventRepoMock.updateEvent).not.toHaveBeenCalled();
  });
  it('returns 404 when event not found', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(null);
    await expect(svc.updateEvent('x', { eventName: 'X' }, ACTOR)).rejects.toMatchObject({ status: 404 });
  });
});

describe('cancelEvent', () => {
  it('cancels and audits', async () => {
    eventRepoMock.findById.mockResolvedValueOnce(CREATED);
    eventRepoMock.updateEvent.mockResolvedValueOnce({ ...CREATED, status: 'CANCELLED' });
    expect((await svc.cancelEvent('e1', ACTOR)).status).toBe('CANCELLED');
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'CANCEL' }));
  });
  it('rejects already-cancelled', async () => {
    eventRepoMock.findById.mockResolvedValueOnce({ ...CREATED, status: 'CANCELLED' });
    await expect(svc.cancelEvent('e1', ACTOR)).rejects.toMatchObject({ status: 409 });
  });
  it('rejects completed event', async () => {
    eventRepoMock.findById.mockResolvedValueOnce({ ...CREATED, status: 'COMPLETED' });
    await expect(svc.cancelEvent('e1', ACTOR)).rejects.toMatchObject({ status: 409 });
  });
});

describe('completeEvent', () => {
  it('completes and audits', async () => {
    eventRepoMock.findById.mockResolvedValueOnce({ ...CREATED, status: 'PUBLISHED' });
    eventRepoMock.updateEvent.mockResolvedValueOnce({ ...CREATED, status: 'COMPLETED' });
    expect((await svc.completeEvent('e1', ACTOR)).status).toBe('COMPLETED');
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'COMPLETE' }));
  });
  it('rejects cancelled event', async () => {
    eventRepoMock.findById.mockResolvedValueOnce({ ...CREATED, status: 'CANCELLED' });
    await expect(svc.completeEvent('e1', ACTOR)).rejects.toMatchObject({ status: 409 });
  });
});

describe('transactions', () => {
  it('commits on success', async () => {
    eventRepoMock.createEvent.mockResolvedValueOnce(CREATED);
    const client = makeClient();
    poolMock.connect.mockResolvedValue(client);
    await svc.createEvent({ eventName: 'Food Drive', eventDate: '2026-10-01' }, ACTOR);
    expect(client.sql).toContain('BEGIN');
    expect(client.sql[client.sql.length - 1]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
  it('rolls back on repository error', async () => {
    eventRepoMock.createEvent.mockRejectedValueOnce(new Error('DB error'));
    const client = makeClient();
    poolMock.connect.mockResolvedValue(client);
    await expect(svc.createEvent({ eventName: 'Food Drive', eventDate: '2026-10-01' }, ACTOR)).rejects.toThrow('DB error');
    expect(client.sql).toContain('BEGIN');
    expect(client.sql).toContain('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });
});
