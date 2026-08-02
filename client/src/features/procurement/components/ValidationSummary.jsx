// src/components/ValidationSummary.jsx

const ValidationSummary = ({ errors }) => {
  if (!errors || errors.length === 0) return null;

  return (
    <div className="validation-summary">
      <p className="validation-summary-title">Please fix the following:</p>
      <ul className="validation-summary-list">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
};

export default ValidationSummary;