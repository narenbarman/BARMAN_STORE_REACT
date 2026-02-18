import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Filter, Package, Tag, Calendar, Search, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { productsApi, categoriesApi } from '../services/api';
import { getProductImageSrc, getProductFallbackImage } from '../utils/productImage';
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

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const getInitialVisibleCount = () => (window.innerWidth <= 768 ? 10 : 16);

function Products({ setCartCount }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'all');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get('q') || '');
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'relevance');
  const [inStockOnly, setInStockOnly] = useState(searchParams.get('stock') === '1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cart, setCart] = useState([]);
  const [visibleCount, setVisibleCount] = useState(getInitialVisibleCount());
  const [expandedDetails, setExpandedDetails] = useState({});
  const [buttonStatus, setButtonStatus] = useState({});
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    loadCart();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (debouncedQuery) params.set('q', debouncedQuery);
    if (sortBy !== 'relevance') params.set('sort', sortBy);
    if (inStockOnly) params.set('stock', '1');
    setSearchParams(params, { replace: true });
  }, [selectedCategory, debouncedQuery, sortBy, inStockOnly, setSearchParams]);

  useEffect(() => {
    setVisibleCount(getInitialVisibleCount());
  }, [selectedCategory, debouncedQuery, sortBy, inStockOnly]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(timer);
  }, [notice]);

  const fetchProducts = async () => {
    try {
      const data = await productsApi.getAll();
      setProducts(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching products:', error);
      setError('Failed to load products. Please refresh and try again.');
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await categoriesApi.getAll();
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const loadCart = () => {
    try {
      const savedCart = localStorage.getItem('barman_cart');
      if (!savedCart) return;
      const parsed = JSON.parse(savedCart);
      const cartData = Array.isArray(parsed) ? parsed : [];
      setCart(cartData);
      setCartCount(cartData.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
    } catch (err) {
      console.error('Invalid cart data in localStorage, resetting cart', err);
      localStorage.removeItem('barman_cart');
      setCart([]);
      setCartCount(0);
    }
  };

  const cartQtyById = useMemo(() => {
    return cart.reduce((acc, item) => {
      acc[item.id] = Number(item.quantity || 0);
      return acc;
    }, {});
  }, [cart]);

  const effectiveCategories = useMemo(() => {
    if (categories.length > 0) {
      return categories.map((category) => ({
        id: category.id || category.name,
        name: String(category.name || '').trim()
      })).filter((c) => c.name);
    }

    const unique = Array.from(new Set(products.map((p) => String(p.category || '').trim()).filter(Boolean)));
    return unique.map((name) => ({ id: name, name }));
  }, [categories, products]);

  const filteredProducts = useMemo(() => {
    const query = normalizeText(debouncedQuery);
    const selected = normalizeText(selectedCategory);

    let list = products.filter((product) => {
      const category = normalizeText(product.category);
      const name = normalizeText(product.name);
      const description = normalizeText(product.description);
      const brand = normalizeText(product.brand);
      const sku = normalizeText(product.sku);
      const content = normalizeText(product.content);
      const inStock = Number(product.stock || 0) > 0;

      if (selected !== 'all' && category !== selected) return false;
      if (inStockOnly && !inStock) return false;

      if (!query) return true;
      return [name, description, brand, sku, category, content].some((part) => part.includes(query));
    });

    const sorters = {
      'price-asc': (a, b) => Number(a.price || 0) - Number(b.price || 0),
      'price-desc': (a, b) => Number(b.price || 0) - Number(a.price || 0),
      'stock-desc': (a, b) => Number(b.stock || 0) - Number(a.stock || 0),
      newest: (a, b) => Number(b.id || 0) - Number(a.id || 0),
      relevance: (a, b) => {
        if (!query) return String(a.name || '').localeCompare(String(b.name || ''));
        const aName = normalizeText(a.name);
        const bName = normalizeText(b.name);
        const aStarts = aName.startsWith(query) ? 1 : 0;
        const bStarts = bName.startsWith(query) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;
        return aName.localeCompare(bName);
      }
    };

    const sortFn = sorters[sortBy] || sorters.relevance;
    list = [...list].sort(sortFn);
    return list;
  }, [products, debouncedQuery, selectedCategory, sortBy, inStockOnly]);

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );

  const hasMoreProducts = visibleCount < filteredProducts.length;

  const addToCart = (product) => {
    const productStock = Number(product.stock || 0);
    if (productStock <= 0) {
      setNotice({ type: 'error', message: 'This product is out of stock.' });
      return;
    }

    const existingItem = cart.find(item => item.id === product.id);
    let newCart;
    const currentQuantity = Number(existingItem?.quantity || 0);

    if (currentQuantity >= productStock) {
      setNotice({ type: 'error', message: 'Reached max quantity available in stock.' });
      return;
    }

    if (existingItem) {
      newCart = cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: Math.min(Number(item.quantity || 0) + 1, productStock) }
          : item
      );
    } else {
      newCart = [
        ...cart,
        {
          id: product.id,
          name: String(product.name || '').trim(),
          category: String(product.category || '').trim(),
          image: getProductImageSrc(product),
          price: Number(product.price || 0),
          stock: productStock,
          uom: String(product.uom || 'pcs').trim(),
          quantity: 1
        }
      ];
    }

    setCart(newCart);
    localStorage.setItem('barman_cart', JSON.stringify(newCart));
    setCartCount(newCart.reduce((sum, item) => sum + item.quantity, 0));
    setButtonStatus((prev) => ({ ...prev, [product.id]: 'added' }));
    setTimeout(() => {
      setButtonStatus((prev) => ({ ...prev, [product.id]: '' }));
    }, 900);
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

  const toggleDetails = (id) => {
    setExpandedDetails((prev) => ({ ...prev, [id]: !prev[id] }));
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
      {notice && (
        <div className={`products-notice ${notice.type === 'error' ? 'error' : 'info'}`}>
          {notice.message}
        </div>
      )}

      <div className="products-header fade-in-up">
        <h1>Our Collection</h1>
        <p>Discover premium products for your needs</p>
      </div>

      {error && (
        <div className="products-error">{error}</div>
      )}

      <div className="products-controls sticky-controls slide-in-left">
        <div className="search-row">
          <div className="search-input-wrap">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search by name, SKU, brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search products"
            />
          </div>
        </div>

        <div className="filter-row">
          <div className="filter-header">
            <Filter size={18} />
            <span>Category</span>
          </div>
          <div className="category-buttons">
            <button
              className={`category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All
            </button>
            {effectiveCategories.map((category) => (
              <button
                key={category.id}
                className={`category-btn ${normalizeText(selectedCategory) === normalizeText(category.name) ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category.name)}
              >
                {getCategoryIcon(category.name)} {category.name}
              </button>
            ))}
          </div>
        </div>

        <div className="sort-row">
          <div className="sort-group">
            <SlidersHorizontal size={16} />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort products">
              <option value="relevance">Relevance</option>
              <option value="newest">Newest</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="stock-desc">Stock: High to Low</option>
            </select>
          </div>
          <label className="stock-only-toggle">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
            />
            In-stock only
          </label>
        </div>
      </div>

      <div className="result-summary">
        <span>
          Showing {visibleProducts.length} of {filteredProducts.length} products
        </span>
      </div>

      <div className="products-grid">
        {visibleProducts.map((product, index) => {
          const safeName = String(product.name || 'Product').trim();
          const safeDescription = String(product.description || '').trim();
          const safeCategory = String(product.category || 'General').trim();
          const safeBrand = String(product.brand || '').trim();
          const safeContent = String(product.content || '').trim();
          const productStock = Number(product.stock || 0);
          const currentQty = Number(cartQtyById[product.id] || 0);
          const isMaxed = currentQty >= productStock && productStock > 0;
          const expanded = !!expandedDetails[product.id];
          const added = buttonStatus[product.id] === 'added';
          return (
            <div
              key={product.id}
              className="product-card fade-in-up compact-mobile-card"
              style={{ animationDelay: `${index * 0.04}s` }}
            >
              <div className="product-image">
                <img
                  src={getProductImageSrc(product)}
                  alt={safeName}
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = getProductFallbackImage(product);
                  }}
                />
                <div className="product-overlay">
                  <span className="product-category">{safeCategory}</span>
                </div>
                {isNearExpiry(product.expiry_date) && (
                  <div className="expiry-badge">
                    <Calendar size={12} /> Near Expiry
                  </div>
                )}
              </div>

              <div className="product-info">
                <div className="product-header-row">
                  <h3 className="product-name">{safeName}</h3>
                  {product.sku && (
                    <span className="product-sku" title="SKU">
                      <Tag size={12} /> {product.sku}
                    </span>
                  )}
                </div>

                <div className="product-pricing compact">
                  <div className="price-main">
                    {formatCurrencyColored(Number(product.price || 0))}
                    {product.mrp && Number(product.mrp) > Number(product.price) && (
                      <span className="mrp-price">
                        MRP: {formatCurrency(product.mrp)}
                      </span>
                    )}
                  </div>
                  <span className="product-uom">/ {product.uom || 'pcs'}</span>
                </div>

                <div className="product-footer compact">
                  <div className="product-stock">
                    <span className={productStock > 0 ? 'in-stock' : 'out-of-stock'}>
                      {productStock > 0 ? `${productStock} ${product.uom || 'pcs'} in stock` : 'Out of stock'}
                    </span>
                    {currentQty > 0 && (
                      <small className="cart-qty-indicator">In cart: {currentQty}</small>
                    )}
                  </div>
                  <button
                    className="add-to-cart-btn"
                    onClick={() => addToCart(product)}
                    disabled={productStock === 0 || isMaxed}
                  >
                    <Plus size={16} />
                    {productStock === 0 ? 'Out of stock' : isMaxed ? 'Max in cart' : added ? 'Added!' : 'Add'}
                  </button>
                </div>

                <div className={`product-extra ${expanded ? 'open' : ''}`}>
                  {safeDescription && <p className="product-description">{safeDescription}</p>}
                  <div className="product-details-row">
                    {safeBrand && (
                      <span className="product-brand">{safeBrand}</span>
                    )}
                    {safeContent && (
                      <span className="product-content">
                        <Package size={12} /> {safeContent}
                      </span>
                    )}
                  </div>
                </div>

                <button className="more-toggle-btn" onClick={() => toggleDetails(product.id)}>
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {expanded ? 'Less details' : 'More details'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {hasMoreProducts && (
        <div className="load-more-wrap">
          <button
            className="load-more-btn"
            onClick={() => setVisibleCount((prev) => prev + getInitialVisibleCount())}
          >
            Load More
          </button>
        </div>
      )}

      {filteredProducts.length === 0 && (
        <div className="no-products">
          <p>No products matched your filters.</p>
          <button
            className="reset-filters-btn"
            onClick={() => {
              setSelectedCategory('all');
              setSearchQuery('');
              setSortBy('relevance');
              setInStockOnly(false);
            }}
          >
            Reset Filters
          </button>
        </div>
      )}

    </div>
  );
}

export default Products;
