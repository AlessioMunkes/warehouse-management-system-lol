// ─────────────────────────────────────────────────────────────
// server/__tests__/purchaseOrder.quickbooksImport.service.test.js
//
// Validation around the QuickBooks links import: what is refused
// before the database is touched, how untrustworthy rows are marked,
// and how the repository's answers are slotted back in order.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const repoMock = {
  previewQuickbooksLinks: vi.fn(),
  applyQuickbooksLinks: vi.fn(),
};
vi.mock('../src/repositories/purchaseOrder.repository.js', () => ({ default: repoMock }));
vi.mock('../src/features/communications/communications.service.js', () => ({ default: { send: vi.fn() } }));

const { default: service } = await import('../src/services/purchaseOrder.service.js');

const pair = (poNumber, quickbooksNumber, overwrite) => ({ poNumber, quickbooksNumber, overwrite });

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.previewQuickbooksLinks.mockImplementation(async (ps) => ps.map(() => ({ status: 'will_link', poId: 1 })));
  repoMock.applyQuickbooksLinks.mockImplementation(async (ps) => ps.map(() => ({ status: 'linked' })));
});

describe.each([
  ['preview', (b) => service.previewQuickbooksImport(b)],
  ['apply', (b) => service.applyQuickbooksImport(b, 7)],
])('%s — input checks', (_name, run) => {
  it('refuses an empty or missing list', async () => {
    await expect(run({})).rejects.toMatchObject({ status: 400 });
    await expect(run({ pairs: [] })).rejects.toMatchObject({ status: 400 });
  });

  it('refuses more than 500 rows with a message that says what to do', async () => {
    const pairs = Array.from({ length: 501 }, (_, i) => pair(`PO-2026-${1000 + i}`, `QB-${i}`));
    await expect(run({ pairs })).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/501 rows.*up to 500.*split the file/i),
    });
    expect(repoMock.previewQuickbooksLinks).not.toHaveBeenCalled();
    expect(repoMock.applyQuickbooksLinks).not.toHaveBeenCalled();
  });

  it('accepts exactly 500 rows', async () => {
    const pairs = Array.from({ length: 500 }, (_, i) => pair(`PO-2026-${1000 + i}`, `QB-${i}`));
    await expect(run({ pairs })).resolves.toBeTruthy();
  });

  it('marks malformed rows invalid and never sends them to the database', async () => {
    const out = await run({ pairs: [
      pair('banana', 'QB-1'),
      pair('PO-2026-0101', '   '),
      pair('PO-2026-0102', 'Q'.repeat(51)),
      pair('PO-2026-0103', 'QB-3'),
    ] });
    expect(out.rows.map((r) => r.status)).toEqual(['invalid', 'invalid', 'invalid', expect.any(String)]);
    const sent = (repoMock.previewQuickbooksLinks.mock.calls[0] ?? repoMock.applyQuickbooksLinks.mock.calls[0])[0];
    expect(sent.map((p) => p.poNumber)).toEqual(['PO-2026-0103']);
  });

  it('flags every row that repeats a PO number or a QuickBooks number, and links none of them', async () => {
    const out = await run({ pairs: [
      pair('PO-2026-0101', 'QB-1'),
      pair('PO-2026-0101', 'QB-2'),   // same PO twice
      pair('PO-2026-0102', 'QB-9'),
      pair('PO-2026-0103', 'QB-9'),   // same QuickBooks number twice
      pair('PO-2026-0104', 'QB-4'),
    ] });
    expect(out.rows.map((r) => r.status)).toEqual(['duplicate', 'duplicate', 'duplicate', 'duplicate', expect.not.stringMatching(/duplicate/)]);
    const sent = (repoMock.previewQuickbooksLinks.mock.calls[0] ?? repoMock.applyQuickbooksLinks.mock.calls[0])[0];
    expect(sent.map((p) => p.poNumber)).toEqual(['PO-2026-0104']);
  });

  it('normalises case and surrounding spaces, and returns counts per status', async () => {
    const out = await run({ pairs: [pair('  po-2026-0101 ', ' QB-1 '), pair('nope', 'QB-2')] });
    expect(out.rows[0]).toMatchObject({ poNumber: 'PO-2026-0101', quickbooksNumber: 'QB-1' });
    expect(out.counts.invalid).toBe(1);
  });

  it('does not leak database ids in the rows', async () => {
    repoMock.previewQuickbooksLinks.mockResolvedValue([{ status: 'will_link', poId: 12, displacedPoId: 5 }]);
    repoMock.applyQuickbooksLinks.mockResolvedValue([{ status: 'linked', poId: 12 }]);
    const out = await run({ pairs: [pair('PO-2026-0101', 'QB-1')] });
    expect(out.rows[0]).not.toHaveProperty('poId');
    expect(out.rows[0]).not.toHaveProperty('displacedPoId');
  });
});

describe('apply — overwrite and failures', () => {
  it('passes the overwrite flag through only when it is exactly true', async () => {
    await service.applyQuickbooksImport({ pairs: [
      pair('PO-2026-0101', 'QB-1', true),
      pair('PO-2026-0102', 'QB-2', 'yes'),
      pair('PO-2026-0103', 'QB-3'),
    ] }, 7);
    const sent = repoMock.applyQuickbooksLinks.mock.calls[0][0];
    expect(sent.map((p) => p.overwrite)).toEqual([true, false, false]);
    expect(repoMock.applyQuickbooksLinks.mock.calls[0][1]).toBe(7);
  });

  it('answers 409 and says nothing was changed when a unique violation loses a race', async () => {
    repoMock.applyQuickbooksLinks.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(service.applyQuickbooksImport({ pairs: [pair('PO-2026-0101', 'QB-1')] }, 7))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/nothing was changed/i) });
  });

  it('lets any other failure through untouched', async () => {
    repoMock.applyQuickbooksLinks.mockRejectedValue(new Error('connection lost'));
    await expect(service.applyQuickbooksImport({ pairs: [pair('PO-2026-0101', 'QB-1')] }, 7))
      .rejects.toThrow('connection lost');
  });

  it('keeps results in the order the rows were submitted', async () => {
    repoMock.applyQuickbooksLinks.mockResolvedValue([{ status: 'linked' }, { status: 'not_found' }]);
    const out = await service.applyQuickbooksImport({ pairs: [
      pair('PO-2026-0101', 'QB-1'), pair('bad', 'QB-2'), pair('PO-2026-9999', 'QB-9'),
    ] }, 7);
    expect(out.rows.map((r) => [r.poNumber, r.status])).toEqual([
      ['PO-2026-0101', 'linked'], ['BAD', 'invalid'], ['PO-2026-9999', 'not_found'],
    ]);
    expect(out.counts).toEqual({ linked: 1, invalid: 1, not_found: 1 });
  });
});
