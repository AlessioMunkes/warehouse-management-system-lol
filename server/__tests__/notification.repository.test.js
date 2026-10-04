import { describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../src/config/db.js', () => ({
  default: { query: (...args) => query(...args) },
}));

const { createNotification, default: repo } = await import('../src/repositories/notification.repository.js');

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
    ['donation_review', ['manager', 'admin']],
    ['section18a_handoff_failed', ['manager', 'admin']],
    ['section18a_email_failed', ['manager', 'admin']],
    ['stock_expiry_warning_1w', ['manager']],
    ['picking_slip_created', ['warehouse_worker', 'manager']],
  ])('targets %s notifications to %j', async (type, targetRoles) => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    await createNotification(client, {
      type,
      title: 'Matrix notification',
    });

    expect(client.query.mock.calls[0][1][5]).toEqual(targetRoles);
  });
});

describe('what each role reads', () => {
  // Older rows keep the recipients they were written with, so the read
  // also hides the types a role is no longer meant to get.
  const hiddenFor = async (role) => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
    await repo.listForUser(1, role);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/NOT \(n\.type = ANY\(\$3\)\)/);
    return params[2];
  };

  it('keeps floor and stock notifications off the admin feed', async () => {
    const hidden = await hiddenFor('admin');
    expect(hidden).toEqual(expect.arrayContaining(['picking_slip_created', 'low_stock', 'purchase_order_needs_attention']));
    expect(hidden).not.toContain('donation_review');
  });

  it('keeps the floor off the manager feed, but not the donation work', async () => {
    const hidden = await hiddenFor('manager');
    expect(hidden).toEqual(expect.arrayContaining(['picking_slip_released']));
    expect(hidden).not.toContain('donation_review');
    expect(hidden).not.toContain('section18a_handoff_failed');
    expect(hidden).not.toContain('section18a_email_failed');
    expect(hidden).not.toContain('picking_slip_created');
    expect(hidden).not.toContain('low_stock');
  });
});
