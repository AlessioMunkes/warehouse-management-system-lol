// ─────────────────────────────────────────────────────────────
// client/src/features/staff/hooks/useAccountLanguage.js
//
// On arriving at the floor, asks the account which language this person
// chose (GET /api/me/language), so the choice follows them to whichever
// tablet they pick up. The other half of LanguagePicker.jsx.
//
// With no signal, or a server that has no such thing yet, the language
// kept on this phone stands.
// ─────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { apiGet } from '../../../services/api';
import { setLanguage } from '../../../i18n';

export default function useAccountLanguage(userId) {
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    apiGet('/api/me/language')
      .then((res) => { if (!cancelled && res?.data?.language) setLanguage(res.data.language); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);
}
