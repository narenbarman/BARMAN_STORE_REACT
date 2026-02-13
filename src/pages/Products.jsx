import { useState, useEffect } from 'react';
import { Plus, Filter, Package, Tag, Calendar, Hash } from 'lucide-react';
import { productsApi, categoriesApi } from '../services/api';
import './Products.css';

// Currency formatter with Indian Rupee symbol
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

// Currency formatter with conditional color styling
const formatCurrencyColored = (amount) => {
  const formatted = formatCurrency(Math.abs(amount));
  const isPositive = amount >= 0;
  return <span className={isPositive ? 'amount-positive' : 'amount-negative'}>{formatted}</span>;
};

function Products({ setCartCount }) {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    loadCart();
  }, []);

  useEffect(() => {
    if (selectedCategory === 'all') {
      setFilteredProducts(products);
    } else {
      setFilteredProducts(products.filter(p => p.category === selectedCategory));
    }
  }, [selectedCategory, products]);

  const fetchProducts = async () => {
    try {
      const data = await productsApi.getAll();
      setProducts(data);
      setFilteredProducts(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching products:', error);
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await categoriesApi.getAll();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const loadCart = () => {
    const savedCart = localStorage.getItem('barman_cart');
    if (savedCart) {
      const cartData = JSON.parse(savedCart);
      setCart(cartData);
      setCartCount(cartData.reduce((sum, item) => sum + item.quantity, 0));
    }
  };

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.id === product.id);
    let newCart;

    if (existingItem) {
      newCart = cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
    } else {
      newCart = [...cart, { ...product, quantity: 1 }];
    }

    setCart(newCart);
    localStorage.setItem('barman_cart', JSON.stringify(newCart));
    setCartCount(newCart.reduce((sum, item) => sum + item.quantity, 0));

    // Visual feedback
    const btn = document.getElementById(`add-btn-${product.id}`);
    if (btn) {
      btn.textContent = 'Added!';
      setTimeout(() => {
        btn.textContent = 'Add to Cart';
      }, 1000);
    }
  };

  // Check if product is near expiry (within 30 days)
  const isNearExpiry = (expiryDate) => {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    return diffDays <= 30 && diffDays > 0;
  };

  // Get category icon
  const getCategoryIcon = (category) => {
    switch (category?.toLowerCase()) {
      case 'groceries':
      case 'cereals':
        return 'GR';
      case 'stationery':
        return 'ST';
      case 'biscuits':
        return 'BI';
      case 'coffee':
        return 'CF';
      case 'tea':
        return 'TE';
      case 'equipment':
        return 'EQ';
      case 'apparel':
        return 'AP';
      default:
        return 'PR';
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading products...</p>
      </div>
    );
  }

  return (
    <div className="products-page">
      <div className="products-header fade-in-up">
        <h1>Our Collection</h1>
        <p>Discover premium products for your needs</p>
      </div>

      {/* Category Filter */}
      <div className="filter-section slide-in-left">
        <div className="filter-header">
          <Filter size={20} />
          <span>Filter by Category</span>
        </div>
        <div className="category-buttons">
          <button
            className={`category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            All Products
          </button>
          {categories.map((category, index) => (
            <button
              key={category.id || index}
              className={`category-btn ${selectedCategory === category.name ? 'active' : ''}`}
              onClick={() => setSelectedCategory(category.name)}
            >
              {getCategoryIcon(category.name)} {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      <div className="products-grid">
        {filteredProducts.map((product, index) => (
          <div
            key={product.id}
            className="product-card fade-in-up"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="product-image">
              <img src={product.image} alt={product.name} onError={(e) => {
                e.target.src = 'https://via.placeholder.com/300x200?text=No+Image';
              }} />
              <div className="product-overlay">
                <span className="product-category">{product.category}</span>
              </div>
              {isNearExpiry(product.expiry_date) && (
                <div className="expiry-badge">
                  <Calendar size={12} /> Near Expiry
                </div>
              )}
            </div>
            <div className="product-info">
              <div className="product-header-row">
                <h3 className="product-name">{product.name}</h3>
                {product.sku && (
                  <span className="product-sku" title="SKU">
                    <Tag size={12} /> {product.sku}
                  </span>
                )}
              </div>
              
              <p className="product-description">{product.description}</p>
              
              {/* Product Details Row */}
              <div className="product-details-row">
                {product.brand && (
                  <span className="product-brand">{product.brand}</span>
                )}
                {product.content && (
                  <span className="product-content">
                    <Package size={12} /> {product.content}
                  </span>
                )}
              </div>

              {/* Pricing */}
              <div className="product-pricing">
                <div className="price-main">
                  {formatCurrencyColored(product.price)}
                  {product.mrp && product.mrp > product.price && (
                    <span className="mrp-price">
                      MRP: {formatCurrency(product.mrp)}
                    </span>
                  )}
                </div>
                <span className="product-uom">/ {product.uom || 'pcs'}</span>
              </div>

              <div className="product-footer">
                <div className="product-stock">
                  <span className={product.stock > 0 ? 'in-stock' : 'out-of-stock'}>
                    {product.stock > 0 ? `${product.stock} ${product.uom || 'pcs'} in stock` : 'Out of stock'}
                  </span>
                </div>
                <button
                  id={`add-btn-${product.id}`}
                  className="add-to-cart-btn"
                  onClick={() => addToCart(product)}
                  disabled={product.stock === 0}
                >
                  <Plus size={18} />
                  Add to Cart
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="no-products">
          <p>No products found in this category.</p>
        </div>
      )}
    </div>
  );
}

export default Products;
