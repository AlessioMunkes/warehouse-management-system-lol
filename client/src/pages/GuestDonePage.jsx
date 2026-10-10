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
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  GuestShell, GuestScreen, Button, Notice, HelpNote, SignOutConfirm, Rich,
} from '../features/guest/GuestPrimitives';
import { useGuestSignOut } from '../features/guest/useGuestSignOut';
import { formatDay, displayName, beneficiaryKind as beneficiaryKindOf, mark } from '../features/guest/guestFormat';
import { useT } from '../translations';

const GuestDonePage = () => {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const t = useT();

  const summary = state?.summary ?? null;
  const name = displayName(user?.firstName, t);

  // Sign-out lives in useGuestSignOut: it lands on the front door
  // (navigating BEFORE the session is cleared, so ProtectedRoute never
  // bounces the volunteer to the staff login) and asks first if they
  // somehow still hold a pallet.
  const flow = useGuestSignOut();
  const busy = flow.busy || flow.confirming || flow.checkFailed;

  // Reached without state — a refresh, or a direct link. Say thank you
  // properly rather than inventing numbers to fill the space.
  if (!summary) {
    return (
      <GuestShell>
        <GuestScreen
          title={t('guest.done.thanks', { name })}
          lede={t('guest.done.finishedLede')}
        >
          <SignOutConfirm flow={flow} />
          <Button onClick={() => navigate('/guest-home')} disabled={busy}>
            {t('guest.done.another')}
          </Button>
          <Button variant="secondary" onClick={flow.request} disabled={busy} loading={flow.busy}>
            {flow.busy ? t('guest.nav.signingOut') : t('guest.nav.signOut')}
          </Button>
          <HelpNote>{t('guest.done.help')}</HelpNote>
        </GuestScreen>
      </GuestShell>
    );
  }

  const {
    beneficiary, beneficiaryKind, dispatchDate, childCount,
    itemsPacked, itemsFlagged, unitsPacked,
  } = summary;

  const kind = beneficiaryKindOf(beneficiaryKind, t);

  return (
    <GuestShell>
      <GuestScreen
        title={t('guest.done.thanks', { name })}
        lede={t('guest.done.lede')}
      >
        {/* The headline figure — what they physically packed. */}
        <div className="gst-celebrate gst-animate-pop">
          <span className="gst-seal" aria-hidden="true">✓</span>
          <span className="gst-figure">{unitsPacked || itemsPacked}</span>
          <span className="gst-figure-label">
            {unitsPacked ? t('guest.done.unitsLabel') : t('guest.done.checkedLabel')}
          </span>
        </div>

        <div className="gst-figure-row">
          <div className="gst-card gst-stat">
            <span className="gst-figure gst-figure-sm is-packed">{itemsPacked}</span>
            <span className="gst-figure-label">{t('guest.done.thingsPacked')}</span>
          </div>
          <div className="gst-card gst-stat">
            <span className="gst-figure gst-figure-sm">{itemsFlagged}</span>
            <span className="gst-figure-label">{t.n('guest.done.problems', itemsFlagged)}</span>
          </div>
        </div>

        {/* Who it feeds — the "what that means" half of the summary.
            Only states the child count when the data actually has one;
            a made-up number here would be the worst kind. */}
        <div className="gst-card gst-card-quiet">
          <h2 className="gst-card-title">{t('guest.done.whereTitle')}</h2>
          <p className="gst-card-meta gst-text-ink">
            <Rich
              text={t(childCount ? 'guest.done.goesToFeeds' : 'guest.done.goesTo', {
                beneficiary: mark('beneficiary'),
                kind,
                children: mark('children'),
                day: formatDay(dispatchDate, t),
              })}
              parts={{ beneficiary, children: t('common.children', { n: childCount }) }}
            />
          </p>
        </div>

        {itemsFlagged > 0 ? (
          <Notice tone="info">{t.n('guest.done.flagged', itemsFlagged)}</Notice>
        ) : null}

        <div className="gst-card gst-card-quiet gst-thanks">
          <p className="gst-card-meta gst-text-ink">{t('guest.done.gratitude')}</p>
        </div>

        {/* Keep them going: another pallet is the primary action, and
            sign-out stays clearly visible as the outlined one. */}
        <SignOutConfirm flow={flow} />
        <Button onClick={() => navigate('/guest-home')} disabled={busy}>
          {t('guest.done.another')}
        </Button>
        <Button variant="secondary" onClick={flow.request} disabled={busy} loading={flow.busy}>
          {flow.busy ? t('guest.nav.signingOut') : t('guest.nav.signOut')}
        </Button>

        <HelpNote>{t('guest.done.help')}</HelpNote>
      </GuestScreen>
    </GuestShell>
  );
};

export default GuestDonePage;
