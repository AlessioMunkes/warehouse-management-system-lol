// ─────────────────────────────────────────────────────────────
// features/donation/components/DonorSection.jsx
//
// Donation Intake only collects the donor's basic contact details.
// If Section 18A is requested, the donor will receive a follow-up
// form by email to provide the additional certificate information.
// ─────────────────────────────────────────────────────────────

export function DonorConsentSection({
  consentGiven,
  onChange,
  error,
}) {
  return (
    <div className="stf-step-body">
      <div className="stf-field">
        <span className="stf-field-label">
          Does the donor want to request a Section 18A certificate?
        </span>
      </div>

      <div
        className="stf-choices"
        role="radiogroup"
        aria-label="Section 18A request"
      >
        <button
          type="button"
          role="radio"
          aria-checked={consentGiven === true}
          className={`stf-choice ${
            consentGiven === true ? "is-chosen" : ""
          }`}
          onClick={() => onChange(true)}
        >
          <span className="stf-choice-label">Yes</span>

          <span className="stf-choice-meta">
            The donor will receive a Section 18A form by email to
            provide the additional information required for the
            certificate.
          </span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={consentGiven === false}
          className={`stf-choice ${
            consentGiven === false ? "is-chosen" : ""
          }`}
          onClick={() => onChange(false)}
        >
          <span className="stf-choice-label">No</span>

          <span className="stf-choice-meta">
            No Section 18A certificate will be requested.
          </span>
        </button>
      </div>

      {error && <span className="stf-error">{error}</span>}

      <span className="stf-field-hint">
        Required to save donor details for a Section 18A tax certificate.
        Without consent, the donation is still recorded, just without
        the donor's personal details.
      </span>
    </div>
  );
}


function TextField({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
  type = "text",
  placeholder,
  required = false,
}) {
  const inputClassName =
    `stf-input is-text ${error ? "is-flagged" : ""}`;

  const describedBy = error ? `${id}-error` : undefined;

  return (
    <div className="stf-field">
      <span className="stf-field-label">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </span>

      <input
        id={id}
        className={inputClassName}
        type={type}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        required={required}
      />

      {error && (
        <span className="stf-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}


export function DonorInfoFields({
  donorName,
  donorContact,
  disabled,
  onChange,
  errors = {},
}) {
  return (
    <div className="stf-step-body">
      <TextField
        id="donor-name"
        label="Donor name"
        value={donorName}
        onChange={(value) =>
          onChange({ donorName: value })
        }
        error={errors.donorName}
        disabled={disabled}
        placeholder="Full name or organisation name"
        required
      />

      <TextField
        id="donor-email"
        label="Donor email address"
        value={donorContact}
        onChange={(value) =>
          onChange({ donorContact: value })
        }
        error={errors.donorContact}
        disabled={disabled}
        type="email"
        placeholder="donor@example.com"
        required
      />

      {disabled && (
        <span className="stf-field-hint">
          Select the Section 18A option above to enter the
          donor's details.
        </span>
      )}
    </div>
  );
}