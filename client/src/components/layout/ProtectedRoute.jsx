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
import { homeForRole } from './navSections';
import ManagerLayout from './ManagerLayout';
import AssistantLauncher from '../../features/assistant/AssistantLauncher';
import WelcomeDialog from '../../features/onboarding/WelcomeDialog';
import useWelcome from '../../features/onboarding/useWelcome';
import LoadingScreen from '../ui/loading-screen';

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
  // Before any early return: a hook has to run on every render.
  const welcome = useWelcome(user);

  // Still checking with the server — decide nothing yet.
  if (isLoading) {
    return <LoadingScreen page label="Checking your session" />;
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
  // Guests get it too: a volunteer on their first shift needs help the
  // most. The server gives them a small set of topics of their own, no
  // screens to open and a tighter limit (assistant.routes.js).
  const content = shell ? <ManagerLayout><Outlet /></ManagerLayout> : <Outlet />;

  // First use rides here for the same reason the launcher does: it
  // shows on whichever screen someone first reaches after signing in.
  // The welcome card comes first; the tip on the Help button waits for
  // it to close, so the two are never said at once.
  return (
    <>
      {content}
      <WelcomeDialog user={user} open={welcome.open} onClose={welcome.dismiss} />
      <AssistantLauncher role={user.role} hintReady={!welcome.open} />
    </>
  );
};

export default ProtectedRoute;