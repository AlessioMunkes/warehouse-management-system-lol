// ─────────────────────────────────────────────────────────────
// client/src/features/staff/useAccountLanguage.js
//
// On arriving at the floor, asks the account which language this person
// chose (GET /api/me/language), so the choice follows them to whichever
// tablet they pick up. The other half of LanguagePicker.jsx.
//
// With no signal, or a server that has no such thing yet, the language
// kept on this phone stands.
// ─────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import accountAPI from '../../services/accountAPI';
import { setLanguage } from '../../translations';

export default function useAccountLanguage(userId) {
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    accountAPI.getLanguage()
      .then((language) => { if (!cancelled && language) setLanguage(language); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);
}
