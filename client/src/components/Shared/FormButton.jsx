import React from 'react';
import { Loader2 } from 'lucide-react';

const FormButton = ({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  isLoading = false,
  disabled = false,
  fullWidth = true,
}) => {
  const baseStyle = {
    height: '52px',
    marginTop: '4px',
    color: '#fff',
    fontWeight: 700,
    fontSize: '16px',
    letterSpacing: '0.03em',
    border: 'none',
    borderRadius: '14px',
    cursor: (isLoading || disabled) ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s, transform 0.1s',
    opacity: (isLoading || disabled) ? 0.7 : 1,
    width: fullWidth ? '100%' : 'auto',
    padding: fullWidth ? '0' : '0 24px',
  };

  const variantStyles = {
    primary: {
      background: (isLoading || disabled) ? '#333' : '#111111',
      boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
    },
    secondary: {
      background: (isLoading || disabled) ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.15)',
      boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isLoading || disabled}
      style={{ ...baseStyle, ...variantStyles[variant] }}
      onMouseDown={(e) => {
        if (!isLoading && !disabled) e.currentTarget.style.transform = 'scale(0.97)';
      }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {isLoading ? <Loader2 className="animate-spin" size={22} /> : children}
    </button>
  );
};

export default FormButton;