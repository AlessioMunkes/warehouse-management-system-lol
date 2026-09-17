// src/components/TaskNavGrid.jsx
import { useNavigate, useLocation } from 'react-router-dom';
import { STAFF, PACKING } from '../../../routes/paths';

const NOC_TASKS = [
  { label: 'Procurement', icon: 'truck', path: STAFF.receiving },
  { label: 'Decanting', icon: 'flask', path: STAFF.decanting },
  { label: 'Packing', icon: 'package', path: PACKING.board },
  { label: 'Dispatch', icon: 'heart-handshake', path: STAFF.dispatch },
];

// Matches if either path fully contains the other's last meaningful
// segment — forgiving of small naming mismatches like
// "/decant" vs "/decanting" that break a strict startsWith check.
const isSamePage = (currentPath, taskPath) => {
  const normalize = (p) => p.replace(/\/+$/, ''); // strip trailing slash
  const current = normalize(currentPath);
  const task = normalize(taskPath);

  if (current === task || current.startsWith(`${task}/`)) return true;

  const taskSegment = task.split('/').filter(Boolean).pop() ?? '';
  const currentSegment = current.split('/').filter(Boolean).pop() ?? '';

  return (
    !!taskSegment &&
    !!currentSegment &&
    (currentSegment.startsWith(taskSegment) || taskSegment.startsWith(currentSegment))
  );
};

const TaskNavGrid = ({ tasks = NOC_TASKS }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const visibleTasks = tasks.filter(
    (task) => !isSamePage(location.pathname, task.path)
  );

  return (
    <nav className="task-nav-grid" aria-label="Nourish Our Children tasks">
      {visibleTasks.map((task) => (
        <button
          key={task.path}
          type="button"
          className="task-nav-item"
          onClick={() => navigate(task.path)}
        >
          <span className="task-nav-icon" aria-hidden="true">
            <i className={`ti ti-${task.icon}`} />
          </span>
          <span className="task-nav-label">{task.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default TaskNavGrid;