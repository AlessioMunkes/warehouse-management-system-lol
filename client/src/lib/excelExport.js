// ─────────────────────────────────────────────────────────────
// client/src/lib/excelExport.js
//
// One formatted Excel sheet, for every "Export" in the app.
//
// A CSV opens as a wall of text: dates as strings, money with no
// currency, columns too narrow to read. This writes a real workbook:
//
//   - a title and a line saying what period it covers and when it was made
//   - a bold header row that stays put while the rows scroll, with a
//     filter on every column
//   - real dates, real numbers and rand amounts, so they sort and sum
//   - columns as wide as what is in them, and banded rows
//   - a total under every money column
//
// The same { key, label } columns the tables already use go in; a
// column may say what it holds (`kind`: text, number, money, date,
// datetime), and one that does not is worked out from its values.
//
// The Excel library is loaded only when someone exports, so it adds
// nothing to the first load of any page.
// ─────────────────────────────────────────────────────────────

const INK = 'FF2B3336';
const BAND = 'FFF7F4EF';
const LINE = 'FFE5E0D8';
const MUTED = 'FF6B7477';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MINUTE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;

const FORMATS = {
  number: '#,##0.###',
  money: '"R" #,##0.00',
  date: 'd mmm yyyy',
  datetime: 'd mmm yyyy hh:mm',
};

const isBlank = (v) => v === null || v === undefined || v === '';

// What a column holds, when it does not say: numbers if every value is
// one, dates if every value is a date, otherwise text.
const inferKind = (values) => {
  const filled = values.filter((v) => !isBlank(v));
  if (!filled.length) return 'text';
  if (filled.every((v) => typeof v === 'number' && Number.isFinite(v))) return 'number';
  if (filled.every((v) => typeof v === 'string' && ISO_DAY.test(v))) return 'date';
  if (filled.every((v) => typeof v === 'string' && ISO_MINUTE.test(v))) return 'datetime';
  return 'text';
};

// A date as Excel wants it: a moment at UTC, so "12 Oct" stays the 12th
// whatever the reader's clock is set to.
const toDate = (value, kind) => {
  const s = String(value);
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return s;
  if (kind === 'datetime' && ISO_MINUTE.test(s)) {
    const [hh, mm] = s.slice(11, 16).split(':').map(Number);
    return new Date(Date.UTC(y, m - 1, d, hh, mm));
  }
  return new Date(Date.UTC(y, m - 1, d));
};

const cellValue = (value, kind) => {
  if (isBlank(value)) return null;
  if (kind === 'number' || kind === 'money') {
    const n = Number(value);
    return Number.isFinite(n) ? n : String(value);
  }
  if (kind === 'date' || kind === 'datetime') return toDate(value, kind);
  return String(value);
};

// How wide a value will be once Excel has formatted it, in characters.
const shownLength = (value, kind) => {
  if (isBlank(value)) return 0;
  if (kind === 'money') return Number(value).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).length + 3;
  if (kind === 'number') return Number(value).toLocaleString('en-ZA', { maximumFractionDigits: 3 }).length + 1;
  if (kind === 'date') return 11;
  if (kind === 'datetime') return 17;
  return String(value).length;
};

/**
 * Everything about the sheet that can be decided without the Excel
 * library: each column's kind and width, the cell values, the totals.
 * Kept apart so it can be tested on its own.
 */
export const sheetModel = ({ columns, rows }) => {
  const cols = columns.map((c) => {
    const values = rows.map((r) => r[c.key]);
    const kind = c.kind ?? inferKind(values);
    const longest = values.reduce((max, v) => Math.max(max, shownLength(v, kind)), String(c.label).length);
    return {
      key: c.key, label: String(c.label), kind,
      width: Math.min(Math.max(longest + 3, 9), 50),
      // Only money adds up across rows: quantities mix bags with kilograms.
      total: kind === 'money' ? rows.reduce((sum, r) => sum + (Number(r[c.key]) || 0), 0) : null,
    };
  });
  return {
    columns: cols,
    rows: rows.map((r) => cols.map((c) => cellValue(r[c.key], c.kind))),
    hasTotals: rows.length > 0 && cols.some((c) => c.total !== null),
  };
};

// Excel refuses a sheet name over 31 characters or with any of \ / ? * [ ] :
const sheetNameOf = (name) => (String(name || 'Data').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Data');
const fileNameOf = (name) => `${String(name || 'export').replace(/\.(csv|xlsx)$/i, '').replace(/[\\/:*?"<>|]+/g, '-')}.xlsx`;

const stamp = () => new Date().toLocaleString('en-ZA', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg',
});

/**
 * Write the workbook and hand it to the browser to save.
 *   filename   "goods-received" (the .xlsx is added)
 *   title      first line of the sheet
 *   subtitle   what it covers ("1 Oct to 12 Oct 2026"); the export time is added
 *   columns    [{ key, label, kind? }]
 *   rows       [{ [key]: value }]
 */
export const exportExcel = async ({ filename, sheetName, title, subtitle, columns, rows }) => {
  const mod = await import('exceljs/dist/exceljs.min.js');
  const ExcelJS = mod.default ?? mod;
  const model = sheetModel({ columns, rows });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Batches';
  workbook.created = new Date();

  const top = title ? 3 : 0;                 // title, covering line, a gap
  const headerRow = top + 1;
  const sheet = workbook.addWorksheet(sheetNameOf(sheetName ?? title), {
    views: [{ state: 'frozen', ySplit: headerRow }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = model.columns.map((c) => ({ key: c.key, width: c.width }));

  if (title) {
    sheet.getCell(1, 1).value = title;
    sheet.getCell(1, 1).font = { bold: true, size: 14, color: { argb: INK } };
    sheet.getCell(2, 1).value = [subtitle, `Exported ${stamp()}`].filter(Boolean).join('  ·  ');
    sheet.getCell(2, 1).font = { size: 10, color: { argb: MUTED } };
  }

  const head = sheet.getRow(headerRow);
  model.columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    cell.alignment = { vertical: 'middle', horizontal: c.kind === 'number' || c.kind === 'money' ? 'right' : 'left', wrapText: true };
  });
  head.height = 22;

  model.rows.forEach((values, r) => {
    const row = sheet.getRow(headerRow + 1 + r);
    values.forEach((value, i) => {
      const c = model.columns[i];
      const cell = row.getCell(i + 1);
      cell.value = value;
      if (FORMATS[c.kind] && value !== null && typeof value !== 'string') cell.numFmt = FORMATS[c.kind];
      cell.alignment = { vertical: 'top', horizontal: c.kind === 'number' || c.kind === 'money' ? 'right' : 'left', wrapText: c.kind === 'text' && c.width >= 50 };
      cell.border = { bottom: { style: 'thin', color: { argb: LINE } } };
      if (r % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
    });
  });

  if (model.hasTotals) {
    const row = sheet.getRow(headerRow + 1 + model.rows.length);
    model.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (i === 0 && c.total === null) cell.value = 'Total';
      if (c.total !== null) { cell.value = Math.round(c.total * 100) / 100; cell.numFmt = FORMATS.money; cell.alignment = { horizontal: 'right' }; }
      cell.font = { bold: true };
      cell.border = { top: { style: 'medium', color: { argb: INK } } };
    });
  }

  if (model.rows.length) {
    sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + model.rows.length, column: model.columns.length } };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameOf(filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export default exportExcel;
