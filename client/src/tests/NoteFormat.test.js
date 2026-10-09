// ─────────────────────────────────────────────────────────────
// client/src/tests/NoteFormat.test.js
//
// A DATE column reaches the client either as 'YYYY-MM-DD' or as the
// timestamp node-postgres makes of it: midnight in the server's own
// timezone. Both have to print the same calendar day.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { formatDate, formatDateShort } from '../features/receipts/noteFormat';

describe('noteFormat — a DATE column', () => {
  it('prints a bare date as it stands', () => {
    expect(formatDate('2026-10-06')).toBe('6 October 2026');
  });

  it('prints the right day when the server is on warehouse time', () => {
    // 6 October, midnight SAST.
    expect(formatDate('2026-10-05T22:00:00.000Z')).toBe('6 October 2026');
    expect(formatDateShort('2026-10-05T22:00:00.000Z')).toMatch(/^0?6 Oct/);
  });

  it('prints the right day when the server is on UTC', () => {
    expect(formatDate('2026-10-06T00:00:00.000Z')).toBe('6 October 2026');
    expect(formatDateShort('2026-10-06T00:00:00.000Z')).toMatch(/^0?6 Oct/);
  });

  it('shows a dash for nothing or nonsense', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDateShort('not a date')).toBe('—');
  });
});
