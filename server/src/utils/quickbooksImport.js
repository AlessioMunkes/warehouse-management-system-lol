// ─────────────────────────────────────────────────────────────
// server/src/utils/quickbooksImport.js
//
// The pure half of the QuickBooks links import: what a submitted pair
// is, and what state it is in given what the database already holds.
// No I/O, so the preview endpoint and the apply transaction classify
// identically — the apply step re-runs this against freshly locked
// data and never trusts what the preview said.
//
// The import never guesses. It only fills in links between a PO number
// we issued and a QuickBooks PO number; anything unclear gets a status
// and is skipped.
// ─────────────────────────────────────────────────────────────

export const MAX_IMPORT_ROWS = 500;
export const MAX_QUICKBOOKS_NUMBER_LENGTH = 50;

// PO-YYYY-NNNN, with the sequence growing past 4 digits (see the
// po_number column default).
export const PO_NUMBER_RE = /^PO-\d{4}-\d{4,}$/;

export const tooManyRowsMessage = (count) =>
  `That file has ${count} rows to link. Import up to ${MAX_IMPORT_ROWS} at a time: split the file and import it in parts.`;

// → { poNumber, quickbooksNumber } or { invalid: 'reason' }
export const normalizePair = (raw) => {
  const poNumber = String(raw?.poNumber ?? '').trim().toUpperCase();
  const quickbooksNumber = String(raw?.quickbooksNumber ?? '').trim();
  if (!PO_NUMBER_RE.test(poNumber)) {
    return { poNumber, quickbooksNumber, invalid: 'That is not a PO number.' };
  }
  if (!quickbooksNumber) {
    return { poNumber, quickbooksNumber, invalid: 'The QuickBooks PO number is empty.' };
  }
  if (quickbooksNumber.length > MAX_QUICKBOOKS_NUMBER_LENGTH) {
    return { poNumber, quickbooksNumber, invalid: `The QuickBooks PO number is over ${MAX_QUICKBOOKS_NUMBER_LENGTH} characters.` };
  }
  return { poNumber, quickbooksNumber };
};

// Indexes of pairs that cannot be trusted because the same PO number
// or the same QuickBooks number shows up in more than one pair. All of
// them are flagged, none is picked as "the right one".
export const findDuplicateIndexes = (pairs) => {
  const byPo = new Map();
  const byQb = new Map();
  pairs.forEach((p, i) => {
    if (!byPo.has(p.poNumber)) byPo.set(p.poNumber, []);
    byPo.get(p.poNumber).push(i);
    if (!byQb.has(p.quickbooksNumber)) byQb.set(p.quickbooksNumber, []);
    byQb.get(p.quickbooksNumber).push(i);
  });
  const dupes = new Set();
  for (const group of [...byPo.values(), ...byQb.values()]) {
    if (group.length > 1) group.forEach((i) => dupes.add(i));
  }
  return dupes;
};

// state = {
//   poByNumber: Map<po_number, id>,
//   linkByPoId: Map<po id, qbo_id>,          // the PO's current link
//   ownerByQb:  Map<qbo_id, { id, poNumber }> // who holds that number now
// }
// → { status, poId?, linkedQuickbooksNumber?, linkedToPoNumber? }
//   status: not_found | unchanged | will_link | conflict
export const classifyPair = (pair, state) => {
  const poId = state.poByNumber.get(pair.poNumber);
  if (poId === undefined) return { status: 'not_found' };

  const current = state.linkByPoId.get(poId) ?? null;
  const owner = state.ownerByQb.get(pair.quickbooksNumber) ?? null;

  if (current === pair.quickbooksNumber) return { status: 'unchanged', poId };

  const linkedQuickbooksNumber = current;
  const linkedToPoNumber = owner && owner.id !== poId ? owner.poNumber : null;
  const displacedPoId = owner && owner.id !== poId ? owner.id : null;
  if (linkedQuickbooksNumber === null && !owner) return { status: 'will_link', poId };

  return {
    status: 'conflict',
    poId,
    displacedPoId,
    linkedQuickbooksNumber,
    linkedToPoNumber: linkedToPoNumber ?? (displacedPoId ? 'another purchase order' : null),
  };
};

export const buildState = (poRows, linkRows) => {
  const poByNumber = new Map(poRows.map((r) => [r.po_number, r.id]));
  const linkByPoId = new Map();
  const ownerByQb = new Map();
  for (const r of linkRows) {
    linkByPoId.set(r.entity_id, r.qbo_id);
    ownerByQb.set(r.qbo_id, { id: r.entity_id, poNumber: r.po_number });
  }
  return { poByNumber, linkByPoId, ownerByQb };
};
