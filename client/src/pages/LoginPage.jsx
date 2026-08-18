// ─────────────────────────────────────────────────────────────
// src/pages/LoginPage.jsx
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/Batches_Logo.jpeg';
import {HugeiconsIcon} from '@hugeicons/react';
import Log_In_Background from '../assets/Log_In_Background.jpg';

// shadcn/ui components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

// Decorative brand icons used as floating background elements


import {
  FavouriteIcon,
  PackageIcon,
  UserGroupIcon,
  ClipboardIcon,
  CookingPotIcon,
} from '@hugeicons/core-free-icons';
const LoginPage = () => {
  const { login, sessionMessage } = useAuth();
  const navigate = useNavigate();

  // Form field state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // UI state: error message, loading spinner, forgot-password modal visibility
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Maps a caught login error to a user-facing message.
  // err.status is set by services/api.js.
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

  // Handles form submission: validates fields, calls login(), then
  // redirects based on the logged-in user's role.
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
    // Full-height split layout: image on the left, form on the right
    <div className="login-page">

      {/* ── Left side: full-bleed background photo (hidden on small screens) ── */}
      <div className="login-image-side">
        <img src={Log_In_Background} alt="" className="login-bg-image" />
      </div>

      {/* ── Right side: logo, floating icons, and the login card ── */}
      <div className="login-form-side">

      
<HugeiconsIcon icon={FavouriteIcon} size={32} className="login-floating-icon icon-1" />
<HugeiconsIcon icon={PackageIcon} size={24} className="login-floating-icon icon-2" />
<HugeiconsIcon icon={CookingPotIcon} size={28} className="login-floating-icon icon-3" />
<HugeiconsIcon icon={UserGroupIcon} size={36} className="login-floating-icon icon-4" />
<HugeiconsIcon icon={ClipboardIcon} size={20} className="login-floating-icon icon-5" />


        {/* Brand logo sits above the card */}
        <div className="login-logo-top">
          <img src={logo} alt="Batches" className="login-logo" />
        </div>

        {/* ── Login card ── */}
        <Card className="login-card">
          <CardHeader className="login-card-header">
            <CardTitle className="login-title">EMPLOYEE LOG IN</CardTitle>
            <CardDescription className="login-subtitle">
              Please fill in your details to continue
            </CardDescription>
          </CardHeader>

          <CardContent className="login-card-body">

            {/* Session expiry / redirect explanation — only shown when there's
                no active error, since a failed login takes priority */}
            {!error && sessionMessage && (
              <div className="login-notice-info">{sessionMessage}</div>
            )}

            {/* Login error message */}
            {error && (
              <div className="login-notice-error">⚠ {error.toUpperCase()}</div>
            )}

            <form onSubmit={handleSubmit} className="login-form">

              {/* Username field */}
              <div className="login-field">
                <Label htmlFor="username" className="login-label">USERNAME</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. WORKER123"
                  autoComplete="username"
                  disabled={isLoading}
                  className="login-input"
                />
              </div>

              {/* Password field, with show/hide toggle and forgot-password link */}
              <div className="login-field">
                <div className="login-field-row">
                  <Label htmlFor="password" className="login-label">PASSWORD</Label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="login-forgot-link"
                  >
                    FORGOT PASSWORD?
                  </button>
                </div>
                <div className="login-input-wrapper">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={isLoading}
                    className="login-input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="login-toggle-visibility"
                  >
                    {showPassword ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              </div>

              {/* Primary login button — disabled + shows "VERIFYING..." while loading */}
              <Button type="submit" disabled={isLoading} className="login-btn-primary">
                {isLoading ? 'VERIFYING...' : 'LOG IN'}
              </Button>

              {/* Guest login — skips credentials, goes straight to /guest */}
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/guest')}
                disabled={isLoading}
                className="login-btn-guest"
              >
                LOG IN AS GUEST
              </Button>
            </form>

            <p className="login-footer-meta">AUTHORISED PERSONNEL ONLY</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Forgot password modal ──
          Controlled entirely by showForgotPassword state; shadcn's Dialog
          handles overlay, focus trap, and escape/click-outside-to-close. */}
      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent className="forgot-modal-content">
          <DialogHeader>
            <DialogTitle className="forgot-modal-title">FORGOT PASSWORD?</DialogTitle>
            <DialogDescription className="forgot-modal-desc">
              Please contact your <strong>Warehouse Manager</strong> or{' '}
              <strong>Administrator</strong> to reset your password.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="forgot-modal-footer">
            <Button onClick={() => setShowForgotPassword(false)} className="forgot-modal-btn">
              GOT IT
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LoginPage;