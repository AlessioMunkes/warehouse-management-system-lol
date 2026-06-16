import logo from '../assets/LOL_Logo.jpg';

const TASKS = [
  { id: 'procurement', label: 'PROCUREMENT',  desc: 'SUPPLIER DELIVERIES & INTAKE',  active: true  },
  { id: 'decanting',   label: 'DECANTING',    desc: 'VEGETABLE WEIGHING & BAGGING',  active: false },
  { id: 'packing',     label: 'PACKING',      desc: 'PALLET PACKING',                active: false },
  { id: 'ecdDispatch', label: 'ECD DISPATCH', desc: 'TUESDAY & THURSDAY DISPATCH',   active: false },
];

const NourishSelect = ({ userName, userRole, onSelect, onBack, onLogout }) => {
  const [selected, setSelected] = useState(null);

  return (
    <div className="page-light">

      {/* Header bar */}
      <div className="header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src={logo} alt="Logo" style={{ width: '24px', height: '24px', background: '#fff', padding: '2px' }} />
          <div>
            <p className="header-logo-text">LADLES OF LOVE</p>
            <p className="header-role">NOURISH OUR CHILDREN</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={onBack}   className="btn-ghost">← BACK</button>
          <button onClick={onLogout} className="btn-ghost">LOGOUT</button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="breadcrumb-bar">
        <p className="breadcrumb-text">LOL-NOC &gt; LOGISTICS &gt; TASK SELECT</p>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '20px', maxWidth: '560px', margin: '0 auto', width: '100%' }}>
        <h1 className="section-title" style={{ fontSize: '13px', marginBottom: '2px' }}>SELECT TASK</h1>
        <p style={{ fontSize: '9px', color: '#605E5C', marginBottom: '16px' }}>
          CHOOSE YOUR ASSIGNMENT FOR THIS SESSION
        </p>

        {/* Task list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
          {TASKS.map((t) => (
            <button
              key={t.id}
              onClick={() => t.active && setSelected(t.id)}
              disabled={!t.active}
              className={`task-row${selected === t.id ? ' selected' : ''}`}
            >
              <div className="task-row-icon">{t.label[0]}</div>
              <div style={{ flex: 1 }}>
                <p className="task-row-label">{t.label}</p>
                <p className="task-row-desc">{t.desc}</p>
              </div>
              {!t.active && (
                <span style={{ fontSize: '7px', fontWeight: 900, color: '#A4262C', textTransform: 'uppercase' }}>
                  OFF
                </span>
              )}
              {selected === t.id && t.active && (
                <span style={{ fontSize: '12px', fontWeight: 900, color: '#E31E24' }}>✓</span>
              )}
            </button>
          ))}
        </div>

        {/* Continue button */}
        <button
          onClick={() => { if (selected) onSelect(selected); }}
          disabled={!selected}
          className="btn-primary-full"
          style={{ height: '36px' }}
        >
          CONTINUE TO {selected ? TASKS.find(t => t.id === selected)?.label : 'TASK'} →
        </button>

        {/* Footer info */}
        <div className="footer-meta">
          <p>LOGGED: {userName?.toUpperCase()} | ROLE: {userRole?.toUpperCase().replace('_', ' ')}</p>
          <p style={{ marginTop: '3px' }}>
            [PROD-NODE-01] | SESSION: {Math.random().toString(36).substr(2, 6).toUpperCase()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default NourishSelect;
