import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Plus, Trash2, Calculator, Save,
  User, Package, DollarSign,
  AlertCircle, CheckCircle, X, FileText, RefreshCw,
  ChevronDown
} from 'lucide-react';
import { billingApi } from '../services/api';
import { buildWhatsAppUrl } from '../utils/whatsapp';
import { formatCurrency } from '../utils/formatters';
import './Billing.css';

function Billing() {
  const navigate = useNavigate();
  const { billNumber: routeBillNumber } = useParams();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [shareText, setShareText] = useState('');
  const [shareBillNumber, setShareBillNumber] = useState('');
  const [sharePhone, setSharePhone] = useState('');
  
  // Stats
  const [stats, setStats] = useState({
    todayBills: 0,
    todayRevenue: 0,
    pendingBalance: 0
  });
  
  // Customer combobox state
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const customerDropdownRef = useRef(null);
  
  // Product combobox state
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [productMode, setProductMode] = useState('selecting'); // 'selecting' | 'new'
  const [newProduct, setNewProduct] = useState({
    name: '',
    mrp: '',
    quantity: 1,
    unit: 'pcs',
    discount_percent: 0,
    category: 'General'
  });
  const productDropdownRef = useRef(null);
  
  // Bill items
  const [billItems, setBillItems] = useState([]);
  
  // Payment
  const [paidAmount, setPaidAmount] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [notes, setNotes] = useState('');
  
  // Current user
  const [currentUser, setCurrentUser] = useState(null);
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target)) {
        setShowCustomerDropdown(false);
      }
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target)) {
        setShowProductDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
    loadStats();
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem('lastBillShare');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const ageMs = Date.now() - Number(data.ts || 0);
      if (ageMs < 10 * 60 * 1000 && data.text) {
        setShareText(data.text);
        setShareBillNumber(data.billNumber || routeBillNumber || '');
        setSharePhone(String(data.phone || ''));
      }
    } catch {
      // ignore malformed storage
    }
  }, [routeBillNumber]);
  
  const loadStats = async () => {
    try {
      const data = await billingApi.getStats();
      setStats({
        todayBills: data.todayBills || 0,
        todayRevenue: data.todayRevenue || 0,
        pendingBalance: data.pendingBalance || 0
      });
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };
  
  // ============ CUSTOMER COMBOBOX ============
  
  useEffect(() => {
    if (customerQuery.length >= 2) {
      searchCustomers();
    } else if (customerQuery.length === 0 && selectedCustomer) {
      // Clear selection if input is cleared
      clearCustomerSelection();
    } else {
      setCustomerResults([]);
      setShowCustomerDropdown(false);
    }
  }, [customerQuery]);
  
  const searchCustomers = async () => {
    try {
      const results = await billingApi.searchCustomers(customerQuery);
      setCustomerResults(results);
      setShowCustomerDropdown(true);
    } catch (err) {
      console.error('Error searching customers:', err);
    }
  };
  
  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setCustomerQuery(customer.name + ' - ' + customer.phone);
    setShowCustomerDropdown(false);
  };
  
  const clearCustomerSelection = () => {
    setSelectedCustomer(null);
    setCustomerQuery('');
  };
  
  const handleCustomerInputChange = (e) => {
    const value = e.target.value;
    setCustomerQuery(value);
    
    // If user edits selected value, clear selection and require selecting again
    if (selectedCustomer && !value.includes(selectedCustomer.phone)) {
      setSelectedCustomer(null);
    }
  };
  
  const handleCustomerInputFocus = () => {
    if (customerQuery.length >= 2) {
      searchCustomers();
    }
  };
  
  // ============ PRODUCT COMBOBOX ============
  
  useEffect(() => {
    if (productQuery.length >= 2 && productMode === 'selecting') {
      searchProducts();
    } else if (productQuery.length === 0) {
      setProductResults([]);
      setShowProductDropdown(false);
    }
  }, [productQuery]);
  
  const searchProducts = async () => {
    try {
      const results = await billingApi.searchProducts(productQuery);
      setProductResults(results);
      setShowProductDropdown(true);
    } catch (err) {
      console.error('Error searching products:', err);
    }
  };
  
  const selectProduct = (product) => {
    const existingIndex = billItems.findIndex(item => item.product_id === product.id);
    
    if (existingIndex >= 0) {
      const updated = [...billItems];
      updated[existingIndex].quantity += 1;
      setBillItems(updated);
    } else {
      setBillItems([...billItems, {
        product_id: product.id,
        name: product.name,
        mrp: product.price,
        quantity: 1,
        unit: 'pcs',
        discount_percent: 0,
        category: product.category || 'General'
      }]);
    }
    
    setProductQuery('');
    setShowProductDropdown(false);
    setProductMode('selecting');
    setNewProduct({
      name: '',
      mrp: '',
      quantity: 1,
      unit: 'pcs',
      discount_percent: 0,
      category: 'General'
    });
  };
  
  const addNewProductToBill = () => {
    if (!newProduct.name || !newProduct.mrp) {
      setError('Please enter item name and MRP');
      return;
    }
    
    setBillItems([...billItems, {
      product_id: null,
      name: newProduct.name,
      mrp: parseFloat(newProduct.mrp),
      quantity: parseFloat(newProduct.quantity) || 1,
      unit: newProduct.unit,
      discount_percent: parseFloat(newProduct.discount_percent) || 0,
      isNewItem: true,
      category: newProduct.category
    }]);
    
    setNewProduct({
      name: '',
      mrp: '',
      quantity: 1,
      unit: 'pcs',
      discount_percent: 0,
      category: 'General'
    });
    setProductQuery('');
  };
  
  const handleProductInputChange = (e) => {
    const value = e.target.value;
    setProductQuery(value);
    
    if (value.length >= 2) {
      const matchingProduct = productResults.find(p => 
        p.name.toLowerCase().includes(value.toLowerCase())
      );
      if (!matchingProduct) {
        setProductMode('new');
      }
    }
  };
  
  const handleProductInputFocus = () => {
    if (productQuery.length >= 2) {
      searchProducts();
    }
  };
  
  // ============ BILL ITEM MANAGEMENT ============
  
  const updateBillItem = (index, field, value) => {
    const updated = [...billItems];
    updated[index][field] = value;
    setBillItems(updated);
  };
  
  const removeBillItem = (index) => {
    setBillItems(billItems.filter((_, i) => i !== index));
  };
  
  // ============ CALCULATIONS ============
  
  const calculateTotals = useCallback(() => {
    let subtotal = 0;
    
    billItems.forEach(item => {
      const mrp = parseFloat(item.mrp) || 0;
      const quantity = parseFloat(item.quantity) || 0;
      const discountPercent = parseFloat(item.discount_percent) || 0;
      const discountAmount = (mrp * quantity * discountPercent) / 100;
      subtotal += (mrp * quantity) - discountAmount;
    });
    
    const discountAmount = (subtotal * discountPercent) / 100;
    const totalAmount = subtotal - discountAmount;
    const balanceAmount = totalAmount - (parseFloat(paidAmount) || 0);
    
    return {
      subtotal,
      discountAmount,
      totalAmount,
      balanceAmount
    };
  }, [billItems, discountPercent, paidAmount]);
  
  const totals = calculateTotals();
  
  // ============ FORM SUBMISSION ============
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    
    try {
      if (!selectedCustomer?.id) {
        throw new Error('Select an existing customer to create bill');
      }
      const customerData = {
        id: selectedCustomer.id,
        name: selectedCustomer.name,
        phone: selectedCustomer.phone || '',
        address: selectedCustomer.address || null
      };
      
      if (billItems.length === 0) {
        throw new Error('Please add at least one item to the bill');
      }
      
      const items = billItems.map(item => {
        const mrp = parseFloat(item.mrp) || 0;
        const quantity = parseFloat(item.quantity) || 0;
        const discountPercent = parseFloat(item.discount_percent) || 0;
        const discountAmount = (mrp * quantity * discountPercent) / 100;
        const amount = (mrp * quantity) - discountAmount;
        return {
          product_id: item.product_id || null,
          product_name: item.name,
          mrp,
          qty: quantity,
          unit: item.unit || 'pcs',
          discount: discountAmount,
          amount
        };
      });

      const result = await billingApi.createBill({
        customer_id: customerData.id,
        subtotal: totals.subtotal,
        discount_amount: totals.discountAmount,
        total_amount: totals.totalAmount,
        paid_amount: parseFloat(paidAmount) || 0,
        credit_amount: Math.max(0, totals.balanceAmount),
        payment_method: 'cash',
        payment_status: totals.balanceAmount > 0 ? 'pending' : 'paid',
        bill_type: 'sales',
        notes: notes || null,
        items
      });
      
      setSuccess(`Bill ${result.bill_number} created successfully!`);
      const share = buildShareText({
        bill_number: result.bill_number,
        created_at: new Date().toISOString(),
        customer_name: customerData.name,
        customer_phone: customerData.phone,
        customer_address: customerData.address,
        items,
        total_amount: totals.totalAmount,
        paid_amount: parseFloat(paidAmount) || 0,
        credit_amount: Math.max(0, totals.balanceAmount),
        payment_status: totals.balanceAmount > 0 ? 'pending' : 'paid'
      });
      setShareText(share);
      setShareBillNumber(result.bill_number);
      localStorage.setItem('lastBillShare', JSON.stringify({
        text: share,
        billNumber: result.bill_number,
        phone: customerData.phone || '',
        ts: Date.now()
      }));
      setSharePhone(customerData.phone || '');
      setTimeout(() => {
        navigate(`/billing/${result.bill_number}`);
      }, 2000);
      
      // Reset form
      setBillItems([]);
      setSelectedCustomer(null);
      setCustomerQuery('');
      setPaidAmount(0);
      setDiscountPercent(0);
      setNotes('');
      loadStats();
      
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const buildShareText = (bill) => {
    const itemsList = Array.isArray(bill.items) ? bill.items : [];
    const lines = [
      `BILL #${bill.bill_number || ''}`,
      `Date: ${new Date(bill.created_at || Date.now()).toLocaleString()}`,
      `Customer: ${bill.customer_name || ''}`,
      bill.customer_phone ? `Phone: ${bill.customer_phone}` : null,
      bill.customer_address ? `Address: ${bill.customer_address}` : null,
      '',
      'Items:'
    ];
    if (itemsList.length === 0) {
      lines.push('- None');
    } else {
      itemsList.forEach((it) => {
        const name = it.product_name || it.name || 'Item';
        const qty = Number(it.qty || it.quantity || 0);
        const unit = it.unit || '';
        const amount = Number(it.amount || 0);
        lines.push(`- ${name} ${qty}${unit ? ' ' + unit : ''} : Rs ${amount}`);
      });
    }
    lines.push('');
    lines.push(`Total: Rs ${Number(bill.total_amount || 0)}`);
    lines.push(`Paid: Rs ${Number(bill.paid_amount || 0)}`);
    lines.push(`Credit: Rs ${Number(bill.credit_amount || 0)}`);
    lines.push(`Status: ${bill.payment_status || ''}`);
    return lines.filter(Boolean).join('\n');
  };

  const handleCopyShare = async () => {
    if (!shareText) return;
    try {
      await navigator.clipboard.writeText(shareText);
      alert('Bill text copied.');
    } catch {
      alert('Failed to copy bill text.');
    }
  };

  const getWhatsAppHref = () => {
    return buildWhatsAppUrl({
      phone: sharePhone,
      text: shareText,
    });
  };
  
  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="billing-page">
        <div className="access-denied">
          <AlertCircle size={48} />
          <h2>Access Denied</h2>
          <p>Only administrators can access billing.</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="billing-page">
      <div className="billing-header fade-in-up">
        <h1>Bill Generation</h1>
        <p>Create bills and manage customer transactions</p>
        
        <div className="stats-row">
          <div className="stat-card">
            <FileText size={24} />
            <div className="stat-info">
              <span className="stat-value">{stats.todayBills}</span>
              <span className="stat-label">Today's Bills</span>
            </div>
          </div>
          <div className="stat-card">
            <DollarSign size={24} />
            <div className="stat-info">
              <span className="stat-value">{formatCurrency(stats.todayRevenue)}</span>
              <span className="stat-label">Today's Revenue</span>
            </div>
          </div>
          <div className="stat-card warning">
            <AlertCircle size={24} />
            <div className="stat-info">
              <span className="stat-value">{formatCurrency(stats.pendingBalance)}</span>
              <span className="stat-label">Pending Balance</span>
            </div>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="alert error fade-in-up">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}
      
      {success && (
        <div className="alert success fade-in-up">
          <CheckCircle size={20} />
          <span>{success}</span>
          <button onClick={() => setSuccess(null)}><X size={16} /></button>
        </div>
      )}

      {shareText && (
        <div className="share-panel fade-in-up">
          <div className="share-header">
            <strong>Share Bill {shareBillNumber ? `#${shareBillNumber}` : ''}</strong>
          </div>
          <textarea className="share-text" readOnly value={shareText} />
          <div className="share-actions">
            <button type="button" className="share-btn" onClick={handleCopyShare}>Copy</button>
              <a
              className="share-btn whatsapp"
              href={getWhatsAppHref()}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          </div>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="billing-form">
        <div className="billing-content">
          {/* Customer Section - Unified Combobox */}
          <div className="form-section fade-in-up">
            <h2><User size={20} /> Customer Information</h2>
            
            <div className="combobox-container" ref={customerDropdownRef}>
              <label className="combobox-label">
                {selectedCustomer ? 'Selected Customer' : 'Customer *'}
              </label>
              
              <div className={`combobox-input-wrapper ${selectedCustomer ? 'has-selection' : ''}`}>
                <input
                  type="text"
                  className="combobox-input"
                  placeholder="Search existing customer by name or phone..."
                  value={customerQuery}
                  onChange={handleCustomerInputChange}
                  onFocus={handleCustomerInputFocus}
                />
                {selectedCustomer && (
                  <button
                    type="button"
                    className="clear-selection-btn"
                    onClick={clearCustomerSelection}
                    title="Clear selection"
                  >
                    <X size={16} />
                  </button>
                )}
                <ChevronDown size={18} className="combobox-arrow" />
              </div>
              
              {showCustomerDropdown && customerResults.length > 0 && (
                <div className="combobox-dropdown">
                  {customerResults.map(customer => (
                    <div
                      key={customer.id}
                      className="combobox-option"
                      onClick={() => selectCustomer(customer)}
                    >
                      <div className="combobox-option-content">
                        <span className="combobox-option-name">{customer.name}</span>
                        <span className="combobox-option-detail">{customer.phone}</span>
                      </div>
                      {customer.pending_balance > 0 && (
                        <span className="pending-badge">
                          Balance: {formatCurrency(customer.pending_balance)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Items Section - Unified Combobox */}
          <div className="form-section fade-in-up">
            <h2><Package size={20} /> Bill Items</h2>
            
            <div className="combobox-container" ref={productDropdownRef}>
              <label className="combobox-label">Add Product</label>
              
              <div className="combobox-input-wrapper">
                <input
                  type="text"
                  className="combobox-input"
                  placeholder="Search or enter product name..."
                  value={productQuery}
                  onChange={handleProductInputChange}
                  onFocus={handleProductInputFocus}
                />
                <ChevronDown size={18} className="combobox-arrow" />
              </div>
              
              {showProductDropdown && productResults.length > 0 && (
                <div className="combobox-dropdown">
                  {productResults.map(product => (
                    <div
                      key={product.id}
                      className="combobox-option"
                      onClick={() => selectProduct(product)}
                    >
                      <div className="combobox-option-content">
                        <span className="combobox-option-name">{product.name}</span>
                        <span className="combobox-option-price">{formatCurrency(product.price)}</span>
                      </div>
                      {product.stock !== undefined && product.stock < 10 && (
                        <span className="stock-warning">Low stock: {product.stock}</span>
                      )}
                    </div>
                  ))}
                  <div 
                    className="combobox-option new-option"
                    onClick={() => {
                      setProductMode('new');
                      setShowProductDropdown(false);
                      setNewProduct({ ...newProduct, name: productQuery });
                    }}
                  >
                    <Plus size={16} />
                    <span>Create new product: <strong>{productQuery}</strong></span>
                  </div>
                </div>
              )}
            </div>
            
            {/* New Product Fields - Show when creating new */}
            <div className="new-entry-fields">
              <div className="form-row">
                <div className="form-group">
                  <label>MRP *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newProduct.mrp}
                    onChange={(e) => setNewProduct({...newProduct, mrp: e.target.value})}
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label>Quantity</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newProduct.quantity}
                    onChange={(e) => setNewProduct({...newProduct, quantity: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>Unit</label>
                  <select
                    value={newProduct.unit}
                    onChange={(e) => setNewProduct({...newProduct, unit: e.target.value})}
                  >
                    <option value="pcs">Pieces</option>
                    <option value="kg">Kilograms</option>
                    <option value="g">Grams</option>
                    <option value="l">Liters</option>
                    <option value="ml">Milliliters</option>
                    <option value="box">Box</option>
                    <option value="dozen">Dozen</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Discount %</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={newProduct.discount_percent}
                    onChange={(e) => setNewProduct({...newProduct, discount_percent: e.target.value})}
                  />
                </div>
              </div>
              <button
                type="button"
                className="add-btn"
                onClick={addNewProductToBill}
                disabled={!newProduct.name || !newProduct.mrp}
              >
                <Plus size={16} /> Add Product
              </button>
            </div>
          </div>
          
          {/* Bill Items Table */}
          {billItems.length > 0 && (
            <div className="form-section fade-in-up">
              <h2><FileText size={20} /> Items in Bill ({billItems.length})</h2>
              
              <div className="bill-items-table">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>MRP</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Discount %</th>
                      <th>Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {billItems.map((item, index) => (
                      <tr key={index}>
                        <td data-label="Item">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateBillItem(index, 'name', e.target.value)}
                            className="item-name-input"
                          />
                        </td>
                        <td data-label="MRP">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.mrp}
                            onChange={(e) => updateBillItem(index, 'mrp', e.target.value)}
                            className="amount-input"
                          />
                        </td>
                        <td data-label="Qty">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => updateBillItem(index, 'quantity', e.target.value)}
                            className="qty-input"
                          />
                        </td>
                        <td data-label="Unit">
                          <select
                            value={item.unit}
                            onChange={(e) => updateBillItem(index, 'unit', e.target.value)}
                          >
                            <option value="pcs">Pcs</option>
                            <option value="kg">Kg</option>
                            <option value="g">G</option>
                            <option value="l">L</option>
                            <option value="ml">Ml</option>
                            <option value="box">Box</option>
                            <option value="dozen">Doz</option>
                          </select>
                        </td>
                        <td data-label="Discount %">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={item.discount_percent}
                            onChange={(e) => updateBillItem(index, 'discount_percent', e.target.value)}
                            className="discount-input"
                          />
                        </td>
                        <td className="amount-cell" data-label="Amount">
                          {formatCurrency(
                            (parseFloat(item.mrp) || 0) * 
                            (parseFloat(item.quantity) || 0) * 
                            (1 - (parseFloat(item.discount_percent) || 0) / 100)
                          )}
                        </td>
                        <td data-label="Action">
                          <button
                            type="button"
                            className="remove-btn"
                            onClick={() => removeBillItem(index)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* Payment Section */}
          <div className="form-section fade-in-up">
            <h2><Calculator size={20} /> Payment Details</h2>
            
            <div className="form-row">
              <div className="form-group">
                <label>Paid Amount</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label>Bill Discount %</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                />
              </div>
            </div>
            
            <div className="form-group">
              <label>Notes (Optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes..."
                rows={3}
              />
            </div>
          </div>
        </div>
        
        {/* Summary Sidebar */}
        <div className="billing-summary slide-in-left">
          <h3>Bill Summary</h3>
          
          <div className="summary-row">
            <span>Subtotal</span>
            <span>{formatCurrency(totals.subtotal)}</span>
          </div>
          
          <div className="summary-row discount">
            <span>Item Discounts</span>
            <span>- {formatCurrency(totals.discountAmount)}</span>
          </div>
          
          <div className="summary-row discount">
            <span>Bill Discount ({discountPercent}%)</span>
            <span>- {formatCurrency(totals.totalAmount < (totals.subtotal - totals.discountAmount) ? (totals.subtotal - totals.discountAmount - totals.totalAmount) : 0)}</span>
          </div>
          
          <div className="summary-row total">
            <span>Total Amount</span>
            <span>{formatCurrency(totals.totalAmount)}</span>
          </div>
          
          <div className="summary-row paid">
            <span>Paid Amount</span>
            <span>{formatCurrency(parseFloat(paidAmount) || 0)}</span>
          </div>
          
          <div className={`summary-row balance ${totals.balanceAmount > 0 ? 'pending' : 'paid'}`}>
            <span>Balance</span>
            <span>{formatCurrency(totals.balanceAmount)}</span>
          </div>
          
          <button
            type="submit"
            className="generate-bill-btn"
            disabled={saving || billItems.length === 0 || !selectedCustomer?.id}
          >
            {saving ? (
              <>
                <RefreshCw size={20} className="spinning" />
                Processing...
              </>
            ) : (
              <>
                <Save size={20} />
                Generate Bill
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default Billing;
