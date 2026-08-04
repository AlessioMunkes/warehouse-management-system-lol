// src/components/WeekPicker.jsx

const WeekPicker = ({ label, value, onChange, required = false, helperText }) => (
  <div className="form-group">
    <label className="form-label">
      {label} {required && <span className="form-required">*</span>}
    </label>
    <div className="form-input-group">
      <input
        type="date"
        className="form-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="form-input-icon" aria-hidden="true">
        <i className="ti ti-calendar" />
      </span>
    </div>
    {helperText && <p className="form-helper-text">{helperText}</p>}
  </div>
);

export default WeekPicker;