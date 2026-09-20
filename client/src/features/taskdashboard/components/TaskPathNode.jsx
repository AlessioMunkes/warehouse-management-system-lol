// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/TaskPathNode.jsx
//
// One stop on the worker dashboard's path — the round, connected-line
// layout from the other old storyboard, used in place of the square
// tile grid.
//
// The storyboard's own version marks one stop "you are here" with a
// solid circle and fades the rest to a dashed outline, reading as a
// single fixed order for the day (Receiving, then Packing, then
// Decanting, then Dispatch). That doesn't hold here: a shift can be
// packing-only or dispatch-only, there's no real "next stop", and a
// fabricated one would just be wrong most days. So every node renders
// the same way — a plain outlined circle, no done/current/future
// state — keeping the round, connected shape that was asked for
// without inventing a sequence the floor doesn't actually follow.
//
// meta is a static instruction ("Pack a picking slip"), not a live
// count any more — see TaskDashboardPage.jsx's own note — so there's
// nothing to load and no skeleton state here.
// ─────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom';

export default function TaskPathNode({ to, icon, title, meta }) {
  return (
    <Link to={to} className="stf-path-node">
      <span className="stf-path-circle">
        <img
          src={`/icons/${icon}.svg`}
          alt=""
          aria-hidden="true"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </span>
      <span className="stf-path-title">{title}</span>
      {meta ? <span className="stf-path-meta">{meta}</span> : null}
    </Link>
  );
}
