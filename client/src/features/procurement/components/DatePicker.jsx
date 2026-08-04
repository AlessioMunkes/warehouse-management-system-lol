// src/components/DatePicker.jsx
import { useRef } from 'react';

const DatePicker = ({ label, value, onChange, required }) => {
  const inputRef = useRef(null);

  const formattedValue = value
    ? new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="date-picker-group">
      <label className="form-label">
        {label} {required && <span className="form-required">*</span>}
      </label>
      <button
        type="button"
        className="date-picker-trigger"
        onClick={() => inputRef.current?.showPicker?.() || inputRef.current?.focus()}
      >
        <i className="ti ti-calendar" aria-hidden="true" />
        <span>{formattedValue || 'Pick a date'}</span>
      </button>
      <input
        ref={inputRef}
        type="date"
        className="date-picker-hidden-input"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

export default DatePicker;