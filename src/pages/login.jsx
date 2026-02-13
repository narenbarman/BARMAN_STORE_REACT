import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import './login.css';

// Phone number validation and formatting
const formatPhoneNumber = (phone) => {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  // Format as XXX-XXX-XXXX if 10 digits
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  }
  // Format as XXX-XXX-XXXX if 10 digits with country code
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `${cleaned.slice(0, 1)}-${cleaned.slice(1, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7, 11)}`;
  }
  return cleaned;
};

const validatePhoneNumber = (phone) => {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 11;
};

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

function Login({ setUser }) {
  const [loginMethod, setLoginMethod] = useState('email'); // 'email' or 'phone'
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetReason, setResetReason] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let data;
      if (isRegistering) {
        // Registration with optional phone and address
        const phoneValue = registerPhone || null;
        const addressValue = address || null;
        data = await authApi.register(email, password, name, phoneValue, addressValue);
      } else {
        // Login with either email or phone
        if (loginMethod === 'email') {
          if (!validateEmail(email)) {
            setError('Please enter a valid email address');
            setLoading(false);
            return;
          }
          data = await authApi.login(email, password);
        } else {
          if (!validatePhoneNumber(phone)) {
            setError('Please enter a valid phone number (10-11 digits)');
            setLoading(false);
            return;
          }
          data = await authApi.loginWithPhone(formatPhoneNumber(phone), password);
        }
      }

      // Store user and token in localStorage and state
      localStorage.setItem('user', JSON.stringify({ ...data.user, token: data.token }));
      setUser(data.user);

      // Redirect based on role
      if (data.user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = (e, isRegister) => {
    const value = e.target.value;
    if (isRegister) {
      setRegisterPhone(value);
    } else {
      setPhone(value);
    }
  };

  const handleResetRequest = async () => {
    try {
      setError('');
      if (!email && !phone) {
        setError('Enter your email or phone first to request reset');
        return;
      }
      await authApi.requestPasswordReset(email || null, phone || null, resetReason || null);
      setError('Reset request sent to admin');
    } catch (err) {
      setError(err.message || 'Failed to submit reset request');
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>{isRegistering ? 'Create Account' : 'Welcome Back'}</h1>
        <p className="login-subtitle">
          {isRegistering 
            ? 'Sign up for BARMAN STORE account' 
            : 'Sign in to your BARMAN STORE account'}
        </p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          {isRegistering && (
            <>
              <div className="form-group">
                <label htmlFor="name">Full Name</label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required={isRegistering}
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email (Optional)</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email (optional)"
                />
                <small style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                  Either email or phone is required
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="registerPhone">Phone Number (Optional)</label>
                <input
                  type="tel"
                  id="registerPhone"
                  value={registerPhone}
                  onChange={(e) => handlePhoneChange(e, true)}
                  placeholder="Enter your phone number (optional)"
                />
                <small style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                  Either email or phone is required
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="address">Address (Optional)</label>
                <input
                  type="text"
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter your address (optional)"
                />
              </div>
            </>
          )}

          {!isRegistering && (
            <div className="login-method-toggle">
              <button
                type="button"
                className={`toggle-btn ${loginMethod === 'email' ? 'active' : ''}`}
                onClick={() => setLoginMethod('email')}
              >
                Email
              </button>
              <button
                type="button"
                className={`toggle-btn ${loginMethod === 'phone' ? 'active' : ''}`}
                onClick={() => setLoginMethod('phone')}
              >
                Phone
              </button>
            </div>
          )}

          {!isRegistering && loginMethod === 'email' && (
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required={!isRegistering && loginMethod === 'email'}
              />
            </div>
          )}

          {!isRegistering && loginMethod === 'phone' && (
            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => handlePhoneChange(e, false)}
                placeholder="Enter your phone (e.g., 123-456-7890)"
                required={!isRegistering && loginMethod === 'phone'}
              />
              <small style={{ color: 'var(--color-text)', opacity: 0.7 }}>
                Enter your registered phone number (10-11 digits)
              </small>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Please wait...' : (isRegistering ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <div className="login-footer">
          <p>
            {isRegistering ? (
              <>
                Already have an account?{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(false); setError(''); }}>
                  Sign in
                </a>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(true); setError(''); }}>
                  Create one
                </a>
                <br />
                <span style={{ marginTop: '0.5rem', display: 'block' }}>
                  <Link to="/change-password" style={{ color: 'var(--color-secondary)', fontWeight: 700, textDecoration: 'none' }}>
                    Change Password
                  </Link>
                </span>
                <span style={{ marginTop: '0.5rem', display: 'block' }}>
                  <input
                    type="text"
                    value={resetReason}
                    onChange={(e) => setResetReason(e.target.value)}
                    placeholder="Reset reason (optional)"
                    style={{ width: '100%', marginBottom: '0.4rem' }}
                  />
                  <button type="button" className="login-button" onClick={handleResetRequest}>
                    Request Password Reset
                  </button>
                </span>
              </>
            )}
          </p>
        </div>

        {!isRegistering && (
          <div className="demo-credentials">
            <p><strong>Demo Credentials:</strong></p>
            <p>Admin: admin@admin.com / admin123</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Login;
