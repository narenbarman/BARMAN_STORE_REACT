import { BrowserRouter, HashRouter, Routes, Route, Link } from 'react-router-dom';
import { ShoppingCart, Menu, X, Package, ClipboardList, Home as HomeIcon, Store } from 'lucide-react';
import { useState, useEffect, lazy, Suspense } from 'react';
import UserMenu from './components/UserMenu';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import './App.css';
import * as info from './pages/info.js';
import logoImage from '../logo.png';

const Home = lazy(() => import('./pages/Home'));
const Products = lazy(() => import('./pages/Products'));
const Cart = lazy(() => import('./pages/Cart'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Login = lazy(() => import('./pages/login'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const Admin = lazy(() => import('./pages/Admin'));
const CreditHistory = lazy(() => import('./pages/CreditHistory'));
const OrderHistory = lazy(() => import('./pages/OrderHistory'));
const OrderTracking = lazy(() => import('./pages/OrderTracking'));
const MyOrders = lazy(() => import('./pages/MyOrders'));
const OrderDetails = lazy(() => import('./pages/OrderDetails'));
const Profile = lazy(() => import('./pages/Profile'));
const Billing = lazy(() => import('./pages/Billing'));


// React Router v7 future flags to opt-in early and suppress warnings
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true
};

const isGitHubPagesHost = (() => {
  if (typeof window === 'undefined') return false;
  return /\.github\.io$/i.test(window.location.hostname);
})();

const Router = isGitHubPagesHost ? HashRouter : BrowserRouter;
const routerBasename = (() => {
  if (isGitHubPagesHost) return '/';
  const base = String(import.meta.env.BASE_URL || '/');
  return base === '/' ? '/' : base.replace(/\/$/, '');
})();

const getGitHubPagesHashUrl = (path = '/') => {
  if (typeof window === 'undefined') return path;
  const normalizedPath = String(path || '/').startsWith('/') ? String(path) : `/${path}`;
  const basePath = String(import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${window.location.origin}${basePath}/#${normalizedPath}`;
};

function App() {
  const [cartCount, setCartCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check for existing user session
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (_) {
        localStorage.removeItem('user');
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    const syncUserFromStorage = () => {
      const savedUser = localStorage.getItem('user');
      if (!savedUser) {
        setUser(null);
        return;
      }
      try {
        setUser(JSON.parse(savedUser));
      } catch (_) {
        localStorage.removeItem('user');
        setUser(null);
      }
    };
    window.addEventListener('storage', syncUserFromStorage);
    window.addEventListener('user-updated', syncUserFromStorage);
    return () => {
      window.removeEventListener('storage', syncUserFromStorage);
      window.removeEventListener('user-updated', syncUserFromStorage);
    };
  }, []);

  useEffect(() => {
    if (!isGitHubPagesHost || typeof window === 'undefined') return;
    const currentHash = String(window.location.hash || '');
    if (currentHash && currentHash.startsWith('#/')) return;

    const basePath = String(import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    const pathWithoutBase = window.location.pathname.replace(basePath, '') || '/';
    const normalizedPath = pathWithoutBase.startsWith('/') ? pathWithoutBase : `/${pathWithoutBase}`;

    if (normalizedPath === '/') return;

    const target = getGitHubPagesHashUrl(normalizedPath);
    window.location.replace(target + window.location.search);
  }, []);

  return (
    <ErrorBoundary>
      <Router basename={routerBasename} future={routerFuture}>
      <div className="app">
        {/* Header */}
        <header className="header">
          <div className="header-content">
            <Link to="/" className="logo">
              <img src={logoImage} alt="Logo" className="logo-image" />
              <span className="logo-bar">BAR</span>
              <span className="logo-man">MAN</span>
              <span className="logo-store">STORE</span>
            </Link>

            <nav className={`nav ${mobileMenuOpen ? 'nav-open' : ''}`}>
              <Link to="/" onClick={() => setMobileMenuOpen(false)}>
                <HomeIcon size={20} /> Home
              </Link>
              <Link to="/products" onClick={() => setMobileMenuOpen(false)}>
                <Store size={20} /> Products
              </Link>
              <Link to="/order-history" onClick={() => setMobileMenuOpen(false)}>
                <ClipboardList size={20} /> Orders
              </Link>
              <Link to="/order-tracking" onClick={() => setMobileMenuOpen(false)}>
                <Package size={20} /> Track
              </Link>
              <Link to="/cart" className="cart-link" onClick={() => setMobileMenuOpen(false)}>
                <ShoppingCart size={20} />
                {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
              </Link>
              
              {/* Combined User Menu (Profile, Login/Logout, Admin) */}
              <UserMenu user={user} setUser={setUser} />
            </nav>

            <button 
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="main-content">
          <Suspense fallback={<div style={{ padding: '24px' }}>Loading...</div>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/products" element={<Products setCartCount={setCartCount} />} />
              <Route path="/cart" element={<Cart cartCount={cartCount} setCartCount={setCartCount} />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/login" element={<Login setUser={setUser} />} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route path="/admin" element={<Admin user={user} />} />
              <Route path="/admin/users/:userId/credit" element={<CreditHistory user={user} />} />
              <Route path="/my-credit" element={<CreditHistory user={user} />} />
              <Route path="/order-history" element={<OrderHistory />} />
              <Route path="/my-orders" element={<MyOrders />} />
              <Route path="/orders/:id" element={<OrderDetails />} />
              <Route path="/order-tracking" element={<OrderTracking />} />
              <Route path="/order-tracking/:orderId" element={<OrderTracking />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/billing/:billNumber" element={<Billing />} />
            </Routes>
          </Suspense>
        </main>

        {/* Footer */}
        <footer className="footer">
          <div className="footer-content">
            <div className="footer-section">
              <h3>{info.TITLE}</h3>
              <p>{info.SUB_TITLE}</p>
            </div>
            <div className="footer-section">
              <h4>Quick Links</h4>
              <Link to="/products">Shop</Link>
              <Link to="/cart">Cart</Link>
            </div>
            <div className="footer-section">
              <h4>CONTACT US</h4>
              <p>Email:{info.EMAIL}</p>
              <p>Phone: {info.CONTACT}</p>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2026 {info.TITLE}. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </Router>
    </ErrorBoundary>
  );
}

export default App;
