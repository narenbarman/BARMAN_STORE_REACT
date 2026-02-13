# 🎨 Mobile Design System - Quick Reference Card

## Component Quick Copy-Paste

### Buttons
```html
<!-- Primary (Gold) -->
<button class="btn-modern primary">Primary Action</button>
<button class="btn-modern primary full">Full Width</button>
<button class="btn-modern primary small">Small</button>

<!-- Secondary (Dark) -->
<button class="btn-modern secondary">Secondary</button>
<button class="btn-modern secondary full">Full Width</button>

<!-- Outline -->
<button class="btn-modern outline">Outline</button>

<!-- Danger (Red) -->
<button class="btn-modern danger">Delete</button>
```

### Inputs
```html
<!-- Default -->
<input class="input-modern" type="text" placeholder="Name">
<input class="input-modern" type="email" placeholder="Email">

<!-- States -->
<input class="input-modern success" type="text" placeholder="Valid">
<input class="input-modern error" type="text" placeholder="Invalid">
```

### Cards
```html
<!-- Basic -->
<div class="modern-card">Content</div>

<!-- Elevated -->
<div class="modern-card elevated">Important</div>
```

### Badges
```html
<!-- Primary (Gold) -->
<span class="badge-modern primary">Sale</span>

<!-- Success (Green) -->
<span class="badge-modern success">In Stock</span>

<!-- Danger (Red) -->
<span class="badge-modern danger">Out of Stock</span>

<!-- Warning (Orange) -->
<span class="badge-modern warning">Low Stock</span>
```

### Prices
```html
<div class="price-tag">
  <span class="current">₹599</span>
  <span class="original">₹799</span>
  <span class="discount">-25%</span>
</div>
```

### Summary Block
```html
<div class="summary-modern">
  <div class="summary-row">
    <span class="label">Subtotal</span>
    <span class="value">₹2000</span>
  </div>
  <div class="summary-row total">
    <span class="label">Total</span>
    <span class="value">₹2200</span>
  </div>
</div>
```

### Badges/Tags
```html
<span class="badge-modern primary">Premium</span>
<span class="badge-modern success">Active</span>
<span class="badge-modern danger">Urgent</span>
<span class="badge-modern warning">Caution</span>
```

### Chips/Tags (Removable)
```html
<div class="chip-modern">
  Filter Tag
  <button class="close-btn">✕</button>
</div>

<div class="chip-modern active">
  Active Filter
  <button class="close-btn">✕</button>
</div>
```

### Grids
```html
<!-- Single Column (Mobile) -->
<div class="modern-grid">
  <div>Item 1</div>
  <div>Item 2</div>
</div>

<!-- Two Columns -->
<div class="modern-grid cols-2">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
  <div>Item 4</div>
</div>

<!-- Three Columns -->
<div class="modern-grid cols-3">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</div>
```

### Loading Skeletons
```html
<!-- Text Skeleton -->
<div class="skeleton text"></div>
<div class="skeleton text"></div>

<!-- Avatar Skeleton -->
<div class="skeleton avatar"></div>

<!-- Card Skeleton -->
<div class="skeleton card"></div>
```

### Empty State
```html
<div class="empty-state">
  <div class="empty-state-icon">📦</div>
  <h3 class="empty-state-title">No Items</h3>
  <p class="empty-state-text">Your cart is empty</p>
  <button class="btn-modern primary">Start Shopping</button>
</div>
```

### Stepper
```html
<div class="stepper-modern">
  <div class="stepper-step completed">
    <div class="stepper-circle">✓</div>
    <div class="stepper-line"></div>
  </div>
  <div class="stepper-step active">
    <div class="stepper-circle">2</div>
    <div class="stepper-line"></div>
  </div>
  <div class="stepper-step">
    <div class="stepper-circle">3</div>
  </div>
</div>
```

### Bottom Sheet
```html
<div class="bottom-sheet open">
  <h2>Sheet Title</h2>
  <p>Content goes here...</p>
  <button class="btn-modern primary full">Action</button>
</div>
```

### Divider
```html
<div class="divider-modern"></div>
```

### Horizontal Scroll
```html
<div class="scroll-horizontal">
  <div class="chip-modern">Option 1</div>
  <div class="chip-modern">Option 2</div>
  <div class="chip-modern">Option 3</div>
  <div class="chip-modern">Option 4</div>
</div>
```

---

## CSS Variables You Can Use

```css
/* Colors */
--color-primary: #1a1a1a
--color-secondary: #d4af37
--color-accent: #8b4513
--color-bg: #faf8f5
--color-text: #2d2d2d
--color-border: #e0d7c6
--color-card: #ffffff

/* Spacing */
--mobile-gutter: 1rem
--mobile-gap: 0.75rem

/* Radius */
--mobile-radius: 12px
--mobile-radius-lg: 16px

/* Transitions */
--transition-fast: 150ms ease-out
--transition-normal: 250ms ease-out
--transition-slow: 350ms ease-out

/* Touch Targets */
--touch-target: 48px
--touch-target-small: 44px
```

---

## Responsive Helpers

```css
/* Use clamp() for responsive text */
font-size: clamp(0.9rem, 2.2vw, 1.2rem);

/* Grid that adapts */
display: grid;
grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
```

---

## Common Patterns

### Product Card
```html
<div class="modern-card">
  <div class="product-image">
    <img src="product.jpg" alt="Product">
  </div>
  <div style="padding: 1rem;">
    <h3>Product Name</h3>
    <div class="price-tag">
      <span class="current">₹599</span>
      <span class="original">₹799</span>
    </div>
    <button class="btn-modern primary full">Add to Cart</button>
  </div>
</div>
```

### Form
```html
<form>
  <input class="input-modern" type="text" placeholder="Name" required>
  <input class="input-modern" type="email" placeholder="Email" required>
  <textarea class="input-modern" placeholder="Message"></textarea>
  <button type="submit" class="btn-modern primary full">Submit</button>
</form>
```

### List with Badges
```html
<div style="display: flex; flex-direction: column; gap: 0.75rem;">
  <div class="modern-card" style="display: flex; justify-content: space-between; align-items: center;">
    <span>Item 1</span>
    <span class="badge-modern success">Active</span>
  </div>
  <div class="modern-card" style="display: flex; justify-content: space-between; align-items: center;">
    <span>Item 2</span>
    <span class="badge-modern danger">Inactive</span>
  </div>
</div>
```

### Modal with Buttons
```html
<div class="modern-card" style="max-width: 500px; margin: 2rem auto;">
  <h2>Confirm Action</h2>
  <p>Are you sure you want to continue?</p>
  <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
    <button class="btn-modern secondary" style="flex: 1;">Cancel</button>
    <button class="btn-modern primary" style="flex: 1;">Confirm</button>
  </div>
</div>
```

---

## Touch States

```css
/* Active state (on tap) */
.btn-modern:active {
  transform: scale(0.96);
}

/* Focus state (for keyboard) */
.input-modern:focus {
  border-color: var(--color-secondary);
  box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.1);
}

/* Disabled state */
.btn-modern:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

---

## Accessibility Checklist

- ✅ Touch targets 48px minimum
- ✅ Color not only differentiator (also use badges/icons)
- ✅ Sufficient contrast (WCAG AA)
- ✅ Keyboard navigation (Tab, Enter, Escape)
- ✅ Focus visible (blue outline)
- ✅ Semantic HTML (form labels, buttons, etc.)
- ✅ Alt text for images
- ✅ Aria labels where needed

---

## Common Customizations

### Change Primary Color
```css
:root {
  --color-secondary: #your-color;
}
```

### Adjust Spacing
```css
:root {
  --mobile-gutter: 1.5rem; /* was 1rem */
  --mobile-gap: 1rem; /* was 0.75rem */
}
```

### Faster Animations
```css
:root {
  --transition-fast: 100ms ease-out;
  --transition-normal: 200ms ease-out;
}
```

### Larger Touch Targets
```css
:root {
  --touch-target: 52px;
  --touch-target-small: 48px;
}
```

---

## Browser Support

✅ Chrome 90+  
✅ Firefox 88+  
✅ Safari 14+  
✅ Edge 90+  
✅ iOS Safari 14+  
✅ Chrome Mobile  

---

## File Size

- Design System CSS: ~15KB
- Gzipped: ~3KB
- No JavaScript required
- Zero new dependencies

---

## Performance Tips

1. Use `will-change: transform` for frequently animated elements
2. Avoid `box-shadow` on large lists (use borders instead)
3. GPU-accelerate: `transform`, `opacity` only
4. Lazy-load skeleton screens for dynamic content
5. Use `debounce` for scroll/resize events

---

**Last Updated**: 2024  
**Version**: 1.0
