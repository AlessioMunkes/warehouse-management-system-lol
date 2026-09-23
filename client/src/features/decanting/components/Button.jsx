// src/components/Button.jsx
//import React from 'react';

// decanting-btn is scoped CSS (see index.css's own note on it) — this
// component is DecantingPlanner's only consumer, so it's the one place
// that can shrink the week planner's buttons without touching
// .btn-primary/.btn-secondary, which every other manager screen also
// renders through directly.
const Button = ({ variant = 'primary', icon, children, ...props }) => (
  <button className={`btn-${variant} decanting-btn`} {...props}>
    {icon && <i className={`ti ti-${icon} btn-icon`} aria-hidden="true" />}
    <span>{children}</span>
  </button>
);

export default Button;