import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Ticket,
  Kanban,
  Bot,
  Server,
  FolderPlus,
  Users,
  KeyRound,
  Layers,
  LogOut,
  Brain,
  Wand2,
} from 'lucide-react';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/tickets', icon: Ticket, label: 'Tickets' },
    { to: '/tickets/kanban', icon: Kanban, label: 'Kanban' },
    { to: '/agents', icon: Bot, label: 'Agents' },
    { to: '/agents/catalog', icon: Layers, label: 'Catalog' },
    { to: '/vms', icon: Server, label: 'VMs' },
    { to: '/learning', icon: Brain, label: 'Learning' },
    { to: '/mcp-factory', icon: Wand2, label: 'MCP Factory' },
    { to: '/projects/new', icon: FolderPlus, label: 'New Project' },
  ];

  const adminItems = [
    { to: '/admin/users', icon: Users, label: 'Users' },
    { to: '/secrets', icon: KeyRound, label: 'Secrets' },
  ];

  const isActive = (path) => {
    // Exact match for specific routes
    if (path === '/tickets' && location.pathname === '/tickets') return true;
    if (path === '/tickets/kanban' && location.pathname === '/tickets/kanban') return true;
    if (path === '/agents' && location.pathname === '/agents') return true;
    if (path === '/agents/catalog') return location.pathname.startsWith('/agents/catalog');
    
    // For other routes, use startsWith but exclude handled paths
    if (path !== '/tickets' && path !== '/tickets/kanban' && path !== '/agents' && path !== '/agents/catalog') {
      return location.pathname.startsWith(path);
    }
    return false;
  };


  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Layers className="brand-icon" />
        <span>Swarm</span>
      </div>
      
      <nav className="sidebar-nav">
        <div className="nav-section">
          {navItems.map(item => (
            <Link 
              key={item.to} 
              to={item.to} 
              className={`nav-item ${isActive(item.to) ? 'active' : ''}`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
        
        {user?.role === 'admin' && (
          <div className="nav-section">
            <div className="nav-section-label">Admin</div>
            {adminItems.map(item => (
              <Link 
                key={item.to} 
                to={item.to} 
                className={`nav-item ${isActive(item.to) ? 'active' : ''}`}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-card">
          <div className="user-avatar">{user?.name?.charAt(0) || 'U'}</div>
          <div className="user-details">
            <span className="user-name">{user?.name}</span>
            <span className="user-role">{user?.role}</span>
          </div>
        </div>
        <button onClick={logout} className="logout-btn" title="Sign out">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}
