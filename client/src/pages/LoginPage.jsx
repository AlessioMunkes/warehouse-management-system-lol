// ─────────────────────────────────────────────────────────────
// src/pages/LoginPage.jsx
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/Batches_Logo.jpeg';
import { HugeiconsIcon } from '@hugeicons/react';
import Log_In_Background from '../assets/Log_In_Background.jpg';
import { STAFF, ADMIN } from '../routes/paths';

// shadcn/ui components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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

import {
  FavouriteIcon,
  PackageIcon,
  UserGroupIcon,
  ClipboardIcon,
  CookingPotIcon,
} from '@hugeicons/core-free-icons';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  // Image loading state
  const [imageLoaded, setImageLoaded] = useState(false);

  // Form field state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // UI state
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const getLoginErrorMessage = (err) => {
    if (err.isNetworkError || err.message === "Failed to fetch") {
      return "Could not reach the server. Check your connection and try again.";
    }
    if (err.status === 401) {
      return "Incorrect username or password.";
    }
    if (err.status === 403) {
      return err.message || "This account cannot be used to log in.";
    }
    return err.message || "Login failed. Please try again.";
  };

  const redirectByRole = (loggedInUser) => {
    switch (loggedInUser?.role) {
      case "admin":
        navigate(ADMIN.dashboard);
        break;
      case "manager":
        navigate("/manager");
        break;
      default:
        navigate(STAFF.home);
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
    <div className="login-page">

      {/* ── Left side: full-bleed photo with skeleton loader ── */}
      <div className="login-image-side">
        {!imageLoaded && (
          <Skeleton className="login-image-skeleton" />
        )}
        <img
          src={Log_In_Background}
          alt="Login background"
          onLoad={() => setImageLoaded(true)}
          className={`login-bg-image ${imageLoaded ? 'is-loaded' : ''}`}
        />
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

            {/* Error message shown only after invalid attempt */}
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

              {/* Password field */}
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

              {/* Buttons */}
              <Button type="submit" disabled={isLoading} className="login-btn-primary">
                {isLoading ? 'VERIFYING...' : 'LOG IN'}
              </Button>

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

      {/* Forgot Password Modal */}
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