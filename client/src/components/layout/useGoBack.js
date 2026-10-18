// ─────────────────────────────────────────────────────────────
// client/src/components/layout/useGoBack.js
//
// What the back button does. navigate(-1) goes nowhere when this is
// the first page the tab loaded — a link opened from an email, a
// bookmark — so the button would look dead. React Router gives the
// first entry in a tab the location key "default"; there is no page of
// ours to go back to, so go to the signed-in user's home instead (the
// landing page when nobody is signed in).
// ─────────────────────────────────────────────────────────────
import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { homeForRole } from './navSections';
import { LANDING } from '../../routes/paths';

export default function useGoBack() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth() ?? {};
  const isFirstEntry = location.key === 'default';
  const home = user?.role ? homeForRole(user.role) : LANDING;

  return useCallback(() => {
    if (isFirstEntry) navigate(home, { replace: true });
    else navigate(-1);
  }, [isFirstEntry, home, navigate]);
}
