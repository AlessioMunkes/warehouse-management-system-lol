// What "Create a new slip" sends. A soup or dignity kitchen is named on
// the slip and has no centre; the wrapper used to drop the kitchen's kind
// and name, so the server took it for a centre and answered "ECD is
// required."
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSlip } from '../services/pickingAPI';

const sentBody = () => JSON.parse(fetch.mock.calls[0][1].body);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { slipId: 1 } }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  })));
});
afterEach(() => vi.unstubAllGlobals());

describe('createSlip', () => {
  it('sends a kitchen by kind and name, with no centre or cohort', async () => {
    const items = [{ productId: 9, quantity: 12, unit: 'kg' }];
    await createSlip({ beneficiaryKind: 'soup_kitchen', beneficiaryName: 'Rondebosch Soup Kitchen', dispatchDate: '2026-10-28', items });

    expect(sentBody()).toEqual({ beneficiaryKind: 'soup_kitchen', beneficiaryName: 'Rondebosch Soup Kitchen', dispatchDate: '2026-10-28', items });
  });

  it('sends the Dignity Kitchen the same way', async () => {
    await createSlip({ beneficiaryKind: 'dignity_kitchen', beneficiaryName: 'Dignity Kitchen', dispatchDate: '2026-10-28', items: [] });

    expect(sentBody()).toMatchObject({ beneficiaryKind: 'dignity_kitchen', beneficiaryName: 'Dignity Kitchen' });
    expect(sentBody()).not.toHaveProperty('ecdId');
  });

  it('still sends a centre by its id and cohort', async () => {
    await createSlip({ ecdId: 14, dispatchDate: '2026-10-29', cohort: 'thursday', force: true });

    expect(sentBody()).toEqual({ ecdId: 14, dispatchDate: '2026-10-29', cohort: 'thursday', force: true });
  });
});
