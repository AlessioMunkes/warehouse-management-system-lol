// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/TaskTile.jsx
//
// One square in the worker dashboard's task grid. Uses the same brand
// icon files StaffTabBar.jsx already draws from (client/public/icons)
// rather than a lucide glyph, so the dashboard and the bottom tab bar
// read as the same set of five tasks, not two different icon
// languages for the same thing.
//
// Title and meta are wrapped together (.stf-task-tile-text) rather
// than sitting as loose siblings of the icon: an odd tile count (five
// tasks in a two-column grid) left one tile stranded alone in its own
// row with an awkward empty half — staff.css's
// :last-child:nth-child(odd) rule spans that one tile across the full
// row and switches it to icon-left/text-right, which needs the title
// and meta grouped as one block to lay out next to the icon instead
// of underneath it.
// ─────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom';

export default function TaskTile({ to, icon, title, meta, loading }) {
  return (
    <Link to={to} className="stf-task-tile">
      <img
        className="stf-task-tile-icon"
        src={`/icons/${icon}.svg`}
        alt=""
        aria-hidden="true"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      <span className="stf-task-tile-text">
        <span className="stf-task-tile-title">{title}</span>
        {loading ? (
          <span className="stf-task-tile-meta stf-task-tile-meta-skeleton" aria-hidden="true" />
        ) : meta ? (
          <span className="stf-task-tile-meta">{meta}</span>
        ) : null}
      </span>
    </Link>
  );
}
