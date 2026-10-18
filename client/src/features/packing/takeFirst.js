// ─────────────────────────────────────────────────────────────
// client/src/features/packing/takeFirst.js
//
// First expired, first out. A slip item carries use_first_date: the
// soonest use-by date on record for its product that has not passed.
// These turn it into the words a packer reads — on the staff packing
// screen, the guest packing screen and the printed slip — so all three
// say the same thing.
//
// It is the date to look for on the shelf, not a promise about how much
// of that stock is left: the system keeps one balance per product. If
// nothing on the shelf carries that date, the packer takes the next
// oldest, which is what "use first" already means.
// ─────────────────────────────────────────────────────────────

// '2026-10-14' -> '14 Oct'. Read as a plain calendar day, in UTC, so the
// browser's timezone cannot move it.
export const takeFirstDay = (item) => {
  const iso = String(item?.use_first_date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const day = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return '';
  return day.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

// The instruction, or '' for a product with no date on record.
export const takeFirstText = (item) => {
  const day = takeFirstDay(item);
  return day ? `Use the stock dated ${day} first` : '';
};
