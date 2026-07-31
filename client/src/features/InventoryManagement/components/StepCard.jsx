// The white rounded card with a title/subtitle header, used to wrap
// every discrete section of a task screen (manifest table, adjust
// form, decanting steps, etc).
export default function StepCard({ title, subtitle, children }) {
  return (
    <div className="step-card">
      <div className="step-card-header">
        <div>
          <h2 className="step-card-title">{title}</h2>
          {subtitle && <p className="form-helper-text">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}