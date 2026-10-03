// ─────────────────────────────────────────────────────────────
// client/src/pages/GuestDonePage.jsx
//
// BR-22 screen (e): the thank-you and contribution summary, ending in
// sign-out.
//
// This is the emotional close of the whole flow (Warehouse Visit 1
// §6.2, §6.3) and the last thing most Love Activists will ever see of
// this system. It is the screen that decides whether packing a pallet
// felt like doing something or like operating software.
//
// EVERY NUMBER IS REAL. They are counted from the items this volunteer
// just worked through and handed over by GuestPackPage — never a
// placeholder, never an estimate, never a figure invented to look
// impressive. An overstated number here would be a lie told to someone
// who just gave up their morning, and the one thing worse than no
// impact figure is a made-up one.
//
// This is also where the visit ends: signing out stamps
// volunteers.signed_out_at, which is what the volunteer-hours report is
// built on. Before Phase 0.3 nothing set it and the metric was empty.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  GuestShell, GuestScreen, Button, Notice, HelpNote,
} from '../features/guest/components/GuestPrimitives';
import { formatDay, displayName, beneficiaryKind as beneficiaryKindOf } from '../features/guest/guestFormat';

const GuestDonePage = () => {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  const summary = state?.summary ?? null;
  const name = displayName(user?.firstName);

  // Navigate BEFORE clearing the session, not after.
  //
  // This screen sits inside ProtectedRoute, which renders
  // <Navigate to="/login"> the moment the user becomes null. Awaiting
  // logout() first therefore handed the volunteer to the staff login —
  // "EMPLOYEE LOG IN · AUTHORISED PERSONNEL ONLY" — as the last thing
  // they saw after giving up their morning. Leaving the protected route
  // first means that redirect never has a chance to fire.
  //
  // The landing page, not /guest: it carries "I'm volunteering today",
  // so a volunteer coming back tomorrow has a way in, and it reads as
  // the front door rather than a form.
  //
  // logout() is still awaited so the visit is properly signed out; it
  // just is not what decides where they end up.
  const signOut = async () => {
    setBusy(true);
    navigate('/', { replace: true });
    await logout();               // closes the visit AND clears the cookie
  };

  // Reached without state — a refresh, or a direct link. Say thank you
  // properly rather than inventing numbers to fill the space.
  if (!summary) {
    return (
      <GuestShell>
        <GuestScreen
          title={`Thank you, ${name}`}
          lede="Your pallet is finished and on its way."
        >
          <Button onClick={() => navigate('/guest-home')} disabled={busy}>
            Pack another pallet
          </Button>
          <Button variant="secondary" onClick={signOut} disabled={busy}>
            {busy ? 'Signing you out…' : 'Sign out'}
          </Button>
          <HelpNote>Need to tell us something? Let a staff member know before you go.</HelpNote>
        </GuestScreen>
      </GuestShell>
    );
  }

  const {
    beneficiary, beneficiaryKind, dispatchDate, childCount,
    itemsPacked, itemsFlagged, unitsPacked,
  } = summary;

  const kind = beneficiaryKindOf(beneficiaryKind);

  return (
    <GuestShell>
      <GuestScreen
        title={<>Thank you, <span className="gst-underline">{name}</span></>}
        lede="That pallet is packed and ready to go out. Here is what you did."
      >
        {/* The headline figure — what they physically packed. */}
        <div className="gst-celebrate gst-animate-pop">
          <span className="gst-seal" aria-hidden="true">✓</span>
          <span className="gst-figure">{unitsPacked || itemsPacked}</span>
          <span className="gst-figure-label">
            {unitsPacked
              ? `items packed into this pallet`
              : `things checked off this pallet`}
          </span>
        </div>

        <div className="gst-figure-row">
          <div className="gst-card gst-stat">
            <span className="gst-figure gst-figure-sm is-packed">{itemsPacked}</span>
            <span className="gst-figure-label">things packed</span>
          </div>
          <div className="gst-card gst-stat">
            <span className="gst-figure gst-figure-sm">{itemsFlagged}</span>
            <span className="gst-figure-label">
              {itemsFlagged === 1 ? 'problem reported' : 'problems reported'}
            </span>
          </div>
        </div>

        {/* Who it feeds — the "what that means" half of the summary.
            Only states the child count when the data actually has one;
            a made-up number here would be the worst kind. */}
        <div className="gst-card gst-card-quiet">
          <h2 className="gst-card-title">Where it’s going</h2>
          <p className="gst-card-meta gst-text-ink">
            This pallet goes to <strong>{beneficiary}</strong>
            {`, ${kind.article} ${kind.noun}`}
            {childCount ? <> that feeds <strong>{childCount} children</strong></> : ''}
            . It leaves {formatDay(dispatchDate)}.
          </p>
        </div>

        {itemsFlagged > 0 ? (
          <Notice tone="info">
            A staff member has {itemsFlagged === 1 ? 'your report' : 'your reports'}.
            Thank you for flagging {itemsFlagged === 1 ? 'it' : 'them'}.
          </Notice>
        ) : null}

        <div className="gst-card gst-card-quiet gst-thanks">
          <p className="gst-card-meta gst-text-ink">
            Ladles of Love could not do this without people giving up their time.
            Thank you for giving yours today.
          </p>
        </div>

        {/* Keep them going: another pallet is the primary action, and
            sign-out stays clearly visible as the outlined one. */}
        <Button onClick={() => navigate('/guest-home')} disabled={busy}>
          Pack another pallet
        </Button>
        <Button variant="secondary" onClick={signOut} disabled={busy}>
          {busy ? 'Signing you out…' : 'Sign out'}
        </Button>

        <HelpNote>Need to tell us something? Let a staff member know before you go.</HelpNote>
      </GuestScreen>
    </GuestShell>
  );
};

export default GuestDonePage;
