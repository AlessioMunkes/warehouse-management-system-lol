import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ProtectedRoute = ({ roles } = {}) => {
  const { user, isLoading } = useAuth();

  // Still reading from localStorage — render nothing yet
  if (isLoading) return null;

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