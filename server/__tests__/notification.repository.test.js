import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/db.js', () => ({
  default: {},
}));

const { createNotification } = await import('../src/repositories/notification.repository.js');

describe('createNotification duplicate insert SQL', () => {
  it('casts reused placeholders consistently in the insert and duplicate check', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    await createNotification(client, {
      type: 'low_stock',
      title: 'Low stock',
      body: 'Rice is low',
      entityType: 'product',
      entityId: 7,
      avoidDuplicate: true,
    });

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/\$1::varchar/);
    expect(sql).toMatch(/\$4::varchar/);
    expect(sql).toMatch(/\$5::integer/);
    expect(sql).toMatch(/\$6::text\[\]/);
    expect(params).toEqual([
      'low_stock',
      'Low stock',
      'Rice is low',
      'product',
      7,
      ['manager'],
    ]);
  });

  it.each([
    ['low_stock', ['manager']],
    ['picking_slips_generated', ['manager']],
    ['non_collections_flagged', ['manager']],
    ['purchase_order_needs_attention', ['manager']],
    ['vms_sync_failed', ['manager']],
    ['stock_expiry_2_weeks', ['manager']],
    ['stock_expiry_1_week', ['manager']],
    ['donation_review', ['admin']],
    ['section18a_handoff_failed', ['admin']],
  ])('targets %s notifications to %j', async (type, targetRoles) => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    await createNotification(client, {
      type,
      title: 'Matrix notification',
    });

    expect(client.query.mock.calls[0][1][5]).toEqual(targetRoles);
  });
});
