// ─────────────────────────────────────────────────────────────
// client/src/features/guest/GuestLanguageSwitch.jsx
//
// The volunteer's language control: English, Afrikaans or isiXhosa.
//
// The same store, list and words as the floor screens
// (translations/index.js, messages.js); only the control is the
// guest's own. The worker's LanguagePicker also saves the choice to the
// staff account, which a guest does not have (PATCH /api/me/language
// answers a guest with 403), so this one keeps it on the phone only:
// setLanguage() stores it, which is what carries it between screens
// and across a reload.
//
// Each language is named in its own language, and the control's label
// is "Language" in all three, so someone who cannot read the current
// one can still find theirs. A native select: one large tap target,
// and the phone's own picker opens, which a first-time visitor already
// knows how to use one-handed.
// ─────────────────────────────────────────────────────────────
import { useId } from 'react';
import { LANGUAGES, setLanguage, useLanguage } from '../../translations';
import { MESSAGES } from '../../translations/messages';
import '../../styles/guest.css';

// "Language · Taal · Ulwimi", from each language's own entry.
const LABEL = LANGUAGES.map((l) => MESSAGES[l.code]?.['language.label'] ?? MESSAGES.en['language.label']).join(' · ');

export default function GuestLanguageSwitch({ className = '' }) {
  const language = useLanguage();
  const id = useId();

  return (
    <span className={`gst-lang ${className}`.trim()} translate="no">
      <label className="gst-sr" htmlFor={id}>{LABEL}</label>
      <span className="gst-lang-icon" aria-hidden="true">🌐</span>
      <select
        id={id}
        className="gst-lang-select"
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>
        ))}
      </select>
    </span>
  );
}
