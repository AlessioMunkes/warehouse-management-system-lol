// src/components/DecisionCard.jsx

const DecisionCard = ({ icon, title, subtitle, variant, selected, onClick }) => (
  <button
    type="button"
    className={`decision-card decision-card-${variant} ${selected ? 'decision-card-selected' : ''}`}
    onClick={onClick}
    aria-pressed={selected}
  >
    <span className="decision-card-icon" aria-hidden="true">
      <i className={`ti ti-${icon}`} />
    </span>
    <span className="decision-card-title">{title}</span>
    <span className="decision-card-subtitle">{subtitle}</span>
  </button>
);

export default DecisionCard;