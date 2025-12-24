import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  Home, 
  Users, 
  Key, 
  Building2,
  Settings, 
  LogOut,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [adminExpanded, setAdminExpanded] = React.useState(true);

  const navigationItems = [
    {
      to: '/',
      icon: Home,
      label: 'Dashboard'
    },
    {
      to: '/settings',
      icon: Settings,
      label: 'Settings'
    }
  ];

  const adminItems = [
    {
      to: '/admin/users',
      icon: Users,
      label: 'Users'
    },
    {
      to: '/admin/tenants',
      icon: Building2,
      label: 'Tenants'
    },
    {
      to: '/admin/secrets',
      icon: Key,
      label: 'Secrets'
    }
  ];

  const isActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const isAdminRoute = () => {
    return location.pathname.startsWith('/admin');
  };

  React.useEffect(() => {
    if (isAdminRoute()) {
      setAdminExpanded(true);
    }
  }, [location.pathname]);

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200">
      {/* Logo/Brand */}
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {/* Main Navigation */}
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isActive(item.to)
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className="w-5 h-5 mr-3" />
              {item.label}
            </NavLink>
          );
        })}

        {/* Admin Section */}
        {user?.role === 'admin' && (
          <div className="mt-6">
            <button
              onClick={() => setAdminExpanded(!adminExpanded)}
              className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              {adminExpanded ? (
                <ChevronDown className="w-4 h-4 mr-2" />
              ) : (
                <ChevronRight className="w-4 h-4 mr-2" />
              )}
              <span className="text-xs uppercase tracking-wider font-semibold text-gray-500">
                Admin
              </span>
            </button>
            
            {adminExpanded && (
              <div className="mt-2 space-y-1">
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={cn(
                        'flex items-center px-3 py-2 ml-4 text-sm font-medium rounded-md transition-colors',
                        isActive(item.to)
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      )}
                    >
                      <Icon className="w-4 h-4 mr-3" />
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* User Info & Logout */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-white">
                {user?.name?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;