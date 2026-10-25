// ─────────────────────────────────────────────────────────────
// client/src/features/decanting/bagLabelPdf.js
//
// Stickers for the bags a decanting run made: one per bag, each with
// the product, the bag size, the day it was decanted, a line to write
// the use-by date on, and a Code 128 barcode. The sheet itself is
// features/labels/labelSheetPdf.js, shared with Print labels on a
// stock item.
//
// WHY A BARCODE ON A BAG WE FILLED OURSELVES
// Decanted bags are what the packing check most needs and could not
// do: loose rice in a plain bag has no barcode, and a 1 kg bag and a
// 2 kg bag of the same rice look alike. The code names both the
// product and the size (ownBagCode in productCode.js: "LOL12K2000" is
// product 12 in 2 kg bags), and it is linked to the product with that
// size as its units per scan before the sheet is printed, so a scan at
// packing counts the right amount.
// ─────────────────────────────────────────────────────────────
import { buildLabelSheet, openLabelSheet, longDate, barModules } from '../labels/labelSheetPdf';

export { barModules };

// bags: [{ label: '2kg', count: 5, code: 'LOL12K2000' }]
const asSheet = ({ productName, bags, decantedOn }) => ({
  title: productName,
  useBy: true,
  labels: (bags ?? []).map((b) => ({
    code: b.code,
    count: b.count,
    caption: `${b.label} bag · Decanted ${longDate(decantedOn)}`,
  })),
});

export const buildBagLabelPdf = (args) => buildLabelSheet(asSheet(args));

// `win`: a window opened on the click (labelSheetPdf.openBlankForSheet).
export const openBagLabelPdf = (args, win = null) => openLabelSheet(asSheet(args), win);

export default { buildBagLabelPdf, openBagLabelPdf, barModules };
