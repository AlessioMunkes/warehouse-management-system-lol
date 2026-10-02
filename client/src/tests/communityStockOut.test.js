import { describe, it, expect } from 'vitest';
import {
  STOCK_OUT_TAG, mayHaveStockOut, stockOutReason, withStockOutTag,
} from '../features/communityRequests/stockOut';

describe('stockOut helpers', () => {
  it('appends the tag on a new line when ticked, after trimming the note', () => {
    expect(withStockOutTag('Gave 2 bags of samp  ', true))
      .toBe('Gave 2 bags of samp\n[Stock out — manager to record]');
    expect(STOCK_OUT_TAG).toBe('[Stock out — manager to record]');
  });

  it('leaves the note untouched when not ticked', () => {
    expect(withStockOutTag('Gave 2 bags', false)).toBe('Gave 2 bags');
  });

  it('only fulfilled and partially fulfilled may have stock out', () => {
    expect(mayHaveStockOut('fulfilled')).toBe(true);
    expect(mayHaveStockOut('partially_fulfilled')).toBe(true);
    expect(mayHaveStockOut('declined')).toBe(false);
  });

  it('builds the reason text with the caller name or "unnamed caller"', () => {
    expect(stockOutReason({ id: 12, callerName: 'Sister Agnes' })).toBe('Benevolent request #12 — Sister Agnes');
    expect(stockOutReason({ id: 12, callerName: '  ' })).toBe('Benevolent request #12 — unnamed caller');
    expect(stockOutReason({ id: 3, callerName: '' })).toBe('Benevolent request #3 — unnamed caller');
  });
});
