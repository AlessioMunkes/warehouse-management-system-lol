// ─────────────────────────────────────────────────────────────
// server/__tests__/httpError.test.js
//
// What a person reads when a request fails (utils/httpError.js): the
// service's own words for their mistake, "wait a minute" when the
// database is down, and what to do next for anything else. Never the
// raw error.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { errorReply, isDatabaseDown, DATABASE_DOWN_MESSAGE } from '../src/utils/httpError.js';

const withStatus = (status, message) => Object.assign(new Error(message), { status });

describe('errorReply', () => {
  it('keeps the service’s message for a mistake in the request', () => {
    expect(errorReply(withStatus(400, 'Choose a supplier.'), 'Failed to save.'))
      .toEqual({ status: 400, message: 'Choose a supplier.' });
  });

  it.each([
    ['connection terminated unexpectedly', undefined],
    ['timeout exceeded when trying to connect', undefined],
    ['anything', 'ECONNREFUSED'],
    ['terminating connection due to administrator command', '57P01'],
  ])('says to wait when the database cannot be reached (%s %s)', (message, code) => {
    const err = Object.assign(new Error(message), code ? { code } : {});
    expect(isDatabaseDown(err)).toBe(true);
    expect(errorReply(err, 'Failed to save.')).toMatchObject({ status: 503, message: DATABASE_DOWN_MESSAGE });
  });

  it('says what could not be done and what to do, never the raw error', () => {
    const reply = errorReply(new Error('relation "users" does not exist'), 'Failed to retrieve picking slips.');
    expect(reply).toEqual({
      status: 500,
      message: 'Could not load picking slips. Try again, and if it keeps happening, tell an administrator.',
    });
  });

  it('shows a 5xx message only where the controller says it was written for the reader', () => {
    expect(errorReply(withStatus(503, 'QuickBooks is busy.'), 'Failed to sync.').message).toMatch(/^Could not sync/);
    expect(errorReply(withStatus(503, 'QuickBooks is busy.'), 'Failed to sync.', { passThrough: [503] }).message)
      .toBe('QuickBooks is busy.');
  });

  it('is not fooled into calling a query error a lost database', () => {
    expect(isDatabaseDown(Object.assign(new Error('duplicate key value'), { code: '23505' }))).toBe(false);
  });
});
