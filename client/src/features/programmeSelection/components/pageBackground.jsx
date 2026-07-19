// src/components/PageBackground.jsx
import React from 'react';

const PageBackground = ({ children, flow = false }) => (
  <div className={`page-background ${flow ? 'page-background-flow' : ''}`}>
    {children}
  </div>
);

export default PageBackground;