import React, { useState, useEffect } from 'react';
import './EditTenantModal.css';

const EditTenantModal = ({ isOpen, onClose, onSave, tenant }) => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    plan: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (tenant) {
      setFormData({
        id: tenant.id || '',
        name: tenant.name || '',
        plan: tenant.plan || ''
      });
      setErrors({});
    }
  }, [tenant]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.plan.trim()) {
      newErrors.plan = 'Plan is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onSave({
        id: formData.id,
        name: formData.name.trim(),
        plan: formData.plan.trim()
      });
      handleClose();
    } catch (error) {
      console.error('Error saving tenant:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({ id: '', name: '', plan: '' });
    setErrors({});
    setIsSubmitting(false);
    onClose();
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content edit-tenant-modal">
        <div className="modal-header">
          <h2>Edit Tenant</h2>
          <button 
            type="button" 
            className="modal-close-btn" 
            onClick={handleClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>
        
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="tenant-id">ID</label>
              <input
                id="tenant-id"
                type="text"
                value={formData.id}
                readOnly
                className="form-control readonly"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="tenant-name">Name *</label>
              <input
                id="tenant-name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={`form-control ${errors.name ? 'error' : ''}`}
                placeholder="Enter tenant name"
              />
              {errors.name && <span className="error-message">{errors.name}</span>}
            </div>
            
            <div className="form-group">
              <label htmlFor="tenant-plan">Plan *</label>
              <select
                id="tenant-plan"
                name="plan"
                value={formData.plan}
                onChange={handleInputChange}
                className={`form-control ${errors.plan ? 'error' : ''}`}
              >
                <option value="">Select a plan</option>
                <option value="free">Free</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
              {errors.plan && <span className="error-message">{errors.plan}</span>}
            </div>
            
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditTenantModal;