import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";

const PROGRAMMES = [
  {
    key: "packing",
    label: "Packing",
    path: "/packing",
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
    path: "/dispatch",
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
    label: "Procurement",
    path: "/procurement",
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
    path: "/decanting",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="m12 2 8 4.6v9.8L12 21l-8-4.6V6.6L12 2Z" strokeLinejoin="round" />
        <path d="m4 6.6 8 4.6 8-4.6" strokeLinejoin="round" />
        <path d="M12 11.2v9.6" />
      </svg>
    ),
  },
];

function getDisplayName(user) {
  if (!user) return "there";
  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0];
  if (!fullName) return "there";
  return fullName.split(" ")[0];
}

export default function ProgrammeSelect() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const displayName = getDisplayName(user);

  if (loading) {
    return (
      <div className="page-background page-background-flow">
        <div className="programme-select-content">
          <p className="programme-select-subtitle">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-background page-background-flow">
      <div className="programme-select-content">
        <div className="programme-badge">
          <span className="programme-badge__icon" aria-hidden="true">
            ❤
          </span>
          <span className="programme-badge__label">Programme select</span>
        </div>

        <h1 className="programme-select-heading">
          Take your time, {displayName} — pick a programme
        </h1>
        <p className="programme-select-subtitle">Lovely heart. Pick where you're heading.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PROGRAMMES.map((programme) => (
            <button
              key={programme.key}
              type="button"
              className="programme-button"
              onClick={() => navigate(programme.path)}
              aria-label={`Go to ${programme.label}`}
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