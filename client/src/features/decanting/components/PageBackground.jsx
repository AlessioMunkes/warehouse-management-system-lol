// src/components/PageBackground.jsx

const PageBackground = ({ children, flow = false }) => (
  <div className={`page-background ${flow ? 'page-background-flow' : ''}`}>
    {children}
  </div>
);

export default PageBackground;