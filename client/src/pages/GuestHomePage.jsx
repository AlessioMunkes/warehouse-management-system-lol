// ─────────────────────────────────────────────────────────────
// client/src/pages/GuestHomePage.jsx
//
// BR-22 screen (c): where a Love Activist lands after signing in at
// the gate, and the home of entry path 3 — arriving with no QR code
// at all.
//
// THIS IS A PRIMARY SCREEN, NOT A FALLBACK. A volunteer with no
// smartphone, a broken camera, or no idea what a QR code is must be
// able to complete the whole flow from here. The QR is an accelerator;
// this is the road everyone can walk.
//
// Two ways on, in the order most people will need them:
//   1. Pick from today's unclaimed pallets — no typing at all, which
//      is the most accessible option on the screen and so it comes
//      first and takes the most room.
//   2. Type the 6-character code printed under the QR, for someone
//      holding a specific poster whose camera would not scan it.
//
// Replaces a 23-line stub that was a heading and a logout button.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchAvailableSlips, fetchMySlip, fetchSlipByCode, claimSlipByCode, claimSlipById,
} from '../services/guestSlipAPI';
import {
  GuestShell, GuestScreen, Button, Notice, PalletCard, HelpNote, Loading,
} from '../features/guest/components/GuestPrimitives';

const firstNameOf = (full) => (full || '').trim().split(/\s+/)[0] || 'there';

const GuestHomePage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [slips, setSlips]     = useState([]);
  const [mySlip, setMySlip]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const [code, setCode]       = useState('');
  const [codeError, setCodeError] = useState(null);
  const [busy, setBusy]       = useState(false);

  useEffect(() => {
    let cancelled = false;

    // "Do I already have a pallet" is asked first, because a volunteer
    // who wandered back to this screen mid-pallet should be offered
    // their own work, not a fresh list to start again from.
    Promise.all([
      fetchMySlip().catch(() => null),
      fetchAvailableSlips().catch((err) => { if (!cancelled) setError(err.message); return []; }),
    ])
      .then(([mine, available]) => {
        if (cancelled) return;
        setMySlip(mine);
        setSlips(available ?? []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const claimByCode = async (e) => {
    e.preventDefault();
    const trimmed = code.trim().toLowerCase();
    if (trimmed.length !== 6) {
      setCodeError('The code is 6 characters, printed under the QR code.');
      return;
    }

    setBusy(true);
    setCodeError(null);
    try {
      // Look it up first so a wrong code is a plain "we could not find
      // that", not a failed claim the volunteer has to interpret.
      await fetchSlipByCode(trimmed);
      await claimSlipByCode(trimmed);
      navigate('/guest/pack');
    } catch (err) {
      setCodeError(err.message);
      setBusy(false);
    }
  };

  const pick = async (slip) => {
    setBusy(true);
    setError(null);
    try {
      // By id, not by code: the list came from the server and the
      // volunteer never saw a token. Their session authorises it, and
      // it binds to the volunteer they already are rather than creating
      // a second arrival for someone already in the building.
      await claimSlipById(slip.id);
      navigate('/guest/pack');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const name = firstNameOf(user?.firstName);

  return (
    <GuestShell>
      <GuestScreen
        title={<>Welcome, <span className="gst-underline">{name}</span></>}
        lede="Thank you for being here today. Pick a pallet below and we’ll take it one step at a time."
      >
        {loading ? <Loading label="Loading today’s pallets" /> : (
          <>
            {/* Already holding one — offer that before anything else. */}
            {mySlip ? (
              <div className="gst-stack-tight">
                <Notice tone="good">You already have a pallet on the go.</Notice>
                <Button onClick={() => navigate('/guest/pack')}>Carry on packing</Button>
              </div>
            ) : null}

            {error ? <Notice tone="warn">{error}</Notice> : null}

            {/* ── 1. Pick from the list — no typing ──────────── */}
            {!mySlip ? (
              <div className="gst-stack-tight">
                <h2 className="gst-title gst-title-sm">Today’s pallets</h2>
                {slips.length === 0 ? (
                  <Notice tone="info">
                    Every pallet for today has someone on it. Ask a staff member what needs doing next.
                  </Notice>
                ) : (
                  <>
                    <p className="gst-hint">Tap the one you are standing at.</p>
                    {slips.map((slip) => (
                      <PalletCard
                        key={slip.id}
                        slip={slip}
                        actionLabel="Pack this one"
                        onClick={busy ? undefined : () => pick(slip)}
                      />
                    ))}
                  </>
                )}
              </div>
            ) : null}

            {/* ── 2. Type the printed code ───────────────────── */}
            {!mySlip ? (
              <form className="gst-card gst-stack-tight" onSubmit={claimByCode}>
                <h2 className="gst-card-title">Have a code instead?</h2>
                <p className="gst-card-meta">
                  There are 6 characters printed under the QR code on the pallet.
                </p>
                <div className="gst-field">
                  <label className="gst-label" htmlFor="gst-code">Pallet code</label>
                  <input
                    id="gst-code"
                    className="gst-input gst-input-code"
                    value={code}
                    onChange={(e) => { setCode(e.target.value); setCodeError(null); }}
                    placeholder="a1b2c3"
                    maxLength={6}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck="false"
                    inputMode="text"
                  />
                </div>
                {codeError ? <Notice tone="warn">{codeError}</Notice> : null}
                <button type="submit" className="gst-btn gst-btn-secondary" disabled={busy || code.trim().length !== 6}>
                  {busy ? 'Just a moment…' : 'Find this pallet'}
                </button>
              </form>
            ) : null}
          </>
        )}

        <Button variant="ghost" onClick={async () => { await logout(); navigate('/guest'); }}>
          I’m finished for today
        </Button>

        <HelpNote>New here, or not sure which pallet is yours?</HelpNote>
      </GuestScreen>
    </GuestShell>
  );
};

export default GuestHomePage;
