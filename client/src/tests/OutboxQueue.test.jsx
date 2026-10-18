// ─────────────────────────────────────────────────────────────
// src/tests/OutboxQueue.test.jsx
//
// The offline queue itself, on a stand-in IndexedDB: what happens to
// work saved on a phone when the send does not go through.
//
// The rule being pinned: NOTHING IS A DEAD END. Work that could not be
// sent is never quietly given up on. A session that ran out waits for
// the worker to sign in again (it used to be retired for good); a busy
// server is tried again; only a real refusal stops, and even that can
// be tried again or discarded from the list behind the bar.
// ─────────────────────────────────────────────────────────────
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const session = vi.hoisted(() => ({ user: { id: 7, firstName: 'Wendy', lastName: 'Jacobs' } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: session.user }) }));
vi.mock('../services/api', () => ({ apiGet: vi.fn(async () => ({})), apiPost: vi.fn() }));

const outbox = await import('../services/outbox');
const connection = await import('../services/connection');
const { apiPost } = await import('../services/api');
const { default: OfflineBar } = await import('../components/layout/OfflineBar');

const WENDY = { id: 7, firstName: 'Wendy', lastName: 'Jacobs' };
const SIPHO = { id: 9, firstName: 'Sipho', lastName: 'Ndlovu' };
const fails = (status, extra = {}) => Object.assign(new Error(extra.message ?? `refused ${status}`), { status, ...extra });
const NO_SIGNAL = Object.assign(new Error('no signal'), { isNetworkError: true });

const item = (label, extra = {}) => ({ endpoint: '/api/deliveries', body: { idempotencyKey: `key-${label}`, label }, kind: 'delivery', label, ...extra });
const labels = async () => (await outbox.list()).map((i) => i.label);
const find = async (label) => (await outbox.list()).find((i) => i.label === label);

beforeEach(async () => {
  vi.clearAllMocks();
  session.user = WENDY;
  outbox.setOwner(WENDY);
  connection.reportReach();
  for (const row of await outbox.list()) await outbox.remove(row.id);
});

describe('a session that ran out while work was waiting', () => {
  it('does not give up on the work', async () => {
    await outbox.enqueue(item('Order 86'));
    await outbox.flush(vi.fn().mockRejectedValue(fails(401, { message: 'Session expired.' })));

    const row = await find('Order 86');
    expect(row).toBeTruthy();
    expect(row.permanent).toBe(false);
    expect(row.reason).toBe('signin');
  });

  it('sends it once the worker has signed in again', async () => {
    await outbox.enqueue(item('Order 86'));
    await outbox.flush(vi.fn().mockRejectedValue(fails(401)));

    const post = vi.fn().mockResolvedValue({ success: true });
    const sent = await outbox.flush(post);
    expect(sent.map((i) => i.label)).toEqual(['Order 86']);
    expect(post).toHaveBeenCalledWith('/api/deliveries', expect.objectContaining({ idempotencyKey: 'key-Order 86' }));
    expect(await labels()).toEqual([]);
  });

  it('stops there: everything behind it would be turned away too', async () => {
    await outbox.enqueue(item('first'));
    await outbox.enqueue(item('second'));
    const post = vi.fn().mockRejectedValue(fails(401));
    await outbox.flush(post);
    expect(post).toHaveBeenCalledTimes(1);
    expect((await find('second')).error).toBeNull();
  });
});

describe('work saved by somebody else on the same phone', () => {
  it('is never sent under the wrong name', async () => {
    await outbox.enqueue(item('Wendy delivery'));
    outbox.setOwner(SIPHO);
    await outbox.enqueue(item('Sipho pallet'));

    const post = vi.fn().mockResolvedValue({});
    const sent = await outbox.flush(post);            // Sipho is signed in
    expect(sent.map((i) => i.label)).toEqual(['Sipho pallet']);
    expect(await labels()).toEqual(['Wendy delivery']);

    outbox.setOwner(WENDY);                           // Wendy signs back in
    expect((await outbox.flush(post)).map((i) => i.label)).toEqual(['Wendy delivery']);
  });

  it('remembers who saved it', async () => {
    await outbox.enqueue(item('Order 86'));
    expect(await find('Order 86')).toMatchObject({ userId: 7, userName: 'Wendy Jacobs' });
  });
});

describe('a server that could not take it just now', () => {
  it.each([
    ['a rate limit', fails(429)],
    ['a timeout', fails(408)],
    ['a server error', fails(503)],
    ['the same submission still being saved', fails(409, { retryable: true })],
  ])('%s is tried again later, not given up on', async (_name, error) => {
    await outbox.enqueue(item('Order 86'));
    await outbox.flush(vi.fn().mockRejectedValue(error));
    expect(await find('Order 86')).toMatchObject({ permanent: false, reason: 'later', attempts: 1 });

    await outbox.flush(vi.fn().mockResolvedValue({}));
    expect(await labels()).toEqual([]);
  });

  it('no signal leaves the item untouched', async () => {
    await outbox.enqueue(item('Order 86'));
    await outbox.flush(vi.fn().mockRejectedValue(NO_SIGNAL));
    expect(await find('Order 86')).toMatchObject({ error: null, attempts: 0 });
  });
});

describe('work the server refused', () => {
  it('is kept with the reason and taken out of the rotation', async () => {
    await outbox.enqueue(item('Order 86'));
    await outbox.flush(vi.fn().mockRejectedValue(fails(409, { message: 'That order is already closed.' })));
    expect(await find('Order 86')).toMatchObject({ permanent: true, reason: 'refused', error: 'That order is already closed.' });
  });

  it('does not hold up what is behind it', async () => {
    await outbox.enqueue(item('refused'));
    await outbox.enqueue(item('fine'));
    const post = vi.fn().mockImplementation(async (_e, body) => { if (body.label === 'refused') throw fails(400); return {}; });
    const sent = await outbox.flush(post);
    expect(sent.map((i) => i.label)).toEqual(['fine']);
    expect(await labels()).toEqual(['refused']);
  });

  it('can be tried again on the worker\'s say so', async () => {
    await outbox.enqueue(item('Order 86'));
    await outbox.flush(vi.fn().mockRejectedValue(fails(400)));
    const post = vi.fn().mockResolvedValue({});
    expect(await outbox.flush(post)).toEqual([]);        // skipped while refused
    await outbox.retry((await find('Order 86')).id);
    expect((await outbox.flush(post)).map((i) => i.label)).toEqual(['Order 86']);
  });
});

describe('work saved more than twelve hours ago', () => {

  it('is not sent on its own', async () => {
    await outbox.enqueue(item('Yesterday'));
    const row = await find('Yesterday');
    vi.spyOn(Date, 'now').mockReturnValue(row.savedAt + outbox.STALE_AFTER + 60000);
    const post = vi.fn().mockResolvedValue({});
    await outbox.flush(post);
    vi.restoreAllMocks();
    expect(post).not.toHaveBeenCalled();
    expect(await find('Yesterday')).toMatchObject({ permanent: true, reason: 'stale' });
  });

  it('still goes if the worker checks it and sends it', async () => {
    await outbox.enqueue(item('Yesterday'));
    const row = await find('Yesterday');
    const later = row.savedAt + outbox.STALE_AFTER + 60000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(later);
    await outbox.flush(vi.fn().mockResolvedValue({}));
    await outbox.retry(row.id);
    const post = vi.fn().mockResolvedValue({});
    const sent = await outbox.flush(post);
    clock.mockRestore();
    expect(sent.map((i) => i.label)).toEqual(['Yesterday']);
  });
});

describe('two sends at once', () => {
  it('are one pass over the queue, so nothing goes twice', async () => {
    await outbox.enqueue(item('Order 86'));
    let release;
    const post = vi.fn().mockImplementation(() => new Promise((resolve) => { release = () => resolve({}); }));
    const first = outbox.flush(post);
    const second = outbox.flush(post);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    release();
    await Promise.all([first, second]);
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('the list behind the bar', () => {
  const user = userEvent.setup();

  it('shows what is waiting and why, and lets a refused item be tried again', async () => {
    await outbox.enqueue(item('Order 86'));
    await outbox.flush(vi.fn().mockRejectedValue(fails(409, { message: 'That order is already closed.' })));
    apiPost.mockResolvedValue({});

    render(<OfflineBar />);
    expect(await screen.findByText(/1 thing could not be sent/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View' }));

    expect(await screen.findByText('Order 86')).toBeInTheDocument();
    expect(screen.getByText('That order is already closed.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(async () => expect(await labels()).toEqual([]));
    expect(apiPost).toHaveBeenCalledWith('/api/deliveries', expect.objectContaining({ label: 'Order 86' }));
  });

  it('discards only after a second, explicit tap', async () => {
    await outbox.enqueue(item('Order 86'));
    await outbox.flush(vi.fn().mockRejectedValue(fails(400)));

    render(<OfflineBar />);
    await user.click(await screen.findByRole('button', { name: 'View' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(await labels()).toEqual(['Order 86']);                 // not yet
    expect(screen.getByText(/has not been saved anywhere else/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, discard it' }));
    await waitFor(async () => expect(await labels()).toEqual([]));
  });

  it('shows somebody else\'s work as theirs, with nothing to press on it', async () => {
    outbox.setOwner(SIPHO);
    await outbox.enqueue(item('Sipho pallet'));
    outbox.setOwner(WENDY);

    render(<OfflineBar />);
    expect(await screen.findByText(/1 thing saved by Sipho Ndlovu is waiting on this phone/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText(/Saved by Sipho Ndlovu/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });
});
