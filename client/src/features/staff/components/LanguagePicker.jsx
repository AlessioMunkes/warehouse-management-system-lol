// ─────────────────────────────────────────────────────────────
// client/src/features/staff/components/LanguagePicker.jsx
//
// "Choose your language": English, Afrikaans or isiXhosa for the floor
// screens, in a drop-down.
//
// Each choice is written in its own language, so someone who cannot
// read the current one can still find theirs. The screens change the
// moment one is chosen; saving it to the account happens behind that
// and never holds the change up. With no signal the choice is kept on
// the phone and the account catches up the next time it is chosen.
//
// hooks/useAccountLanguage.js is the other half: on arriving at the
// floor it asks the account which language this person chose.
// ─────────────────────────────────────────────────────────────
import { useId, useState } from 'react';
import { apiPatch } from '../../../services/api';
import { LANGUAGES, setLanguage, useLanguage, useT } from '../../../i18n';

export default function LanguagePicker() {
  const t = useT();
  const language = useLanguage();
  const id = useId();
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
    // The names of the languages are never themselves translated.
    <div className="stf-language" translate="no">
      <label className="stf-language-label" htmlFor={id}>{t('language.choose')}</label>
      <select
        id={id} className="stf-select stf-language-select"
        value={language} onChange={(e) => choose(e.target.value)}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>
        ))}
      </select>
      {note ? <p className="stf-field-hint" role="status">{t(note)}</p> : null}
    </div>
  );
}
