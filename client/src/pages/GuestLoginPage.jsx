// ─────────────────────────────────────────────────────────────
// src/pages/GuestLoginPage.jsx
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiPost } from '../services/api';
import logo from '../assets/Batches_Logo.jpeg';
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

// Decorative brand icons used as floating background elements
import { HugeiconsIcon } from '@hugeicons/react';
import {
  FavouriteIcon,
  PackageIcon,
  UserGroupIcon,
  ClipboardIcon,
  CookingPotIcon,
} from '@hugeicons/core-free-icons';

const GuestLoginPage = () => {
  const { loginAsGuest } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }

    // Fire-and-forget for now — a failed audit write must never lock
    // a volunteer out of the system at the gate.
    try {
      await apiPost('/api/volunteers/sign-in', { name: name.trim() });
    } catch (err) {
      console.error('Guest sign-in not recorded:', err);
    }

    loginAsGuest(name.trim());
    navigate('/guest-home', { replace: true });
  };

  return (
    // Full-height split layout: image on the left, form on the right
    <div className="login-page">

      {/* ── Left side: full-bleed background photo (hidden on small screens) ── */}
      <div className="login-image-side">
        <img src={Log_In_Background} alt="" className="login-bg-image" />
      </div>

      {/* ── Right side: logo, floating icons, and the guest sign-in card ── */}
      <div className="login-form-side">

        {/* Decorative floating icons */}
        <HugeiconsIcon icon={FavouriteIcon} size={32} className="login-floating-icon icon-1" />
        <HugeiconsIcon icon={PackageIcon} size={24} className="login-floating-icon icon-2" />
        <HugeiconsIcon icon={CookingPotIcon} size={28} className="login-floating-icon icon-3" />
        <HugeiconsIcon icon={UserGroupIcon} size={36} className="login-floating-icon icon-4" />
        <HugeiconsIcon icon={ClipboardIcon} size={20} className="login-floating-icon icon-5" />

        {/* Brand logo, spinning, sits above the card */}
        <div className="login-logo-top">
          <img src={logo} alt="Ladles of Love" className="login-logo" />
        </div>

        {/* ── Guest sign-in card ── */}
        <Card className="login-card">
          <CardHeader className="login-card-header">
            <CardTitle className="login-title">GUEST LOG IN</CardTitle>
            <CardDescription className="login-subtitle">
              Please fill in your details to continue
            </CardDescription>
          </CardHeader>

          <CardContent className="login-card-body">
            <p className="login-section-title">GUEST SIGN IN</p>

            {error && (
              <div className="login-notice-error">⚠ {error.toUpperCase()}</div>
            )}

            <form onSubmit={handleSubmit} className="login-form">

              {/* Full name field — the only field on this page */}
              <div className="login-field">
                <Label htmlFor="name" className="login-label">FULL NAME</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError('');
                  }}
                  placeholder="e.g. THABO MOKOENA"
                  className="login-input"
                />
              </div>

              {/* Primary sign-in button */}
              <Button type="submit" className="login-btn-primary">
                LOGIN
              </Button>

              {/* Back to employee sign-in */}
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/login')}
                className="login-btn-guest"
              >
                ← BACK TO EMPLOYEE SIGN IN
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GuestLoginPage;