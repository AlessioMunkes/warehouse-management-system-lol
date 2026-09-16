import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('../src/config/db.js', () => ({
  default: { query },
}));

const repository = (await import('../src/repositories/certificateSettings.repository.js')).default;

const dbRow = {
  id: 1,
  organisation_name: 'Ladles of Love',
  pbo_number: '930000000',
  section18a_reference: '18A-REF',
  contact_email: 'finance@example.org',
  signature_name: 'Authorised Person',
};

beforeEach(() => {
  query.mockReset();
});

describe('certificateSettings.repository', () => {
  it('updates certificate settings with one atomic upsert query', async () => {
    query.mockResolvedValue({ rows: [dbRow] });

    const result = await repository.updateSettings({
      organisation_name: dbRow.organisation_name,
      pbo_number: dbRow.pbo_number,
      section18a_reference: dbRow.section18a_reference,
      contact_email: dbRow.contact_email,
      signature_name: dbRow.signature_name,
    });

    expect(result).toEqual(dbRow);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('INSERT INTO certificate_settings');
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (id) DO UPDATE');
    expect(query.mock.calls[0][0]).toContain('RETURNING *');
    expect(query.mock.calls[0][1]).not.toContain(undefined);
    expect(query.mock.calls[0][1]).not.toContain(null);
  });

  it('resolves null when the database returns no updated row', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(repository.updateSettings(dbRow)).resolves.toBeNull();
  });

  it('does not open an explicit transaction for settings updates', async () => {
    query.mockResolvedValue({ rows: [dbRow] });

    await repository.updateSettings(dbRow);

    const sql = query.mock.calls[0][0];
    expect(sql).not.toMatch(/\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/i);
  });
});
