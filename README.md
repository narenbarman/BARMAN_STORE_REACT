# BARMAN STORE - E-commerce Application

A full-stack e-commerce application built with React and SQLite database, featuring a distinctive brutalist-refined design aesthetic.

## Features

- 🛍️ **Product Catalog** - Browse premium coffee products and barista equipment
- 🛒 **Shopping Cart** - Add, remove, and manage cart items
- 💳 **Checkout Process** - Complete order placement with customer information
- 📦 **Order Management** - SQLite database for storing products and orders
- 🎨 **Distinctive Design** - Brutalist-refined aesthetic with custom typography and animations
- 📱 **Responsive** - Mobile-friendly design

## Tech Stack

### Frontend
- **React 18** - UI framework
- **React Router** - Client-side routing
- **Lucide React** - Icon library
- **Vite** - Build tool and dev server
- **Custom CSS** - Distinctive styling with Google Fonts (Playfair Display, Space Mono)

### Backend
- **Node.js & Express** - API server
- **Better-SQLite3** - Embedded SQLite database
- **CORS** - Cross-origin resource sharing

## Project Structure

```
barman-store/
├── server/
│   ├── index.js              # Express API server
│   └── barman-store.db       # SQLite database (auto-created)
├── src/
│   ├── pages/
│   │   ├── Home.jsx          # Landing page
│   │   ├── Home.css
│   │   ├── Products.jsx      # Product listing
│   │   ├── Products.css
│   │   ├── Cart.jsx          # Shopping cart
│   │   ├── Cart.css
│   │   ├── Checkout.jsx      # Order checkout
│   │   └── Checkout.css
│   ├── App.jsx               # Main app component
│   ├── App.css               # Global styles
│   └── main.jsx              # Entry point
├── public/
├── index.html
├── vite.config.js
└── package.json
```

## Database Schema

### Products Table
- `id` - Auto-incrementing primary key
- `name` - Product name
- `description` - Product description
- `price` - Product price
- `category` - Product category
- `image` - Product image URL
- `stock` - Available quantity
- `created_at` - Timestamp

### Orders Table
- `id` - Auto-incrementing primary key
- `customer_name` - Customer full name
- `customer_email` - Customer email
- `customer_phone` - Customer phone number
- `total_amount` - Order total
- `status` - Order status (default: 'pending')
- `created_at` - Timestamp

### Order Items Table
- `id` - Auto-incrementing primary key
- `order_id` - Foreign key to orders
- `product_id` - Foreign key to products
- `quantity` - Item quantity
- `price` - Item price at time of order

## Installation

1. **Clone or download the project**

2. **Install dependencies**
```bash
cd barman-store
npm install
```

3. **Start the backend server**
```bash
npm run server
```
This will start the Express API on http://localhost:5000 and automatically create and seed the SQLite database.

4. **Start the frontend development server** (in a new terminal)
```bash
npm run dev
```
This will start the Vite dev server on http://localhost:3000

5. **Open your browser**
Navigate to http://localhost:3000

## API Endpoints

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get product by ID
- `GET /api/products/category/:category` - Get products by category
- `POST /api/products` - Create new product

### Orders
- `GET /api/orders` - Get all orders
- `POST /api/orders` - Create new order

### Categories
- `GET /api/categories` - Get all product categories

## Sample Products

The database is automatically seeded with 8 sample products:
- Premium Coffee Beans
- Espresso Machine
- Barista Apron
- Milk Frother
- Coffee Grinder
- Organic Tea Collection
- Latte Art Tools
- Coffee Mug Set

## Design Features

### Typography
- **Display Font**: Playfair Display (elegant serif for headings)
- **Body Font**: Space Mono (distinctive monospace)

### Color Scheme
- Primary: Dark charcoal (#1a1a1a)
- Secondary: Golden (#d4af37)
- Accent: Saddle brown (#8b4513)
- Background: Warm beige (#faf8f5)

### Animations
- Fade-in effects on page load
- Slide-in animations for content
- Hover transitions on cards and buttons
- Smooth gradient effects

## Development

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## Notes

- This is a demo application. The checkout process doesn't integrate with real payment processors.
- Cart data is stored in localStorage for persistence across page refreshes.
- The SQLite database file (`barman-store.db`) is created automatically in the `server/` directory.

## Future Enhancements

- User authentication and profiles
- Product search functionality
- Product reviews and ratings
- Order history for customers
- Admin dashboard for managing products
- Payment gateway integration
- Email notifications
- Inventory management

## License

MIT License - Free to use for learning and personal projects

---

**BARMAN STORE** - Premium Coffee & Barista Equipment
