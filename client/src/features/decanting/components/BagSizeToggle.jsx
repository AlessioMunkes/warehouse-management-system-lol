// src/components/BagSizeToggle.jsx
//import React from 'react';

const BagSizeToggle = ({ label, selected, onToggle }) => (
  <button
    type="button"
    className={`bag-size-toggle ${selected ? 'bag-size-toggle-active' : ''}`}
    onClick={onToggle}
    aria-pressed={selected}
  >
    {label}
  </button>
);

export default BagSizeToggle;