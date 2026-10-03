// ─────────────────────────────────────────────────────────────
// client/src/features/guest/useGuestSignOut.js
//
// Sign a volunteer out and land them on the front door ("/"), the same
// way the thank-you page does. Navigate BEFORE clearing the session so a
// ProtectedRoute never gets the chance to bounce them to the staff login
// (see GuestDonePage). logout() is still awaited so the visit is closed
// properly; it just is not what decides where they end up.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const useGuestSignOut = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    navigate('/', { replace: true });
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  };

  return { signOut, signingOut: busy };
};
