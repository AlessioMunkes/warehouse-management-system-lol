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
  fetchAvailableSlips, fetchMySlip, fetchSlipByCode, claimSlipByCode, claimSlipById, releaseMySlip,
} from '../services/guestSlipAPI';
import {
  GuestShell, GuestScreen, Button, Notice, PalletCard, HelpNote, Loading,
} from '../features/guest/GuestPrimitives';
import { displayName } from '../features/guest/guestFormat';
import { useT } from '../translations';

// Name and "<n> of <total> packed", from the /mine payload the page
// already has. "n" counts every item dealt with (packed or flagged), the
// same count the packing screen's progress uses.
const mySlipSummary = (slip) => {
  const items = slip.items ?? [];
  return {
    who: slip.ecd_name || slip.beneficiary_name || null,
    done: items.filter((i) => i.status !== 'pending').length,
    total: items.length,
  };
};

const GuestHomePage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const t = useT();

  const [slips, setSlips]     = useState([]);
  const [mySlip, setMySlip]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const [code, setCode]       = useState('');
  const [codeError, setCodeError] = useState(null);
  const [busy, setBusy]       = useState(false);

  // Handing the held pallet back from this screen: idle → confirming → releasing.
  const [returning, setReturning] = useState('idle');
  const [returnError, setReturnError] = useState(null);

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
      setCodeError(t('guest.home.codeWrong'));
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

  // Same server release the sign-out uses: the pallet goes back to the
  // floor with its progress kept. Then the list is read again so the
  // pallet just returned is on it, and the code box comes back.
  const returnPallet = async () => {
    setReturning('releasing');
    setReturnError(null);
    try {
      await releaseMySlip();
    } catch (err) {
      setReturnError(err.message || t('guest.signOut.returnFailed'));
      setReturning('confirming');
      return;
    }
    setMySlip(null);
    setReturning('idle');
    try {
      setSlips(await fetchAvailableSlips());
      setError(null);
    } catch (err) {
      setError(err.message);
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

  const name = displayName(user?.firstName, t);
  const held = mySlip ? mySlipSummary(mySlip) : null;

  return (
    <GuestShell nav>
      <GuestScreen
        title={t('guest.home.welcome', { name })}
        lede={mySlip ? t('guest.home.ledeHeld') : t('guest.home.lede')}
      >
        {loading ? <Loading label={t('guest.home.loading')} /> : (
          <>
            {/* Already holding one — offer that before anything else. */}
            {mySlip ? (
              <div className="gst-card gst-stack-tight">
                {/* Laid out like the worker's pallet row: the name as the
                    heading, progress on its own line under it. */}
                <div>
                  <p className="gst-row-pos">{t('guest.home.inProgress')}</p>
                  <h2 className="gst-card-title">{held.who || t('guest.card.partner')}</h2>
                  <p className="gst-card-meta">{t('guest.home.packedOf', { done: held.done, all: held.total })}</p>
                </div>
                {returning === 'idle' ? (
                  <>
                    <Button onClick={() => navigate('/guest/pack')}>{t('guest.home.continue')}</Button>
                    <Button variant="secondary" onClick={() => setReturning('confirming')}>{t('guest.home.return')}</Button>
                  </>
                ) : (
                  <div className="gst-stack-tight" role="alertdialog" aria-labelledby="gst-return-text">
                    <p className="gst-card-meta gst-text-ink" id="gst-return-text">
                      {t('guest.home.returnAsk')}
                    </p>
                    {returnError ? <Notice tone="warn">{returnError}</Notice> : null}
                    <Button onClick={returnPallet} loading={returning === 'releasing'}>{t('guest.home.returnConfirm')}</Button>
                    <Button
                      variant="secondary" disabled={returning === 'releasing'}
                      onClick={() => { setReturning('idle'); setReturnError(null); }}
                    >
                      {t('guest.home.keep')}
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            {error ? <Notice tone="warn">{error}</Notice> : null}

            {/* ── 1. Pick from the list — no typing ──────────── */}
            {!mySlip ? (
              <div className="gst-stack-tight">
                <h2 className="gst-title gst-title-sm">{t('guest.home.listTitle')}</h2>
                {slips.length === 0 ? (
                  <Notice tone="info">
                    {t('guest.home.allTaken')}
                  </Notice>
                ) : (
                  <>
                    <p className="gst-hint">{t('guest.home.tapHint')}</p>
                    {slips.map((slip) => (
                      <PalletCard
                        key={slip.id}
                        slip={slip}
                        actionLabel={t('guest.home.packThis')}
                        onClick={() => pick(slip)}
                        disabled={busy}
                      />
                    ))}
                  </>
                )}
              </div>
            ) : null}

            {/* ── 2. Type the printed code ───────────────────── */}
            {!mySlip ? (
              <form className="gst-card gst-stack-tight" onSubmit={claimByCode}>
                <h2 className="gst-card-title">{t('guest.home.codeTitle')}</h2>
                <p className="gst-card-meta">{t('guest.home.codeHint')}</p>
                <div className="gst-field">
                  <label className="gst-label" htmlFor="gst-code">{t('guest.home.codeLabel')}</label>
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
                  {busy ? t('guest.home.codeBusy') : t('guest.home.codeFind')}
                </button>
              </form>
            ) : null}
          </>
        )}

        <HelpNote>{t('guest.home.help')}</HelpNote>
      </GuestScreen>
    </GuestShell>
  );
};

export default GuestHomePage;
