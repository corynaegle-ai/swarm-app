import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import ProtectedRoute from '../components/ProtectedRoute';
import Sidebar from '../components/Sidebar';

const TenantManagement = () => {
  const { user } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTenants = async () => {
      try {
        setLoading(true);
        // TODO: Replace with actual API call
        // const response = await fetch('/api/admin/tenants');
        // const data = await response.json();
        
        // Mock data for now
        const mockTenants = [
          {
            id: 1,
            name: 'Acme Corporation',
            domain: 'acme.corp',
            status: 'active',
            userCount: 150,
            createdAt: '2024-01-15T10:30:00Z',
            plan: 'enterprise'
          },
          {
            id: 2,
            name: 'Tech Startup Inc',
            domain: 'techstartup.com',
            status: 'active',
            userCount: 25,
            createdAt: '2024-02-20T14:15:00Z',
            plan: 'professional'
          },
          {
            id: 3,
            name: 'Global Services Ltd',
            domain: 'globalservices.net',
            status: 'suspended',
            userCount: 75,
            createdAt: '2024-01-10T09:45:00Z',
            plan: 'business'
          }
        ];
        
        setTenants(mockTenants);
      } catch (err) {
        setError('Failed to load tenants');
        console.error('Error fetching tenants:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTenants();
  }, []);

  const handleStatusChange = async (tenantId, newStatus) => {
    try {
      // TODO: Replace with actual API call
      // await fetch(`/api/admin/tenants/${tenantId}/status`, {
      //   method: 'PATCH',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ status: newStatus })
      // });
      
      setTenants(prev => 
        prev.map(tenant => 
          tenant.id === tenantId 
            ? { ...tenant, status: newStatus }
            : tenant
        )
      );
    } catch (err) {
      console.error('Error updating tenant status:', err);
      setError('Failed to update tenant status');
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'suspended':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPlanBadgeClass = (plan) => {
    switch (plan) {
      case 'enterprise':
        return 'bg-purple-100 text-purple-800';
      case 'professional':
        return 'bg-blue-100 text-blue-800';
      case 'business':
        return 'bg-indigo-100 text-indigo-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Tenant Management</h1>
            <p className="mt-2 text-gray-600">
              Manage tenants, their subscriptions, and access permissions.
            </p>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="bg-white shadow-sm rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900">All Tenants</h2>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors">
                  Add New Tenant
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tenant
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Domain
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Plan
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Users
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {tenant.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            ID: {tenant.id}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {tenant.domain}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full capitalize ${getPlanBadgeClass(tenant.plan)}`}>
                          {tenant.plan}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {tenant.userCount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full capitalize ${getStatusBadgeClass(tenant.status)}`}>
                          {tenant.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(tenant.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button className="text-blue-600 hover:text-blue-900">
                          Edit
                        </button>
                        <button 
                          onClick={() => handleStatusChange(tenant.id, tenant.status === 'active' ? 'suspended' : 'active')}
                          className={`${tenant.status === 'active' ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}`}
                        >
                          {tenant.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                        <button className="text-gray-600 hover:text-gray-900">
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {tenants.length === 0 && !loading && (
              <div className="p-8 text-center text-gray-500">
                <p>No tenants found.</p>
              </div>
            )}
          </div>

          <div className="mt-6 bg-white shadow-sm rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Tenant Statistics</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {tenants.length}
                </div>
                <div className="text-sm text-gray-600">Total Tenants</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {tenants.filter(t => t.status === 'active').length}
                </div>
                <div className="text-sm text-gray-600">Active Tenants</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {tenants.reduce((sum, tenant) => sum + tenant.userCount, 0)}
                </div>
                <div className="text-sm text-gray-600">Total Users</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProtectedTenantManagement = () => {
  return (
    <ProtectedRoute adminOnly={true}>
      <TenantManagement />
    </ProtectedRoute>
  );
};

export default ProtectedTenantManagement;