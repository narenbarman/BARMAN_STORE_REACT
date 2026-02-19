import { useState, useEffect } from 'react';
import { X, Package, QrCode, Plus, Trash2 } from 'lucide-react';
import { productsApi, categoriesApi } from '../services/api';
import { getProductImageSrc } from '../utils/productImage';
import ImageUrlPicker from '../components/ImageUrlPicker';
import './ProductForm.css';

function ProductForm({ product, onClose, onSave }) {
  const createInitialFormData = () => ({
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
  const [formData, setFormData] = useState(createInitialFormData());
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [batchProducts, setBatchProducts] = useState([]);
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
      setFormData(createInitialFormData());
      setBatchProducts([]);
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

  const validateFormData = (data) => {
    const newErrors = {};
    
    if (!data.name.trim()) {
      newErrors.name = 'Product name is required';
    }
    
    if (!data.description.trim()) {
      newErrors.description = 'Description is required';
    }
    
    if (!data.price || parseFloat(data.price) <= 0) {
      newErrors.price = 'Price must be a positive number';
    }
    
    if (!data.category) {
      newErrors.category = 'Category is required';
    }
    
    if (!data.stock || parseInt(data.stock) < 0) {
      newErrors.stock = 'Stock must be a non-negative number';
    }
    return newErrors;
  };

  const validateForm = () => {
    const newErrors = validateFormData(formData);
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildProductData = (data) => ({
    name: data.name.trim(),
    description: data.description.trim(),
    brand: data.brand.trim(),
    content: data.content.trim(),
    color: data.color.trim(),
    price: parseFloat(data.price),
    mrp: parseFloat(data.mrp) || parseFloat(data.price),
    uom: data.uom,
    base_unit: data.base_unit,
    uom_type: data.uom_type,
    barcode: data.barcode.trim(),
    sku: data.sku,
    image: data.image.trim(),
    stock: parseInt(data.stock),
    conversion_factor: parseFloat(data.conversion_factor) || 1,
    expiry_date: data.expiry_date || null,
    category: data.category,
    defaultDiscount: parseFloat(data.defaultDiscount) || 0,
    discountType: data.discountType
  });

  const normalizeKey = (value) => String(value || '').trim().toLowerCase();

  const buildIdentityKey = (item) => {
    const nameKey = normalizeKey(item?.name);
    const brandKey = normalizeKey(item?.brand);
    const contentKey = normalizeKey(item?.content);
    if (!nameKey) return '';
    return `${nameKey}|${brandKey}|${contentKey}`;
  };

  const findDuplicateProduct = ({ existingProducts = [], payload, excludeId = null, queuedPayloads = [] }) => {
    if (!payload) return null;
    const skuKey = normalizeKey(payload.sku);
    const barcodeKey = normalizeKey(payload.barcode);
    const identityKey = buildIdentityKey(payload);

    const hasExistingDuplicate = existingProducts.find((row) => {
      const rowId = Number(row?.id || 0);
      if (excludeId && rowId === Number(excludeId)) return false;
      const rowSku = normalizeKey(row?.sku);
      const rowBarcode = normalizeKey(row?.barcode);
      const rowIdentity = buildIdentityKey(row);
      if (skuKey && rowSku && skuKey === rowSku) return true;
      if (barcodeKey && rowBarcode && barcodeKey === rowBarcode) return true;
      if (identityKey && rowIdentity && identityKey === rowIdentity) return true;
      return false;
    });
    if (hasExistingDuplicate) {
      return `Duplicate with existing product "${hasExistingDuplicate.name}"`;
    }

    const hasQueuedDuplicate = queuedPayloads.find((row) => {
      const rowSku = normalizeKey(row?.sku);
      const rowBarcode = normalizeKey(row?.barcode);
      const rowIdentity = buildIdentityKey(row);
      if (skuKey && rowSku && skuKey === rowSku) return true;
      if (barcodeKey && rowBarcode && barcodeKey === rowBarcode) return true;
      if (identityKey && rowIdentity && identityKey === rowIdentity) return true;
      return false;
    });
    if (hasQueuedDuplicate) {
      return `Duplicate inside this batch for "${hasQueuedDuplicate.name}"`;
    }
    return null;
  };

  const hasFormDraft = (data = formData) => {
    return ['name', 'description', 'brand', 'content', 'color', 'price', 'mrp', 'barcode', 'sku', 'image', 'stock', 'expiry_date', 'category', 'defaultDiscount']
      .some((field) => String(data[field] || '').trim() !== '');
  };

  const handleAddToBatch = () => {
    setError('');
    if (!validateForm()) return;
    const payload = buildProductData(formData);
    setBatchProducts((prev) => [...prev, payload]);
    setFormData((prev) => ({
      ...createInitialFormData(),
      category: prev.category || '',
      uom: prev.uom || 'pcs',
      base_unit: prev.base_unit || 'pcs',
      uom_type: prev.uom_type || 'selling'
    }));
    setErrors({});
    setIsDescriptionAuto(true);
  };

  const handleRemoveBatchItem = (index) => {
    setBatchProducts((prev) => prev.filter((_, idx) => idx !== index));
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

    setLoading(true);

    try {
      const existingProducts = await productsApi.getAll({ include_inactive: true });
      if (product) {
        if (!validateForm()) return;
        const productData = buildProductData(formData);
        const duplicateMessage = findDuplicateProduct({
          existingProducts,
          payload: productData,
          excludeId: product.id
        });
        if (duplicateMessage) {
          setError(duplicateMessage);
          return;
        }
        await productsApi.update(product.id, productData);
        await onSave({ mode: 'edit', createdCount: 0 });
      } else {
        const payloads = [...batchProducts];
        if (hasFormDraft(formData)) {
          if (!validateForm()) return;
          payloads.push(buildProductData(formData));
        }
        if (!payloads.length) {
          setError('Add at least one product to submit');
          return;
        }

        const validatedPayloads = [];
        for (let i = 0; i < payloads.length; i += 1) {
          const duplicateMessage = findDuplicateProduct({
            existingProducts,
            payload: payloads[i],
            queuedPayloads: validatedPayloads
          });
          if (duplicateMessage) {
            setError(`Duplicate at product ${i + 1} (${payloads[i].name}): ${duplicateMessage}`);
            return;
          }
          validatedPayloads.push(payloads[i]);
        }

        let createdCount = 0;
        for (let i = 0; i < payloads.length; i += 1) {
          try {
            await productsApi.create(payloads[i]);
            createdCount += 1;
          } catch (err) {
            if (createdCount > 0) {
              await onSave();
            }
            setError(`Failed at product ${i + 1} (${payloads[i].name}): ${err.message || 'Create failed'}. Created ${createdCount} product(s).`);
            return;
          }
        }
        await onSave({ mode: 'create', createdCount: payloads.length });
      }
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
          {!isEditing && (
            <div className="form-section batch-section">
              <h3 className="section-title">Batch Add Products</h3>
              <p className="batch-help">
                Fill product details and click <strong>Add To Batch</strong>. You can submit all queued products at once.
              </p>
              <div className="batch-actions">
                <button type="button" className="submit-btn batch-add-btn" onClick={handleAddToBatch} disabled={loading}>
                  <Plus size={16} /> Add To Batch
                </button>
              </div>
              {batchProducts.length > 0 && (
                <div className="batch-list">
                  {batchProducts.map((item, index) => (
                    <div key={`${item.name}-${index}`} className="batch-item">
                      <div className="batch-item-info">
                        <strong>{item.name}</strong>
                        <span>{item.category} | Rs {Number(item.price || 0).toFixed(2)} | Stock: {item.stock}</span>
                      </div>
                      <button type="button" className="batch-item-remove" onClick={() => handleRemoveBatchItem(index)} title="Remove">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
              <ImageUrlPicker
                value={formData.image}
                disabled={loading}
                productMeta={{
                  name: formData.name,
                  brand: formData.brand,
                  content: formData.content,
                  category: formData.category,
                }}
                onChange={(nextUrl) => {
                  setFormData((prev) => ({ ...prev, image: nextUrl }));
                }}
              />
            </div>

            {formData.image && (
              <div className="image-preview">
                <img src={getProductImageSrc(formData.image)} alt="Product preview" onError={(e) => e.target.style.display = 'none'} />
              </div>
            )}

          </div>

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Saving...' : (isEditing ? 'Update Product' : `Add Product${batchProducts.length ? ` (${batchProducts.length} queued)` : ''}`)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProductForm;
