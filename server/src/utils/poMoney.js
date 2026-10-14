// ─────────────────────────────────────────────────────────────
// server/src/utils/poMoney.js
//
// How a purchase order line is priced, in one place, so the Finance
// email, the order list's value and the order sent to QuickBooks all
// agree to the cent.
//
// THE RULE: a line is quantity × unit price, rounded half up to the
// cent. An order's total is the sum of its ROUNDED lines, never the
// rounded sum of the raw products. 2.5 × R 33.33 is R 83.325, which
// is R 83.33 here, in the email and in QuickBooks.
//
// Whole numbers throughout. Quantity has at most three decimals and a
// price two, so quantity in thousandths × price in cents is exact and
// rounding it never meets a floating-point 83.32499999.
// ─────────────────────────────────────────────────────────────

const toMilli = (quantity) => Math.round(Number(quantity || 0) * 1000);
const toCents = (price) => Math.round(Number(price || 0) * 100);

/** A line's amount in whole cents. A missing price counts as 0. */
export const lineCents = (quantity, unitPrice) => {
  const product = toMilli(quantity) * toCents(unitPrice);   // thousandths of a cent
  return Math.floor((product + 500) / 1000);                // half up
};

/** A line's amount in rand, to the cent. */
export const lineAmount = (quantity, unitPrice) => lineCents(quantity, unitPrice) / 100;

/** An order's total in rand: the sum of its rounded lines. */
export const orderTotal = (lines) => (
  lines.reduce((sum, l) => sum + lineCents(l.quantity, l.unitPrice), 0) / 100
);

export default { lineCents, lineAmount, orderTotal };
