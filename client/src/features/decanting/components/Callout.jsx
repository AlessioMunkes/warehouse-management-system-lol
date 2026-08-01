// src/components/Callout.jsx

const Callout = ({ icon = 'info-circle', children }) => (
  <p className="callout">
    <i className={`ti ti-${icon} callout-icon`} aria-hidden="true" />
    <span>{children}</span>
  </p>
);

export default Callout;