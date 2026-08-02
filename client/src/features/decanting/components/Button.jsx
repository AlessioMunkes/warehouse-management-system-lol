// src/components/Button.jsx
//import React from 'react';

const Button = ({ variant = 'primary', icon, children, ...props }) => (
  <button className={`btn-${variant}`} {...props}>
    {icon && <i className={`ti ti-${icon} btn-icon`} aria-hidden="true" />}
    <span>{children}</span>
  </button>
);

export default Button;