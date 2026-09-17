// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/parseUpload.js
//
// Turns a dropped file or a Google Sheet link into { columns, rows }.
// Runs entirely in the browser — nothing is uploaded.
//
// CSV is parsed here rather than with Papaparse: the format is well
// understood, a correct reader is about fifty lines, and one fewer
// dependency matters for a system nobody will be maintaining after
// handover. Excel needs SheetJS, which is why that one import is
// dynamic — 400 kB should not sit in the bundle for the majority who
// never drop a file.
// ─────────────────────────────────────────────────────────────

// A sheet big enough to hit this is not something to chart in a
// browser; the limit exists so a mis-drop cannot lock the tab.
export const MAX_ROWS = 20_000;

// ── CSV ───────────────────────────────────────────────────────
// A character-by-character state machine, because a regex split on
// commas breaks the moment a field contains one — and ECD names and
// addresses routinely do. Handles quoted fields, escaped quotes
// (""), and both CRLF and LF.
export const parseCSV = (text) => {
  const rows = [];
  let row = [], field = '', inQuotes = false;

  // Strip a UTF-8 BOM: Excel writes one, and it would otherwise be
  // glued to the first column name and break header matching.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; }  // escaped quote
        else inQuotes = false;
      } else field += c;
      continue;
    }

    if (c === '"')        { inQuotes = true; }
    else if (c === ',')   { row.push(field); field = ''; }
    else if (c === '\n')  { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r')  { /* handled by the \n that follows */ }
    else                  { field += c; }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
};

// ── Shape a raw grid into columns + objects ───────────────────
const toTable = (grid, sourceName) => {
  if (!grid.length) throw new Error('That file appears to be empty.');

  // Blank or duplicate headers become positional names so a column
  // can still be selected rather than silently vanishing.
  const seen = new Map();
  const columns = grid[0].map((h, i) => {
    let name = String(h ?? '').trim() || `Column ${i + 1}`;
    if (seen.has(name)) { const n = seen.get(name) + 1; seen.set(name, n); name = `${name} (${n})`; }
    else seen.set(name, 1);
    return name;
  });

  const body = grid.slice(1, MAX_ROWS + 1);
  if (!body.length) throw new Error('That file has headers but no data rows.');

  const rows = body.map((r) => {
    const obj = {};
    columns.forEach((c, i) => { obj[c] = r[i] ?? ''; });
    return obj;
  });

  return {
    columns,
    rows,
    sourceName,
    truncated: grid.length - 1 > MAX_ROWS,
  };
};

// ── Entry point: a File from the drop zone ────────────────────
export const parseFile = async (file) => {
  const name = file.name;
  const ext  = name.split('.').pop().toLowerCase();

  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
    const text = await file.text();
    return toTable(parseCSV(text), name);
  }

  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') {
    // Dynamic: SheetJS only downloads when someone actually drops a
    // spreadsheet. Keeps it out of the main bundle entirely.
    const XLSX = await import('xlsx');
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array' });

    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error('That workbook has no sheets.');

    // header:1 gives a raw grid, matching the CSV path so both feed
    // the same shaping code. raw:false formats dates as text rather
    // than leaking Excel serial numbers like 45231 into labels.
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1, blankrows: false, raw: false, defval: '',
    });

    const table = toTable(grid, `${name} — ${sheetName}`);
    table.sheetNames = wb.SheetNames;
    return table;
  }

  throw new Error(`Cannot read .${ext} files. Use CSV or Excel.`);
};

// ── Google Sheets ─────────────────────────────────────────────
// No OAuth. Full integration would need a Google Cloud project,
// consent screen and refresh-token handling — a lot of surface area
// and one more credential to hand over. Instead the sheet's own CSV
// export endpoint is fetched, which works when the sheet is
// published to the web or shared as "anyone with the link".
export const toCsvUrl = (url) => {
  const id = url.match(/\/spreadsheets\/d\/(?:e\/)?([a-zA-Z0-9-_]+)/)?.[1];
  if (!id) return null;

  const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? '0';

  // A /d/e/ link is already the published form and uses a different
  // endpoint from a normal shared link.
  return url.includes('/d/e/')
    ? `https://docs.google.com/spreadsheets/d/e/${id}/pub?output=csv&gid=${gid}`
    : `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
};

export const parseSheetUrl = async (url) => {
  const csvUrl = toCsvUrl(url);
  if (!csvUrl) throw new Error('That does not look like a Google Sheets link.');

  let res;
  try {
    res = await fetch(csvUrl);
  } catch {
    // A CORS rejection surfaces as a bare network error with no
    // status, so the message has to explain the likely cause rather
    // than report a failure the user cannot interpret.
    throw new Error(
      'Could not read that sheet. It needs to be shared as "anyone with the link", ' +
      'or published to the web. Downloading it and dropping the file always works.'
    );
  }

  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? 'That sheet is private. Share it as "anyone with the link", or download and drop the file.'
        : `Could not read that sheet (error ${res.status}).`
    );
  }

  const text = await res.text();
  // A private sheet often returns the sign-in page with a 200, so
  // check the body rather than trusting the status.
  if (text.trimStart().toLowerCase().startsWith('<!doctype html')) {
    throw new Error('That sheet is not readable without signing in. Download it and drop the file instead.');
  }

  return toTable(parseCSV(text), 'Google Sheet');
};

// ── Column detection ──────────────────────────────────────────
// A value counts as numeric after stripping the punctuation a
// spreadsheet exports: thousands separators, currency symbols, a
// trailing %, and parentheses for negatives.
const asNumber = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[(),\s]/g, '').replace(/^[R$€£]/i, '').replace(/%$/, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
};

export const numericFraction = (rows, column) => {
  const values = rows.map((r) => r[column]).filter((v) => String(v ?? '').trim() !== '');
  if (!values.length) return 0;
  return values.filter((v) => asNumber(v) !== null).length / values.length;
};

// Label = the first column that is mostly not numeric. Value = the
// first that mostly is. Wrong often enough that both are editable in
// the UI, but right often enough to save the common case.
export const detectColumns = (table) => {
  const { columns, rows } = table;
  const scored = columns.map((c) => ({ c, frac: numericFraction(rows, c) }));
  const label = scored.find((s) => s.frac < 0.5)?.c ?? columns[0];
  const value = scored.find((s) => s.frac >= 0.7 && s.c !== label)?.c
             ?? columns.find((c) => c !== label)
             ?? columns[0];
  return { labelColumn: label, valueColumn: value };
};

// ── Build a chart series ──────────────────────────────────────
// Rows sharing a label are grouped, because a raw export usually has
// one row per transaction rather than one per category. Without
// this, a sheet of 300 collections would render 300 bars.
export const MAX_SERIES = 40;

export const buildSeries = (table, { labelColumn, valueColumn, aggregation }) => {
  const buckets = new Map();

  for (const row of table.rows) {
    const label = String(row[labelColumn] ?? '').trim() || '(blank)';
    const n = aggregation === 'count' ? 1 : asNumber(row[valueColumn]);
    if (n === null) continue;                     // skip unparseable, do not treat as zero

    const b = buckets.get(label) ?? { sum: 0, count: 0 };
    b.sum += n; b.count += 1;
    buckets.set(label, b);
  }

  let series = [...buckets.entries()].map(([label, b]) => ({
    label,
    value: aggregation === 'average'
      ? Number((b.sum / b.count).toFixed(2))
      : aggregation === 'count' ? b.count : Number(b.sum.toFixed(2)),
  }));

  // Skipped rows are reported rather than absorbed, so a column with
  // stray text does not quietly shrink the total.
  const used = series.reduce((s, r) => s + (aggregation === 'count' ? r.value : 1), 0);

  let trimmed = false;
  if (series.length > MAX_SERIES) {
    series = [...series].sort((a, b) => b.value - a.value).slice(0, MAX_SERIES);
    trimmed = true;
  }

  return { series, trimmed, usedRows: used, totalRows: table.rows.length };
};

export default {
  parseFile, parseSheetUrl, parseCSV, toCsvUrl,
  detectColumns, buildSeries, numericFraction, MAX_ROWS, MAX_SERIES,
};
