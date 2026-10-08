// ─────────────────────────────────────────────────────────────
// src/pages/LoginPage.jsx
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/Batches_Logo.jpeg';
import { HugeiconsIcon } from '@hugeicons/react';
import Log_In_Background from '../assets/Log_In_Background.jpg';
import { STAFF, ADMIN, LANDING } from '../routes/paths';
import { requestReset } from '../services/passwordResetAPI';

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

// Shown after a reset request, whatever the server actually did with
// it — identical whether the email matched an account or not. See
// passwordReset.service.js's no-enumeration guarantee: this page must
// not improve on that by drawing a distinction the server deliberately
// doesn't make.
const RESET_SENT_MESSAGE = "If that email is registered, we've sent a reset link.";
const RESET_RATE_LIMITED_MESSAGE = 'Too many requests, try again in a few minutes.';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Image loading state
  const [imageLoaded, setImageLoaded] = useState(false);

  // Form field state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // UI state
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // ResetPasswordPage's "Request a new link" sends the visitor back
  // here with ?forgot=1 so they land straight on the request form
  // instead of having to find the link again. Lazy initial state
  // (not an effect) — this only needs to run once, against the URL
  // this page was actually opened with.
  const [showForgotPassword, setShowForgotPassword] = useState(
    () => searchParams.get('forgot') === '1'
  );

  // A page-level notice from elsewhere (currently: ResetPasswordPage's
  // "Password updated, sign in" after a successful reset). Read once;
  // react-router keeps location.state around across re-renders of the
  // same entry, not just the first.
  const [pageNotice] = useState(location.state?.message ?? null);

  // ── Forgot-password request form ──────────────────────────────
  const [resetEmail, setResetEmail] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');

  const closeForgotPassword = (open) => {
    setShowForgotPassword(open);
    if (!open) {
      // Reset for next time — reopening should always start on the
      // form, never on a stale "sent" state from a previous visit.
      setResetEmail('');
      setResetSubmitting(false);
      setResetSent(false);
      setResetError('');
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setResetError('Email is required.');
      return;
    }

    setResetSubmitting(true);
    setResetError('');
    try {
      await requestReset(resetEmail.trim());
      // Shown regardless of what the server actually found — see
      // RESET_SENT_MESSAGE's own comment.
      setResetSent(true);
    } catch (err) {
      if (err.status === 429) {
        setResetError(RESET_RATE_LIMITED_MESSAGE);
      } else if (err.isNetworkError) {
        setResetError('Could not reach the server. Check your connection and try again.');
      } else {
        // Anything else (an unexpected 500, etc.) still resolves to
        // the same generic outcome — this form must never surface a
        // difference that could tell a caller whether an email exists.
        setResetSent(true);
      }
    } finally {
      setResetSubmitting(false);
    }
  };

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
      console.error("[LOGIN] handleSubmit caught:", err);
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
            <div className="login-field-row">
              <button
                type="button"
                onClick={() => navigate(LANDING)}
                className="login-forgot-link"
              >
                ← BACK TO HOME
              </button>
            </div>
            <CardTitle className="login-title">EMPLOYEE LOG IN</CardTitle>
            <CardDescription className="login-subtitle">
              Please fill in your details to continue
            </CardDescription>
          </CardHeader>

          <CardContent className="login-card-body">

            {/* A message handed over from elsewhere — currently only
                ResetPasswordPage's "password updated" redirect. */}
            {pageNotice && (
              <div className="login-notice-info">{pageNotice}</div>
            )}

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
      <Dialog open={showForgotPassword} onOpenChange={closeForgotPassword}>
        <DialogContent className="forgot-modal-content">
          {resetSent ? (
            <>
              <DialogHeader>
                <DialogTitle className="forgot-modal-title">CHECK YOUR EMAIL</DialogTitle>
                <DialogDescription className="forgot-modal-desc forgot-modal-desc-sent">
                  {RESET_SENT_MESSAGE}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="forgot-modal-footer">
                <Button onClick={() => closeForgotPassword(false)} className="forgot-modal-btn">
                  GOT IT
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="forgot-modal-title">FORGOT PASSWORD?</DialogTitle>
                <DialogDescription className="forgot-modal-desc">
                  Enter your email and we'll send you a link to reset your password.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleResetSubmit} className="forgot-modal-form">
                {resetError && (
                  <div className="login-notice-error">⚠ {resetError}</div>
                )}
                <div className="login-field">
                  <Label htmlFor="reset-email" className="login-label">EMAIL</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    disabled={resetSubmitting}
                    className="login-input"
                  />
                </div>
                <Button type="submit" disabled={resetSubmitting} className="forgot-modal-btn">
                  {resetSubmitting ? 'SENDING...' : 'SEND RESET LINK'}
                </Button>
              </form>

              <p className="forgot-modal-footnote">
                No email on your account? Contact your manager.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LoginPage;