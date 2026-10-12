// ─────────────────────────────────────────────────────────────
// client/src/features/dashboard/InsightPanels.jsx
//
// Two list panels for the manager's board, both from
// /api/dashboard/insights:
//
//   StockCoverPanel        the stock outlook: available and due in
//                          against what a week takes, the date each
//                          runs short and whether its next use-by
//                          date comes first (dashboard.repository.js
//                          stockOutlook)
//   MissedCollectionsPanel centres that have not collected two or more
//                          pallets in the last few weeks
// ─────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom';
import { STAFF } from '../../routes/paths';
import { fmtQty } from '../../lib/quantity';
import StatusBadge from '@/components/ui/status-badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ChartNote from '../reporting/ChartNote';

// Under two weeks is the one to act on; under four is worth watching.
const coverTone = (weeks) => (weeks < 2 ? 'text-danger' : weeks < 4 ? 'text-warn' : 'text-good');
const weeksText = (weeks) => (weeks === 1 ? '1 week' : `${weeks} weeks`);

const fmtDay = (day) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-ZA', {
  day: 'numeric', month: 'short', timeZone: 'UTC',
});

// A figure with its one-line explanation on hover and keyboard focus.
// The words are always on the screen; the tip only says how they were
// worked out.
function Explained({ tip, children, className = '' }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span tabIndex={0} />}
        className={`cursor-help rounded-sm underline decoration-dotted decoration-1 underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${className}`}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{tip}</TooltipContent>
    </Tooltip>
  );
}

// How the panel's figures are worked out, behind the info button for
// touch screens, where nothing hovers.
const outlookNote = (insights) => [
  'Available is what is on hand, less packed pallets and approved benevolent requests.',
  `Due in is what approved orders due in the next ${insights.outlook.dueInWeeks} weeks still have to bring.`,
  insights.recipeName
    ? `A week is what a week of slips takes on the ${insights.recipeName} recipe, or for anything not on it, the average sent out a week over the last ${insights.outlook.usageWeeks} weeks.`
    : `A week is the average sent out a week over the last ${insights.outlook.usageWeeks} weeks.`,
  'Weeks is available plus due in, divided by a week.',
  'May expire first means the next use-by date comes before the stock would be used up. Use-by dates are kept per delivery, so this assumes the oldest stock goes first.',
].join(' ');

export function StockCoverPanel({ insights }) {
  if (insights.stockCover.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to measure yet: no product is on the recipe in use or has been sent out in the last {insights.outlook.usageWeeks} weeks.
      </p>
    );
  }
  const weekTip = (p) => (p.usage === 'recipe'
    ? `What a week of slips takes on the ${insights.recipeName} recipe.`
    : `The average sent out a week over the last ${insights.outlook.usageWeeks} weeks.`);

  return (
    <TooltipProvider>
      <ul className="divide-y">
        {insights.stockCover.map((p) => (
          <li key={p.productId} className="py-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{p.name}</span>
              {/* Stock in crates, the recipe in kilograms, and no crate
                  weight set (admin Settings): nothing to work out. */}
              {p.weeks === null ? (
                <span className="shrink-0 text-xs text-muted-foreground">No {p.unit} weight set</span>
              ) : (
                <Explained tip="Available plus due in, divided by a week." className={`shrink-0 font-semibold tabular-nums ${coverTone(p.weeks)}`}>
                  {weeksText(p.weeks)}
                </Explained>
              )}
            </div>
            <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
              <Explained tip="On hand, less packed pallets and approved benevolent requests.">
                {fmtQty(p.available, p.unit)} available
              </Explained>
              {p.dueIn > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <Explained tip={`Still to arrive on approved orders${p.nextDue ? `, the next due ${fmtDay(p.nextDue)}` : ''}.`}>
                    {fmtQty(p.dueIn, p.unit)} due in
                  </Explained>
                </>
              ) : null}
              <span aria-hidden="true">·</span>
              <Explained tip={weekTip(p)}>
                {fmtQty(p.weeklyUse, p.weeks === null ? p.weeklyUnit : p.unit)} a week
              </Explained>
            </p>
            {p.runsShortOn || p.mayExpireOn ? (
              <p className="mt-1 flex flex-wrap gap-1.5">
                {p.runsShortOn ? (
                  <Explained tip="When it runs out at this rate, counting what is due in." className="no-underline">
                    <StatusBadge kind="outlook" status="runs_short">
                      {p.weeks === 0 ? 'None available' : `Runs short around ${fmtDay(p.runsShortOn)}`}
                    </StatusBadge>
                  </Explained>
                ) : null}
                {p.mayExpireOn ? (
                  <Explained tip="The next use-by date comes before this stock would be used up. This assumes the oldest stock goes first." className="no-underline">
                    <StatusBadge kind="outlook" status="may_expire">May expire first: use-by {fmtDay(p.mayExpireOn)}</StatusBadge>
                  </Explained>
                ) : null}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <ChartNote note={outlookNote(insights)} label="How this is worked out" />
        <span>Shortest first. <Link to={STAFF.inventory} className="underline underline-offset-2">Open inventory</Link></span>
      </div>
    </TooltipProvider>
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
