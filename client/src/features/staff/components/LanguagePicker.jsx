// ─────────────────────────────────────────────────────────────
// client/src/features/staff/components/LanguagePicker.jsx
//
// English, Afrikaans or isiXhosa for the floor screens.
//
// Each choice is written in its own language, so someone who cannot
// read the current one can still find theirs. The screens change the
// moment one is pressed; saving it to the account happens behind that
// and never holds the change up. With no signal the choice is kept on
// the phone and the account catches up the next time it is chosen.
//
// hooks/useAccountLanguage.js is the other half: on arriving at the
// floor it asks the account which language this person chose.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { apiPatch } from '../../../services/api';
import { LANGUAGES, setLanguage, useLanguage, useT } from '../../../i18n';

export default function LanguagePicker() {
  const t = useT();
  const language = useLanguage();
  const [note, setNote] = useState(null);

  const choose = async (code) => {
    if (code === language) return;
    setLanguage(code);
    setNote(null);
    try {
      await apiPatch('/api/me/language', { language: code });
    } catch {
      setNote('language.savedHere');
    }
  };

  return (
    <div className="stf-language">
      <div className="stf-segments" role="group" aria-label={t('language.label')}>
        {LANGUAGES.map((l) => (
          <button
            key={l.code} type="button" lang={l.code}
            aria-pressed={language === l.code}
            className={`stf-segment${language === l.code ? ' is-active' : ''}`}
            onClick={() => choose(l.code)}
          >
            {l.name}
          </button>
        ))}
      </div>
      {note ? <p className="stf-field-hint" role="status">{t(note)}</p> : null}
    </div>
  );
}
