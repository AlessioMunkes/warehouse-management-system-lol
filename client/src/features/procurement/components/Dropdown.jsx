// src/components/Dropdown.jsx
import React from 'react';

const Dropdown = ({ label, value, onChange, options, placeholder, disabled, required }) => (
  <div className="form-group">
    <label className="form-label">
      {label} {required && <span className="form-required">*</span>}
    </label>
    <select
      className="form-select"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

export default Dropdown;