// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/TaskNode.jsx
//
// One task on the worker dashboard — was TaskPathNode.jsx, renamed
// alongside dropping the connecting line between nodes (see staff.css's
// own note on .stf-tasks): "path" implied a route between them that
// no longer exists, and a name that used to be accurate but now isn't
// is worse than no comment at all.
//
// Renders the same way at every task, on purpose: a fixed done/
// current/future state (the old storyboard reference's own version)
// reads as a single order for the day — Receiving, then Packing, then
// Decanting, then Dispatch — which doesn't hold. A shift can be
// packing-only or dispatch-only, so nothing here claims a sequence
// the floor doesn't actually follow.
//
// Row on a phone, circle on wider screens — CSS only (.stf-tasks'
// media query in staff.css), same markup either way.
// ─────────────────────────────────────────────────────────────
import { Link } from 'react-router-dom';

export default function TaskNode({ to, icon, title, meta }) {
  return (
    <Link to={to} className="stf-task-item">
      <span className="stf-task-icon">
        <img
          src={`/icons/${icon}.svg`}
          alt=""
          aria-hidden="true"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </span>
      <span className="stf-task-text">
        <span className="stf-task-title">{title}</span>
        {meta ? <span className="stf-task-meta">{meta}</span> : null}
      </span>
    </Link>
  );
}
