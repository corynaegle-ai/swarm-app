import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/signin');
  };

  if (!user) return null;

  return (
    <div className="user-menu">
      <span className="user-info">
        {user.name} <span className="user-role">({user.role})</span>
      </span>
      <button onClick={handleLogout} className="logout-btn">
        Logout
      </button>
    </div>
  );
}
