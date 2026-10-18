// ─────────────────────────────────────────────────────────────
// features/donation/ValueField.jsx
//
// The donation's estimated value in rand. Needed when the donor wants a
// Section 18A certificate, and optional otherwise.
//
// This file also asked which programme the donation was for. Nothing
// used the answer, so the question is gone.
// ─────────────────────────────────────────────────────────────
import { useState } from "react";

const valueMessage = (v, required) => {
  if (v === "" || v === null || v === undefined) {
    return required
      ? { valid: false, message: "Enter a value for the certificate (0 if none)." }
      : { valid: true, message: "" };
  }
  if (Number.isNaN(Number(v))) return { valid: false, message: "Enter a number, not text." };
  if (Number(v) < 0) return { valid: false, message: "Value cannot be negative." };
  return { valid: true, message: "Looks good." };
};

export function ValueField({ estimatedValueZar, onChange, error, required = false }) {
  const [touched, setTouched] = useState(false);
  const state = valueMessage(estimatedValueZar, required);
  const message = error || state.message;
  const showValidation = (touched || Boolean(error)) && Boolean(message);

  return (
    <div className="stf-step-body">
      <div className="stf-field">
        <span className="stf-field-label">Estimated value (ZAR)</span>
        <input
          id="estimated-value-zar"
          className={`stf-input ${!showValidation ? "" : state.valid && !error ? "is-valid" : "is-flagged"}`}
          type="number"
          min="0"
          step="0.01"
          value={estimatedValueZar}
          onChange={(e) => {
            setTouched(true);
            onChange({ estimatedValueZar: e.target.value });
          }}
          onBlur={() => setTouched(true)}
          placeholder="0.00"
        />
        {showValidation ? (
          <span
            className={`stf-field-hint ${state.valid && !error ? "is-valid-msg" : ""}`}
            style={state.valid && !error ? undefined : { color: "var(--stf-attention)" }}
          >
            {message}
          </span>
        ) : (
          <span className="stf-field-hint">
            {required
              ? "Needed for the Section 18A certificate. Enter 0 if it has no value."
              : "Optional. Leave blank if you do not know it."}
          </span>
        )}
      </div>

    </div>
  );
}
