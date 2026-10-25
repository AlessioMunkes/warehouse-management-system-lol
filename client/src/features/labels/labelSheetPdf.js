// ─────────────────────────────────────────────────────────────
// client/src/features/labels/labelSheetPdf.js
//
// A sheet of barcode stickers the system prints for its own stock:
// decanted bags (decanting/bagLabelPdf.js) and any loose stock item
// (products/PrintLabels.jsx). One sticker per label, each with the item's
// name, a line saying what one label is ("2 kg bag · Decanted 22 Oct
// 2026", "1 crate"), optionally a line to write the use-by date on, and
// a Code 128 barcode with its code printed under it.
//
// THE SHEET is A4 with 21 labels, 3 across and 7 down, 63.5 x 38.1 mm:
// the most common office label sheet (L7160 and its copies). Printed on
// plain paper it still works, cut out and taped on.
//
// Code 128 because every scanner reads it: the phone camera in product
// mode and the cheapest USB scanner. jsbarcode works out the bars; this
// file draws them as rectangles, so there is no image to blur.
//
// OPENING IT. Browsers block a window a page opens after it has waited
// on the server, which is what printing does (the code is linked
// first). So the caller opens an empty window on the click itself
// (`openBlankForSheet`) and the sheet is put into it when ready.
// ─────────────────────────────────────────────────────────────
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

const PAGE = { cols: 3, rows: 7, left: 7.2, top: 15.15, w: 63.5, h: 38.1, pitchX: 66.04, pitchY: 38.1 };
const PAD = 3;
const BAR_H = 10;
export const PER_PAGE = PAGE.cols * PAGE.rows;
// More than this many stickers in one go is a typing slip, not a print run.
export const MAX_LABELS = 500;

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

export const longDate = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Today in Cape Town, as 'YYYY-MM-DD'.
export const todaySast = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date());

// title:  the item's name, on every label
// labels: [{ code, caption, count }]: `count` stickers of each
// useBy:  a line to write the use-by date on
export const buildLabelSheet = ({ title, labels, useBy = true }) => {
  const stickers = (labels ?? [])
    .flatMap((l) => Array.from({ length: Math.max(0, Number(l.count) || 0) }, () => l))
    .slice(0, MAX_LABELS);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.setTextColor(0, 0, 0);
  pdf.setFillColor(0, 0, 0);

  stickers.forEach((label, i) => {
    if (i > 0 && i % PER_PAGE === 0) pdf.addPage();
    const slot = i % PER_PAGE;
    const x = PAGE.left + (slot % PAGE.cols) * PAGE.pitchX;
    const y = PAGE.top + Math.floor(slot / PAGE.cols) * PAGE.pitchY;
    const inner = PAGE.w - PAD * 2;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    const name = pdf.splitTextToSize(String(title ?? ''), inner).slice(0, 2);
    pdf.text(name, x + PAD, y + PAD + 3.5);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const below = y + PAD + 3.5 + name.length * 4;
    if (label.caption) pdf.text(pdf.splitTextToSize(label.caption, inner)[0], x + PAD, below);
    if (useBy) pdf.text('Use by: ______________', x + PAD, below + 4);

    drawBars(pdf, label.code, x + PAD, y + PAGE.h - PAD - BAR_H - 3, inner, BAR_H);
    pdf.setFontSize(7);
    pdf.text(label.code, x + PAGE.w / 2, y + PAGE.h - PAD, { align: 'center' });
  });

  return { pdf, labelCount: stickers.length, pageCount: Math.ceil(stickers.length / PER_PAGE) };
};

// An empty window, opened on the click so the browser allows it.
export const openBlankForSheet = () => {
  try { return window.open('', '_blank'); } catch { return null; }
};

// Puts the sheet into `win` (from openBlankForSheet), or opens a new one.
// { opened, labelCount }
export const openLabelSheet = (args, win = null) => {
  const { pdf, labelCount } = buildLabelSheet(args);
  if (labelCount === 0) { win?.close?.(); return { opened: false, labelCount }; }
  const url = pdf.output('bloburl');
  if (win && !win.closed) {
    win.location.href = url;
    return { opened: true, labelCount };
  }
  const opened = window.open(url, '_blank');
  return { opened: Boolean(opened), labelCount };
};

export default { buildLabelSheet, openLabelSheet, openBlankForSheet, barModules, longDate, todaySast, MAX_LABELS };
