// ─────────────────────────────────────────────────────────────
// client/src/features/pickingSlips/pickingSlipPdf.js
//
// The printed picking slip: the sheet that goes on the pallet. Laid out
// like the paper slip the warehouse already uses — the centre's name,
// pickup day, warehouse and week number, then one row per item with
// blank QTY Filled / Check / Comment columns to write in, and the
// driver's sign-off along the bottom — with two additions: the logo,
// and the pallet's QR code, so the same sheet opens the pallet on a
// phone.
//
// Drawn straight into jsPDF, like palletLabelPdf.js and for its reasons:
// the QR has to stay vector to scan reliably, and a week's batch is a
// page per slip with no DOM to rasterise.
//
// NOT STORED. Built on demand from the slip and its items.
// ─────────────────────────────────────────────────────────────
import { jsPDF } from 'jspdf';
import { drawQr, shortCodeOf, slipUrlFor } from '../packing/palletLabelPdf';

export const SLIP_LOGO_URL = '/images/pdf_logo.png';
export const DEFAULT_WAREHOUSE_NAME = 'LoL Cape Town';

// ── Page geometry, in mm (A4 portrait) ────────────────────────
const PAGE_H = 297;
const LEFT = 15;
const RIGHT = 195;
const QR_SIZE = 30;
const LOGO_W = 19;
const LOGO_H = 24;   // pdf_logo.png is 2136 x 2695
const ROW_H = 7.6;
const TABLE_BOTTOM = 252;   // leaves room for the sign-off
const BLANK_ROWS = 2;       // spare lines for an item added by hand

// Column left edges, then the table's right edge.
const COLS = [
  { key: 'qty',     label: 'QTY',        x: LEFT },
  { key: 'item',    label: 'Item',       x: 41 },
  { key: 'filled',  label: 'QTY Filled', x: 113 },
  { key: 'check',   label: 'Check',      x: 139 },
  { key: 'comment', label: 'Comment',    x: 156 },
];
const colRight = (i) => (i + 1 < COLS.length ? COLS[i + 1].x : RIGHT);

// ── Dates ─────────────────────────────────────────────────────
// The slip's calendar day as plain UTC, so no browser timezone can move
// it. dispatch_date_iso is 'YYYY-MM-DD'.
const dayOf = (slip) => {
  const iso = slip.dispatch_date_iso ?? String(slip.dispatch_date ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : null;
};

const COHORT_DAY = { tuesday: 'Tuesday', thursday: 'Thursday' };

export const pickupDayOf = (slip) => {
  const day = dayOf(slip);
  if (day) return day.toLocaleDateString('en-ZA', { weekday: 'long', timeZone: 'UTC' });
  return COHORT_DAY[slip.cohort] ?? '';
};

// ISO 8601 week number: the week with the year's first Thursday is week 1.
export const weekNumberOf = (slip) => {
  const day = dayOf(slip);
  if (!day) return null;
  const thursday = new Date(day);
  thursday.setUTCDate(day.getUTCDate() + 3 - ((day.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7));
  return 1 + Math.round((thursday - firstThursday) / (7 * 24 * 60 * 60 * 1000));
};

// Two decimals, as on the paper slip, with the unit so "3.00" is not
// left to mean crates on one line and kilograms on the next.
export const quantityText = (item) => {
  const n = Number(item.required_quantity);
  const qty = Number.isFinite(n) ? n.toFixed(2) : String(item.required_quantity ?? '');
  return item.unit ? `${qty} ${item.unit}` : qty;
};

// ── Drawing ───────────────────────────────────────────────────
const drawTableHeader = (pdf, y) => {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  COLS.forEach((col) => pdf.text(col.label, col.x + 1.5, y + ROW_H - 2.4));
  return y + ROW_H;
};

// The grid for the rows between top and bottom, drawn once the rows are
// placed so the lines sit over nothing.
const drawGrid = (pdf, top, bottom) => {
  pdf.setDrawColor(60, 60, 60);
  pdf.setLineWidth(0.25);
  for (let y = top; y <= bottom + 0.01; y += ROW_H) pdf.line(LEFT, y, RIGHT, y);
  COLS.forEach((col) => pdf.line(col.x, top, col.x, bottom));
  pdf.line(RIGHT, top, RIGHT, bottom);
};

const drawHeader = (pdf, slip, { origin, logo, warehouseName, continued }) => {
  const name = slip.beneficiary_name || slip.ecd_name || 'Community partner';
  let textX = LEFT;

  if (logo) {
    // One alias for the whole batch, so the image is stored once however
    // many slips are printed.
    pdf.addImage(logo, 'PNG', LEFT, 12, LOGO_W, LOGO_H, 'slip-logo', 'FAST');
    textX = LEFT + LOGO_W + 6;
  }

  // The QR, top right, with the typed code under it for anyone who
  // cannot scan.
  const qrX = RIGHT - QR_SIZE;
  const hasCode = Boolean(slip.public_token);
  if (hasCode) {
    drawQr(pdf, slipUrlFor(slip.public_token, origin), qrX, 12, QR_SIZE);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(60, 60, 60);
    pdf.text('Scan to open this pallet', qrX + QR_SIZE / 2, 12 + QR_SIZE + 3.6, { align: 'center' });
    pdf.setFont('courier', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(0, 0, 0);
    pdf.text(shortCodeOf(slip.public_token), qrX + QR_SIZE / 2, 12 + QR_SIZE + 8.2, { align: 'center' });
  }

  // The centre's name, shrunk before it is ever cut: the sheet is
  // matched to the pallet by it.
  const nameWidth = (hasCode ? qrX - 6 : RIGHT) - textX;
  let size = 20;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(size);
  let lines = pdf.splitTextToSize(name, nameWidth);
  while (lines.length > 2 && size > 12) {
    size -= 2;
    pdf.setFontSize(size);
    lines = pdf.splitTextToSize(name, nameWidth);
  }
  pdf.setTextColor(0, 0, 0);
  lines.slice(0, 2).forEach((line, i) => pdf.text(line, textX, 22 + i * (size * 0.42)));

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(60, 60, 60);
  pdf.text(continued ? 'Picking slip (continued)' : 'Picking slip', textX, 22 + Math.min(lines.length, 2) * (size * 0.42) + 1.5);

  // Pickup day · warehouse · week, in the paper slip's order.
  const week = weekNumberOf(slip);
  const facts = [
    `Pickup Day: ${pickupDayOf(slip) || '—'}`,
    `Warehouse: ${warehouseName}`,
    `Week Number: ${week ? `Week ${week}` : '—'}`,
  ];
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(0, 0, 0);
  const factsY = 12 + QR_SIZE + 16;
  pdf.text(facts[0], LEFT, factsY);
  pdf.text(facts[1], 78, factsY);
  pdf.text(facts[2], RIGHT, factsY, { align: 'right' });

  return factsY + 5;   // where the table starts
};

const drawSignOff = (pdf) => {
  const rule = (label, x, y, lineTo) => {
    pdf.text(label, x, y);
    const start = x + pdf.getTextWidth(label) + 1.5;
    pdf.line(start, y + 0.6, lineTo, y + 0.6);
  };
  pdf.setFont('times', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(0, 0, 0);
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.2);
  const y1 = PAGE_H - 26;
  rule('Driver Name:', LEFT, y1, 84);
  rule('Signature:', 87, y1, 150);
  rule('Date:', 153, y1, RIGHT);
  const y2 = PAGE_H - 17;
  rule('Invoice #', 40, y2, 84);
  rule('Order checked by:', 87, y2, 170);
};

// One slip. Runs onto further pages when it has more lines than fit;
// every page of it carries the header and the code.
const drawSlip = (pdf, slip, opts) => {
  const rows = [...(slip.items ?? []), ...Array.from({ length: BLANK_ROWS }, () => null)];
  let index = 0;
  let pages = 0;

  while (index < rows.length || pages === 0) {
    if (pages > 0) pdf.addPage();
    const tableTop = drawHeader(pdf, slip, { ...opts, continued: pages > 0 });
    let y = drawTableHeader(pdf, tableTop);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(0, 0, 0);
    while (index < rows.length && y + ROW_H <= TABLE_BOTTOM) {
      const item = rows[index];
      if (item) {
        pdf.text(quantityText(item), COLS[0].x + 1.5, y + ROW_H - 2.4);
        const width = colRight(1) - COLS[1].x - 3;
        const label = pdf.splitTextToSize(String(item.product_name ?? ''), width)[0] ?? '';
        pdf.text(label, COLS[1].x + 1.5, y + ROW_H - 2.4);
      }
      y += ROW_H;
      index += 1;
    }
    drawGrid(pdf, tableTop, y);
    pages += 1;
  }

  drawSignOff(pdf);
  return pages;
};

// ── Public API ────────────────────────────────────────────────
// `slips` carry their items (fetchPickingSlip's shape). Returns the
// jsPDF instance rather than opening it, so the caller decides and this
// stays testable without a browser window.
export const buildPickingSlipPdf = (slips, { origin, logo = null, warehouseName = DEFAULT_WAREHOUSE_NAME } = {}) => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const list = (slips || []).filter(Boolean);
  let pageCount = 0;

  list.forEach((slip, i) => {
    if (i > 0) pdf.addPage();
    pageCount += drawSlip(pdf, slip, { origin, logo, warehouseName });
  });

  return { pdf, slipCount: list.length, pageCount };
};

// The logo as a data URL, read once per page load. A missing logo is
// not a reason to refuse to print: the slip is drawn without it.
//
// Drawn down to print size first. pdf_logo.png is 2136 x 2695, and
// embedded as it stands it makes an 11 MB file out of a one-page slip;
// at 19mm wide, 360px is already past what a printer resolves.
const LOGO_PX_W = 360;
let logoPromise = null;
export const loadSlipLogo = () => {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = LOGO_PX_W;
          canvas.height = Math.round(LOGO_PX_W * (img.naturalHeight / img.naturalWidth));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = SLIP_LOGO_URL;
    });
  }
  return logoPromise;
};

export default { buildPickingSlipPdf, loadSlipLogo, pickupDayOf, weekNumberOf, quantityText };
