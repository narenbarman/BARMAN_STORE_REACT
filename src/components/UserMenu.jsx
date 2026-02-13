import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Shield, LogOut, ChevronDown, Settings } from 'lucide-react';
import './UserMenu.css';

function UserMenu({ user, setUser }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
          >
            <span className="user-avatar">
              {user.name ? getInitials(user.name) : <User size={18} />}
            </span>
            <ChevronDown size={16} className={`chevron ${menuOpen ? 'open' : ''}`} />
          </button>

          {/* Dropdown menu */}
          {menuOpen && (
            <div className="user-dropdown fade-in-up">
              {/* User Info Header */}
              <div className="dropdown-header">
                <div className="dropdown-avatar">
                  {user.name ? getInitials(user.name) : <User size={24} />}
                </div>
                <div className="dropdown-user-info">
                  <span className="dropdown-user-name">{user.name || 'User'}</span>
                  <span className="dropdown-user-email">{user.email || user.phone || 'No email'}</span>
                </div>
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
