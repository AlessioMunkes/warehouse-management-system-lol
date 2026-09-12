// ─────────────────────────────────────────────────────────────
// server/src/providers/pdf.provider.js
//
// Section 18A certificate PDF generation (pdfkit).
// Keeps PDF layout out of donation.service.js — the service passes
// plain snapshots, this module returns { buffer, filename, contentType }.
// ─────────────────────────────────────────────────────────────
import PDFDocument from 'pdfkit';

const generateSection18APdf = async ({
  certificateNumber,
  issueDate,
  settings = {},
  donor = {},
  donation = {},
}) => {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  const chunks = [];

  const done = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  const orgName = settings.organisation_name || settings.pbo_name || 'Ladles of Love';
  const pboNumber = settings.pbo_number || '';
  const pbaDeclaration = settings.pba_declaration || '';
  const contactEmail = settings.contact_email || '';
  const contactPhone = settings.contact_phone || '';

  doc.fontSize(20).font('Helvetica-Bold').text('Section 18A Tax Certificate', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(12).font('Helvetica').text(orgName, { align: 'center' });
  if (pboNumber) doc.fontSize(10).text(`PBO Number: ${pboNumber}`, { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(11).font('Helvetica-Bold').text('Certificate details');
  doc.font('Helvetica').fontSize(10);
  doc.text(`Certificate number: ${certificateNumber}`);
  doc.text(`Issue date: ${issueDate}`);
  doc.moveDown(0.75);

  doc.fontSize(11).font('Helvetica-Bold').text('Donor');
  doc.font('Helvetica').fontSize(10);
  doc.text(`Name: ${donor.name || '—'}`);
  doc.text(`Contact: ${donor.contact || '—'}`);
  doc.text(`Tax reference: ${donor.taxReference || '—'}`);
  doc.moveDown(0.75);

  doc.fontSize(11).font('Helvetica-Bold').text('Donation');
  doc.font('Helvetica').fontSize(10);
  doc.text(`Donation ID: ${donation.id ?? '—'}`);
  doc.text(`Category: ${donation.donation_category || '—'}`);
  doc.text(`Estimated value (ZAR): ${donation.estimated_value_zar ?? '—'}`);
  doc.text(`Received: ${donation.received_at || '—'}`);
  if (Array.isArray(donation.items) && donation.items.length) {
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').text('Items:');
    doc.font('Helvetica');
    donation.items.forEach((item, idx) => {
      doc.text(
        `${idx + 1}. ${item.description || 'Item'} — ${item.quantity ?? ''} ${item.unit || ''}`.trim()
      );
    });
  }
  doc.moveDown(1);

  if (pbaDeclaration) {
    doc.fontSize(9).font('Helvetica-Oblique').text(pbaDeclaration);
    doc.moveDown(0.5);
  }

  doc.fontSize(9).font('Helvetica');
  if (contactEmail) doc.text(`Contact: ${contactEmail}`);
  if (contactPhone) doc.text(`Phone: ${contactPhone}`);

  doc.end();
  await done;

  return {
    buffer: Buffer.concat(chunks),
    filename: `section-18a-${certificateNumber}.pdf`,
    contentType: 'application/pdf',
  };
};

export default { generateSection18APdf };
