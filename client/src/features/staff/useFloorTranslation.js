// ─────────────────────────────────────────────────────────────
// client/src/features/staff/useFloorTranslation.js
//
// While a floor screen is showing and the worker has chosen Afrikaans
// or isiXhosa, keeps the whole page in that language
// (translations/floorTranslator.js). Leaving the floor, or choosing English,
// puts the page back.
//
// Called by StaffShell, which every floor screen is drawn inside, so no
// screen has to ask for it. Managers and admins never get it.
// ─────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { useLanguage } from '../../translations';
import { startFloorTranslation, stopFloorTranslation } from '../../translations/floorTranslator';

export default function useFloorTranslation(enabled) {
  const language = useLanguage();
  useEffect(() => {
    if (!enabled || language === 'en') return undefined;
    startFloorTranslation(language).catch(() => { /* the page stays in English */ });
    return stopFloorTranslation;
  }, [enabled, language]);
}
