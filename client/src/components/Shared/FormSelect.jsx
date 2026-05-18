import React, { useState } from 'react';

const FormSelect = ({
  label,
  value,
  onChange,
  options,
  error,
  required = false,
  placeholder = 'Select...',
  disabled = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  // Ensure value is always a string (to match placeholder "")
  const selectValue = value || '';

  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{
        display: 'block',
        fontSize: '15px',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.85)',
        marginBottom: '6px'
      }}>
        {label}
        {required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
      </label>
      
      <select
        value={selectValue}
        onChange={onChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '11px 36px 11px 14px',
          borderRadius: '10px',
          border: isFocused
            ? '2px solid #3b82f6'
            : '1px solid rgba(255,255,255,0.18)',
          background: 'rgba(255,255,255,0.08)',
          color: '#fff',
          fontSize: '15px',
          fontWeight: 600,
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          appearance: 'none',
          transition: 'border 0.2s, box-shadow 0.2s',
          boxSizing: 'border-box',
          boxShadow: isFocused ? '0 0 0 3px rgba(59,130,246,0.25)' : 'none',
        }}
      >
        <option value="" disabled style={{ background: '#3d0a0a', color: 'rgba(255,255,255,0.6)' }}>
          {placeholder}
        </option>
        {options.map(opt => (
          <option
            key={opt.value}
            value={opt.value}
            style={{ background: '#3d0a0a', color: '#fff' }}
          >
            {opt.label}
          </option>
        ))}
      </select>
      
      {error && (
        <p style={{
          color: '#fca5a5',
          fontSize: '12px',
          marginTop: '4px',
          marginLeft: '2px'
        }}>
          {error}
        </p>
      )}
    </div>
  );
};

export default FormSelect;
