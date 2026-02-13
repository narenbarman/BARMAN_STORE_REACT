# Quick-Start Code Snippets for Modern Mobile UI

## Cart Page Example

```jsx
// src/pages/Cart.jsx - Updated with modern components

import './Cart.css';

export default function Cart() {
  const cartItems = [ /* ... */ ];
  const subtotal = 2000;
  const tax = 200;
  const total = 2200;

  return (
    <div className="cart-page">
      <header className="cart-header">
        <h1>Shopping Cart</h1>
        <span className="badge-modern primary">{cartItems.length} items</span>
      </header>

      <div className="cart-items">
        {cartItems.map(item => (
          <div key={item.id} className="modern-card cart-item">
            <img src={item.image} alt={item.name} className="cart-item-image" />
            <div className="cart-item-info">
              <h3>{item.name}</h3>
              <p className="cart-item-sku">{item.sku}</p>
            </div>
            <div className="cart-item-price">
              <span className="amount-positive">₹{item.price}</span>
            </div>
            <div className="cart-item-quantity">
              <input type="number" value={item.qty} min="1" className="input-modern" />
            </div>
            <button className="btn-modern danger small">✕</button>
          </div>
        ))}
      </div>

      {/* Summary Block */}
      <div className="summary-modern">
        <div className="summary-row">
          <span className="label">Subtotal</span>
          <span className="value">₹{subtotal}</span>
        </div>
        <div className="summary-row">
          <span className="label">Tax (10%)</span>
          <span className="value amount-positive">₹{tax}</span>
        </div>
        <div className="divider-modern"></div>
        <div className="summary-row total">
          <span className="label">Total</span>
          <span className="value amount-positive">₹{total}</span>
        </div>
      </div>

      {/* CTA */}
      <div className="cart-actions">
        <button className="btn-modern secondary full">Continue Shopping</button>
        <button className="btn-modern primary full">Proceed to Checkout</button>
      </div>
    </div>
  );
}
```

```css
/* src/pages/Cart.css */

.cart-page {
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
}

.cart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  gap: 1rem;
}

.cart-header h1 {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 4vw, 2.5rem);
  font-weight: 700;
  color: var(--color-primary);
}

.cart-items {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  margin-bottom: 2rem;
}

.cart-item {
  display: grid;
  grid-template-columns: 60px 1fr 80px 60px 44px;
  gap: 0.875rem;
  align-items: center;
  padding: 1rem;
}

@media (max-width: 640px) {
  .cart-item {
    grid-template-columns: 50px 1fr;
    gap: 0.75rem;
  }
  
  .cart-item-price,
  .cart-item-quantity {
    grid-column: 2;
    font-size: 0.9rem;
  }
}

.cart-item-image {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: var(--mobile-radius);
}

.cart-item-info {
  min-width: 0;
}

.cart-item-info h3 {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cart-item-sku {
  font-size: 0.8rem;
  color: var(--color-text);
  opacity: 0.6;
}

.cart-item-quantity input {
  width: 60px;
  padding: 0.5rem;
}

.cart-actions {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  margin-top: 1.5rem;
}

@media (min-width: 640px) {
  .cart-actions {
    flex-direction: row;
  }
  
  .cart-actions button {
    flex: 1;
  }
}
```

## Checkout Page Example

```jsx
// src/pages/Checkout.jsx - With modern stepper

import { useState } from 'react';
import './Checkout.css';

export default function Checkout() {
  const [step, setStep] = useState(1);

  const handleNext = () => setStep(step + 1);
  const handlePrev = () => setStep(step - 1);

  return (
    <div className="checkout-page">
      {/* Stepper */}
      <div className="stepper-modern">
        <div className={`stepper-step ${step > 1 ? 'completed' : ''} ${step === 1 ? 'active' : ''}`}>
          <div className="stepper-circle">{step > 1 ? '✓' : '1'}</div>
          <span className="stepper-label">Address</span>
        </div>
        <div className="stepper-line"></div>
        
        <div className={`stepper-step ${step > 2 ? 'completed' : ''} ${step === 2 ? 'active' : ''}`}>
          <div className="stepper-circle">{step > 2 ? '✓' : '2'}</div>
          <span className="stepper-label">Payment</span>
        </div>
        <div className="stepper-line"></div>
        
        <div className={`stepper-step ${step === 3 ? 'active' : ''}`}>
          <div className="stepper-circle">3</div>
          <span className="stepper-label">Confirm</span>
        </div>
      </div>

      {/* Step 1: Address */}
      {step === 1 && (
        <div className="checkout-step modern-card">
          <h2>Delivery Address</h2>
          <form>
            <input className="input-modern" type="text" placeholder="Full Name" required />
            <input className="input-modern" type="tel" placeholder="Phone Number" required />
            <input className="input-modern" type="text" placeholder="Street Address" required />
            <div className="input-row">
              <input className="input-modern" type="text" placeholder="City" required />
              <input className="input-modern" type="text" placeholder="State" required />
            </div>
            <input className="input-modern" type="text" placeholder="Postal Code" required />
          </form>
          <div className="checkout-actions">
            <button className="btn-modern secondary">Cancel</button>
            <button className="btn-modern primary" onClick={handleNext}>Continue</button>
          </div>
        </div>
      )}

      {/* Step 2: Payment */}
      {step === 2 && (
        <div className="checkout-step modern-card">
          <h2>Payment Method</h2>
          <div className="payment-options">
            <label className="payment-option">
              <input type="radio" name="payment" value="cash" defaultChecked />
              <span className="payment-label">
                <span className="payment-title">Cash on Delivery</span>
                <span className="payment-desc">Pay when you receive</span>
              </span>
            </label>
            <label className="payment-option">
              <input type="radio" name="payment" value="card" />
              <span className="payment-label">
                <span className="payment-title">Credit/Debit Card</span>
                <span className="payment-desc">Visa, Mastercard, Rupay</span>
              </span>
            </label>
            <label className="payment-option">
              <input type="radio" name="payment" value="upi" />
              <span className="payment-label">
                <span className="payment-title">UPI</span>
                <span className="payment-desc">Google Pay, PhonePe, Paytm</span>
              </span>
            </label>
          </div>
          <div className="checkout-actions">
            <button className="btn-modern secondary" onClick={handlePrev}>Back</button>
            <button className="btn-modern primary" onClick={handleNext}>Continue</button>
          </div>
        </div>
      )}

      {/* Step 3: Confirmation */}
      {step === 3 && (
        <div className="checkout-step modern-card">
          <h2>Order Summary</h2>
          <div className="summary-modern">
            <div className="summary-row">
              <span className="label">3 items</span>
              <span className="value">₹2,000</span>
            </div>
            <div className="summary-row">
              <span className="label">Delivery</span>
              <span className="value">Free</span>
            </div>
            <div className="summary-row">
              <span className="label">Tax (10%)</span>
              <span className="value">₹200</span>
            </div>
            <div className="divider-modern"></div>
            <div className="summary-row total">
              <span className="label">Total</span>
              <span className="value amount-positive">₹2,200</span>
            </div>
          </div>
          <div className="checkout-actions">
            <button className="btn-modern secondary" onClick={handlePrev}>Edit</button>
            <button className="btn-modern primary full">Place Order</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

```css
/* src/pages/Checkout.css */

.checkout-page {
  padding: 1rem;
  max-width: 600px;
  margin: 0 auto;
}

.stepper-modern {
  margin-bottom: 2rem;
}

.stepper-label {
  font-size: 0.8rem;
  font-weight: 600;
  display: block;
  margin-top: 0.5rem;
}

.checkout-step {
  margin-bottom: 1.5rem;
}

.checkout-step h2 {
  font-family: var(--font-display);
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: var(--color-primary);
}

.checkout-step form {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  margin-bottom: 1.5rem;
}

.input-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.875rem;
}

.payment-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.payment-option {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border: 2px solid var(--color-border);
  border-radius: var(--mobile-radius);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.payment-option:active {
  transform: scale(0.98);
}

.payment-option input[type="radio"] {
  width: 24px;
  height: 24px;
  margin-top: 0.25rem;
  cursor: pointer;
  accent-color: var(--color-secondary);
}

.payment-option input[type="radio"]:checked + .payment-label {
  color: var(--color-secondary);
  font-weight: 600;
}

.payment-label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.payment-title {
  font-weight: 600;
  color: var(--color-primary);
}

.payment-desc {
  font-size: 0.85rem;
  opacity: 0.7;
}

.checkout-actions {
  display: flex;
  gap: 0.875rem;
}

.checkout-actions button {
  flex: 1;
}

@media (max-width: 480px) {
  .checkout-actions {
    flex-direction: column;
  }
}
```

## Login Page Example

```jsx
// src/pages/Login.jsx - Simplified with modern components

import { useState } from 'react';
import { Link } from 'react-router-dom';
import './login.css';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="login-container">
      <div className="modern-card login-card">
        <h1 className="login-title">
          {isLogin ? 'Welcome Back' : 'Join Us'}
        </h1>
        <p className="login-subtitle">
          {isLogin 
            ? 'Sign in to your account' 
            : 'Create new account to get started'}
        </p>

        <form className="login-form">
          {!isLogin && (
            <input 
              className="input-modern" 
              type="text" 
              placeholder="Full Name"
              required 
            />
          )}
          
          <input 
            className="input-modern" 
            type="email" 
            placeholder="Email or Phone"
            required 
          />
          
          <input 
            className="input-modern" 
            type="password" 
            placeholder="Password"
            required 
          />

          {!isLogin && (
            <label className="checkbox-label">
              <input type="checkbox" />
              <span>I agree to Terms & Conditions</span>
            </label>
          )}

          <button type="submit" className="btn-modern primary full">
            {isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="divider-modern"></div>

        <p className="login-toggle">
          {isLogin ? "Don't have account? " : 'Already have account? '}
          <button 
            type="button"
            className="link-toggle"
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>

        {isLogin && (
          <Link to="/request-reset" className="forgot-link">
            Forgot password?
          </Link>
        )}
      </div>
    </div>
  );
}
```

```css
/* src/pages/login.css - Updated */

.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: var(--color-bg);
}

.login-card {
  width: 100%;
  max-width: 400px;
  animation: slideUp 350ms ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-title {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 900;
  color: var(--color-primary);
  margin-bottom: 0.5rem;
  text-align: center;
}

.login-subtitle {
  text-align: center;
  color: var(--color-text);
  opacity: 0.7;
  margin-bottom: 1.5rem;
  font-size: 0.95rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  font-size: 0.9rem;
}

.checkbox-label input[type="checkbox"] {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: var(--color-secondary);
}

.login-toggle {
  text-align: center;
  font-size: 0.9rem;
  color: var(--color-text);
}

.link-toggle {
  background: none;
  border: none;
  color: var(--color-secondary);
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  font-size: inherit;
}

.forgot-link {
  text-align: center;
  display: block;
  color: var(--color-secondary);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
  margin-top: 1rem;
}
```

## Using These Components

1. Copy the relevant code to your pages
2. Make sure to import the CSS file (`@import './mobile-design-system.css'`)
3. Use the `.btn-modern`, `.input-modern`, `.modern-card` classes
4. Test on mobile devices for touch responsiveness

All components automatically adapt to different screen sizes!
