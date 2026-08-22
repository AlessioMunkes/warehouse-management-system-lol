// ─────────────────────────────────────────────────────────────
// features/donation/components/ValueProgrammeFields.jsx
// UPDATED: live validity message, catches non-numeric input.
// ─────────────────────────────────────────────────────────────
import { useState } from "react";

const PROGRAMMES = [
  { value: "NOC",           label: "NOC" },
  { value: "FTS",           label: "FTS" },
  { value: "LOVE_ACTIVISM", label: "Love Activism" },
];

const valueMessage = (v) => {
  if (v === "") return { valid: false, message: "An estimated value is required (enter 0 if none)." };
  if (Number.isNaN(Number(v))) return { valid: false, message: "Enter a number, not text." };
  if (Number(v) < 0) return { valid: false, message: "Value cannot be negative." };
  return { valid: true, message: "Looks good." };
};

export function ValueProgrammeFields({ estimatedValueZar, programmeCode, onChange }) {
  const [touched, setTouched] = useState(false);
  const state = valueMessage(estimatedValueZar);

  return (
    <div className="stf-step-body">
      <div className="stf-field">
        <span className="stf-field-label">Estimated value (ZAR)</span>
        <input
          className={`stf-input ${!touched ? "" : state.valid ? "is-valid" : "is-flagged"}`}
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
        {touched ? (
          <span
            className={`stf-field-hint ${state.valid ? "is-valid-msg" : ""}`}
            style={!state.valid ? { color: "var(--stf-attention)" } : undefined}
          >
            {state.message}
          </span>
        ) : (
          <span className="stf-field-hint">
            Required for every donation. Enter 0 if it has no assessable value.
          </span>
        )}
      </div>

      <div className="stf-field">
        <span className="stf-field-label">Programme (optional)</span>
        <select
          className="stf-select"
          value={programmeCode}
          onChange={(e) => onChange({ programmeCode: e.target.value })}
        >
          <option value="">No programme</option>
          {PROGRAMMES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}