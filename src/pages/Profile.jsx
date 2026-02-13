import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, Phone, MapPin, Mail, Save, CheckCircle, 
  AlertCircle, ArrowLeft, Home 
} from 'lucide-react';
import { usersApi } from '../services/api';
import './Profile.css';

function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: 'India',
  });
  
  const [validationIssues, setValidationIssues] = useState([]);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const savedUser = localStorage.getItem('user');
      if (!savedUser) {
        navigate('/login');
        return;
      }
      
      const userData = JSON.parse(savedUser);
      setUser(userData);
      
      // Load full profile from server
      const profile = await usersApi.getById(userData.id);
      
      let addressData = {};
      if (profile.address) {
        try {
          addressData = JSON.parse(profile.address);
        } catch (e) {}
      }
      
      setFormData({
        name: profile.name || '',
        email: profile.email || '',
        phone: profile.phone || '',
        ...addressData
      });
      
      // Validate profile completeness
      validateProfile(profile, addressData);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const validateProfile = (profile, address) => {
    const issues = [];
    
    if (!profile.phone || profile.phone.trim().length < 10) {
      issues.push({ field: 'phone', message: 'Phone number is required (min 10 digits)' });
    }
    if (!address.street) issues.push({ field: 'street', message: 'Street address is required' });
    if (!address.city) issues.push({ field: 'city', message: 'City is required' });
    if (!address.state) issues.push({ field: 'state', message: 'State is required' });
    if (!address.zip) issues.push({ field: 'zip', message: 'Postal code is required' });
    
    setValidationIssues(issues);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear validation issues when user starts editing
    if (validationIssues.find(i => i.field === name)) {
      setValidationIssues(prev => prev.filter(i => i.field !== name));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const address = {
        street: formData.street,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        country: formData.country
      };

      await usersApi.update(user.id, {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: JSON.stringify(address)
      });

      // Update local storage
      const updatedUser = {
        ...user,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: JSON.stringify(address)
      };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      
      setSuccess('Profile updated successfully!');
      
      // Re-validate
      validateProfile({ ...formData, phone: formData.phone }, address);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="loading-container">
          <User size={40} className="spinning" />
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <div className="profile-header fade-in-up">
        <button className="back-btn" onClick={() => navigate('/')}>
          <ArrowLeft size={20} /> Back
        </button>
        <h1>My Profile</h1>
        <p>Manage your account information</p>
      </div>

      {/* Validation Issues Warning */}
      {validationIssues.length > 0 && (
        <div className="validation-warning fade-in-up">
          <AlertCircle size={24} />
          <div className="warning-content">
            <h3>Complete Your Profile for Orders</h3>
            <p>The following information is required to place orders:</p>
            <ul className="issues-list">
              {validationIssues.map((issue, idx) => (
                <li key={idx}>
                  <span className="issue-icon">•</span>
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="success-alert fade-in-up">
          <CheckCircle size={20} />
          <span>{success}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-alert fade-in-up">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      <div className="profile-content">
        <form onSubmit={handleSubmit} className="profile-form slide-in-up">
          
          {/* Personal Information */}
          <div className="form-section">
            <h2><User size={20} /> Personal Information</h2>
            
            <div className="form-group">
              <label htmlFor="name">Full Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="Your full name"
                className={validationIssues.find(i => i.field === 'name') ? 'error-field' : ''}
              />
            </div>

            <div className="form-row two-col">
              <div className="form-group">
                <label htmlFor="email">
                  <Mail size={16} /> Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="your@email.com"
                />
              </div>
              <div className="form-group">
                <label htmlFor="phone">
                  <Phone size={16} /> Phone Number *
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                  placeholder="+91 98765 43210"
                  className={validationIssues.find(i => i.field === 'phone') ? 'error-field' : ''}
                />
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          <div className="form-section">
            <h2><MapPin size={20} /> Shipping Address</h2>
            <p className="section-help">This address will be used for all orders</p>
            
            <div className="form-group">
              <label htmlFor="street">Street Address *</label>
              <input
                type="text"
                id="street"
                name="street"
                value={formData.street}
                onChange={handleInputChange}
                placeholder="123 Main Street, Apartment 4B"
                className={validationIssues.find(i => i.field === 'street') ? 'error-field' : ''}
              />
            </div>

            <div className="form-row three-col">
              <div className="form-group">
                <label htmlFor="city">City *</label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  placeholder="Mumbai"
                  className={validationIssues.find(i => i.field === 'city') ? 'error-field' : ''}
                />
              </div>
              <div className="form-group">
                <label htmlFor="state">State/Region *</label>
                <input
                  type="text"
                  id="state"
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  placeholder="Maharashtra"
                  className={validationIssues.find(i => i.field === 'state') ? 'error-field' : ''}
                />
              </div>
              <div className="form-group">
                <label htmlFor="zip">Postal Code *</label>
                <input
                  type="text"
                  id="zip"
                  name="zip"
                  value={formData.zip}
                  onChange={handleInputChange}
                  placeholder="400001"
                  className={validationIssues.find(i => i.field === 'zip') ? 'error-field' : ''}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="country">Country</label>
              <input
                type="text"
                id="country"
                name="country"
                value={formData.country}
                onChange={handleInputChange}
                placeholder="India"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={() => navigate('/')}>
              Cancel
            </button>
            <button type="submit" className="save-btn" disabled={saving}>
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* Quick Actions */}
        <div className="quick-actions slide-in-up">
          <h3>Quick Actions</h3>
          <button className="action-btn" onClick={() => navigate('/order-history')}>
            View My Orders
          </button>
          <button className="action-btn" onClick={() => navigate('/cart')}>
            View Cart
          </button>
          <button className="action-btn" onClick={() => navigate('/change-password')}>
            Change Password
          </button>
        </div>
      </div>
    </div>
  );
}

export default Profile;
