import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const NOC_TASKS = [
  { label: 'Procurement', icon: 'truck', path: '/noc/procurement' },
  { label: 'Decanting', icon: 'flask', path: '/decanting' },
  { label: 'Packing', icon: 'package', path: '/programmes/noc/packing' },
  { label: 'ECD collections', icon: 'heart-handshake', path: '/programmes/noc/ecd' },
];

const normalize = (p) => p.replace(/\/+$/, '');

export default function ActivitiesMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = normalize(location.pathname);

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      <button
        className="activities-trigger"
        onClick={() => setOpen(true)}
        aria-label="Open activities menu"
        data-tooltip="Activities"
      >
        <i className="ti ti-layout-grid" aria-hidden="true" />
        <span className="activities-trigger__label">Activities</span>
      </button>

      {open && (
        <div className="activities-drawer-overlay" onClick={() => setOpen(false)}>
          <div className="activities-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="activities-drawer__header">
              <h2>Warehouse activities</h2>
              <button
                className="activities-drawer__close"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>

            <nav className="activities-drawer__list">
              {NOC_TASKS.map((task) => {
                const isActive = normalize(task.path) === currentPath
                  || currentPath.startsWith(`${normalize(task.path)}/`);
                return (
                  <button
                    key={task.path}
                    className={`activities-drawer__item ${isActive ? 'is-active' : ''}`}
                    onClick={() => go(task.path)}
                  >
                    <span className="activities-drawer__icon">
                      <i className={`ti ti-${task.icon}`} aria-hidden="true" />
                    </span>
                    <span className="activities-drawer__label">{task.label}</span>
                    {isActive && <i className="ti ti-check activities-drawer__check" aria-hidden="true" />}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}