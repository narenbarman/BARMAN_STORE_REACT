import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Filter, Search, SlidersHorizontal } from 'lucide-react';
import { productsApi, categoriesApi } from '../services/api';
import { getProductImageSrc, getProductFallbackImage } from '../utils/productImage';
import { formatCurrency, getSignedCurrencyClassName } from '../utils/formatters';
import useIsMobile from '../hooks/useIsMobile';
import MobileBottomSheet from '../components/mobile/MobileBottomSheet';
import './Products.css';

const normalizeText = (value) => String(value || '').trim().toLowerCase();
const getInitialVisibleCount = (isMobile) => (isMobile ? 12 : 16);

const formatCurrencyColored = (amount) => {
  const formatted = formatCurrency(Math.abs(amount));
  return <span className={getSignedCurrencyClassName(amount)}>{formatted}</span>;
};

const getFamilyKey = (product) => {
  const name = normalizeText(product?.name);
  const brand = normalizeText(product?.brand);
  return `${name}|${brand}`;
};

const getVariationLabel = (variation, index) => {
  const parts = [String(variation.content || '').trim(), String(variation.color || '').trim()].filter(Boolean);
  if (parts.length > 0) return parts.join(' / ');
  const sku = String(variation.sku || '').trim();
  if (sku) return sku;
  return `Option ${index + 1}`;
};

function ProductDetailView({
  family,
  selectedVariationId,
  onSelectVariation,
  onIncreaseQty,
  onDecreaseQty,
  cartQtyById,
  buttonStatus,
  showImage = false
}) {
  const selectedVariation = family.variations.find((v) => v.id === selectedVariationId) || family.variations[0];
  if (!selectedVariation) return null;
  const hasMultipleVariations = family.variations.length > 1;
  const labelSeen = new Set();
  const variationChoices = family.variations.map((variation, idx) => {
    let label = getVariationLabel(variation, idx);
    const key = normalizeText(label);
    if (labelSeen.has(key)) {
      label = `${label} (${idx + 1})`;
    }
    labelSeen.add(key);
    return { variation, label };
  });

  const selectedQty = Number(cartQtyById[selectedVariation.id] || 0);
  const selectedStock = Number(selectedVariation.stock || 0);
  const isMaxed = selectedStock > 0 && selectedQty >= selectedStock;
  const added = buttonStatus[selectedVariation.id] === 'added';

  return (
    <div className="product-detail-view" onClick={(event) => event.stopPropagation()} role="presentation">
      {showImage && (
        <div className="detail-mobile-image-wrap">
          <img
            src={selectedVariation.image}
            alt={family.name}
            className="detail-mobile-image"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = getProductFallbackImage(selectedVariation.raw);
            }}
          />
        </div>
      )}
      <p className="detail-description">{family.description || 'No additional description available.'}</p>
      {hasMultipleVariations ? (
        <div className="variation-list">
          {variationChoices.map(({ variation, label }) => {
            const isActive = variation.id === selectedVariation.id;
            return (
              <button
                key={variation.id}
                type="button"
                className={`variation-chip ${isActive ? 'active' : ''}`}
                onClick={() => onSelectVariation(family.id, variation.id)}
              >
                <span>{label}</span>
                <strong>{formatCurrency(Number(variation.price || 0))}</strong>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="single-variation-row">
          <span>{variationChoices[0]?.label}</span>
          <strong>{formatCurrency(Number(selectedVariation.price || 0))}</strong>
        </div>
      )}

      <div className="detail-selected-meta">
        <div className="detail-price-line">
          <span>{formatCurrencyColored(Number(selectedVariation.price || 0))}</span>
          <small>/ {selectedVariation.uom || 'pcs'}</small>
        </div>
        {selectedVariation.mrp && Number(selectedVariation.mrp) > Number(selectedVariation.price) && (
          <small className="mrp-price">MRP: {formatCurrency(selectedVariation.mrp)}</small>
        )}
        <div className="detail-stock-line">
          <span className={selectedStock > 0 ? 'in-stock' : 'out-of-stock'}>
            {selectedStock > 0 ? `${selectedStock} ${selectedVariation.uom || 'pcs'} in stock` : 'Out of stock'}
          </span>
          {selectedQty > 0 && <small>In cart: {selectedQty}</small>}
        </div>
      </div>

      <button
        type="button"
        className="add-to-cart-btn detail-add-btn"
        onClick={() => onIncreaseQty(family, selectedVariation)}
        disabled={selectedStock === 0 || isMaxed}
      >
        <Plus size={14} />
        {selectedStock === 0 ? 'Out of stock' : isMaxed ? 'Max in cart' : added ? 'Added!' : 'Add to cart'}
      </button>
      <div className="detail-counter-row">
        <button
          type="button"
          className="qty-step-btn"
          onClick={() => onDecreaseQty(selectedVariation)}
          disabled={selectedQty <= 0}
        >
          -
        </button>
        <span className="qty-step-value">{selectedQty}</span>
        <button
          type="button"
          className="qty-step-btn"
          onClick={() => onIncreaseQty(family, selectedVariation)}
          disabled={selectedStock === 0 || isMaxed}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Products({ setCartCount }) {
  const isMobile = useIsMobile();
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
  const [visibleCount, setVisibleCount] = useState(16);
  const [buttonStatus, setButtonStatus] = useState({});
  const [notice, setNotice] = useState(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [activeDesktopFamilyId, setActiveDesktopFamilyId] = useState(null);
  const [activeMobileFamilyId, setActiveMobileFamilyId] = useState(null);
  const [selectedVariationByFamily, setSelectedVariationByFamily] = useState({});

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
    setVisibleCount(getInitialVisibleCount(isMobile));
  }, [selectedCategory, debouncedQuery, sortBy, inStockOnly, isMobile]);

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
    } catch (fetchError) {
      console.error('Error fetching products:', fetchError);
      setError('Failed to load products. Please refresh and try again.');
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await categoriesApi.getAll();
      setCategories(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      console.error('Error fetching categories:', fetchError);
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
    } catch (cartError) {
      console.error('Invalid cart data in localStorage, resetting cart', cartError);
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

  const productFamilies = useMemo(() => {
    const familyMap = new Map();
    products.forEach((product) => {
      const key = getFamilyKey(product);
      const variationSignature = [
        normalizeText(product?.name),
        normalizeText(product?.brand),
        Number(product?.price || 0).toFixed(2),
        Number(product?.mrp || product?.price || 0).toFixed(2),
        normalizeText(product?.content),
        normalizeText(product?.color)
      ].join('|');

      if (!familyMap.has(key)) {
        familyMap.set(key, {
          id: key,
          key,
          name: String(product.name || 'Product').trim() || 'Product',
          brand: String(product.brand || '').trim(),
          category: String(product.category || '').trim(),
          description: String(product.description || '').trim(),
          variations: []
        });
      }
      const family = familyMap.get(key);
      const existingVariation = family.variations.find((variation) => variation.signature === variationSignature);
      if (existingVariation) {
        existingVariation.stock = Number(existingVariation.stock || 0) + Number(product.stock || 0);
        if (!existingVariation.description && product.description) {
          existingVariation.description = String(product.description || '').trim();
        }
      } else {
        family.variations.push({
          id: product.id,
          signature: variationSignature,
          name: String(product.name || '').trim(),
          brand: String(product.brand || '').trim(),
          category: String(product.category || '').trim(),
          description: String(product.description || '').trim(),
          color: String(product.color || '').trim(),
          content: String(product.content || '').trim(),
          sku: String(product.sku || '').trim(),
          price: Number(product.price || 0),
          mrp: Number(product.mrp || 0),
          stock: Number(product.stock || 0),
          uom: String(product.uom || 'pcs').trim(),
          image: getProductImageSrc(product),
          raw: product
        });
      }
      if (!family.description && product.description) {
        family.description = String(product.description || '').trim();
      }
      if (!family.category && product.category) {
        family.category = String(product.category || '').trim();
      }
    });

    return [...familyMap.values()].map((family) => {
      const sortedVariations = [...family.variations].sort((a, b) => {
        if (a.price !== b.price) return a.price - b.price;
        return String(a.content || '').localeCompare(String(b.content || ''));
      });
      const minPrice = sortedVariations.reduce((min, variation) => Math.min(min, Number(variation.price || 0)), Infinity);
      const totalStock = sortedVariations.reduce((sum, variation) => sum + Number(variation.stock || 0), 0);
      return {
        ...family,
        variations: sortedVariations,
        minPrice: Number.isFinite(minPrice) ? minPrice : 0,
        totalStock
      };
    });
  }, [products]);

  const effectiveCategories = useMemo(() => {
    if (categories.length > 0) {
      return categories
        .map((category) => ({
          id: category.id || category.name,
          name: String(category.name || '').trim()
        }))
        .filter((category) => category.name);
    }

    const unique = Array.from(new Set(productFamilies.map((family) => String(family.category || '').trim()).filter(Boolean)));
    return unique.map((name) => ({ id: name, name }));
  }, [categories, productFamilies]);

  const filteredFamilies = useMemo(() => {
    const query = normalizeText(debouncedQuery);
    const selected = normalizeText(selectedCategory);

    let list = productFamilies.filter((family) => {
      const familyCategory = normalizeText(family.category);
      const inStock = family.variations.some((variation) => Number(variation.stock || 0) > 0);
      if (selected !== 'all' && familyCategory !== selected) return false;
      if (inStockOnly && !inStock) return false;
      if (!query) return true;

      const searchable = [
        family.name,
        family.brand,
        family.category,
        family.description,
        ...family.variations.map((variation) => `${variation.content} ${variation.color} ${variation.sku}`)
      ]
        .map((value) => normalizeText(value))
        .join(' ');

      return searchable.includes(query);
    });

    const sorters = {
      'price-asc': (a, b) => Number(a.minPrice || 0) - Number(b.minPrice || 0),
      'price-desc': (a, b) => Number(b.minPrice || 0) - Number(a.minPrice || 0),
      'stock-desc': (a, b) => Number(b.totalStock || 0) - Number(a.totalStock || 0),
      newest: (a, b) => Number(Math.max(...b.variations.map((variation) => Number(variation.id || 0)))) - Number(Math.max(...a.variations.map((variation) => Number(variation.id || 0)))),
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
  }, [productFamilies, debouncedQuery, selectedCategory, sortBy, inStockOnly]);

  useEffect(() => {
    setSelectedVariationByFamily((prev) => {
      const next = { ...prev };
      let changed = false;
      filteredFamilies.forEach((family) => {
        if (!family.variations.length) return;
        const current = next[family.id];
        const stillExists = family.variations.some((variation) => variation.id === current);
        if (!current || !stillExists) {
          next[family.id] = family.variations[0].id;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [filteredFamilies]);

  const visibleFamilies = useMemo(() => filteredFamilies.slice(0, visibleCount), [filteredFamilies, visibleCount]);
  const hasMoreProducts = visibleCount < filteredFamilies.length;

  const getSelectedVariation = (family) => {
    const selectedId = selectedVariationByFamily[family.id];
    return family.variations.find((variation) => variation.id === selectedId) || family.variations[0];
  };

  const handleSelectVariation = (familyId, variationId) => {
    setSelectedVariationByFamily((prev) => ({ ...prev, [familyId]: variationId }));
  };

  const addToCart = (family, variation) => {
    if (!variation) return;

    const productStock = Number(variation.stock || 0);
    if (productStock <= 0) {
      setNotice({ type: 'error', message: 'This variation is out of stock.' });
      return;
    }

    const existingItem = cart.find((item) => item.id === variation.id);
    const currentQuantity = Number(existingItem?.quantity || 0);
    if (currentQuantity >= productStock) {
      setNotice({ type: 'error', message: 'Reached max quantity available in stock.' });
      return;
    }

    let newCart;
    if (existingItem) {
      newCart = cart.map((item) =>
        item.id === variation.id
          ? { ...item, quantity: Math.min(Number(item.quantity || 0) + 1, productStock) }
          : item
      );
    } else {
      newCart = [
        ...cart,
        {
          id: variation.id,
          name: family.name,
          brand: family.brand,
          category: variation.category,
          content: variation.content,
          color: variation.color,
          image: variation.image,
          price: Number(variation.price || 0),
          stock: productStock,
          uom: variation.uom || 'pcs',
          quantity: 1
        }
      ];
    }

    setCart(newCart);
    localStorage.setItem('barman_cart', JSON.stringify(newCart));
    setCartCount(newCart.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
    setButtonStatus((prev) => ({ ...prev, [variation.id]: 'added' }));
    setTimeout(() => {
      setButtonStatus((prev) => ({ ...prev, [variation.id]: '' }));
    }, 900);
  };

  const decreaseFromCart = (variation) => {
    if (!variation) return;
    const existingItem = cart.find((item) => item.id === variation.id);
    if (!existingItem) return;

    const nextQty = Math.max(0, Number(existingItem.quantity || 0) - 1);
    const newCart = nextQty === 0
      ? cart.filter((item) => item.id !== variation.id)
      : cart.map((item) => (item.id === variation.id ? { ...item, quantity: nextQty } : item));

    setCart(newCart);
    localStorage.setItem('barman_cart', JSON.stringify(newCart));
    setCartCount(newCart.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
  };

  const openFamilyDetails = (familyId) => {
    if (isMobile) {
      setActiveMobileFamilyId(familyId);
      return;
    }
    setActiveDesktopFamilyId((prev) => (prev === familyId ? null : familyId));
  };

  const activeMobileFamily = useMemo(
    () => filteredFamilies.find((family) => family.id === activeMobileFamilyId) || null,
    [filteredFamilies, activeMobileFamilyId]
  );

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

      {error && <div className="products-error">{error}</div>}

      <div className="products-controls sticky-controls slide-in-left">
        <div className="search-row">
          <div className="search-input-wrap">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search by name, content, color..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search products"
            />
          </div>
        </div>

        {isMobile ? (
          <div className="mobile-filter-launch-row">
            <button type="button" className="mobile-filter-btn" onClick={() => setShowMobileFilters(true)}>
              <Filter size={16} /> Filters & Sort
            </button>
            <label className="stock-only-toggle">
              <input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} />
              In-stock only
            </label>
          </div>
        ) : (
          <>
            <div className="filter-row">
              <div className="filter-header">
                <Filter size={18} />
                <span>Category</span>
              </div>
              <div className="category-buttons">
                <button
                  type="button"
                  className={`category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedCategory('all')}
                >
                  All
                </button>
                {effectiveCategories.map((category) => (
                  <button
                    type="button"
                    key={category.id}
                    className={`category-btn ${normalizeText(selectedCategory) === normalizeText(category.name) ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(category.name)}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="sort-row">
              <div className="sort-group">
                <SlidersHorizontal size={16} />
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort products">
                  <option value="relevance">Relevance</option>
                  <option value="newest">Newest</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="stock-desc">Stock: High to Low</option>
                </select>
              </div>
              <label className="stock-only-toggle">
                <input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} />
                In-stock only
              </label>
            </div>
          </>
        )}
      </div>

      <div className="result-summary">
        <span>
          Showing {visibleFamilies.length} of {filteredFamilies.length} products
        </span>
      </div>

      <div className="products-grid">
        {visibleFamilies.map((family, index) => {
          const selectedVariation = getSelectedVariation(family);
          const familyInStock = family.variations.some((variation) => Number(variation.stock || 0) > 0);
          const familyCartQty = family.variations.reduce((sum, variation) => sum + Number(cartQtyById[variation.id] || 0), 0);
          const isActiveDesktop = !isMobile && activeDesktopFamilyId === family.id;
          const selectedQty = Number(cartQtyById[selectedVariation.id] || 0);
          const selectedStock = Number(selectedVariation.stock || 0);
          const selectedMaxed = selectedStock > 0 && selectedQty >= selectedStock;

          return (
            <div
              key={family.id}
              className="product-card fade-in-up compact-mobile-card family-card"
              style={{ animationDelay: `${index * 0.04}s` }}
              onClick={() => openFamilyDetails(family.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') openFamilyDetails(family.id);
              }}
              role="button"
              tabIndex={0}
            >
              <div className="product-image">
                <img
                  src={selectedVariation.image}
                  alt={family.name}
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = getProductFallbackImage(selectedVariation.raw);
                  }}
                />
                <div className="price-corner-tag">
                  {family.variations.length > 1 ? `From ${formatCurrency(Number(family.minPrice || 0))}` : formatCurrency(Number(selectedVariation.price || 0))}
                </div>
              </div>

              <div className="product-info">
                <h3 className="product-name">{family.name}</h3>
                <div className="product-footer compact">
                  <div className="product-stock">
                    <span className={familyInStock ? 'in-stock' : 'out-of-stock'}>
                      {familyInStock ? `${family.variations.length} options` : 'Out of stock'}
                    </span>
                    {familyCartQty > 0 && <small className="cart-qty-indicator">In cart: {familyCartQty}</small>}
                  </div>
                  {selectedQty > 0 ? (
                    <div className="card-qty-counter" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className="qty-step-btn"
                        onClick={() => decreaseFromCart(selectedVariation)}
                      >
                        -
                      </button>
                      <span className="qty-step-value">{selectedQty}</span>
                      <button
                        type="button"
                        className="qty-step-btn"
                        onClick={() => addToCart(family, selectedVariation)}
                        disabled={selectedStock === 0 || selectedMaxed}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="add-to-cart-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        addToCart(family, selectedVariation);
                      }}
                      disabled={selectedStock === 0}
                    >
                      <Plus size={14} /> Add
                    </button>
                  )}
                </div>

                {isActiveDesktop && (
                  <ProductDetailView
                    family={family}
                    selectedVariationId={selectedVariation.id}
                    onSelectVariation={handleSelectVariation}
                    onIncreaseQty={addToCart}
                    onDecreaseQty={decreaseFromCart}
                    cartQtyById={cartQtyById}
                    buttonStatus={buttonStatus}
                    showImage={false}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasMoreProducts && (
        <div className="load-more-wrap">
          <button type="button" className="load-more-btn" onClick={() => setVisibleCount((prev) => prev + getInitialVisibleCount(isMobile))}>
            Load More
          </button>
        </div>
      )}

      {filteredFamilies.length === 0 && (
        <div className="no-products">
          <p>No products matched your filters.</p>
          <button
            type="button"
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

      {isMobile && (
        <MobileBottomSheet
          open={showMobileFilters}
          onClose={() => setShowMobileFilters(false)}
          title="Filter Products"
          className="products-filter-sheet"
        >
          <div className="filter-row">
            <div className="filter-header">
              <Filter size={18} />
              <span>Category</span>
            </div>
            <div className="category-buttons">
              <button
                type="button"
                className={`category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                All
              </button>
              {effectiveCategories.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  className={`category-btn ${normalizeText(selectedCategory) === normalizeText(category.name) ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(category.name)}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          <div className="sort-row">
            <div className="sort-group">
              <SlidersHorizontal size={16} />
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort products">
                <option value="relevance">Relevance</option>
                <option value="newest">Newest</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="stock-desc">Stock: High to Low</option>
              </select>
            </div>
          </div>
        </MobileBottomSheet>
      )}

      {isMobile && activeMobileFamily && (
        <MobileBottomSheet
          open={!!activeMobileFamily}
          onClose={() => setActiveMobileFamilyId(null)}
          title={activeMobileFamily.name}
          className="products-detail-sheet"
        >
          <ProductDetailView
            family={activeMobileFamily}
            selectedVariationId={getSelectedVariation(activeMobileFamily)?.id}
            onSelectVariation={handleSelectVariation}
            onIncreaseQty={addToCart}
            onDecreaseQty={decreaseFromCart}
            cartQtyById={cartQtyById}
            buttonStatus={buttonStatus}
            showImage
          />
        </MobileBottomSheet>
      )}
    </div>
  );
}

export default Products;
