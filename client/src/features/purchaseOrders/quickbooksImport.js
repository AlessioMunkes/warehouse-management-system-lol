// ─────────────────────────────────────────────────────────────
// client/src/features/purchaseOrders/quickbooksImport.js
//
// The reading half of "Import QuickBooks links": turn a QuickBooks PO
// export into { poNumber, quickbooksNumber } pairs, and say which rows
// cannot be trusted. Pure functions, no network.
//
// Finance types our PO number into the QuickBooks PO's Memo, so the
// number is searched for in EVERY cell of a row rather than in a named
// column: exports differ, and the memo is free text. The only column
// the user chooses is the one holding QuickBooks' own number.
//
// The import never guesses. A row that is unclear is given a reason
// and left out of what gets sent to the server.
// ─────────────────────────────────────────────────────────────

export const MAX_IMPORT_ROWS = 500;

// ── Header row ────────────────────────────────────────────────
// QuickBooks puts a title and a blank row above the headers, so row 1
// is not the header. The header is the first row with several
// non-empty text cells (a title row has one; a data row has numbers).
const isTextCell = (v) => {
  const s = String(v ?? '').trim();
  return s !== '' && Number.isNaN(Number(s.replace(/[,\s]/g, '')));
};

export const findHeaderRow = (grid) => {
  const count = (row) => row.filter(isTextCell).length;
  const strong = grid.findIndex((row) => count(row) >= 3);
  if (strong !== -1) return strong;
  const weak = grid.findIndex((row) => count(row) >= 2);
  return weak !== -1 ? weak : 0;
};

// Blank or repeated headers get positional names so every column can
// still be picked.
const nameColumns = (headerRow) => {
  const seen = new Map();
  return headerRow.map((h, i) => {
    let name = String(h ?? '').trim() || `Column ${i + 1}`;
    if (seen.has(name)) {
      const n = seen.get(name) + 1;
      seen.set(name, n);
      name = `${name} (${n})`;
    } else seen.set(name, 1);
    return name;
  });
};

// → { columns: string[], dataRows: [{ rowNumber, cells }] }
// rowNumber orders rows and keys them. It counts non-blank rows only
// (the readers drop blank ones), so it is NOT shown to the user as a
// spreadsheet row number.
export const readTable = (grid) => {
  if (!grid.length) throw new Error('That file is empty.');
  const headerIndex = findHeaderRow(grid);
  const columns = nameColumns(grid[headerIndex]);
  const dataRows = grid
    .slice(headerIndex + 1)
    .map((cells, i) => ({ rowNumber: headerIndex + 2 + i, cells }))
    .filter((r) => r.cells.some((c) => String(c ?? '').trim() !== ''));
  if (!dataRows.length) throw new Error('That file has headers but no rows below them.');
  return { columns, dataRows };
};

// ── Which column holds QuickBooks' number ─────────────────────
// Pre-selects a header that reads like "Num", "Number", "No.", "PO #".
// Best match first; null when nothing looks right, so the user picks.
export const guessNumberColumn = (columns) => {
  const score = (name) => {
    const h = name.trim().toLowerCase();
    if (/^(num|number|no\.?|#)$/.test(h)) return 4;
    if (/^(po|p\.o\.)\s*(num|number|no\.?|#)/.test(h)) return 3;
    if (/(^|[^a-z])(num|number|no\.?)([^a-z]|$)|#/.test(h)) return 2;
    if (h.includes('num')) return 1;
    return 0;
  };
  let best = null;
  let bestScore = 0;
  for (const c of columns) {
    const s = score(c);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  return best;
};

// ── Our PO number, wherever it is in the text ─────────────────
// PO-YYYY-NNNN with 4 or more digits at the end, any case, spaces
// allowed around the dashes. Not when glued to a letter or digit
// before it ("REPO-2026-0001"), or to more digits after it.
const PO_PATTERN = /(?<![A-Za-z0-9])PO\s*-\s*(\d{4})\s*-\s*(\d{4,})(?!\d)/gi;

export const findPoNumbers = (text) => {
  const found = [];
  for (const m of String(text ?? '').matchAll(PO_PATTERN)) {
    const po = `PO-${m[1]}-${m[2]}`;
    if (!found.includes(po)) found.push(po);
  }
  return found;
};

// ── One entry per row ─────────────────────────────────────────
export const extractRows = ({ columns, dataRows }, numberColumn) => {
  const numberIndex = columns.indexOf(numberColumn);
  if (numberIndex === -1) throw new Error('Choose the column with the QuickBooks PO number.');
  return dataRows.map(({ rowNumber, cells }) => ({
    rowNumber,
    quickbooksNumber: String(cells[numberIndex] ?? '').trim(),
    poNumbers: [...new Set(cells.flatMap((c) => findPoNumbers(c)))],
  }));
};

// ── What the client can already tell from the file alone ──────
// Reasons a row is "needs review" (link nothing for it):
export const REVIEW_REASONS = {
  multi_po:  'This row has more than one PO number.',
  repeat_po: 'This PO number is in more than one row.',
  repeat_qb: 'This QuickBooks number is in more than one row with different PO numbers.',
  no_qb:     'This row has no QuickBooks number in the chosen column.',
};

// → { noPo: row[], review: [{ ...row, reason }], candidates: row[] }
// A candidate has exactly one PO number, one QuickBooks number, and
// neither is repeated elsewhere, so it is safe to ask the server about.
export const sortRows = (rows) => {
  const withPo = rows.filter((r) => r.poNumbers.length > 0);
  const noPo = rows.filter((r) => r.poNumbers.length === 0);

  const rowsPerPo = new Map();
  for (const r of withPo) {
    for (const po of r.poNumbers) rowsPerPo.set(po, (rowsPerPo.get(po) ?? 0) + 1);
  }

  const posPerQb = new Map();
  for (const r of withPo) {
    if (!r.quickbooksNumber) continue;
    if (!posPerQb.has(r.quickbooksNumber)) posPerQb.set(r.quickbooksNumber, new Set());
    r.poNumbers.forEach((po) => posPerQb.get(r.quickbooksNumber).add(po));
  }

  const review = [];
  const candidates = [];
  for (const r of withPo) {
    let reason = null;
    if (r.poNumbers.length > 1) reason = 'multi_po';
    else if (rowsPerPo.get(r.poNumbers[0]) > 1) reason = 'repeat_po';
    else if (!r.quickbooksNumber) reason = 'no_qb';
    else if (posPerQb.get(r.quickbooksNumber).size > 1) reason = 'repeat_qb';

    if (reason) review.push({ ...r, reason });
    else candidates.push({ ...r, poNumber: r.poNumbers[0] });
  }
  return { noPo, review, candidates };
};

// ── Merge the server's preview back onto the candidates ───────
// Groups: willLink, unchanged, conflicts, notFound, plus anything the
// server refused to classify (shouldn't happen, but it must not vanish
// quietly) which joins "needs review".
export const mergePreview = (candidates, serverRows) => {
  const out = { willLink: [], unchanged: [], conflicts: [], notFound: [], extraReview: [] };
  candidates.forEach((row, i) => {
    const s = serverRows[i] ?? { status: 'invalid' };
    const merged = { ...row, ...s };
    if (s.status === 'will_link') out.willLink.push(merged);
    else if (s.status === 'unchanged') out.unchanged.push(merged);
    else if (s.status === 'conflict') out.conflicts.push(merged);
    else if (s.status === 'not_found') out.notFound.push(merged);
    else out.extraReview.push({ ...merged, reason: null, message: s.message });
  });
  return out;
};

// ── Conflict wording ──────────────────────────────────────────
// Short line beside the tickbox; the full sentence is the detail.
export const conflictShort = (c) => {
  const parts = [];
  if (c.linkedToPoNumber) parts.push(`Moves from ${c.linkedToPoNumber}`);
  if (c.linkedQuickbooksNumber) parts.push(`replaces ${c.linkedQuickbooksNumber}`);
  const line = parts.join(', ');
  return line.charAt(0).toUpperCase() + line.slice(1);
};

export const conflictDetail = (c) => {
  const bits = [];
  if (c.linkedToPoNumber) {
    bits.push(`QuickBooks PO number ${c.quickbooksNumber} is linked to ${c.linkedToPoNumber}. `
      + `Ticking this moves it to ${c.poNumber}, and ${c.linkedToPoNumber} becomes unlinked.`);
  }
  if (c.linkedQuickbooksNumber) {
    bits.push(`${c.poNumber} is linked to QuickBooks PO number ${c.linkedQuickbooksNumber}. `
      + `Ticking this replaces it with ${c.quickbooksNumber}.`);
  }
  return bits.join(' ');
};

// ── The confirm summary ───────────────────────────────────────
// Totals, not rows. `ticked` is the conflicts the user chose to apply.
export const summarise = (willLink, ticked) => {
  const moves = ticked.filter((c) => c.linkedToPoNumber);
  const replaces = ticked.filter((c) => !c.linkedToPoNumber && c.linkedQuickbooksNumber);
  return {
    willLink: willLink.length,
    moves: moves.length,
    replaces: replaces.length,
    total: willLink.length + ticked.length,
    movedPos: moves.map((c) => ({ from: c.linkedToPoNumber, to: c.poNumber, quickbooksNumber: c.quickbooksNumber })),
    replacedPos: ticked.filter((c) => c.linkedQuickbooksNumber)
      .map((c) => ({ poNumber: c.poNumber, was: c.linkedQuickbooksNumber, now: c.quickbooksNumber })),
  };
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const summaryLines = (s) => {
  const lines = [];
  if (s.willLink) lines.push(`${s.willLink} will link.`);
  if (s.moves) {
    lines.push(`${plural(s.moves, 'link', 'links')} will move to a different PO, which becomes unlinked.`);
  }
  if (s.replaces) {
    lines.push(`${plural(s.replaces, 'PO', 'POs')} will switch to a different QuickBooks PO number.`);
  }
  return lines;
};
