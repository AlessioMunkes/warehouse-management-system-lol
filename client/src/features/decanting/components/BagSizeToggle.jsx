// src/components/BagSizeToggle.jsx
//import React from 'react';

const BagSizeToggle = ({ label, selected, onToggle }) => (
  <button
    type="button"
    className={`bag-size-toggle stf-segment ${selected ? 'bag-size-toggle-active is-active' : ''}`}
    onClick={onToggle}
    aria-pressed={selected}
  >
    {label}
  </button>
);

export default BagSizeToggle;