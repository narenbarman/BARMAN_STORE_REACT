import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, Search, Package, Truck, RotateCcw, Eye, Check, Clock, ArrowUpDown } from 'lucide-react';
import { purchaseOrdersApi, distributorsApi, productsApi, purchaseReturnsApi, stockLedgerApi } from '../services/api';
import './PurchaseManagement.css';

function PurchaseManagement({ user }) {
  const [activeSubTab, setActiveSubTab] = useState('orders');
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [filters, setFilters] = useState({
    distributor_id: '',
    status: '',
    start_date: '',
    end_date: ''
  });

  // Form states
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedReturn, setSelectedReturn] = useState(null);

  // Order form data
  const [orderFormData, setOrderFormData] = useState({
    distributor_id: '',
    expected_delivery: '',
    notes: '',
    items: []
  });

  // Receive form data
  const [receiveData, setReceiveData] = useState({
    invoice_number: '',
    items: []
  });

  // Return form data
  const [returnFormData, setReturnFormData] = useState({
    distributor_id: '',
    reference_po: '',
    return_type: 'return',
    reason: '',
    items: []
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [filters]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [distributorsData, productsData] = await Promise.all([
        distributorsApi.getAll(),
        productsApi.getAll()
      ]);
      setDistributors(distributorsData || []);
      setProducts(productsData || []);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const orders = await purchaseOrdersApi.getAll(filters);
      setPurchaseOrders(orders || []);
    } catch (err) {
      setError('Failed to load purchase orders');
    }
  };

  const fetchReturns = async () => {
    try {
      const returns = await purchaseReturnsApi.getAll(filters);
      setPurchaseReturns(returns || []);
    } catch (err) {
      setError('Failed to load purchase returns');
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Order form handlers
  const handleOrderItemAdd = () => {
    setOrderFormData(prev => ({
      ...prev,
      items: [...prev.items, { product_id: '', product_name: '', quantity: 1, uom: 'pcs', unit_price: 0 }]
    }));
  };

  const handleOrderItemChange = (index, field, value) => {
    const items = [...orderFormData.items];
    items[index][field] = value;

    if (field === 'product_id') {
      const product = products.find(p => p.id === parseInt(value));
      if (product) {
        items[index].product_name = product.name;
        items[index].unit_price = product.price;
        items[index].uom = product.uom || 'pcs';
      }
    }

    setOrderFormData(prev => ({ ...prev, items }));
  };

  const handleOrderItemRemove = (index) => {
    setOrderFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const validItems = orderFormData.items.filter(item => item.product_id && item.quantity > 0);
      if (validItems.length === 0) {
        setError('Please add at least one item');
        return;
      }

      await purchaseOrdersApi.create({
        distributor_id: orderFormData.distributor_id,
        expected_delivery: orderFormData.expected_delivery,
        notes: orderFormData.notes,
        items: validItems,
        created_by: user?.id
      });

      setShowOrderForm(false);
      setOrderFormData({ distributor_id: '', expected_delivery: '', notes: '', items: [] });
      fetchOrders();
    } catch (err) {
      setError(err.message || 'Failed to create purchase order');
    }
  };

  // Receive handlers
  const handleReceiveClick = (order) => {
    setSelectedOrder(order);
    setReceiveData({
      invoice_number: '',
      items: order.items?.map(item => ({
        item_id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        ordered_quantity: item.quantity,
        received_quantity: item.quantity - (item.received_quantity || 0),
        unit_price: item.unit_price
      })) || []
    });
    setShowReceiveModal(true);
  };

  const handleReceiveItemChange = (index, field, value) => {
    const items = [...receiveData.items];
    items[index][field] = value;
    setReceiveData(prev => ({ ...prev, items }));
  };

  const handleReceiveSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const validItems = receiveData.items.filter(item => item.received_quantity > 0);
      if (validItems.length === 0) {
        setError('Please receive at least one item');
        return;
      }

      await purchaseOrdersApi.receive(selectedOrder.id, {
        invoice_number: receiveData.invoice_number,
        items: validItems,
        received_by: user?.id
      });

      setShowReceiveModal(false);
      setSelectedOrder(null);
      setReceiveData({ invoice_number: '', items: [] });
      fetchOrders();
    } catch (err) {
      setError(err.message || 'Failed to receive inventory');
    }
  };

  // Status update
  const handleUpdateStatus = async (orderId, status) => {
    try {
      await purchaseOrdersApi.updateStatus(orderId, status);
      fetchOrders();
    } catch (err) {
      setError('Failed to update status');
    }
  };

  // Delete order
  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to delete this purchase order?')) return;

    try {
      await purchaseOrdersApi.delete(orderId);
      fetchOrders();
    } catch (err) {
      setError('Failed to delete order');
    }
  };

  // Return form handlers
  const handleReturnFormOpen = () => {
    setReturnFormData({
      distributor_id: '',
      reference_po: '',
      return_type: 'return',
      reason: '',
      items: []
    });
    setShowReturnForm(true);
  };

  const handleReturnItemAdd = () => {
    setReturnFormData(prev => ({
      ...prev,
      items: [...prev.items, { product_id: '', product_name: '', quantity: 1, uom: 'pcs', unit_price: 0, reason: '' }]
    }));
  };

  const handleReturnItemChange = (index, field, value) => {
    const items = [...returnFormData.items];
    items[index][field] = value;

    if (field === 'product_id') {
      const product = products.find(p => p.id === parseInt(value));
      if (product) {
        items[index].product_name = product.name;
        items[index].unit_price = product.price;
        items[index].uom = product.uom || 'pcs';
      }
    }

    setReturnFormData(prev => ({ ...prev, items }));
  };

  const handleReturnItemRemove = (index) => {
    setReturnFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const validItems = returnFormData.items.filter(item => item.product_id && item.quantity > 0);
      if (validItems.length === 0) {
        setError('Please add at least one item');
        return;
      }

      await purchaseReturnsApi.create({
        distributor_id: returnFormData.distributor_id,
        reference_po: returnFormData.reference_po,
        return_type: returnFormData.return_type,
        reason: returnFormData.reason,
        items: validItems,
        created_by: user?.id
      });

      setShowReturnForm(false);
      setReturnFormData({ distributor_id: '', reference_po: '', return_type: 'return', reason: '', items: [] });
      fetchReturns();
    } catch (err) {
      setError(err.message || 'Failed to create return');
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { label: 'Pending', class: 'pending' },
      confirmed: { label: 'Confirmed', class: 'confirmed' },
      shipped: { label: 'Shipped', class: 'shipped' },
      received: { label: 'Received', class: 'received' },
      cancelled: { label: 'Cancelled', class: 'cancelled' }
    };
    const config = statusConfig[status] || { label: status, class: '' };
    return <span className={`status-badge ${config.class}`}>{config.label}</span>;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="purchase-management">
        <div className="loading">Loading purchase data...</div>
      </div>
    );
  }

  return (
    <div className="purchase-management">
      {error && <div className="error-message">{error}</div>}

      {/* Sub Navigation */}
      <div className="sub-nav">
        <button
          className={activeSubTab === 'orders' ? 'active' : ''}
          onClick={() => setActiveSubTab('orders')}
        >
          <Package size={18} /> Purchase Orders
        </button>
        <button
          className={activeSubTab === 'returns' ? 'active' : ''}
          onClick={() => { setActiveSubTab('returns'); fetchReturns(); }}
        >
          <RotateCcw size={18} /> Purchase Returns
        </button>
      </div>

      {activeSubTab === 'orders' && (
        <>
          {/* Filters */}
          <div className="filters-bar">
            <div className="filter-group">
              <label>Distributor:</label>
              <select name="distributor_id" value={filters.distributor_id} onChange={handleFilterChange}>
                <option value="">All Distributors</option>
                {distributors.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Status:</label>
              <select name="status" value={filters.status} onChange={handleFilterChange}>
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="shipped">Shipped</option>
                <option value="received">Received</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="filter-group">
              <label>From:</label>
              <input type="date" name="start_date" value={filters.start_date} onChange={handleFilterChange} />
            </div>
            <div className="filter-group">
              <label>To:</label>
              <input type="date" name="end_date" value={filters.end_date} onChange={handleFilterChange} />
            </div>
          </div>

          {/* Actions Bar */}
          <div className="actions-bar">
            <h2>Purchase Orders</h2>
            <div className="action-buttons">
              <button className="admin-btn secondary" onClick={handleReturnFormOpen}>
                <RotateCcw size={18} /> Return / Exchange
              </button>
              <button className="admin-btn primary" onClick={() => setShowOrderForm(true)}>
                <Plus size={18} /> New Order
              </button>
            </div>
          </div>

          {/* Orders Table */}
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Distributor</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Expected</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-state">No purchase orders found</td>
                  </tr>
                ) : (
                  purchaseOrders.map(order => (
                    <tr key={order.id}>
                      <td><strong>{order.po_number}</strong></td>
                      <td>{order.distributor_name}</td>
                      <td>{order.items?.length || 0}</td>
                      <td>{formatCurrency(order.total)}</td>
                      <td>{getStatusBadge(order.status)}</td>
                      <td>{order.expected_delivery ? new Date(order.expected_delivery).toLocaleDateString() : '-'}</td>
                      <td className="actions-cell">
                        {order.status === 'pending' && (
                          <>
                            <button className="action-btn" title="Confirm" onClick={() => handleUpdateStatus(order.id, 'confirmed')}>
                              <Check size={16} />
                            </button>
                            <button className="action-btn" title="Ship" onClick={() => handleUpdateStatus(order.id, 'shipped')}>
                              <Truck size={16} />
                            </button>
                          </>
                        )}
                        {order.status === 'shipped' && (
                          <button className="action-btn receive" title="Receive" onClick={() => handleReceiveClick(order)}>
                            <Package size={16} />
                          </button>
                        )}
                        {order.status === 'pending' && (
                          <button className="action-btn delete" title="Delete" onClick={() => handleDeleteOrder(order.id)}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeSubTab === 'returns' && (
        <>
          {/* Filters for Returns */}
          <div className="filters-bar">
            <div className="filter-group">
              <label>Distributor:</label>
              <select name="distributor_id" value={filters.distributor_id} onChange={handleFilterChange}>
                <option value="">All Distributors</option>
                {distributors.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Returns Table */}
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Return Number</th>
                  <th>Distributor</th>
                  <th>Type</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Reason</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {purchaseReturns.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-state">No purchase returns found</td>
                  </tr>
                ) : (
                  purchaseReturns.map(ret => (
                    <tr key={ret.id}>
                      <td><strong>{ret.return_number}</strong></td>
                      <td>{ret.distributor_name}</td>
                      <td>
                        <span className={`type-badge ${ret.return_type}`}>
                          {ret.return_type === 'exchange' ? 'Exchange' : 'Return'}
                        </span>
                      </td>
                      <td>{ret.items?.length || 0}</td>
                      <td>{formatCurrency(ret.total)}</td>
                      <td>{ret.reason || '-'}</td>
                      <td>{new Date(ret.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* New Order Modal */}
      {showOrderForm && (
        <div className="modal-overlay" onClick={() => setShowOrderForm(false)}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Purchase Order</h2>
              <button className="close-btn" onClick={() => setShowOrderForm(false)}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleOrderSubmit}>
              <div className="form-section">
                <div className="form-row">
                  <div className="form-group">
                    <label>Distributor *</label>
                    <select
                      value={orderFormData.distributor_id}
                      onChange={e => setOrderFormData(prev => ({ ...prev, distributor_id: e.target.value }))}
                      required
                    >
                      <option value="">Select distributor</option>
                      {distributors.filter(d => d.status === 'active').map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Expected Delivery</label>
                    <input
                      type="date"
                      value={orderFormData.expected_delivery}
                      onChange={e => setOrderFormData(prev => ({ ...prev, expected_delivery: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={orderFormData.notes}
                    onChange={e => setOrderFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows="2"
                  />
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Order Items</h3>
                  <button type="button" className="add-item-btn" onClick={handleOrderItemAdd}>
                    <Plus size={16} /> Add Item
                  </button>
                </div>
                <div className="items-list">
                  {orderFormData.items.map((item, index) => (
                    <div key={index} className="item-row">
                      <div className="item-field product">
                        <label>Product</label>
                        <select
                          value={item.product_id}
                          onChange={e => handleOrderItemChange(index, 'product_id', e.target.value)}
                        >
                          <option value="">Select product</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                          ))}
                        </select>
                      </div>
                      <div className="item-field qty">
                        <label>Qty</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => handleOrderItemChange(index, 'quantity', parseFloat(e.target.value))}
                        />
                      </div>
                      <div className="item-field uom">
                        <label>UOM</label>
                        <input type="text" value={item.uom} readOnly />
                      </div>
                      <div className="item-field price">
                        <label>Unit Price</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={e => handleOrderItemChange(index, 'unit_price', parseFloat(e.target.value))}
                        />
                      </div>
                      <div className="item-field total">
                        <label>Total</label>
                        <span>{formatCurrency(item.quantity * item.unit_price)}</span>
                      </div>
                      <button type="button" className="remove-item-btn" onClick={() => handleOrderItemRemove(index)}>
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  {orderFormData.items.length === 0 && (
                    <p className="no-items">No items added. Click "Add Item" to add products.</p>
                  )}
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowOrderForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Create Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Modal */}
      {showReceiveModal && selectedOrder && (
        <div className="modal-overlay" onClick={() => setShowReceiveModal(false)}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Receive Inventory - {selectedOrder.po_number}</h2>
              <button className="close-btn" onClick={() => setShowReceiveModal(false)}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleReceiveSubmit}>
              <div className="form-section">
                <div className="form-group">
                  <label>Invoice Number</label>
                  <input
                    type="text"
                    value={receiveData.invoice_number}
                    onChange={e => setReceiveData(prev => ({ ...prev, invoice_number: e.target.value }))}
                    placeholder="Enter invoice number"
                  />
                </div>
              </div>

              <div className="form-section">
                <h3>Received Items</h3>
                <div className="items-list">
                  {receiveData.items.map((item, index) => (
                    <div key={index} className="item-row">
                      <div className="item-field product">
                        <label>Product</label>
                        <span>{item.product_name}</span>
                      </div>
                      <div className="item-field qty">
                        <label>Ordered</label>
                        <span>{item.ordered_quantity}</span>
                      </div>
                      <div className="item-field qty">
                        <label>Received</label>
                        <input
                          type="number"
                          min="0"
                          max={item.ordered_quantity}
                          value={item.received_quantity}
                          onChange={e => handleReceiveItemChange(index, 'received_quantity', parseFloat(e.target.value))}
                        />
                      </div>
                      <div className="item-field price">
                        <label>Unit Cost</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={e => handleReceiveItemChange(index, 'unit_price', parseFloat(e.target.value))}
                        />
                      </div>
                      <div className="item-field total">
                        <label>Value</label>
                        <span>{formatCurrency(item.received_quantity * item.unit_price)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowReceiveModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Confirm Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Form Modal */}
      {showReturnForm && (
        <div className="modal-overlay" onClick={() => setShowReturnForm(false)}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Purchase Return / Exchange</h2>
              <button className="close-btn" onClick={() => setShowReturnForm(false)}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleReturnSubmit}>
              <div className="form-section">
                <div className="form-row">
                  <div className="form-group">
                    <label>Distributor *</label>
                    <select
                      value={returnFormData.distributor_id}
                      onChange={e => setReturnFormData(prev => ({ ...prev, distributor_id: e.target.value }))}
                      required
                    >
                      <option value="">Select distributor</option>
                      {distributors.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Reference PO</label>
                    <input
                      type="text"
                      value={returnFormData.reference_po}
                      onChange={e => setReturnFormData(prev => ({ ...prev, reference_po: e.target.value }))}
                      placeholder="Original PO number"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Return Type</label>
                    <select
                      value={returnFormData.return_type}
                      onChange={e => setReturnFormData(prev => ({ ...prev, return_type: e.target.value }))}
                    >
                      <option value="return">Return</option>
                      <option value="exchange">Exchange</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Reason</label>
                    <input
                      type="text"
                      value={returnFormData.reason}
                      onChange={e => setReturnFormData(prev => ({ ...prev, reason: e.target.value }))}
                      placeholder="Reason for return/exchange"
                    />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Return Items</h3>
                  <button type="button" className="add-item-btn" onClick={handleReturnItemAdd}>
                    <Plus size={16} /> Add Item
                  </button>
                </div>
                <div className="items-list">
                  {returnFormData.items.map((item, index) => (
                    <div key={index} className="item-row">
                      <div className="item-field product">
                        <label>Product</label>
                        <select
                          value={item.product_id}
                          onChange={e => handleReturnItemChange(index, 'product_id', e.target.value)}
                        >
                          <option value="">Select product</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                          ))}
                        </select>
                      </div>
                      <div className="item-field qty">
                        <label>Qty</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => handleReturnItemChange(index, 'quantity', parseFloat(e.target.value))}
                        />
                      </div>
                      <div className="item-field uom">
                        <label>UOM</label>
                        <input type="text" value={item.uom} readOnly />
                      </div>
                      <div className="item-field price">
                        <label>Unit Price</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={e => handleReturnItemChange(index, 'unit_price', parseFloat(e.target.value))}
                        />
                      </div>
                      <div className="item-field total">
                        <label>Total</label>
                        <span>{formatCurrency(item.quantity * item.unit_price)}</span>
                      </div>
                      <button type="button" className="remove-item-btn" onClick={() => handleReturnItemRemove(index)}>
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowReturnForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Create Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PurchaseManagement;
