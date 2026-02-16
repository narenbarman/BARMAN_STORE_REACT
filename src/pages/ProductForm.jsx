import { useState, useEffect } from 'react';
import { X, Search, Image, Package, QrCode } from 'lucide-react';
import { productsApi, categoriesApi } from '../services/api';
import ImageSearchModal from './ImageSearchModal';
import './ProductForm.css';

function ProductForm({ product, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    brand: '',
    content: '',
    color: '',
    price: '',
    mrp: '',
    uom: 'pcs',
    base_unit: 'pcs',
    uom_type: 'selling',
    conversion_factor: '1',
    barcode: '',
    sku: '',
    image: '',
    stock: '',
    expiry_date: '',
    category: '',
    defaultDiscount: '',
    discountType: 'fixed'
  });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [isDescriptionAuto, setIsDescriptionAuto] = useState(true);

  // UOM options for groceries
  const uomOptions = [
    { value: 'pcs', label: 'Pieces (pcs)' },
    { value: 'kg', label: 'Kilogram (kg)' },
    { value: 'g', label: 'Gram (g)' },
    { value: 'l', label: 'Liter (l)' },
    { value: 'ml', label: 'Milliliter (ml)' },
    { value: 'box', label: 'Box' },
    { value: 'pack', label: 'Pack' },
    { value: 'case', label: 'Case (24 pcs)' },
    { value: 'dozen', label: 'Dozen (12 pcs)' }
  ];

  useEffect(() => {
    fetchCategories();
    if (product) {
      setFormData({
        name: product.name || '',
        description: product.description || '',
        brand: product.brand || '',
        content: product.content || '',
        color: product.color || '',
        price: product.price?.toString() || '',
        mrp: product.mrp?.toString() || '',
        uom: product.uom || 'pcs',
        base_unit: product.base_unit || 'pcs',
        uom_type: product.uom_type || 'selling',
        conversion_factor: product.conversion_factor?.toString() || '1',
        barcode: product.barcode || '',
        sku: product.sku || '',
        image: product.image || '',
        stock: product.stock?.toString() || '',
        expiry_date: product.expiry_date || '',
        category: product.category || '',
        defaultDiscount: product.defaultDiscount?.toString() || '',
        discountType: product.discountType || 'fixed'
      });
      setIsDescriptionAuto(false);
    } else {
      setIsDescriptionAuto(true);
    }
  }, [product]);

  const fetchCategories = async () => {
    try {
      const data = await categoriesApi.getAll();
      setCategories(data);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  // Auto-generate SKU when relevant fields change
  const generateAutoSKU = (data = formData) => {
    const sanitize = (v) => String(v || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const namePart = sanitize(data.name).slice(0, 4).padEnd(4, 'X');
    const brandPart = sanitize(data.brand).slice(0, 4).padEnd(4, 'X');
    const contentPart = sanitize(data.content).slice(0, 2).padEnd(2, 'X');
    const mrpRounded = Math.round(parseFloat(data.mrp) || parseFloat(data.price) || 0);
    const pricePart = String(mrpRounded).replace(/\D/g, '').slice(-4).padStart(4, '0');
    return `${namePart}${brandPart}${contentPart}${pricePart}`;
  };

  const generateDescriptionSuggestion = (data = formData) => {
    const name = (data.name || '').trim();
    if (!name) return '';

    const brand = (data.brand || '').trim();
    const content = (data.content || '').trim();
    const category = (data.category || '').trim();
    const color = (data.color || '').trim();

    const parts = [name];
    if (brand) parts.push(`by ${brand}`);
    if (content) parts.push(`(${content})`);

    let description = parts.join(' ');
    if (category) description += ` in ${category} category`;
    if (color) description += `, ${color} variant`;
    description += '. Quality product for daily use.';

    return description;
  };

  const handleSuggestDescription = () => {
    const suggested = generateDescriptionSuggestion(formData);
    if (!suggested) return;
    setFormData(prev => ({ ...prev, description: suggested }));
    setIsDescriptionAuto(true);
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Product name is required';
    }
    
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }
    
    if (!formData.price || parseFloat(formData.price) <= 0) {
      newErrors.price = 'Price must be a positive number';
    }
    
    if (!formData.category) {
      newErrors.category = 'Category is required';
    }
    
    if (!formData.stock || parseInt(formData.stock) < 0) {
      newErrors.stock = 'Stock must be a non-negative number';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const nextFormData = { ...formData, [name]: value };
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    
    // Auto-generate SKU when relevant fields change
    if (['name', 'brand', 'content', 'price', 'mrp'].includes(name)) {
      nextFormData.sku = generateAutoSKU(nextFormData);
    }

    if (name === 'description') {
      setIsDescriptionAuto(false);
    }

    if (['name', 'brand', 'content', 'category', 'color'].includes(name)) {
      if (!nextFormData.description.trim() || isDescriptionAuto) {
        const suggested = generateDescriptionSuggestion(nextFormData);
        if (suggested) {
          nextFormData.description = suggested;
          setIsDescriptionAuto(true);
        }
      }
    }

    setFormData(nextFormData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const productData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        brand: formData.brand.trim(),
        content: formData.content.trim(),
        color: formData.color.trim(),
        price: parseFloat(formData.price),
        mrp: parseFloat(formData.mrp) || parseFloat(formData.price),
        uom: formData.uom,
        base_unit: formData.base_unit,
        uom_type: formData.uom_type,
        barcode: formData.barcode.trim(),
        sku: formData.sku,
        image: formData.image.trim(),
        stock: parseInt(formData.stock),
        conversion_factor: parseFloat(formData.conversion_factor) || 1,
        expiry_date: formData.expiry_date || null,
        category: formData.category,
        defaultDiscount: parseFloat(formData.defaultDiscount) || 0,
        discountType: formData.discountType
      };

      if (product) {
        await productsApi.update(product.id, productData);
      } else {
        await productsApi.create(productData);
      }

      onSave();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  const isEditing = !!product;

  return (
    <div className="product-form-overlay">
      <div className="product-form-container fade-in-up">
        <div className="product-form-header">
          <h2>{isEditing ? 'Edit Product' : 'Add New Product'}</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="product-form">
          {/* Basic Information Section */}
          <div className="form-section">
            <h3 className="section-title">Basic Information</h3>
            
            <div className="form-group">
              <label htmlFor="name">Product Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter product name"
                className={`input-field ${errors.name ? 'error' : ''}`}
              />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </div>

            <div className="form-group">
              <div className="description-header">
                <label htmlFor="description">Description *</label>
                <button type="button" className="suggest-description-btn" onClick={handleSuggestDescription}>
                  Suggest
                </button>
              </div>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Enter product description"
                rows="3"
                className={`input-field ${errors.description ? 'error' : ''}`}
              />
              <small className="field-help">Description is auto-suggested from product name. You can edit it anytime.</small>
              {errors.description && <span className="field-error">{errors.description}</span>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="brand">Brand</label>
                <input
                  type="text"
                  id="brand"
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  placeholder="e.g., Nescafe, Parle"
                  className="input-field"
                />
              </div>

              <div className="form-group">
                <label htmlFor="content">Content/Size</label>
                <input
                  type="text"
                  id="content"
                  name="content"
                  value={formData.content}
                  onChange={handleChange}
                  placeholder="e.g., 250g, 1L, 500ml"
                  className="input-field"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="color">Color</label>
                <input
                  type="text"
                  id="color"
                  name="color"
                  value={formData.color}
                  onChange={handleChange}
                  placeholder="e.g., Brown, White, Red"
                  className="input-field"
                />
              </div>

              <div className="form-group">
                <label htmlFor="category">Category *</label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className={`input-field ${errors.category ? 'error' : ''}`}
                >
                  <option value="">Select a category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
                {errors.category && <span className="field-error">{errors.category}</span>}
              </div>
            </div>
          </div>

          {/* Pricing Section */}
          <div className="form-section">
            <h3 className="section-title">Pricing</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="price">Selling Price (₹) *</label>
                <input
                  type="number"
                  id="price"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className={`input-field ${errors.price ? 'error' : ''}`}
                />
                {errors.price && <span className="field-error">{errors.price}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="mrp">MRP (₹)</label>
                <input
                  type="number"
                  id="mrp"
                  name="mrp"
                  value={formData.mrp}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="input-field"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="defaultDiscount">Discount</label>
                <input
                  type="number"
                  id="defaultDiscount"
                  name="defaultDiscount"
                  value={formData.defaultDiscount}
                  onChange={handleChange}
                  placeholder="0"
                  step="0.01"
                  min="0"
                  className="input-field"
                />
              </div>

              <div className="form-group">
                <label htmlFor="discountType">Discount Type</label>
                <select
                  id="discountType"
                  name="discountType"
                  value={formData.discountType}
                  onChange={handleChange}
                  className="input-field"
                >
                  <option value="fixed">Fixed (₹)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Inventory Section */}
          <div className="form-section">
            <h3 className="section-title">Inventory</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="stock">Stock Quantity *</label>
                <input
                  type="number"
                  id="stock"
                  name="stock"
                  value={formData.stock}
                  onChange={handleChange}
                  placeholder="0"
                  min="0"
                  className={`input-field ${errors.stock ? 'error' : ''}`}
                />
                {errors.stock && <span className="field-error">{errors.stock}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="base_unit">Base Unit</label>
                <select
                  id="base_unit"
                  name="base_unit"
                  value={formData.base_unit}
                  onChange={handleChange}
                  className="input-field"
                >
                  {uomOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <small className="field-help">Primary unit for inventory</small>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="uom">Selling UOM</label>
                <select
                  id="uom"
                  name="uom"
                  value={formData.uom}
                  onChange={handleChange}
                  className="input-field"
                >
                  {uomOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="uom_type">UOM Type</label>
                <select
                  id="uom_type"
                  name="uom_type"
                  value={formData.uom_type}
                  onChange={handleChange}
                  className="input-field"
                >
                  <option value="selling">Selling Only</option>
                  <option value="purchasing">Purchasing Only</option>
                  <option value="both">Both Selling & Purchasing</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="conversion_factor">Conversion Factor</label>
                <input
                  type="number"
                  id="conversion_factor"
                  name="conversion_factor"
                  value={formData.conversion_factor}
                  onChange={handleChange}
                  placeholder="1"
                  step="0.0001"
                  min="0"
                  className="input-field"
                />
                <small className="field-help">Selling units per base unit (e.g., 12 for Dozen)</small>
              </div>

              <div className="form-group">
                <label htmlFor="expiry_date">Expiry Date</label>
                <input
                  type="date"
                  id="expiry_date"
                  name="expiry_date"
                  value={formData.expiry_date}
                  onChange={handleChange}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* SKU & Barcode Section */}
          <div className="form-section">
            <h3 className="section-title">SKU & Barcode</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="sku">
                  <Package size={16} /> SKU (Auto-generated)
                </label>
                <input
                  type="text"
                  id="sku"
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                  placeholder="Auto-generated SKU"
                  className="input-field"
                  readOnly={!isEditing}
                />
                <small className="field-help">Format: Name[:4] + Brand[:4] + Content[:2] + MRP[:4]</small>
              </div>

              <div className="form-group">
                <label htmlFor="barcode">
                  <QrCode size={16} /> Barcode
                </label>
                <input
                  type="text"
                  id="barcode"
                  name="barcode"
                  value={formData.barcode}
                  onChange={handleChange}
                  placeholder="Enter barcode (numeric)"
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* Image Section */}
          <div className="form-section">
            <h3 className="section-title">Product Image</h3>
            
            <div className="form-group">
              <label htmlFor="image">Image URL</label>
              <div className="image-url-input">
                <input
                  type="url"
                  id="image"
                  name="image"
                  value={formData.image}
                  onChange={handleChange}
                  placeholder="https://example.com/image.jpg"
                  className="input-field"
                />
                <button
                  type="button"
                  className="search-image-btn"
                  onClick={() => setShowImageSearch(true)}
                  title="Search for images"
                >
                  <Search size={18} /> Search
                </button>
              </div>
            </div>

            {formData.image && (
              <div className="image-preview">
                <img src={formData.image} alt="Product preview" onError={(e) => e.target.style.display = 'none'} />
              </div>
            )}

            {/* Image Search Modal */}
            {showImageSearch && (
              <ImageSearchModal
                onClose={() => setShowImageSearch(false)}
                onSelectImage={(url) => {
                  setFormData(prev => ({ ...prev, image: url }));
                }}
              />
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Saving...' : (isEditing ? 'Update Product' : 'Add Product')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProductForm;
