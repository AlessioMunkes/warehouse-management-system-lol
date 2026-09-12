// ─────────────────────────────────────────────────────────────
// features/donations/components/CategorySelector.jsx
//
// ⚠ PLACEHOLDER — donation-level category, worker picks manually.
// Pending Alessio's answer on whether this should instead be derived
// per-item from a seeded product->category mapping (see state machine
// doc discussion). If that's confirmed, this component's shape
// changes significantly: category would move off the draft root and
// onto each item in DonationItemsList instead.
//
// Uses .stf-choices / .stf-choice — tap-target cards, not a dropdown.
// Matches BR-10's four categories exactly (donation.service.js
// CATEGORIES) so a mismatch here would be a silent 500 from the
// database's own CHECK constraint, not a friendly 400.
// ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: "recipe_food",     label: "Recipe Food",     hint: "Matches an active ECD recipe" },
  { value: "add_on_food",     label: "Add-on food",     hint: "Split across ECD centres automatically" },
  { value: "non_recipe_food", label: "Non-recipe Food", hint: "Routed to the soup kitchen" },
  { value: "non_food",        label: "Non-food",        hint: "Stored or routed externally" },
  { value: "manager_review",  label: "Manager Review",  hint: "Requires a warehouse manager to classify" },
];

export function CategorySelector({ value, onChange, error }) {
  return (
    <div className="stf-step-body">
      <div className="stf-field">
        <span className="stf-field-label">What kind of donation is this?</span>
        {error && <span className="stf-field-hint" style={{ color: "var(--stf-attention)" }}>{error}</span>}
      </div>

      <div className="stf-choices" role="radiogroup" aria-label="Donation category">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={value === c.value}
            className={`stf-choice ${value === c.value ? "is-chosen" : ""}`}
            onClick={() => onChange(c.value)}
          >
            <span className="stf-choice-label">{c.label}</span>
            <span className="stf-choice-meta">{c.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
