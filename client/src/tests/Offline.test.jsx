// ─────────────────────────────────────────────────────────────
// src/tests/Offline.test.jsx
//
// What has to hold when the warehouse loses signal.
//
// jsdom has no IndexedDB, which makes this suite more useful than it
// looks: it is exactly the "storage is unavailable" case (a private
// window, a browser with site data blocked, an old device). Every
// assertion about the queue here is really an assertion that the app
// degrades instead of throwing into a render or swallowing a
// submission it never stored.
//
// The IndexedDB path itself is verified in a real browser rather than
// against a shim — a fake that agrees with your assumptions proves
// nothing about the transaction semantics this depends on.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const connection = await import('../services/connection');
const outbox = await import('../services/outbox');
const { default: OfflineBar } = await import('../components/layout/OfflineBar');

const NETWORK_ERROR = Object.assign(new Error('Could not reach the server.'), {
  isNetworkError: true,
});
const REFUSAL = Object.assign(new Error('That order is already closed.'), { status: 400 });

beforeEach(() => {
  connection.reportReach();
});

// ── Reachability ──────────────────────────────────────────────
describe('connection', () => {
  it('starts out assuming the server is there', () => {
    expect(connection.isReachable()).toBe(true);
  });

  it('a failed request is what makes it offline, not a browser flag', () => {
    connection.reportUnreachable();
    expect(connection.isReachable()).toBe(false);
  });

  it('a server refusal still counts as reaching the server', () => {
    connection.reportUnreachable();
    // A 400 comes back through reportReach: the warehouse has signal,
    // the request was refused. Telling a worker otherwise sends them
    // looking for a wifi problem that does not exist.
    connection.reportReach();
    expect(connection.isReachable()).toBe(true);
  });

  it('tells its listeners, once per change', () => {
    const heard = [];
    const stop = connection.subscribe((v) => heard.push(v));

    connection.reportUnreachable();
    connection.reportUnreachable();   // no change, no second call
    connection.reportReach();
    stop();
    connection.reportUnreachable();   // unsubscribed, not heard

    expect(heard).toEqual([false, true]);
  });

  it('one listener throwing does not deafen the others', () => {
    const heard = [];
    const stopA = connection.subscribe(() => { throw new Error('boom'); });
    const stopB = connection.subscribe((v) => heard.push(v));

    expect(() => connection.reportUnreachable()).not.toThrow();
    expect(heard).toEqual([false]);
    stopA(); stopB();
  });
});

// ── What may be queued ────────────────────────────────────────
describe('queueIfOffline', () => {
  it('refuses a server refusal — retrying that forever hides the reason', async () => {
    const ok = await outbox.queueIfOffline(REFUSAL, {
      endpoint: '/api/deliveries',
      body: { idempotencyKey: 'k1' },
    });
    expect(ok).toBe(false);
  });

  it('refuses anything without an idempotency key', async () => {
    // This is the rule that keeps decanting out of the queue. A
    // retry the server cannot recognise is a second decanting run,
    // and a decanting run cannot be un-recorded.
    const ok = await outbox.queueIfOffline(NETWORK_ERROR, {
      endpoint: '/api/decanting',
      body: { weekOf: '2026-09-07' },
    });
    expect(ok).toBe(false);
  });

  it('refuses rather than throwing when the device has no storage', async () => {
    // jsdom: no IndexedDB. The caller re-throws the original network
    // error, which is the truthful outcome — the alternative is
    // telling a worker their delivery is safe on a phone that did
    // not store it.
    const ok = await outbox.queueIfOffline(NETWORK_ERROR, {
      endpoint: '/api/deliveries',
      body: { idempotencyKey: 'k1' },
    });
    expect(ok).toBe(false);
  });
});

describe('the queue with no storage available', () => {
  it('reads as empty rather than throwing into a render', async () => {
    await expect(outbox.list()).resolves.toEqual([]);
  });

  it('flushes nothing and asks the server for nothing', async () => {
    const post = vi.fn();
    await expect(outbox.flush(post)).resolves.toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });
});

// ── The bar ───────────────────────────────────────────────────
describe('OfflineBar', () => {
  it('says nothing on a normal day', () => {
    const { container } = render(<OfflineBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('appears the moment a request fails, not when the submit does', async () => {
    render(<OfflineBar />);
    connection.reportUnreachable();

    expect(await screen.findByText(/No signal/)).toBeInTheDocument();
  });

  it('tells the worker their work is kept, because that is the question', async () => {
    render(<OfflineBar />);
    connection.reportUnreachable();

    expect(await screen.findByText(/saved on this phone/i)).toBeInTheDocument();
  });

  it('goes away again when the server comes back', async () => {
    const { container } = render(<OfflineBar />);
    connection.reportUnreachable();
    await screen.findByText(/No signal/);

    connection.reportReach();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('cannot be dismissed — there is no button to hide it', async () => {
    render(<OfflineBar />);
    connection.reportUnreachable();
    await screen.findByText(/No signal/);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
