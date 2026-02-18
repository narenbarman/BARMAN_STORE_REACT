import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User, Shield, LogOut, ChevronDown, Settings, X, ShoppingCart } from 'lucide-react';
import './UserMenu.css';

function UserMenu({ user, setUser }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const handleEsc = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    const isMobile = window.innerWidth <= 768;
    const previousOverflow = document.body.style.overflow;
    if (isMobile) document.body.style.overflow = 'hidden';

    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setMenuOpen(false);
    navigate('/');
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="user-menu-container" ref={menuRef}>
      {user ? (
        <>
          {/* Logged in - Show user avatar button */}
          <button 
            className="user-menu-button logged-in"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Account menu"
            aria-expanded={menuOpen}
          >
            <span className="user-avatar">
              {user.name ? getInitials(user.name) : <User size={18} />}
            </span>
            <span className="user-menu-label">Account</span>
            <ChevronDown size={16} className={`chevron ${menuOpen ? 'open' : ''}`} />
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <>
              <button
                type="button"
                className="user-menu-overlay"
                aria-label="Close account menu"
                onClick={() => setMenuOpen(false)}
              />
              <div className="user-dropdown fade-in-up open">
                {/* User Info Header */}
                <div className="dropdown-header">
                  <div className="dropdown-avatar">
                    {user.name ? getInitials(user.name) : <User size={24} />}
                  </div>
                  <div className="dropdown-user-info">
                    <span className="dropdown-user-name">{user.name || 'User'}</span>
                    <span className="dropdown-user-email">{user.email || user.phone || 'No email'}</span>
                  </div>
                  <button
                    type="button"
                    className="dropdown-close-btn"
                    aria-label="Close account menu"
                    onClick={() => setMenuOpen(false)}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="dropdown-divider"></div>

                {/* Menu Items */}
                <div className="dropdown-menu">
                  <Link to="/profile" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                    <User size={18} />
                    <span>My Profile</span>
                  </Link>

                  {user.role === 'admin' && (
                    <Link to="/admin" className="dropdown-item admin-item" onClick={() => setMenuOpen(false)}>
                      <Shield size={18} />
                      <span>Admin Panel</span>
                    </Link>
                  )}
                  <Link to="/my-orders" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                    <ShoppingCart size={18} />
                    <span>My Orders</span>
                  </Link>

                  <div className="dropdown-divider"></div>

                  <Link to="/change-password" className="dropdown-item" onClick={() => setMenuOpen(false)}>
                    <Settings size={18} />
                    <span>Change Password</span>
                  </Link>

                  <button className="dropdown-item logout-item" onClick={handleLogout}>
                    <LogOut size={18} />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {/* Not logged in - Show Sign in button */}
          <Link to="/login" className="user-menu-button sign-in-btn">
            <span>Sign in</span>
          </Link>
        </>
      )}
    </div>
  );
}

export default UserMenu;
