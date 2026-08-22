// ─────────────────────────────────────────────────────────────
// features/donations/components/DonationRail.jsx
// UPDATED: 2 steps instead of 3, since Donor Details merges into
// Donation Details.
// ─────────────────────────────────────────────────────────────
const STEPS = ["Donation Details", "Review"];

// currentStep: 0 | 1
export function DonationRail({ currentStep }) {
  return (
    <div className="stf-rail">
      <div className="stf-rail-bars">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`stf-rail-bar ${i <= currentStep ? "is-done" : ""}`}
          />
        ))}
      </div>
      <div className="stf-rail-meta">
        <span>{STEPS[currentStep]}</span>
        <span>Step {currentStep + 1} of {STEPS.length}</span>
      </div>
    </div>
  );
}