// ─────────────────────────────────────────────────────────────
// features/donations/components/DonorSection.jsx
//
// Consent gates the three donor fields — this is the one field in the
// whole form with a real legal consequence (POPIA). If consent is
// false, the backend silently drops donorName/Contact/TaxReference
// even if the worker typed them, so the fields are disabled here to
// make that behaviour visible rather than surprising.
// ─────────────────────────────────────────────────────────────
export function DonorConsentSection({ consentGiven, onChange }) {
  return (
    <div className="stf-step-body">
      <div className="stf-field">
        <span className="stf-field-label">
          Did the donor consent to their details being recorded?
        </span>
      </div>

      <div className="stf-choices" role="radiogroup" aria-label="Donor consent">
        <button
          type="button"
          role="radio"
          aria-checked={consentGiven === true}
          className={`stf-choice ${consentGiven === true ? "is-chosen" : ""}`}
          onClick={() => onChange(true)}
        >
          <span className="stf-choice-label">Yes, consent given</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={consentGiven === false}
          className={`stf-choice ${consentGiven === false ? "is-chosen" : ""}`}
          onClick={() => onChange(false)}
        >
          <span className="stf-choice-label">No consent given</span>
        </button>
      </div>

      <span className="stf-field-hint">
        Required to save donor details for a Section 18A tax certificate.
        Without consent, the donation is still recorded — just without
        the donor's personal details.
      </span>
    </div>
  );
}

export function DonorInfoFields({ donorName, donorContact, donorTaxReference, disabled, onChange, error }) {
  return (
    <div className="stf-step-body">
      <div className="stf-field">
        <span className="stf-field-label">Donor name</span>
        <input
          className="stf-input is-text"
          disabled={disabled}
          value={donorName}
          onChange={(e) => onChange({ donorName: e.target.value })}
        />
      </div>
      <div className="stf-field">
        <span className="stf-field-label">Donor email</span>
        <input
          className="stf-input is-text"
          disabled={disabled}
          value={donorContact}
          onChange={(e) => onChange({ donorContact: e.target.value })}
        />
        {error && <span className="stf-error">{error}</span>}
      </div>
      <div className="stf-field">
        <span className="stf-field-label">Tax reference</span>
        <input
          className="stf-input is-text"
          disabled={disabled}
          value={donorTaxReference}
          onChange={(e) => onChange({ donorTaxReference: e.target.value })}
        />
      </div>
      {disabled && (
        <span className="stf-field-hint">
          Confirm consent above to enter donor details.
        </span>
      )}
    </div>
  );
}
 