// ─────────────────────────────────────────────────────────────
// src/pages/SelectNOCjob.jsx
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useNavigate }      from 'react-router-dom';
import { useAuth }          from '../context/AuthContext';
import logo                 from '../assets/LOL_Logo.jpg';

// `to` is the route each task opens. A task with no `to` has no page
// built yet and renders disabled, so the tile can't lead to a dead route.
const TASKS = [
  { id: 'procurement', label: 'PROCUREMENT',  desc: 'SUPPLIER DELIVERIES & INTAKE', to: '/noc/procurement' },
  { id: 'decanting',   label: 'DECANTING',    desc: 'VEGETABLE WEIGHING & BAGGING', to: '/noc/decanting' },
  { id: 'packing',     label: 'PACKING',      desc: 'PALLET PACKING',               to: '/noc/packing' },
  { id: 'inventory',   label: 'INVENTORY',    desc: 'STOCK LEVELS & ADJUSTMENTS',   to: '/noc/inventory' },
  { id: 'ecdDispatch', label: 'ECD DISPATCH', desc: 'TUESDAY & THURSDAY DISPATCH',  to: null },
];

const SelectNOCjob = () => {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const [selected, setSelected] = useState(null);

  const handleContinue = () => {
    const task = TASKS.find((t) => t.id === selected);
    if (task?.to) navigate(task.to);
  };

  const handleBack = () => navigate('/programmes');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="page-light">

      <div className="header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src={logo} alt="Logo" style={{ width: '24px', height: '24px', background: '#fff', padding: '2px' }} />
          <div>
            <p className="header-logo-text">LADLES OF LOVE</p>
            <p className="header-role">NOURISH OUR CHILDREN</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={handleBack}   className="btn-ghost">← BACK</button>
          <button onClick={handleLogout} className="btn-ghost">LOGOUT</button>
        </div>
      </div>

      <div className="breadcrumb-bar">
        <p className="breadcrumb-text">LOL-NOC &gt; LOGISTICS &gt; TASK SELECT</p>
      </div>

      <div style={{ flex: 1, padding: '20px', maxWidth: '560px', margin: '0 auto', width: '100%' }}>
        <h1 className="section-title" style={{ fontSize: '13px', marginBottom: '2px' }}>SELECT TASK</h1>
        <p style={{ fontSize: '9px', color: '#605E5C', marginBottom: '16px' }}>
          CHOOSE YOUR ASSIGNMENT FOR THIS SESSION
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
          {TASKS.map((t) => (
            <button
              key={t.id}
              onClick={() => t.to && setSelected(t.id)}
              disabled={!t.to}
              className={`task-row${selected === t.id ? ' selected' : ''}`}
            >
              <div className="task-row-icon">{t.label[0]}</div>
              <div style={{ flex: 1 }}>
                <p className="task-row-label">{t.label}</p>
                <p className="task-row-desc">{t.desc}</p>
              </div>
              {!t.to && (
                <span style={{ fontSize: '7px', fontWeight: 900, color: '#A4262C', textTransform: 'uppercase' }}>
                  OFF
                </span>
              )}
              {selected === t.id && t.to && (
                <span style={{ fontSize: '12px', fontWeight: 900, color: '#E31E24' }}>✓</span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={handleContinue}
          disabled={!selected}
          className="btn-primary-full"
          style={{ height: '36px' }}
        >
          CONTINUE TO {selected ? TASKS.find(t => t.id === selected)?.label : 'TASK'} →
        </button>

        <div className="footer-meta">
          <p>LOGGED: {user?.firstName?.toUpperCase()} | ROLE: {user?.role?.toUpperCase()}</p>
        </div>
      </div>
    </div>
  );
};

export default SelectNOCjob;