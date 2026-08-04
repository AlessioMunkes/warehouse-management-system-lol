import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";

// `path` must match a route registered in App.jsx. Every programme
// page lives under /noc/, so a bare "/packing" falls through to the
// catch-all and silently lands the user on the landing page.
//
// `enabled: false` marks a programme whose page has not been built
// yet — the tile renders disabled rather than navigating nowhere.
const PROGRAMMES = [
  {
    key: "packing",
    label: "Packing",
    path: "/noc/packing",
    enabled: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M12 2 3 6.5v11L12 22l9-4.5v-11L12 2Z" strokeLinejoin="round" />
        <path d="M3 6.5 12 11l9-4.5" strokeLinejoin="round" />
        <path d="M12 11v11" />
      </svg>
    ),
  },
  {
    key: "dispatch",
    label: "Dispatch",
    path: null,            // no DispatchPage exists yet
    enabled: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M2 8h11v8H2z" strokeLinejoin="round" />
        <path d="M13 11h4l4 3v2h-8" strokeLinejoin="round" />
        <circle cx="6.5" cy="18" r="1.8" />
        <circle cx="16.5" cy="18" r="1.8" />
      </svg>
    ),
  },
  {
    key: "procurement",
    label: "Receiving",
    path: "/noc/procurement",
    enabled: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 3h6v3H9z" />
        <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "decanting",
    label: "Decanting",
    path: "/noc/decanting",
    enabled: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="m12 2 8 4.6v9.8L12 21l-8-4.6V6.6L12 2Z" strokeLinejoin="round" />
        <path d="m4 6.6 8 4.6 8-4.6" strokeLinejoin="round" />
        <path d="M12 11.2v9.6" />
      </svg>
    ),
  },
  {
    key: "inventory",
    label: "Inventory",
    path: "/noc/inventory",
    enabled: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 7h18v13H3z" strokeLinejoin="round" />
        <path d="M3 7l2-3h14l2 3" strokeLinejoin="round" />
        <path d="M10 11h4" strokeLinecap="round" />
      </svg>
    ),
  },
];

// The user object comes from our own /api/login, not from Supabase
// Auth — it is { id, username, firstName, lastName, role }. Reading
// user_metadata or email here always yields undefined, so everyone
// was greeted as "there".
function getDisplayName(user) {
  if (!user) return "there";
  return user.firstName || user.username || "there";
}

export default function ProgrammeSelect() {
  const navigate = useNavigate();
  // AuthContext exposes `isLoading`, not `loading`.
  const { user, isLoading } = useAuth();
  const displayName = getDisplayName(user);

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
          <span className="programme-badge__icon" aria-hidden="true">
            ❤
          </span>
          <span className="programme-badge__label">Programme select</span>
        </div>

        <h1 className="programme-select-heading">Hi {displayName}!</h1>
        <p className="programme-select-subtitle">
          Pick an activity to get started below by clicking on the icon of your choice
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PROGRAMMES.map((programme) => (
            <button
              key={programme.key}
              type="button"
              className="programme-button"
              onClick={() => programme.path && navigate(programme.path)}
              disabled={!programme.enabled}
              aria-label={
                programme.enabled
                  ? `Go to ${programme.label}`
                  : `${programme.label} — coming soon`
              }
              title={programme.enabled ? undefined : "Coming soon"}
            >
              <span className="programme-button__icon" aria-hidden="true">
                {programme.icon}
              </span>
              <span className="programme-button__label">{programme.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}