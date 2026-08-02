// src/components/PageHeader.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';

const getInitials = (firstName, lastName) => {
  const first = firstName?.[0] ?? '';
  const last = lastName?.[0] ?? '';
  return `${first}${last}`.toUpperCase();
};

const PageHeader = ({ status = 'SYS OK', onLogout, showBack = true }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleConfirmLogout = async () => {
    setShowLogoutConfirm(false);
    await onLogout();
  };

  return (
    <>
      <header className="page-header">
        <div className="page-header-left">
          {showBack && (
            <button
              className="page-header-icon-btn"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              data-tooltip="Back"
            >
              <i className="ti ti-arrow-left" aria-hidden="true" />
            </button>
          )}

          <div className="page-header-brand">
            <span className="page-header-avatar" aria-hidden="true">
              {getInitials(user?.firstName, user?.lastName)}
            </span>
            <span className="page-header-name">
              {user?.firstName} {user?.lastName}
            </span>
          </div>
        </div>

        <div className="page-header-right">
          <div className="page-header-status">
            <span className="page-header-status-dot" aria-hidden="true" />
            <span>{status}</span>
          </div>

          
          <button
            className="page-header-icon-btn"
            onClick={() => setShowLogoutConfirm(true)}
            aria-label="Log out"
            data-tooltip="Log out"
          >
            <i className="ti ti-logout" aria-hidden="true" />
          </button>
        </div>
      </header>

      {showLogoutConfirm && (
        <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Log out?</h3>
            <p className="modal-body">Are you sure you want to log out?</p>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowLogoutConfirm(false)}>
                No, stay
              </button>
              <button className="btn-primary" onClick={handleConfirmLogout}>
                Yes, log out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PageHeader;