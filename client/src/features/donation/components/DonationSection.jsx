// ─────────────────────────────────────────────────────────────
// features/donations/components/DonorSection.jsx
//
// Consent gates the three donor fields — this is the one field in the
// whole form with a real legal consequence (POPIA). If consent is
// false, the backend silently drops donorName/Contact/TaxReference
// even if the worker typed them, so the fields are disabled here to
// make that behaviour visible rather than surprising.
// ─────────────────────────────────────────────────────────────
export function DonorConsentSection({ consentGiven, onChange, error }) {
  return (
    <div className="stf-step-body">
      <div className="stf-field">
        <span className="stf-field-label">Can we record the donor details for a Section 18A certificate?</span>
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
          <span className="stf-choice-meta">Donor details can be recorded and used for the certificate.</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={consentGiven === false}
          className={`stf-choice ${consentGiven === false ? "is-chosen" : ""}`}
          onClick={() => onChange(false)}
        >
          <span className="stf-choice-label">No consent given</span>
          <span className="stf-choice-meta">The donation will be recorded without donor details.</span>
        </button>
      </div>

      {error && <span className="stf-error">{error}</span>}
      <span className="stf-field-hint">
        Consent is required before donor details can be saved for a Section 18A tax certificate.
      </span>
    </div>
  );
}

const donorTypes = [
  { value: "natural_person", label: "Natural person" },
  { value: "company", label: "Company" },
  { value: "trust", label: "Trust" },
  { value: "other", label: "Other juristic person" },
];

const naturalPersonIdTypes = [
  { value: "south_african_id", label: "South African ID" },
  { value: "passport", label: "Passport" },
  { value: "other", label: "Other identification" },
];

function TextField({ id, label, value, onChange, error, disabled, type = "text", placeholder, required = false, multiline = false }) {
  const inputClassName = `stf-input is-text ${error ? "is-flagged" : ""}`;
  const describedBy = error ? `${id}-error` : undefined;

  return (
    <div className="stf-field">
      <span className="stf-field-label">
        {label}{required && <span aria-hidden="true"> *</span>}
      </span>
      {multiline ? (
        <textarea
          id={id}
          className={inputClassName}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          rows="3"
          required={required}
        />
      ) : (
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
      )}
      {error && <span className="stf-error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}

function SelectField({ id, label, value, onChange, error, disabled, children, required = false }) {
  return (
    <div className="stf-field">
      <span className="stf-field-label">
        {label}{required && <span aria-hidden="true"> *</span>}
      </span>
      <select
        id={id}
        className={`stf-select ${error ? "is-flagged" : ""}`}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        required={required}
      >
        <option value="">Select an option</option>
        {children}
      </select>
      {error && <span className="stf-error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}

export function DonorInfoFields({
  donorName,
  donorContact,
  donorTaxReference,
  donorType,
  donorAddress,
  donorContactNumber,
  donorTradingName,
  donorIdType,
  donorIdCountry,
  donorIdNumber,
  disabled,
  onChange,
  errors = {},
}) {
  const isNaturalPerson = donorType === "natural_person";
  const registrationLabel = donorType === "company"
    ? "Company registration number"
    : donorType === "trust"
      ? "Trust registration number"
      : "Identification or registration number";

  return (
    <div className="stf-step-body">
      <SelectField
        id="donor-type"
        label="Donor type"
        value={donorType}
        onChange={(value) => onChange({ donorType: value })}
        error={errors.donorType}
        disabled={disabled}
        required
      >
        {donorTypes.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </SelectField>

      <TextField
        id="donor-name"
        label="Donor name"
        value={donorName}
        onChange={(value) => onChange({ donorName: value })}
        error={errors.donorName}
        disabled={disabled}
        placeholder="Full name or registered name"
        required
      />

      <TextField
        id="donor-trading-name"
        label="Trading name (if different)"
        value={donorTradingName}
        onChange={(value) => onChange({ donorTradingName: value })}
        error={errors.donorTradingName}
        disabled={disabled}
        placeholder="Optional"
      />

      <TextField
        id="donor-address"
        label="Donor address"
        value={donorAddress}
        onChange={(value) => onChange({ donorAddress: value })}
        error={errors.donorAddress}
        disabled={disabled}
        placeholder="Street, suburb, city and postal code"
        required
        multiline
      />

      <TextField
        id="donor-contact-number"
        label="Donor contact number"
        value={donorContactNumber}
        onChange={(value) => onChange({ donorContactNumber: value })}
        error={errors.donorContactNumber}
        disabled={disabled}
        type="tel"
        placeholder="e.g. +27 12 345 6789"
        required
      />

      <TextField
        id="donor-email"
        label="Donor email address"
        value={donorContact}
        onChange={(value) => onChange({ donorContact: value })}
        error={errors.donorContact}
        disabled={disabled}
        type="email"
        placeholder="donor@example.com"
        required
      />

      <TextField
        id="donor-tax-reference"
        label="Income tax reference number"
        value={donorTaxReference}
        onChange={(value) => onChange({ donorTaxReference: value })}
        error={errors.donorTaxReference}
        disabled={disabled}
        placeholder="SARS tax reference number"
        required
      />

      {isNaturalPerson && (
        <>
          <SelectField
            id="donor-id-type"
            label="Identification type"
            value={donorIdType}
            onChange={(value) => onChange({ donorIdType: value })}
            error={errors.donorIdType}
            disabled={disabled}
            required
          >
            {naturalPersonIdTypes.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectField>

          <TextField
            id="donor-id-country"
            label="Country of issue"
            value={donorIdCountry}
            onChange={(value) => onChange({ donorIdCountry: value })}
            error={errors.donorIdCountry}
            disabled={disabled}
            placeholder="e.g. South Africa"
            required
          />
        </>
      )}

      <TextField
        id="donor-id-number"
        label={registrationLabel}
        value={donorIdNumber}
        onChange={(value) => onChange({ donorIdNumber: value })}
        error={errors.donorIdNumber}
        disabled={disabled}
        placeholder={isNaturalPerson ? "ID or passport number" : "Registration number"}
        required
      />

      {disabled && (
        <span className="stf-field-hint">
          Confirm consent above to enter donor details.
        </span>
      )}
    </div>
  );
}
 