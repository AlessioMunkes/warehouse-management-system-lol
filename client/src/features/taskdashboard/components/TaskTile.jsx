// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/TaskTile.jsx
//
// One square in the worker dashboard's task grid. Uses the same brand
// icon files StaffTabBar.jsx already draws from (client/public/icons)
// rather than a lucide glyph, so the dashboard and the bottom tab bar
// read as the same set of five tasks, not two different icon
// languages for the same thing.
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
      <span className="stf-task-tile-title">{title}</span>
      {loading ? (
        <span className="stf-task-tile-meta stf-task-tile-meta-skeleton" aria-hidden="true" />
      ) : meta ? (
        <span className="stf-task-tile-meta">{meta}</span>
      ) : null}
    </Link>
  );
}
