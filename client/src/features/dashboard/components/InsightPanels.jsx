// ─────────────────────────────────────────────────────────────
// client/src/features/dashboard/components/InsightPanels.jsx
//
// Two list panels for the manager's board, both from
// /api/dashboard/insights:
//
//   StockCoverPanel        how many weeks the stock on hand lasts at
//                          what the recipe in use takes each week,
//                          fewest weeks first
//   MissedCollectionsPanel centres that have not collected two or more
//                          pallets in the last few weeks
// ─────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom';
import { STAFF } from '../../../routes/paths';
import { fmtQty } from '../../../lib/quantity';

// Under two weeks is the one to act on; under four is worth watching.
const coverTone = (weeks) => (weeks < 2 ? 'text-danger' : weeks < 4 ? 'text-warn' : 'text-good');
const weeksText = (weeks) => (weeks === 1 ? '1 week' : `${weeks} weeks`);

const fmtDay = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-ZA', {
  day: 'numeric', month: 'short', timeZone: 'UTC',
});

export function StockCoverPanel({ insights }) {
  if (!insights.recipeName) {
    return (
      <p className="text-sm text-muted-foreground">
        No recipe with products is in use, so there is no weekly amount to measure stock against.
      </p>
    );
  }
  if (insights.stockCover.length === 0) {
    return <p className="text-sm text-muted-foreground">No centre follows the {insights.recipeName} recipe yet.</p>;
  }
  return (
    <div>
      <ul className="divide-y">
        {insights.stockCover.map((p) => (
          <li key={p.productId} className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block text-xs text-muted-foreground">
                {fmtQty(p.onHand, p.unit)} on hand · {fmtQty(p.weeklyUse, p.weeks === null ? p.weeklyUnit : p.unit)} a week
              </span>
            </span>
            {/* Stock in crates, the recipe in kilograms, and no crate
                weight set (admin Settings): nothing to work out. */}
            {p.weeks === null ? (
              <span className="shrink-0 text-xs text-muted-foreground">No {p.unit} weight set</span>
            ) : (
              <span className={`shrink-0 font-semibold tabular-nums ${coverTone(p.weeks)}`}>{weeksText(p.weeks)}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        At what the {insights.recipeName} recipe takes each week. <Link to={STAFF.inventory} className="underline underline-offset-2">Open inventory</Link>
      </p>
    </div>
  );
}

export function MissedCollectionsPanel({ insights }) {
  if (insights.missedCollections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No centre has missed two collections in the last {insights.missedWeeks} weeks.
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {insights.missedCollections.map((c) => (
        <li key={c.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
          <Link to={`${STAFF.beneficiaries}?open=${c.id}`} className="min-w-0 truncate font-medium underline-offset-2 hover:underline">
            {c.name}
          </Link>
          <span className="shrink-0 text-xs text-muted-foreground">
            <span className="font-semibold text-danger">{c.missed} missed</span>
            {c.lastMissed ? ` · last ${fmtDay(c.lastMissed)}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}
