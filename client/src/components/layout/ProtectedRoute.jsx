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
import { homeForRole } from '../../features/taskdashboard/components/navSections';
import ManagerLayout from '../../features/taskdashboard/components/ManagerLayout';
import AssistantLauncher from '../../features/assistant/components/AssistantLauncher';

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
  //
  // Sent to their OWN home, not the warehouse worker's. This was
  // STAFF.home for everybody, so a manager following a stale link to an
  // admin screen landed on the floor-staff task chooser with none of
  // their work on it. homeForRole is the same helper the brand link
  // uses, so the two now agree.
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'guest' ? '/guest-home' : homeForRole(user.role)} replace />;
  }

  // All good — render the child route.
  //
  // The help launcher rides along here rather than in either shell:
  // this is the one component EVERY signed-in route passes through,
  // including the four staff flows that use StaffShell instead of
  // ManagerLayout. One mount, whole app, and it is absent from the
  // landing and login pages for free because they are outside any
  // ProtectedRoute.
  //
  // Not for guests. A guest is a volunteer signed in with a first
  // name for one event; they see a single screen, and the server
  // refuses them the endpoint anyway (assistant.routes.js), so
  // offering the button would be offering a dead end.
  const content = shell ? <ManagerLayout><Outlet /></ManagerLayout> : <Outlet />;

  return (
    <>
      {content}
      {user.role !== 'guest' && <AssistantLauncher />}
    </>
  );
};

export default ProtectedRoute;