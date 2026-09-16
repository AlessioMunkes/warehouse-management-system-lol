import { describe, it, expect, vi, beforeEach } from 'vitest';

const client = {
  query: vi.fn(),
  release: vi.fn(),
};

const poolMock = {
  connect: vi.fn(),
  query: vi.fn(),
};

vi.mock('../src/config/db.js', () => ({ default: poolMock }));

const donationRepository = (await import('../src/repositories/donation.repository.js')).default;

beforeEach(() => {
  vi.clearAllMocks();
  poolMock.connect.mockResolvedValue(client);
  client.query.mockImplementation(async (sql, params = []) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (String(sql).includes('FROM donations') && String(sql).includes('FOR UPDATE')) {
      return { rows: [{ id: 42, section_18a_status: 'queued' }] };
    }
    if (String(sql).includes('FROM section18a_certificates') && String(sql).includes('donation_id')) {
      return { rows: [] };
    }
    if (String(sql).includes('pg_advisory_xact_lock')) return { rows: [] };
    if (String(sql).includes('WHERE certificate_number LIKE')) return { rows: [] };
    if (String(sql).includes('INSERT INTO section18a_certificates')) {
      return {
        rows: [{
          id: 1,
          donation_id: params[0],
          certificate_number: params[1],
          issue_date: params[2],
          pdf_content: params[7],
          pdf_filename: params[8],
          pdf_content_type: params[9],
        }],
      };
    }
    return { rows: [] };
  });
});

describe('donation.repository Section 18A certificate numbering', () => {
  it('generates PREFIX-YEAR-000001 certificate numbers', async () => {
    const { certificate } = await donationRepository.createSection18ACertificate({
      donationId: 42,
      issuedBy: 7,
      settings: { certificate_prefix: '18A' },
      donorSnapshot: {},
      donationSnapshot: {},
      buildPdf: vi.fn(async () => ({
        buffer: Buffer.from('%PDF-1.4'),
        filename: 'section-18a-18A-2026-000001.pdf',
        contentType: 'application/pdf',
      })),
    });

    const currentYear = new Date().getFullYear();
    expect(certificate.certificate_number).toBe(`18A-${currentYear}-000001`);
  });
});
