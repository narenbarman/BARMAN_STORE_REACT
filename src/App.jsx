import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ShoppingCart, Menu, X, Package, ClipboardList, Home as HomeIcon, Store } from 'lucide-react';
import { useState, useEffect } from 'react';
import Home from './pages/Home';
import Products from './pages/Products';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Login from './pages/login';
import ChangePassword from './pages/ChangePassword';
import Admin from './pages/Admin';
import CreditHistory from './pages/CreditHistory';
import OrderHistory from './pages/OrderHistory';
import OrderTracking from './pages/OrderTracking';
import MyOrders from './pages/MyOrders';
import OrderDetails from './pages/OrderDetails';
import Profile from './pages/Profile';
import Billing from './pages/Billing';
import UserMenu from './components/UserMenu';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';
import './App.css';
import * as info from './pages/info.js';
import logoImage from '../logo.png';


// React Router v7 future flags to opt-in early and suppress warnings
const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true
};

const routerBasename = (() => {
  const base = String(import.meta.env.BASE_URL || '/');
  return base === '/' ? '/' : base.replace(/\/$/, '');
})();

function App() {
  const [cartCount, setCartCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check for existing user session
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
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
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Products setCartCount={setCartCount} />} />
            <Route path="/cart" element={<Cart cartCount={cartCount} setCartCount={setCartCount} />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/login" element={<Login setUser={setUser} />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/admin" element={<Admin user={user} />} />
            <Route path="/admin/users/:userId/credit" element={<CreditHistory user={user} />} />
            <Route path="/order-history" element={<OrderHistory />} />
            <Route path="/my-orders" element={<MyOrders />} />
            <Route path="/orders/:id" element={<OrderDetails />} />
            <Route path="/order-tracking" element={<OrderTracking />} />
            <Route path="/order-tracking/:orderId" element={<OrderTracking />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/billing/:billNumber" element={<Billing />} />
          </Routes>
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
