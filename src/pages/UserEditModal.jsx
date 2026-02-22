import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { usersApi } from '../services/api';
import useIsMobile from '../hooks/useIsMobile';
import MobileBottomSheet from '../components/mobile/MobileBottomSheet';
import './UserEditModal.css';

function UserEditModal({ user, onClose, onSave, isCreate = false }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    role: 'customer'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [errors, setErrors] = useState({});
  const isMobile = useIsMobile();

  useEffect(() => {
    if (user && !isCreate) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || '',
        role: user.role || 'customer'
      });
    }
  }, [user, isCreate]);

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }
    
    // Email is optional - no validation needed
    
    // Phone validation (10-11 digits)
    if (formData.phone) {
      const cleaned = formData.phone.replace(/\D/g, '');
      if (cleaned.length < 10 || cleaned.length > 11) {
        newErrors.phone = 'Phone must be 10-11 digits';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isCreate) {
        // Create mode: backend will generate a temporary strong password if password is omitted.
        await usersApi.create({
          ...formData,
          role: 'customer'
        });
        setSuccess('Customer created successfully');
      } else {
        await usersApi.update(user.id, formData);
        setSuccess('User updated successfully');
      }
      setTimeout(() => {
        onSave();
        onClose();
      }, 1000);
    } catch (err) {
      setError(err.message || `Failed to ${isCreate ? 'create' : 'update'} user`);
    } finally {
      setLoading(false);
    }
  };

  const formContent = (
    <>
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <form onSubmit={handleSubmit} className="user-edit-form">
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter customer name"
              autoComplete="name"
              className={errors.name ? 'error' : ''}
              disabled={!isCreate && user?.role === 'admin'}
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter email (optional)"
              autoComplete="email"
              disabled={!isCreate && user?.role === 'admin'}
            />
          </div>

          <div className="form-group">
            <label htmlFor="phone">Phone</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="Enter phone number (e.g., 123-456-7890)"
              autoComplete="tel"
              className={errors.phone ? 'error' : ''}
              disabled={!isCreate && user?.role === 'admin'}
            />
            {errors.phone && <span className="field-error">{errors.phone}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="address">Address</label>
            <input
              type="text"
              id="address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Enter address"
              autoComplete="street-address"
              disabled={!isCreate && user?.role === 'admin'}
            />
          </div>

          {!isCreate && (
            <div className="form-group">
              <label htmlFor="role">Role</label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
                disabled={user?.role === 'admin'}
              >
                <option value="customer">Customer</option>
                <option value="admin">Admin</option>
              </select>
              {user?.role === 'admin' && (
                <span className="info-text">Admin users cannot be modified</span>
              )}
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="submit-btn" 
              disabled={loading || (!isCreate && user?.role === 'admin')}
            >
              {loading ? 'Saving...' : (isCreate ? 'Add Customer' : 'Update User')}
            </button>
          </div>
      </form>
    </>
  );

  if (isMobile) {
    return (
      <MobileBottomSheet
        open
        title={isCreate ? 'Add New Customer' : 'Edit User'}
        onClose={onClose}
        className="user-edit-sheet"
      >
        {formContent}
      </MobileBottomSheet>
    );
  }

  return (
    <div className="user-edit-overlay">
      <div className="user-edit-modal fade-in-up">
        <div className="user-edit-header">
          <h2>{isCreate ? 'Add New Customer' : 'Edit User'}</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>
        {formContent}
      </div>
    </div>
  );
}

export default UserEditModal;
