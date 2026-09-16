// ─────────────────────────────────────────────────────────────
// client/src/pages/SlipPreviewPage.jsx
//
// BR-22 screens (a) and (b): what a volunteer sees when they scan the
// QR on a pallet, and the name entry that follows.
//
// Two steps in one route, not two routes. Scanning a code and saying
// your name is one action to the person doing it, and a URL change
// between them would put a back button in the middle of it.
//
// PUBLIC. No session, no account. The whole point of BR-22 is that
// someone holding a printed poster gets in without the login flow.
//
// If they already have a guest session — they signed in at the gate,
// then scanned a pallet — the name step is skipped: the server binds
// the existing volunteer rather than creating a second one, so asking
// again would be asking someone to introduce themselves twice.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchSlipPreview, claimSlipByToken } from '../services/guestSlipAPI';
import {
  GuestShell, GuestScreen, PlaceBar, Button, Notice,
  PalletCard, HelpNote, Loading,
} from '../features/guest/components/GuestPrimitives';

const SlipPreviewPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, refreshFromClaim } = useAuth();

  const [slip, setSlip]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const [step, setStep]   = useState('preview');   // 'preview' | 'name'
  const [name, setName]   = useState('');
  const [busy, setBusy]   = useState(false);

  const alreadySignedIn = user?.role === 'guest';

  useEffect(() => {
    let cancelled = false;
    fetchSlipPreview(token)
      .then((data) => { if (!cancelled) setSlip(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const claim = async (volunteerName) => {
    setBusy(true);
    setError(null);
    try {
      const data = await claimSlipByToken(token, volunteerName);
      refreshFromClaim(data.user);
      navigate('/guest/pack', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  // ── Could not load ──────────────────────────────────────────
  if (loading) {
    return <GuestShell><Loading label="Finding this pallet" /></GuestShell>;
  }

  if (!slip) {
    return (
      <GuestShell>
        <GuestScreen
          title="We could not find that pallet"
          lede="The code may have been typed wrong, or this pallet may already be finished."
        >
          <Notice tone="warn">{error || 'That code did not match a pallet.'}</Notice>
          <Button onClick={() => navigate('/guest')}>Sign in without a code</Button>
          <HelpNote>Still stuck?</HelpNote>
        </GuestScreen>
      </GuestShell>
    );
  }

  const taken = slip.isClaimed;
  const finished = !['pending', 'in_progress'].includes(slip.status);

  // ── (b) Name entry ──────────────────────────────────────────
  // Framed as "so we can thank you", never as a login form. There is no
  // password, no account, and nothing to get wrong.
  if (step === 'name') {
    return (
      <GuestShell>
        <GuestScreen
          title="First — what should we call you?"
          lede="So we can thank you properly at the end. That is the only reason we ask."
        >
          <PlaceBar items={[
            { text: 'Packing for' },
            { text: slip.beneficiaryName, strong: true },
          ]} />

          <form
            className="gst-stack"
            onSubmit={(e) => { e.preventDefault(); if (name.trim()) claim(name.trim()); }}
          >
            <div className="gst-field">
              <label className="gst-label" htmlFor="gst-name">Your name</label>
              <input
                id="gst-name"
                className="gst-input"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                placeholder="Thabo"
                autoComplete="given-name"
                autoFocus
              />
              {/* A corporate group signs in under one name — the live
                  data already has "Corporate group (Old Mutual)". The
                  field has to welcome that, not just tolerate it. */}
              <p className="gst-hint">
                A first name is plenty. Here as a group? Put the group’s name in.
              </p>
            </div>

            {error ? <Notice tone="warn">{error}</Notice> : null}

            <button type="submit" className="gst-btn gst-btn-primary" disabled={busy || !name.trim()}>
              {busy ? 'Just a moment…' : 'Start packing'}
            </button>
            <Button variant="ghost" onClick={() => setStep('preview')} disabled={busy}>
              Back
            </Button>
          </form>

          <HelpNote />
        </GuestScreen>
      </GuestShell>
    );
  }

  // ── (a) The preview ─────────────────────────────────────────
  return (
    <GuestShell>
      <GuestScreen
        title="You’ve found a pallet"
        lede="Here is what this one is, and who it feeds."
      >
        <PalletCard slip={slip} />

        <div className="gst-card gst-card-quiet">
          <p className="gst-card-meta" style={{ color: 'var(--gst-ink)' }}>
            {slip.itemCount === 0
              ? 'There is nothing listed on this pallet yet. A staff member will need to sort that out before it can be packed.'
              : `You will go through ${slip.itemCount} thing${slip.itemCount === 1 ? '' : 's'}, one at a time. Nothing is timed, and you can ask for help at any point.`}
          </p>
        </div>

        {finished ? (
          <Notice tone="info">This pallet is already finished. Ask a staff member for another one.</Notice>
        ) : taken ? (
          <Notice tone="info">Someone is already packing this pallet. Ask a staff member for another one.</Notice>
        ) : null}

        {error ? <Notice tone="warn">{error}</Notice> : null}

        {!finished && !taken ? (
          alreadySignedIn ? (
            // Already signed in at the gate — no need to ask again.
            <Button onClick={() => claim()} disabled={busy}>
              {busy ? 'Just a moment…' : `Pack this one, ${user.firstName?.split(' ')[0]}`}
            </Button>
          ) : (
            <Button onClick={() => setStep('name')}>I’ll pack this one</Button>
          )
        ) : (
          <Button variant="secondary" onClick={() => navigate('/guest')}>
            See today’s other pallets
          </Button>
        )}

        <HelpNote>Not the pallet you are standing at?</HelpNote>
      </GuestScreen>
    </GuestShell>
  );
};

export default SlipPreviewPage;
