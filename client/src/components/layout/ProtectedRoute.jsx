// ─────────────────────────────────────────────────────────────
// ProtectedRoute.jsx
//
// isLoading now covers a real network round-trip (GET /api/me on
// boot), not an instant localStorage read, so returning null here
// would show a blank white screen on every load. It renders a
// holding state instead.
//
// It must still hold the route CLOSED while loading: redirecting to
// /login before the server has answered would bounce a perfectly
// valid session on every refresh.
// ─────────────────────────────────────────────────────────────
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { STAFF } from '../../routes/paths';
import ManagerLayout from '../../features/taskdashboard/components/ManagerLayout';

// `shell` wraps the whole group in the app shell — sidebar on desktop,
// hamburger drawer on a phone — so a route group opts in with one word
// instead of twenty-two pages each importing a layout. ManagerLayout is
// idempotent, so the pages that already render it keep working: theirs
// becomes a passthrough inside this one.
//
// The four warehouse floor flows deliberately do NOT pass it. They use
// StaffShell, which is phone-first with a bottom tab bar for one-handed
// use at the gate — script 10 adds the same drawer there rather than
// replacing that shell with this one.
const ProtectedRoute = ({ roles, shell = false } = {}) => {
  const { user, isLoading } = useAuth();

  // Still checking with the server — decide nothing yet.
  if (isLoading) {
    return (
      <div className="page-light" role="status" aria-live="polite">
        <p className="pdf-table-empty">Checking your session…</p>
      </div>
    );
  }

  // Not logged in — send to login
  if (!user) return <Navigate to="/login" replace />;

  // Role check (used once SEC-04 is implemented per route)
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'guest' ? '/guest-home' : STAFF.home} replace />;
  }

  // All good — render the child route
  return shell ? <ManagerLayout><Outlet /></ManagerLayout> : <Outlet />;
};

export default ProtectedRoute;