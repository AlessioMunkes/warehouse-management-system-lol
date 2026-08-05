// src/features/managerActivities/components/ManagerActivitySelect.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ActivitySelectionButton from "../ManagerActivitySelection/ActivitySelectionButton";
import { useAuth } from "../../context/AuthContext";

const ACTIVITIES = [
  {
    key: "onboard-ecd",
  
    label: "Onboard ECD Centre",
    description:
      "Register a new ECD centre, set its validated quantity range, and assign it to a cohort before it goes live in the dispatch cycle.",
    path: null,
    enabled: false,
  },
  {
    key: "manage-inventory",
  
    label: "Manage Inventory",
    description:
      "Maintain stock and manage stock by removing, adding, or updating stock items.",
    path: "noc/inventory",
    enabled: true,
  },
  {
    key: "manage-picking-slips",
    
    label: "Manage Picking Slips",
    description:
      "Create and maintain picking slip master records used across the packing and dispatch cycle.",
    path: null,
    enabled: false,
  },
  {
    key: "assign-picking-slips",
  
    label: "Assign Picking Slips",
    description:
      "Allocate picking slips to this week's dispatch runs, linking each one to the correct ECD cohort and dispatch date.",
    path: null,
    enabled: false,
  },
];

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="18" height="18">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
    <path d="M12 11v5" strokeLinecap="round" />
  </svg>
);

// Same convention as ProgrammeSelect — our own /api/login user shape,
// not Supabase Auth, so reading firstName/username directly is correct.
function getDisplayName(user) {
  if (!user) return "there";
  return user.firstName || user.username || "there";
}

export default function ManagerActivitySelect() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const displayName = getDisplayName(user);
  const [infoActivity, setInfoActivity] = useState(null);

  const openInfo = (activity, e) => {
    e.stopPropagation();
    setInfoActivity(activity);
  };

  const closeInfo = () => setInfoActivity(null);

  useEffect(() => {
    if (!infoActivity) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") closeInfo();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [infoActivity]);

  if (isLoading) {
    return (
      <div className="page-light">
        <div className="programme-select-content">
          <p className="programme-select-subtitle">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-light">
      <div className="programme-select-content">
        <div className="programme-badge">
          <span className="programme-badge__icon" aria-hidden="true">❤</span>
          <span className="programme-badge__label">Activity select</span>
        </div>

        <h1 className="programme-select-heading">Hi {displayName}!</h1>
        <p className="programme-select-subtitle">
          Pick an activity to get started. Tap the info icon for details on what each one does.
        </p>

        <div className="grid grid-cols-1 gap-4">
          {ACTIVITIES.map((activity) => (
            <ActivitySelectionButton
              key={activity.key}
              label={`${activity.label}`}
              onSelect={() => activity.path && navigate(activity.path)}
              disabled={!activity.enabled}
              spread
              trailing={
                <span
                  className="programme-button__icon"
                  role="button"
                  tabIndex={0}
                  aria-label={`About ${activity.label}`}
                  onClick={(e) => openInfo(activity, e)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openInfo(activity, e);
                    }
                  }}
                >
                  <InfoIcon />
                </span>
              }
            />
          ))}
        </div>
      </div>

      {infoActivity && (
        <div className="modal-overlay" onClick={closeInfo}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">
              {infoActivity.label}
            </h3>
            <p className="modal-body">{infoActivity.description}</p>
            <div className="modal-actions">
              <button className="btn-primary" onClick={closeInfo}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}