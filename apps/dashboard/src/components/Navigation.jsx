import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Navigation.css';

export function Navigation() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path ? 'nav-link active' : 'nav-link';
  };

  if (!user) {
    return null;
  }

  return (
    <nav className="navigation">
      <div className="nav-brand">
        <Link to="/" className="brand-link">Dashboard</Link>
      </div>
      
      <ul className="nav-menu">
        <li className="nav-item">
          <Link to="/" className={isActive('/')}>
            Home
          </Link>
        </li>
        
        <li className="nav-item">
          <Link to="/profile" className={isActive('/profile')}>
            Profile
          </Link>
        </li>
        
        {user.role === 'admin' && (
          <li className="nav-section">
            <span className="nav-section-title">Admin</span>
            <ul className="nav-subsection">
              <li className="nav-item">
                <Link to="/admin/users" className={isActive('/admin/users')}>
                  Users
                </Link>
              </li>
              <li className="nav-item">
                <Link to="/admin/tenants" className={isActive('/admin/tenants')}>
                  Tenants
                </Link>
              </li>
            </ul>
          </li>
        )}
      </ul>
      
      <div className="nav-user">
        <span className="user-info">{user.name}</span>
        <button onClick={logout} className="logout-btn">
          Logout
        </button>
      </div>
    </nav>
  );
}