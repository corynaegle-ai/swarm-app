import React from 'react';
import { Building2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import Sidebar from '../components/Sidebar';

const TenantManagement = () => {
  const { user } = useAuth();

  return (
    <div className="page-container">
      <Sidebar />
      <div className="page-main">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Building2 className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Tenant Management</h1>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center py-12">
              <Building2 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                Tenant Management System
              </h2>
              <p className="text-gray-500 mb-6">
                Manage tenants, track occupancy, and handle lease agreements.
              </p>
              <div className="space-y-2 text-sm text-gray-600">
                <p>• View and manage all tenants</p>
                <p>• Track lease agreements and renewals</p>
                <p>• Monitor occupancy rates</p>
                <p>• Handle tenant communications</p>
              </div>
              <div className="mt-8">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-blue-700 font-medium">
                    🚧 Feature coming soon!
                  </p>
                  <p className="text-blue-600 text-sm mt-1">
                    Full tenant management functionality will be available in the next release.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantManagement;