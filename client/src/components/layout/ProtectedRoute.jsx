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

const ProtectedRoute = ({ roles } = {}) => {
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
    return <Navigate to={user.role === 'guest' ? '/guest-home' : '/programmes'} replace />;
  }

  // All good — render the child route
  return <Outlet />;
};

export default ProtectedRoute;