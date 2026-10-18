// ─────────────────────────────────────────────────────────────
// client/src/tests/SlipCode.test.js
//
// What a scanned or typed pallet code is taken to mean, and where each
// kind of staff member is sent with it.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { parseSlipCode, staffDestination } from '../features/scan/slipCode';
import { slipUrlFor, shortCodeOf } from '../features/packing/palletLabelPdf';

const TOKEN = 'cc950bab-34b2-4606-81c3-a82973b54530';

describe('parseSlipCode: the full link in the QR', () => {
  it('takes the token out of the link the printed QR holds', () => {
    expect(parseSlipCode(slipUrlFor(TOKEN, 'https://wms-lol.onrender.com')))
      .toEqual({ kind: 'token', token: TOKEN });
  });

  it('reads back exactly what the label printer encodes, for any origin', () => {
    for (const origin of ['http://localhost:5173', 'https://wms-lol.onrender.com', 'https://app.example.org']) {
      expect(parseSlipCode(slipUrlFor(TOKEN, origin))).toEqual({ kind: 'token', token: TOKEN });
    }
  });

  it('ignores a query string, a hash and a trailing slash', () => {
    expect(parseSlipCode(`https://x.test/slip/${TOKEN}/`)).toEqual({ kind: 'token', token: TOKEN });
    expect(parseSlipCode(`https://x.test/slip/${TOKEN}?w=cape-town#top`)).toEqual({ kind: 'token', token: TOKEN });
  });

  it('lower-cases the token and trims the scan', () => {
    expect(parseSlipCode(`  HTTPS://X.TEST/slip/${TOKEN.toUpperCase()}\n`)).toEqual({ kind: 'token', token: TOKEN });
  });

  it('accepts the bare token', () => {
    expect(parseSlipCode(TOKEN)).toEqual({ kind: 'token', token: TOKEN });
  });
});

describe('parseSlipCode: the 6 characters under the QR', () => {
  it('reads the printed short code', () => {
    expect(parseSlipCode(shortCodeOf(TOKEN))).toEqual({ kind: 'code', code: 'b54530' });
  });

  it('is case-insensitive and forgives a stray space or hyphen', () => {
    expect(parseSlipCode('B54530')).toEqual({ kind: 'code', code: 'b54530' });
    expect(parseSlipCode(' b54 530 ')).toEqual({ kind: 'code', code: 'b54530' });
    expect(parseSlipCode('b54-530')).toEqual({ kind: 'code', code: 'b54530' });
  });

  it.each(['b5453', 'b545300', 'zzzzzz', 'b5453!', ''])('refuses %j', (text) => {
    expect(parseSlipCode(text)).toBeNull();
  });
});

describe('parseSlipCode: anything that is not one of our pallet codes', () => {
  it.each([
    ['another site', 'https://example.com/'],
    ['a plain web address', 'https://www.ladlesoflove.org.za/individual-volunteer/'],
    ['a slip path with no token', 'https://x.test/slip/'],
    ['a slip path with a short token', 'https://x.test/slip/1234'],
    ['a token in the wrong place', `https://x.test/other/${TOKEN}`],
    ['a token with something after it', `https://x.test/slip/${TOKEN}/claim`],
    ['a link that is not http', `javascript:alert(1)//slip/${TOKEN}`],
    ['a file link', `file:///slip/${TOKEN}`],
    ['text', 'hello there'],
    ['a wifi QR', 'WIFI:T:WPA;S:guest;P:secret;;'],
    ['a contact card', 'BEGIN:VCARD\nVERSION:3.0\nFN:Someone\nEND:VCARD'],
    ['a volunteer attendance QR from another system', 'https://vms.example.org/checkin/8d1f7c5e'],
  ])('refuses %s', (_label, text) => {
    expect(parseSlipCode(text)).toBeNull();
  });

  it('refuses things that are not text, and absurdly long text', () => {
    expect(parseSlipCode(null)).toBeNull();
    expect(parseSlipCode(undefined)).toBeNull();
    expect(parseSlipCode(42)).toBeNull();
    expect(parseSlipCode(`https://x.test/slip/${TOKEN}${'a'.repeat(3000)}`)).toBeNull();
  });
});

describe('staffDestination', () => {
  it('sends a worker to the packing screen for that slip', () => {
    expect(staffDestination('warehouse_worker', 21)).toBe('/noc/packing/21');
  });

  // The packing screen is the floor's alone: a manager sent there would
  // be bounced to their dashboard.
  it('sends a manager to Picking slips, opened on that slip', () => {
    expect(staffDestination('manager', 21)).toBe('/noc/picking-slips?open=21');
  });

  it('has nowhere to send an admin, or anyone unknown', () => {
    expect(staffDestination('admin', 21)).toBeNull();
    expect(staffDestination('guest', 21)).toBeNull();
    expect(staffDestination(undefined, 21)).toBeNull();
  });
});
