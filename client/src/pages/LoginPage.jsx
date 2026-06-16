// ─────────────────────────────────────────────────────────────
// src/pages/LoginPage.jsx
// ─────────────────────────────────────────────────────────────
import React, { useState }   from 'react';
import { useNavigate }        from 'react-router-dom';
import { useAuth }            from '../context/AuthContext';
import logo                   from '../assets/LOL_Logo.jpg';

const LoginPage = () => {
  const { login }    = useAuth();
  const navigate     = useNavigate();

  const [username,           setUsername]           = useState('');
  const [password,           setPassword]           = useState('');
  const [showPassword,       setShowPassword]       = useState(false);
  const [error,              setError]              = useState('');
  const [isLoading,          setIsLoading]          = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError('Username is required.'); return; }
    if (!password)        { setError('Password is required.');  return; }
    setIsLoading(true);
    try {
      await login(username.trim(), password);
      navigate('/programmes');
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-maroon">
      <div className="card">

        <div className="card-header">
          <img
            src={logo}
            alt="Ladles of Love"
            style={{ width: '48px', height: '48px', marginBottom: '6px', background: '#fff', padding: '3px' }}
          />
          <h1 className="card-header-title">WAREHOUSE SYSTEM</h1>
          <p className="card-header-sub">PROPERTY OF LADLES OF LOVE</p>
        </div>

        <div className="form-body">
          <h2 className="section-title">EMPLOYEE SIGN IN</h2>

          {error && (
            <div className="alert-error">
              <p>⚠ {error.toUpperCase()}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">USERNAME</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. WORKER123"
                autoComplete="username"
                disabled={isLoading}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">PASSWORD</label>
              <div className="form-input-group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={isLoading}
                  className="form-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="btn-toggle-password"
                >
                  {showPassword ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </div>

            <div style={{ textAlign: 'right', marginBottom: '16px' }}>
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="btn-link"
              >
                FORGOT PASSWORD?
              </button>
            </div>

            <button type="submit" disabled={isLoading} className="btn-primary-full">
              {isLoading ? 'VERIFYING...' : 'LOGIN'}
            </button>
          </form>

          <div className="footer-meta">AUTHORISED PERSONNEL ONLY</div>
        </div>
      </div>

      {showForgotPassword && (
        <div className="modal-overlay" onClick={() => setShowForgotPassword(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">FORGOT PASSWORD?</h3>
            <p className="modal-body">
              Please contact your <strong>Warehouse Manager</strong> or{' '}
              <strong>Administrator</strong> to reset your password.
            </p>
            <button
              onClick={() => setShowForgotPassword(false)}
              className="btn-primary-full"
            >
              GOT IT
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;