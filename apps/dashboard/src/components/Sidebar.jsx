import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home,
  Users,
  Settings,
  Building2,
  Shield,
  BarChart3,
  FileText,
  Bell,
  HelpCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

const Sidebar = () => {
  const { user } = useAuth();
  const location = useLocation();

  const navigationItems = [
    {
      name: 'Dashboard',
      href: '/',
      icon: Home,
      roles: ['admin', 'user']
    },
    {
      name: 'Analytics',
      href: '/analytics',
      icon: BarChart3,
      roles: ['admin', 'user']
    },
    {
      name: 'Reports',
      href: '/reports',
      icon: FileText,
      roles: ['admin', 'user']
    },
    {
      name: 'Notifications',
      href: '/notifications',
      icon: Bell,
      roles: ['admin', 'user']
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Settings,
      roles: ['admin', 'user']
    }
  ];

  const adminNavigationItems = [
    {
      name: 'Admin Users',
      href: '/admin/users',
      icon: Users,
      roles: ['admin']
    },
    {
      name: 'Tenant Management',
      href: '/admin/tenants',
      icon: Building2,
      roles: ['admin']
    },
    {
      name: 'System Settings',
      href: '/admin/system',
      icon: Shield,
      roles: ['admin']
    }
  ];

  const supportItems = [
    {
      name: 'Help & Support',
      href: '/help',
      icon: HelpCircle,
      roles: ['admin', 'user']
    }
  ];

  const isActive = (path) => {
    return location.pathname === path;
  };

  const hasAccess = (roles) => {
    if (!user || !user.role) return false;
    return roles.includes(user.role);
  };

  const renderNavItem = (item) => {
    if (!hasAccess(item.roles)) return null;

    const Icon = item.icon;
    const active = isActive(item.href);

    return (
      <NavLink
        key={item.name}
        to={item.href}
        className={cn(
          'flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200',
          active
            ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        )}
      >
        <Icon className="w-5 h-5 mr-3" />
        {item.name}
      </NavLink>
    );
  };

  return (
    <div className="w-64 bg-white shadow-lg h-full flex flex-col">
      {/* Logo/Header */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-8">
        {/* Main Navigation */}
        <div>
          <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Main
          </h3>
          <div className="space-y-1">
            {navigationItems.map(renderNavItem)}
          </div>
        </div>

        {/* Admin Section */}
        {user && user.role === 'admin' && (
          <div>
            <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Administration
            </h3>
            <div className="space-y-1">
              {adminNavigationItems.map(renderNavItem)}
            </div>
          </div>
        )}

        {/* Support */}
        <div>
          <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Support
          </h3>
          <div className="space-y-1">
            {supportItems.map(renderNavItem)}
          </div>
        </div>
      </nav>

      {/* User Info */}
      {user && (
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-medium text-blue-600">
                {user.name?.charAt(0) || 'U'}
              </span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500 capitalize">{user.role}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;