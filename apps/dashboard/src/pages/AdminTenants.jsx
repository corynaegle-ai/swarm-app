import React, { useState, useEffect } from 'react';
import './AdminUsers.css';

const AdminTenants = () => {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingTenant, setEditingTenant] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', plan: '' });
  const [saving, setSaving] = useState(false);

  // Fetch tenants data
  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Mock API call - replace with actual API endpoint
      const response = await fetch('/api/tenants');
      if (!response.ok) {
        throw new Error('Failed to fetch tenants');
      }
      const data = await response.json();
      setTenants(data);
    } catch (err) {
      setError(err.message);
      // Mock data for development
      setTenants([
        { id: 1, name: 'Acme Corporation', plan: 'Enterprise' },
        { id: 2, name: 'TechStart Inc', plan: 'Professional' },
        { id: 3, name: 'Small Biz LLC', plan: 'Basic' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (tenant) => {
    setEditingTenant(tenant);
    setEditForm({
      name: tenant.name,
      plan: tenant.plan
    });
  };

  const handleCloseModal = () => {
    setEditingTenant(null);
    setEditForm({ name: '', plan: '' });
    setSaving(false);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSave = async () => {
    if (!editForm.name.trim() || !editForm.plan.trim()) {
      alert('Please fill in all fields');
      return;
    }

    try {
      setSaving(true);
      
      // Mock API call - replace with actual API endpoint
      const response = await fetch(`/api/tenants/${editingTenant.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update tenant');
      }

      // Update local state
      setTenants(prev => prev.map(tenant => 
        tenant.id === editingTenant.id 
          ? { ...tenant, ...editForm }
          : tenant
      ));
      
      handleCloseModal();
    } catch (err) {
      alert(`Error updating tenant: ${err.message}`);
      // For demo purposes, update anyway
      setTenants(prev => prev.map(tenant => 
        tenant.id === editingTenant.id 
          ? { ...tenant, ...editForm }
          : tenant
      ));
      handleCloseModal();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-users">
        <div className="admin-users-header">
          <h1>Tenant Management</h1>
        </div>
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading tenants...</p>
        </div>
      </div>
    );
  }

  if (error && tenants.length === 0) {
    return (
      <div className="admin-users">
        <div className="admin-users-header">
          <h1>Tenant Management</h1>
        </div>
        <div className="error-state">
          <p>Error: {error}</p>
          <button onClick={fetchTenants} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-users">
      <div className="admin-users-header">
        <h1>Tenant Management</h1>
        <p>Manage organization tenants and their subscription plans</p>
      </div>

      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Plan</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id}>
                <td>{tenant.id}</td>
                <td>{tenant.name}</td>
                <td>
                  <span className={`plan-badge plan-${tenant.plan.toLowerCase()}`}>
                    {tenant.plan}
                  </span>
                </td>
                <td>
                  <button 
                    className="edit-button"
                    onClick={() => handleEdit(tenant)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingTenant && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Tenant</h2>
              <button className="modal-close" onClick={handleCloseModal}>
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="name">Name:</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={editForm.name}
                  onChange={handleFormChange}
                  placeholder="Enter tenant name"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="plan">Plan:</label>
                <select
                  id="plan"
                  name="plan"
                  value={editForm.plan}
                  onChange={handleFormChange}
                >
                  <option value="">Select a plan</option>
                  <option value="Basic">Basic</option>
                  <option value="Professional">Professional</option>
                  <option value="Enterprise">Enterprise</option>
                </select>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="cancel-button" 
                onClick={handleCloseModal}
                disabled={saving}
              >
                Cancel
              </button>
              <button 
                className="save-button" 
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTenants;