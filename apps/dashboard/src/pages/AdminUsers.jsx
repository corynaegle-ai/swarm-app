/**
 * Admin Users - User management dashboard
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import { User } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const ROLE_CONFIG = {
  admin: { label: 'Admin', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  user: { label: 'User', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' }
};

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch(`${API_BASE}/api/admin/users`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data.users || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);


  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: newRole })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update role');
      }
      await fetchUsers();
      setSelectedUser(null);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    users: users.filter(u => u.role === 'user').length
  };

  return (
    <div className="page-container">
      
      <Sidebar />

      <main className="admin-main">
        {/* Hero Section */}
        <div className="admin-hero">
          <div className="hero-title">
            <h2>👥 User Management</h2>
            <p>Manage user accounts and permissions</p>
          </div>
          <div className="hero-stats">
            <div className="hero-stat total">
              <span className="stat-number">{stats.total}</span>
              <span className="stat-label">Total Users</span>
            </div>
            <div className="hero-stat admins">
              <span className="stat-number">{stats.admins}</span>
              <span className="stat-label">Admins</span>
            </div>
            <div className="hero-stat regular">
              <span className="stat-number">{stats.users}</span>
              <span className="stat-label">Users</span>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="admin-toolbar">
          <button 
            className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
            onClick={fetchUsers}
            disabled={loading || refreshing}
          >
            <span className="refresh-icon">↻</span>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="error-banner">
            <span>⚠</span> {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}


        {/* Users Table */}
        <div className="users-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan="5" className="loading-row">
                    <div className="loading-pulse"></div>
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-row">
                    <div className="empty-state">
                      <span className="empty-icon">👥</span>
                      <p>No users found</p>
                    </div>
                  </td>
                </tr>
              ) : users.map(u => (
                <tr key={u.id} className="user-row">
                  <td className="td-user">
                    <div className="user-cell">
                      <div className="user-avatar">
                        {u.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <span className="user-name">{u.name || 'Unknown'}</span>
                      {u.id === currentUser?.id && (
                        <span className="you-badge">You</span>
                      )}
                    </div>
                  </td>
                  <td className="td-email">
                    <span className="user-email">{u.email}</span>
                  </td>
                  <td className="td-role">
                    <span 
                      className="role-badge"
                      style={{
                        color: ROLE_CONFIG[u.role]?.color,
                        backgroundColor: ROLE_CONFIG[u.role]?.bg
                      }}
                    >
                      {ROLE_CONFIG[u.role]?.label || u.role}
                    </span>
                  </td>
                  <td className="td-created">
                    <span className="created-date">{formatDate(u.created_at)}</span>
                  </td>
                  <td className="td-actions">
                    {u.id !== currentUser?.id && (
                      <button 
                        className="edit-btn"
                        onClick={() => setSelectedUser(u)}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>


        {/* Edit User Modal */}
        {selectedUser && (
          <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Edit User</h3>
                <button className="modal-close" onClick={() => setSelectedUser(null)}>×</button>
              </div>
              <div className="modal-body">
                <div className="modal-user-info">
                  <div className="modal-avatar">
                    {selectedUser.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div className="modal-user-name">{selectedUser.name}</div>
                    <div className="modal-user-email">{selectedUser.email}</div>
                  </div>
                </div>
                
                <div className="form-group">
                  <label>Role</label>
                  <div className="role-options">
                    <button
                      className={`role-option ${selectedUser.role === 'user' ? 'active' : ''}`}
                      onClick={() => handleRoleChange(selectedUser.id, 'user')}
                    >
                      <User size={14} />
                      <span className="role-name">User</span>
                      <span className="role-desc">Standard access</span>
                    </button>
                    <button
                      className={`role-option ${selectedUser.role === 'admin' ? 'active' : ''}`}
                      onClick={() => handleRoleChange(selectedUser.id, 'admin')}
                    >
                      <span className="role-icon">👑</span>
                      <span className="role-name">Admin</span>
                      <span className="role-desc">Full access</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Styles */}
        <style>{`
          .admin-dashboard { min-height: 100vh; background: #0a0a0a; }
          .admin-main { padding: 0 2rem 2rem; }
          
          /* Hero */
          .admin-hero {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 2rem 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            margin-bottom: 1.5rem;
          }
          .hero-title h2 { font-size: 1.75rem; color: #fff; margin: 0 0 0.5rem; }
          .hero-title p { color: #666; font-size: 0.95rem; margin: 0; }
          .hero-stats { display: flex; gap: 1rem; }
          .hero-stat {
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 12px;
            padding: 1rem 1.5rem;
            text-align: center;
            min-width: 100px;
          }
          .hero-stat.total { border-left: 3px solid #00d4ff; }
          .hero-stat.admins { border-left: 3px solid #f59e0b; }
          .hero-stat.regular { border-left: 3px solid #3b82f6; }
          .stat-number {
            display: block;
            font-size: 1.75rem;
            font-weight: 700;
            color: #fff;
          }
          .stat-label {
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #666;
          }

          /* Toolbar */
          .admin-toolbar {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 1.5rem;
          }
          .refresh-btn {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: linear-gradient(135deg, #00d4ff, #0099cc);
            border: none;
            color: #000;
            padding: 0.6rem 1.25rem;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          }
          .refresh-btn:hover:not(:disabled) { transform: scale(1.02); }
          .refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }
          .refresh-icon { transition: transform 0.3s; }
          .refresh-btn.spinning .refresh-icon { animation: spin 1s linear infinite; }
          @keyframes spin { to { transform: rotate(360deg); } }

          /* Error */
          .error-banner {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(239,68,68,0.1);
            border: 1px solid rgba(239,68,68,0.3);
            color: #ef4444;
            padding: 0.75rem 1rem;
            border-radius: 8px;
            margin-bottom: 1rem;
          }
          .error-banner button {
            margin-left: auto;
            background: none;
            border: none;
            color: inherit;
            font-size: 1.25rem;
            cursor: pointer;
          }


          /* Users Table */
          .users-container {
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            border: 1px solid rgba(255,255,255,0.06);
            border-radius: 12px;
            overflow: hidden;
          }
          .users-table { width: 100%; border-collapse: collapse; }
          .users-table th {
            padding: 1rem 1.25rem;
            text-align: left;
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #666;
            background: rgba(0,0,0,0.2);
            border-bottom: 1px solid rgba(255,255,255,0.06);
          }
          .users-table td {
            padding: 1rem 1.25rem;
            border-bottom: 1px solid rgba(255,255,255,0.04);
          }
          .user-row { transition: background 0.15s; }
          .user-row:hover { background: rgba(0,212,255,0.03); }
          .user-row:last-child td { border-bottom: none; }
          
          .user-cell { display: flex; align-items: center; gap: 0.75rem; }
          .user-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: linear-gradient(135deg, #00d4ff, #0099cc);
            color: #000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 0.9rem;
          }
          .user-name { color: #fff; font-weight: 500; }
          .you-badge {
            font-size: 0.65rem;
            padding: 0.15rem 0.5rem;
            background: rgba(16,185,129,0.15);
            color: #10b981;
            border-radius: 10px;
            font-weight: 600;
          }
          .user-email { color: #888; font-size: 0.9rem; }
          .role-badge {
            display: inline-block;
            padding: 0.3rem 0.75rem;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: 600;
          }
          .created-date { color: #666; font-size: 0.85rem; }
          .edit-btn {
            background: rgba(0,212,255,0.1);
            border: 1px solid rgba(0,212,255,0.3);
            color: #00d4ff;
            padding: 0.35rem 0.75rem;
            border-radius: 6px;
            font-size: 0.8rem;
            cursor: pointer;
            transition: all 0.2s;
          }
          .edit-btn:hover { background: rgba(0,212,255,0.2); border-color: #00d4ff; }

          /* Loading/Empty States */
          .loading-row, .empty-row { text-align: center; padding: 3rem 1rem !important; }
          .loading-pulse {
            width: 40px; height: 40px;
            border: 3px solid rgba(0,212,255,0.2);
            border-top-color: #00d4ff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
          }
          .empty-state { color: #666; }
          .empty-icon { font-size: 2.5rem; display: block; margin-bottom: 0.75rem; opacity: 0.5; }
          .empty-state p { margin: 0; font-size: 1.1rem; color: #888; }


          /* Modal */
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.85);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }
          .modal-content {
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            width: 90%;
            max-width: 400px;
          }
          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.25rem;
            border-bottom: 1px solid rgba(255,255,255,0.06);
          }
          .modal-header h3 { margin: 0; color: #fff; font-size: 1.1rem; }
          .modal-close {
            background: rgba(255,255,255,0.05);
            border: none;
            color: #666;
            font-size: 1.5rem;
            width: 36px;
            height: 36px;
            border-radius: 8px;
            cursor: pointer;
          }
          .modal-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
          .modal-body { padding: 1.25rem; }
          
          .modal-user-info {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1.5rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid rgba(255,255,255,0.06);
          }
          .modal-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: linear-gradient(135deg, #00d4ff, #0099cc);
            color: #000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 1.25rem;
          }
          .modal-user-name { color: #fff; font-weight: 600; font-size: 1rem; }
          .modal-user-email { color: #666; font-size: 0.85rem; }
          
          .form-group label {
            display: block;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #666;
            margin-bottom: 0.75rem;
          }
          .role-options { display: flex; gap: 0.75rem; }
          .role-option {
            flex: 1;
            background: rgba(0,0,0,0.3);
            border: 2px solid rgba(255,255,255,0.06);
            border-radius: 12px;
            padding: 1rem;
            cursor: pointer;
            text-align: center;
            transition: all 0.2s;
          }
          .role-option:hover { border-color: rgba(255,255,255,0.15); }
          .role-option.active { border-color: #00d4ff; background: rgba(0,212,255,0.1); }
          .role-icon { display: block; font-size: 1.5rem; margin-bottom: 0.5rem; }
          .role-name { display: block; color: #fff; font-weight: 600; font-size: 0.9rem; }
          .role-desc { display: block; color: #666; font-size: 0.75rem; margin-top: 0.25rem; }

          /* Nav active */
          .dashboard-nav a.active { color: #00d4ff; background: rgba(0,212,255,0.1); }
        `}</style>
      </main>
    </div>
  );
}
