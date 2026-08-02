// ─────────────────────────────────────────────────────────────
// src/pages/SelectProgrammeScreen.jsx
// ─────────────────────────────────────────────────────────────
import { useNavigate } from 'react-router-dom';
import { useAuth }     from '../context/AuthContext';
import logo            from '../assets/LOL_Logo.jpg';

const PROGS = [
  { id: 'noc',       name: 'NOURISH OUR CHILDREN', code: 'NOC', active: true  },
  { id: 'soup',      name: 'FEED THE SOIL',         code: 'FTS', active: false },
  { id: 'donations', name: 'LOVE ACTIVISM',         code: 'LA',  active: false },
];

const SelectProgrammeScreen = () => {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();

  const handleSelect = (id) => {
    if (id === 'noc') navigate('/noc');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="page-maroon" style={{ alignItems: 'flex-start', padding: '24px 16px' }}>
      <div style={{ maxWidth: '900px', width: '100%', margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img
            src={logo}
            alt="Ladles of Love"
            style={{ width: '56px', background: '#fff', padding: '6px', marginBottom: '12px' }}
          />
          <h1 className="card-header-title" style={{ fontSize: '14px', letterSpacing: '1px' }}>
            WORKSPACE
          </h1>
          <p className="header-role" style={{ fontSize: '10px', marginTop: '4px' }}>
            WELCOME, {user?.firstName?.toUpperCase()}
          </p>
          <p className="breadcrumb-text" style={{ marginTop: '8px' }}>
            LOL-NOC &gt; SESSION &gt; PROGRAMME SELECT
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
          {PROGS.map((p) => (
            <button
              key={p.id}
              onClick={() => p.active && handleSelect(p.id)}
              disabled={!p.active}
              className="prog-card"
            >
              <div className="prog-card-icon">
                <span>{p.code}</span>
              </div>
              <h2 className="prog-card-title">{p.name}</h2>
              {!p.active && (
                <p style={{ fontSize: '7px', fontWeight: 900, color: '#A4262C', marginTop: '6px', textTransform: 'uppercase' }}>
                  INACTIVE
                </p>
              )}
            </button>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: '28px' }}>
          <button onClick={handleLogout} className="btn-ghost">
            LOGOUT
          </button>
        </div>

      </div>
    </div>
  );
};

export default SelectProgrammeScreen;