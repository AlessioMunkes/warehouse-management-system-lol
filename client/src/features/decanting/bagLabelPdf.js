// ─────────────────────────────────────────────────────────────
// client/src/features/decanting/bagLabelPdf.js
//
// Stickers for the bags a decanting run made: one per bag, each with
// the product, the bag size, the day it was decanted, a line to write
// the use-by date on, and a Code 128 barcode.
//
// WHY A BARCODE ON A BAG WE FILLED OURSELVES
// Decanted bags are what the packing check most needs and could not
// do: loose rice in a plain bag has no barcode, and a 1 kg bag and a
// 2 kg bag of the same rice look alike. The code names both the
// product and the size (ownBagCode in productCode.js: "LOL12K2000" is
// product 12 in 2 kg bags), and it is linked to the product with that
// size as its units per scan before the sheet is printed, so a scan at
// packing counts the right amount.
//
// THE SHEET is A4 with 21 labels, 3 across and 7 down, 63.5 x 38.1 mm:
// the most common office label sheet (L7160 and its copies). Printed on
// plain paper it still works, cut out and taped on.
//
// Code 128 because every scanner reads it: the phone camera in product
// mode and the cheapest USB scanner. jsbarcode works out the bars; this
// file draws them as rectangles, so there is no image to blur.
// ─────────────────────────────────────────────────────────────
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

const PAGE = { cols: 3, rows: 7, left: 7.2, top: 15.15, w: 63.5, h: 38.1, pitchX: 66.04, pitchY: 38.1 };
const PAD = 3;
const BAR_H = 10;
const PER_PAGE = PAGE.cols * PAGE.rows;

// '1101001...' for one code: a 1 is a bar module, a 0 a space.
export const barModules = (code) => {
  const target = {};
  JsBarcode(target, code, { format: 'CODE128' });
  return target.encodings.map((e) => e.data).join('');
};

// The bars, centred in `width`, as filled rectangles.
const drawBars = (pdf, code, x, y, width, height) => {
  const modules = barModules(code);
  const module = Math.min(0.5, width / modules.length);
  const start = x + (width - module * modules.length) / 2;
  let run = 0;
  for (let i = 0; i <= modules.length; i += 1) {
    if (modules[i] === '1') { run += 1; continue; }
    if (run) pdf.rect(start + (i - run) * module, y, run * module, height, 'F');
    run = 0;
  }
};

const longDate = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};

// bags: [{ label: '2kg', count: 5, code: 'LOL12K2000' }]
export const buildBagLabelPdf = ({ productName, bags, decantedOn }) => {
  const labels = (bags ?? []).flatMap((b) => Array.from({ length: Math.max(0, Number(b.count) || 0) }, () => b));
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.setTextColor(0, 0, 0);
  pdf.setFillColor(0, 0, 0);

  labels.forEach((bag, i) => {
    if (i > 0 && i % PER_PAGE === 0) pdf.addPage();
    const slot = i % PER_PAGE;
    const x = PAGE.left + (slot % PAGE.cols) * PAGE.pitchX;
    const y = PAGE.top + Math.floor(slot / PAGE.cols) * PAGE.pitchY;
    const inner = PAGE.w - PAD * 2;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    const name = pdf.splitTextToSize(String(productName ?? ''), inner).slice(0, 2);
    pdf.text(name, x + PAD, y + PAD + 3.5);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const below = y + PAD + 3.5 + name.length * 4;
    pdf.text(`${bag.label} bag · Decanted ${longDate(decantedOn)}`, x + PAD, below);
    pdf.text('Use by: ______________', x + PAD, below + 4);

    drawBars(pdf, bag.code, x + PAD, y + PAGE.h - PAD - BAR_H - 3, inner, BAR_H);
    pdf.setFontSize(7);
    pdf.text(bag.code, x + PAGE.w / 2, y + PAGE.h - PAD, { align: 'center' });
  });

  return { pdf, labelCount: labels.length, pageCount: Math.ceil(labels.length / PER_PAGE) };
};

// Opens in the browser's own PDF viewer, like the pallet labels.
export const openBagLabelPdf = (args) => {
  const { pdf, labelCount } = buildBagLabelPdf(args);
  if (labelCount === 0) return { opened: false, labelCount };
  const opened = window.open(pdf.output('bloburl'), '_blank');
  return { opened: Boolean(opened), labelCount };
};

export default { buildBagLabelPdf, openBagLabelPdf, barModules };
