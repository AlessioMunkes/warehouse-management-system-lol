// ─────────────────────────────────────────────────────────────
// client/src/features/guest/useGuestSignOut.js
//
// Signing a volunteer out, with a pallet in hand taken care of.
//
//   request()  Asks the server whether this guest still holds a pallet.
//              None: sign out straight away. One held: stop and ask
//              (the caller renders <SignOutConfirm flow={...} />).
//   confirm()  Returns the pallet to the floor (progress kept), then
//              signs out. If the return fails the guest is NOT signed
//              out: they would walk away believing it was handed back.
//   cancel()   "Keep packing".
//
// Never a dead end: if the check itself fails, the guest can try again or
// sign out anyway (without a release; staff can return the pallet).
//
// Signing out lands on the front door ("/"), navigating BEFORE the
// session is cleared so a ProtectedRoute never gets the chance to bounce
// the volunteer to the staff login (see GuestDonePage). logout() is
// still awaited so the visit is closed properly.
//
// "Do they hold a pallet" is asked at the moment of signing out rather
// than remembered, so it is right on every screen without any page
// having to pass it down.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchMySlip, releaseMySlip } from '../../services/guestSlipAPI';

export const useGuestSignOut = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [phase, setPhase] = useState('idle');   // idle | checking | confirming | releasing | signingOut | checkFailed
  const [error, setError] = useState(null);

  const finish = async () => {
    setPhase('signingOut');
    navigate('/', { replace: true });
    try {
      await logout();
    } finally {
      setPhase('idle');
    }
  };

  const request = async () => {
    setError(null);
    setPhase('checking');
    let held = false;
    try {
      held = Boolean(await fetchMySlip());
    } catch (err) {
      // 404 is the server saying "you hold nothing". Anything else means
      // we do not know: say so and let them choose, rather than either
      // signing out blind or refusing to let them leave.
      if (err?.status !== 404) {
        setPhase('checkFailed');
        return;
      }
    }
    if (held) setPhase('confirming');
    else await finish();
  };

  const confirm = async () => {
    setError(null);
    setPhase('releasing');
    try {
      await releaseMySlip();
    } catch (err) {
      setError(err?.message || 'We could not return your pallet. Try again.');
      setPhase('confirming');
      return;
    }
    await finish();
  };

  const cancel = () => {
    setError(null);
    setPhase('idle');
  };

  return {
    request, confirm, cancel,
    signOutAnyway: finish,
    checkFailed: phase === 'checkFailed',
    confirming: phase === 'confirming' || phase === 'releasing',
    releasing: phase === 'releasing',
    busy: phase === 'checking' || phase === 'signingOut',
    error,
  };
};
