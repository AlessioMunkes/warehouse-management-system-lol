import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GuestHomePage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="page-light">
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h1 className="section-title">WELCOME, {user?.firstName?.toUpperCase()}</h1>
        <button onClick={handleLogout} className="btn-ghost">LOGOUT</button>
      </div>
    </div>
  );
};

export default GuestHomePage;