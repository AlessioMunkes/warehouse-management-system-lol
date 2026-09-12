// ─────────────────────────────────────────────────────────────
// server/__tests__/donation.emailHistory.repository.test.js
//
// donation.repository listEmailHistory / logDonationEmail with a mocked
// pg pool — no database. Covers the SQL contract for persistent Email
// History: newest-first, search (recipient, donor, donation ID,
// subject), type/status filters, and full-field persistence for both
// SENT and FAILED rows.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach, vi } from 'vitest';

const query = vi.fn();

vi.mock('../src/config/db.js', () => ({
  default: { query },
}));

// stock.repository imports the same pool — the mock above covers it.
const donationRepo = (await import('../src/repositories/donation.repository.js')).default;

beforeEach(() => {
  query.mockReset();
});

describe('listEmailHistory — ordering, search, filters', () => {
  it('orders newest first with no filters', async () => {
    query.mockResolvedValue({ rows: [] });

    await donationRepo.listEmailHistory({});

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY l\.created_at DESC, l\.id DESC/);
    expect(sql).not.toMatch(/ILIKE/);
    expect(params.slice(-2)).toEqual([200, 0]);
  });

  it('searches recipient, donor, donation ID and subject', async () => {
    query.mockResolvedValue({ rows: [] });

    await donationRepo.listEmailHistory({ search: 'donor@example.org' });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/recipient_email/);
    expect(sql).toMatch(/donor_name/);
    expect(sql).toMatch(/CAST\(l\.donation_id AS TEXT\)/);
    expect(sql).toMatch(/l\.subject/);
    expect(params.slice(0, 4)).toEqual([
      '%donor@example.org%',
      '%donor@example.org%',
      '%donor@example.org%',
      '%donor@example.org%',
    ]);
  });

  it('filters by canonical type and status', async () => {
    query.mockResolvedValue({ rows: [] });

    await donationRepo.listEmailHistory({ emailType: 'THANK_YOU', status: 'SENT' });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/l\.email_type = ANY/);
    expect(sql).toMatch(/l\.status = ANY/);
    expect(params).toContainEqual(['THANK_YOU', 'thank_you']);
    expect(params).toContainEqual(['SENT', 'sent']);
  });

  it('accepts legacy spellings for type and status filters', async () => {
    query.mockResolvedValue({ rows: [] });

    await donationRepo.listEmailHistory({ emailType: 'section18a_certificate', status: 'failed' });

    const [, params] = query.mock.calls[0];
    expect(params).toContainEqual(['SECTION_18A', 'section18a_certificate']);
    expect(params).toContainEqual(['FAILED', 'failed']);
  });
});

describe('logDonationEmail — full-field persistence', () => {
  it('persists a successful send with all required fields', async () => {
    query.mockResolvedValue({ rows: [{ id: 1 }] });

    const row = await donationRepo.logDonationEmail({
      donationId: 7,
      donorId: null,
      certificateId: null,
      emailType: 'THANK_YOU',
      recipient: 'donor@example.org',
      recipientEmail: 'donor@example.org',
      recipientName: 'Donor One',
      subject: 'Thank you for your donation',
      status: 'SENT',
      providerMessageId: 'gmail-1',
      gmailMessageId: 'gmail-1',
      gmailThreadId: 'thread-9',
      errorMessage: null,
      sentByUserId: 42,
    });

    expect(row).toEqual({ id: 1 });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO donation_email_logs/);
    expect(sql).toMatch(/recipient_email/);
    expect(sql).toMatch(/gmail_message_id/);
    expect(sql).toMatch(/gmail_thread_id/);
    expect(sql).toMatch(/sent_by_user_id/);
    expect(params).toContain('donor@example.org');
    expect(params).toContain('THANK_YOU');
    expect(params).toContain('SENT');
    expect(params).toContain('gmail-1');
    expect(params).toContain('thread-9');
  });

  it('persists a failed send with the error message', async () => {
    query.mockResolvedValue({ rows: [{ id: 2 }] });

    await donationRepo.logDonationEmail({
      donationId: 7,
      emailType: 'SECTION_18A',
      recipient: 'tax@example.test',
      subject: 'Your Section 18A tax certificate',
      status: 'FAILED',
      errorMessage: 'Gmail API send failed.',
      sentByUserId: 42,
    });

    const [, params] = query.mock.calls[0];
    expect(params).toContain('FAILED');
    expect(params).toContain('Gmail API send failed.');
  });

  it('canonicalises legacy thank_you / sent spellings on write', async () => {
    query.mockResolvedValue({ rows: [{ id: 3 }] });

    await donationRepo.logDonationEmail({
      donationId: 7,
      emailType: 'thank_you',
      recipient: 'donor@example.org',
      subject: 'Thank you for your donation',
      status: 'sent',
      providerMessageId: 'legacy-1',
    });

    const [, params] = query.mock.calls[0];
    expect(params).toContain('THANK_YOU');
    expect(params).toContain('SENT');
  });
});
