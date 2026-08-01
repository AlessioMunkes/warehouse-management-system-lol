// src/components/StepCard.jsx

const StepCard = ({ number, title, children }) => (
  <section className="step-card">
    <div className="step-card-header">
      <span className="step-card-number" aria-hidden="true">{number}</span>
      <h2 className="step-card-title">{title}</h2>
    </div>
    <div className="step-card-body">{children}</div>
  </section>
);

export default StepCard;