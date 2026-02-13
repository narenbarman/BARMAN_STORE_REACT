# BARMAN STORE - Getting Started Guide

## 🎯 Overview

BARMAN STORE is a complete full-stack e-commerce application featuring:
- React frontend with distinctive brutalist-refined design
- Express.js backend API
- SQLite database for data persistence
- Shopping cart functionality
- Order management system

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation Steps

1. **Navigate to the project directory**
   ```bash
   cd barman-store
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the backend server** (Terminal 1)
   ```bash
   npm run server
   ```
   
   Expected output:
   ```
   🚀 BARMAN STORE API running on http://localhost:5000
   📦 Database initialized successfully
   ```

4. **Start the frontend** (Terminal 2)
   ```bash
   npm run dev
   ```
   
   Expected output:
   ```
   VITE v5.x.x  ready in xxx ms
   
   ➜  Local:   http://localhost:3000/
   ```

5. **Open your browser**
   Visit: http://localhost:3000

## 📁 Project Structure

```
barman-store/
│
├── server/                    # Backend API
│   ├── index.js              # Express server + SQLite setup
│   └── barman-store.db       # SQLite database (auto-created)
│
├── src/                      # Frontend React application
│   ├── pages/
│   │   ├── Home.jsx         # Landing page with hero section
│   │   ├── Products.jsx     # Product catalog with filtering
│   │   ├── Cart.jsx         # Shopping cart management
│   │   └── Checkout.jsx     # Order checkout flow
│   │
│   ├── App.jsx              # Main app with routing
│   ├── App.css              # Global styles
│   └── main.jsx             # Entry point
│
├── public/                   # Static assets
├── index.html               # HTML template
├── vite.config.js           # Vite configuration
├── package.json             # Dependencies and scripts
└── README.md                # Documentation
```

## 🎨 Design Philosophy

The application features a **brutalist-refined aesthetic**:

### Typography
- **Playfair Display**: Elegant serif for headings and emphasis
- **Space Mono**: Distinctive monospace for body text and UI elements

### Color Palette
- **Primary Dark**: #1a1a1a (charcoal)
- **Golden Accent**: #d4af37 (gold)
- **Warm Brown**: #8b4513 (saddle brown)
- **Soft Background**: #faf8f5 (warm beige)

### Key Design Elements
- Bold typography with high contrast
- Generous use of borders and structural elements
- Smooth animations and transitions
- Gradient effects and layered shadows
- Asymmetric layouts with intentional whitespace

## 🔌 API Endpoints

### Products
- `GET /api/products` - Retrieve all products
- `GET /api/products/:id` - Get specific product
- `GET /api/products/category/:category` - Filter by category
- `POST /api/products` - Create new product

### Orders
- `GET /api/orders` - List all orders
- `POST /api/orders` - Create new order

### Categories
- `GET /api/categories` - Get all available categories

## 💾 Database Schema

### Products Table
```sql
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  category TEXT NOT NULL,
  image TEXT,
  stock INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Orders Table
```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  total_amount REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Order Items Table
```sql
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
)
```

## 🛠️ Features

### 1. Product Catalog
- Browse all products or filter by category
- Product cards with images, descriptions, and pricing
- Real-time stock availability
- Animated product grid

### 2. Shopping Cart
- Add/remove products
- Adjust quantities
- Persistent cart (localStorage)
- Real-time total calculation
- Tax calculation (10%)

### 3. Checkout Process
- Customer information form
- Order summary
- Order confirmation page
- Email validation
- Database order storage

### 4. Responsive Design
- Mobile-first approach
- Tablet and desktop optimized
- Touch-friendly interactions
- Adaptive navigation

## 🔧 Development Commands

```bash
# Install dependencies
npm install

# Start backend server (port 5000)
npm run server

# Start frontend dev server (port 3000)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📦 Sample Data

The database is auto-seeded with 8 products across 4 categories:

**Coffee**
- Premium Coffee Beans ($24.99)

**Equipment**
- Espresso Machine ($299.99)
- Milk Frother ($49.99)
- Coffee Grinder ($79.99)
- Latte Art Tools ($19.99)

**Apparel**
- Barista Apron ($34.99)

**Tea**
- Organic Tea Collection ($29.99)

**Accessories**
- Coffee Mug Set ($39.99)

## 🎯 User Flow

1. **Browse Products**: User lands on home page, navigates to products
2. **Filter Categories**: User can filter by Coffee, Equipment, Apparel, Tea, or Accessories
3. **Add to Cart**: User clicks "Add to Cart" on desired products
4. **View Cart**: User reviews cart, adjusts quantities
5. **Checkout**: User enters customer information
6. **Order Confirmation**: User receives order number and summary

## 🔐 Cart Persistence

Cart data is stored in browser localStorage:
- Key: `barman_cart`
- Format: JSON array of cart items
- Persists across page refreshes
- Cleared after successful checkout

## 🌐 Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## 🐛 Troubleshooting

### Port already in use
If port 5000 or 3000 is already in use:

**Backend (port 5000):**
Edit `server/index.js`:
```javascript
const PORT = 5001; // Change port number
```

**Frontend (port 3000):**
Edit `vite.config.js`:
```javascript
server: {
  port: 3001, // Change port number
}
```

### Database errors
If you encounter database errors:
1. Stop the server
2. Delete `server/barman-store.db`
3. Restart the server (database will be recreated)

### Dependencies not installing
Try:
```bash
rm -rf node_modules package-lock.json
npm install
```

## 📈 Future Enhancements

Potential features to add:
- User authentication and accounts
- Product search functionality
- Product reviews and ratings
- Wishlist/favorites
- Order history
- Admin dashboard
- Payment gateway integration
- Email notifications
- Inventory management
- Advanced filtering (price range, sorting)
- Product recommendations

## 💡 Customization

### Adding New Products
Use the API or directly insert into SQLite:

```javascript
// API call
fetch('http://localhost:5000/api/products', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'New Product',
    description: 'Product description',
    price: 49.99,
    category: 'Equipment',
    image: 'https://example.com/image.jpg',
    stock: 10
  })
});
```

### Changing Design Colors
Edit `src/App.css` CSS variables:

```css
:root {
  --color-primary: #1a1a1a;
  --color-secondary: #d4af37;
  --color-accent: #8b4513;
  /* ... customize as needed */
}
```

### Adding New Categories
Categories are automatically derived from products. Simply add products with new category names.

## 📞 Support

For issues or questions:
1. Check the README.md
2. Review this getting started guide
3. Check browser console for errors
4. Verify both servers are running

## 🎓 Learning Resources

This project demonstrates:
- React hooks (useState, useEffect)
- React Router for navigation
- RESTful API design
- SQLite database operations
- Responsive CSS design
- Local storage usage
- Form handling and validation

---

**Happy coding with BARMAN STORE! ☕**
