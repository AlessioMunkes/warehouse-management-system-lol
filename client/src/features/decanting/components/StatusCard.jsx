// src/components/StatusBadge.jsx

const StatusBadge = ({ status = 'success', children }) => (
  <span className={`status-badge status-badge-${status}`}>
    <i
      className={`ti ${status === 'success' ? 'ti-circle-check' : 'ti-alert-triangle'}`}
      aria-hidden="true"
    />
    {children}
  </span>
  
);


export default StatusBadge;