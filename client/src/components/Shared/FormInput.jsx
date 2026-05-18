import React, { useState } from 'react';

const FormInput = ({
  label,
  type = 'text',
  value,
  onChange,
  placeholder = '',
  required = false,
  icon: Icon,
  error,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const inputBase = {
    width: '100%',
    padding: Icon ? '11px 14px 11px 40px' : '11px 14px',
    borderRadius: '10px',
    border: isFocused
      ? '2px solid #3b82f6'
      : '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    fontSize: '15px',
    outline: 'none',
    transition: 'border 0.2s, box-shadow 0.2s',
    boxSizing: 'border-box',
    boxShadow: isFocused ? '0 0 0 3px rgba(59,130,246,0.25)' : 'none',
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      <label
        style={{
          display: 'block',
          fontSize: '15px',
          fontWeight: 600,
          color: 'rgba(255,255,255,0.85)',
          marginBottom: '6px',
        }}
      >
        {label}
        {required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
      </label>

      <div style={{ position: 'relative' }}>
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={inputBase}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        {Icon && (
          <Icon
            size={17}
            style={{
              position: 'absolute',
              left: '13px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(255,255,255,0.45)',
            }}
          />
        )}
      </div>

      {error && (
        <p
          style={{
            color: '#fca5a5',
            fontSize: '12px',
            marginTop: '4px',
            marginLeft: '2px',
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
};

export default FormInput;
