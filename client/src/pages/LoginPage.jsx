// ─────────────────────────────────────────────────────────────
// src/pages/LoginPage.jsx
// ─────────────────────────────────────────────────────────────
import { useState }           from 'react';
import { useNavigate }        from 'react-router-dom';
import { useAuth }            from '../context/AuthContext';
import logo                   from '../assets/LOL_Logo.jpg';
import Log_In_Background      from '../assets/Log_In_Background.jpg';

const LoginPage = () => {
  const { login, sessionMessage } = useAuth();
  const navigate   = useNavigate();

  const [username, setUsername]                     = useState('');
  const [password, setPassword]                      = useState('');
  const [showPassword, setShowPassword]               = useState(false);
  const [error, setError]                             = useState('');
  const [isLoading, setIsLoading]                     = useState(false);
  const [showForgotPassword, setShowForgotPassword]   = useState(false);

  // err.status is set by services/api.js. Note this function already
  // read it before that existed, so the status branches below were
  // dead and every failure fell through to err.message.
  const getLoginErrorMessage = (err) => {
    if (err.isNetworkError || err.message === "Failed to fetch") {
      return "Could not reach the server. Check your connection and try again.";
    }
    if (err.status === 401) {
      // Never distinguish "no such user" from "wrong password" — that
      // would let an attacker enumerate valid usernames.
      return "Incorrect username or password.";
    }
    if (err.status === 403) {
      // 403 is NOT a credential failure: the password was correct and
      // the account is deactivated. Showing "incorrect password" here
      // would send someone to reset a password that works fine.
      return err.message || "This account cannot be used to log in.";
    }
    return err.message || "Login failed. Please try again.";
  };

  // Sends managers and workers to their own landing screen instead
  // of everyone defaulting to /programmes.
  const redirectByRole = (loggedInUser) => {
    switch (loggedInUser?.role) {
      case "manager":
        navigate("/manager");
        break;
      case "worker":
      default:
        navigate("/programmes");
        break;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) {
      setError("Username is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }

    setIsLoading(true);
    try {
      const loggedInUser = await login(username.trim(), password);
      redirectByRole(loggedInUser);
    } catch (err) {
      setError(getLoginErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-split">
      <div className="split-left">
        <div className="brand-row">
          <img src={logo} alt="Ladles of Love" className="brand-logo" />
          <span className="brand-name"></span>
        </div>

        <h1 className="hero-title">Welcome to Batches</h1>
        <p className="hero-subtitle">A new and improved way of delivering love</p>

        <div className="card">
          <div className="card-header">
            <h1 className="card-header-title">BATCHES LOG IN </h1>
            <p className="card-header-sub">Please fill in your details to continue</p>
          </div>

          <div className="form-body">
            <h2 className="section-title">EMPLOYEE SIGN IN</h2>

            {/* Explains why the user is looking at a login screen they
                did not navigate to — an expired or revoked session. A
                failed login attempt takes precedence over it. */}
            {!error && sessionMessage && (
              <div className="info-notice">
                <p>{sessionMessage}</p>
              </div>
            )}

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

              <div style={{ marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => navigate('/guest')}
                  className="btn-primary-full"
                  style={{ backgroundColor: 'transparent', color: 'var(--color-maroon)', border: '1px solid var(--color-maroon)' }}
                  disabled={isLoading}
                >
                  LOGIN AS GUEST
                </button>
              </div>
            </form>

            <div className="footer-meta">AUTHORISED PERSONNEL ONLY</div>
          </div>
        </div>
      </div>

      <div className="split-right">
        <img src={Log_In_Background} alt="" className="split-image" />
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