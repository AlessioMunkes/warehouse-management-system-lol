// ─────────────────────────────────────────────────────────────
// src/pages/GuestLoginPage.jsx
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../services/api';
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Multi-warehouse: which site is this volunteer at? ─────────
  // A poster's link can name it (?w=gauteng). Otherwise, if there is
  // more than one warehouse, the page asks. With one database the list
  // comes back empty and nothing extra is shown.
  const [searchParams] = useSearchParams();
  const fromLink = (searchParams.get('w') || '').trim().toLowerCase();
  const [sites, setSites] = useState([]);
  const [warehouse, setWarehouse] = useState(fromLink);

  useEffect(() => {
    let cancelled = false;
    apiGet('/api/public/warehouses')
      .then((data) => {
        if (cancelled || !data?.multiWarehouse) return;
        const list = data.warehouses || [];
        setSites(list);
        const known = list.some((w) => w.code === fromLink);
        if (list.length === 1) setWarehouse(list[0].code);
        else if (!known) setWarehouse('');
      })
      .catch(() => { /* treated as one warehouse; the server still decides */ });
    return () => { cancelled = true; };
  }, [fromLink]);

  const linkNamesSite = sites.some((w) => w.code === fromLink);
  const mustChooseSite = sites.length > 1 && !linkNamesSite;

  // There used to be a second, fire-and-forget POST to
  // /api/volunteers/sign-in right here, on the reasoning that a failed
  // audit write must not lock a volunteer out at the gate. But
  // loginAsGuest posts to that same endpoint, and the endpoint INSERTS —
  // so every arrival created two `volunteers` rows. The session bound to
  // the second; the first was orphaned, permanently open (nothing ever
  // sets its signed_out_at), counted as a separate arrival in the guest
  // log, and double-counted in volunteer hours.
  //
  // One call now, and it is the one that creates the session.
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (mustChooseSite && !warehouse) {
      setError('Choose the warehouse you are at.');
      return;
    }
    if (isSubmitting) return; // a double tap is two arrivals otherwise

    setIsSubmitting(true);
    setError('');

    // Navigate only on success. Sign-in IS the session: if it fails there
    // is no cookie and no volunteer row, so continuing to /guest-home
    // would strand someone on a screen where every request 401s.
    try {
      await loginAsGuest(name.trim(), warehouse || null);
      navigate('/guest-home', { replace: true });
    } catch (err) {
      console.error('Guest sign-in failed:', err);
      setError(err?.message || 'Could not sign you in. Please try again.');
      setIsSubmitting(false);
    }
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

              {/* Multi-warehouse only: which site the volunteer is at */}
              {mustChooseSite && (
                <div className="login-field">
                  <Label htmlFor="warehouse" className="login-label">WAREHOUSE</Label>
                  <select
                    id="warehouse"
                    value={warehouse}
                    onChange={(e) => {
                      setWarehouse(e.target.value);
                      setError('');
                    }}
                    // Same shape as the name field above (components/ui/input.jsx).
                    className="login-input h-9 w-full rounded-3xl border border-input bg-input/50 px-3 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 md:text-sm"
                  >
                    <option value="">Choose where you are today</option>
                    {sites.map((site) => (
                      <option key={site.code} value={site.code}>{site.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Primary sign-in button */}
              <Button type="submit" className="login-btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'SIGNING IN…' : 'LOGIN'}
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
