// ─────────────────────────────────────────────────────────────
// client/src/features/feedTheSoil/dropPointPoster.js
//
// The A4 poster hung at a Feed the Soil drop-off site: the site's name,
// a big QR code, and three lines saying what to do. The code opens the
// public drop-off form for that site (/fts/:token), where the person
// enters the weight and, if they want one, an email for a thank-you.
//
// Drawn with jsPDF and the same vector QR the pallet labels use
// (palletLabelPdf.drawQr), and opened in the browser's PDF viewer to
// print; nothing is stored.
// ─────────────────────────────────────────────────────────────
import { jsPDF } from 'jspdf';
import { drawQr, publicAppOrigin } from '../packing/palletLabelPdf';

export const dropOffUrlFor = (token, origin) =>
  `${(origin || publicAppOrigin()).replace(/\/+$/, '')}/fts/${token}`;

export const buildDropPointPoster = (site, { origin } = {}) => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const width = 210;
  const url = dropOffUrlFor(site.publicToken, origin);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(30);
  pdf.text('Feed the Soil', width / 2, 32, { align: 'center' });
  pdf.setFontSize(20);
  pdf.text(pdf.splitTextToSize(site.name, 170), width / 2, 46, { align: 'center' });

  const size = 120;
  drawQr(pdf, url, (width - size) / 2, 62, size);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(15);
  const steps = [
    '1. Weigh your compost.',
    '2. Scan this code with your phone camera.',
    '3. Enter the weight. Add your email if you would like a thank-you.',
  ];
  steps.forEach((line, i) => pdf.text(line, 25, 200 + i * 10));

  pdf.setFontSize(10);
  pdf.setTextColor(90);
  pdf.text(url, width / 2, 240, { align: 'center' });
  pdf.text('Thank you for feeding the soil that grows food for children. Ladles of Love', width / 2, 280, { align: 'center' });
  return pdf;
};

export const openDropPointPoster = (site, opts) => {
  const pdf = buildDropPointPoster(site, opts);
  return Boolean(window.open(pdf.output('bloburl'), '_blank'));
};
