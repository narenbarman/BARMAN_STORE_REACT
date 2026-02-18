import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, ShoppingCart, Users, TrendingUp, LogOut, Plus, Edit, Trash2, X, FolderOpen, CreditCard, FileText, Truck, ShoppingBag, History, BarChart2, Gift, KeyRound, Eye, Menu } from 'lucide-react';
import { statsApi, productsApi, ordersApi, usersApi, adminApi } from '../services/api';
import ProductForm from './ProductForm';
import CategoryManagement from './CategoryManagement';
import DistributorManagement from './DistributorManagement';
import PurchaseManagement from './PurchaseManagement';
import StockLedgerHistory from './StockLedgerHistory';
import CreditAgingReport from './CreditAgingReport';
import UserEditModal from './UserEditModal';
import BillingTab from './BillingTab';
import BillsViewer from './BillsViewer';
import OfferManagement from './OfferManagement';
import PasswordResetRequests from './PasswordResetRequests';
import CreditKhata from './CreditKhata';
import './Admin.css';

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

const formatBytes = (bytes) => {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

function Admin({ user }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState({ totalOrders: 0, totalRevenue: 0, pendingOrders: 0 });
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showCategoryManagement, setShowCategoryManagement] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [notification, setNotification] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [modalOrder, setModalOrder] = useState(null);
  const [modalItems, setModalItems] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [backups, setBackups] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [productViewMode, setProductViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'table';
    const saved = window.localStorage.getItem('admin-products-view');
    if (saved === 'table' || saved === 'grid') return saved;
    return window.innerWidth <= 768 ? 'grid' : 'table';
  });
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({
    name: '',
    category: '',
    price: '',
    stock: '',
    image: ''
  });
  const [quickEditId, setQuickEditId] = useState(null);
  const [quickEditForm, setQuickEditForm] = useState({
    name: '',
    category: '',
    price: '',
    stock: '',
    image: ''
  });
  const tabGroupMap = {
    dashboard: 'general',
    orders: 'general',
    offers: 'general',
    'credit-aging': 'general',
    products: 'products',
    categories: 'products',
    billing: 'billing',
    'view-bills': 'billing',
    purchases: 'purchase',
    distributors: 'purchase',
    'stock-ledger': 'purchase',
    users: 'users',
    'credit-khata': 'users',
    'password-resets': 'users',
    'backup-restore': 'users'
  };
  const [expandedGroups, setExpandedGroups] = useState({
    general: true,
    products: false,
    billing: false,
    purchase: false,
    users: false
  });

  const refreshAdminData = async () => {
    const [statsData, productsData, ordersData, usersData] = await Promise.all([
      statsApi.orders(),
      productsApi.getAll(),
      ordersApi.getAll(),
      usersApi.getAll()
    ]);

    setStats(statsData);
    setProducts(productsData);
    setOrders(ordersData);
    setUsers(usersData);
  };

  const openApproveModal = async (orderId) => {
    try {
      setModalLoading(true);
      const order = await ordersApi.getById(orderId);
      setModalOrder(order);
      // Fetch current stock for each product in order items.
      const items = order.items || [];
      const itemsWithStock = await Promise.all(items.map(async (it) => {
        try {
          const p = await productsApi.getById(it.product_id);
          return { ...it, stock: p.stock };
        } catch (_) {
          return { ...it, stock: undefined };
        }
      }));
      setModalItems(itemsWithStock);
      setShowApproveModal(true);
    } catch (err) {
      showNotification(err.message || 'Failed to load order details', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const confirmApprove = async () => {
    if (!modalOrder) return;
    try {
      setModalLoading(true);
      await ordersApi.updateStatus(modalOrder.id, 'confirmed', 'Approved via admin modal', user.id);
      setShowApproveModal(false);
      await refreshAdminData();
      showNotification('Order approved and stock applied', 'success');
      await fetch(`/api/notify-order/${modalOrder.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approved' })
      }).catch(() => {});
    } catch (err) {
      showNotification(err.message || 'Failed to approve order', 'error');
    } finally {
      setModalLoading(false);
    }
  };

  const handleUpdateOrderStatus = async (id, status) => {
    if (status === 'cancelled' && !window.confirm('Are you sure you want to cancel this order?')) return;
    if (status === 'confirmed' && !window.confirm('Approve this order and apply stock?')) return;
    try {
      await ordersApi.updateStatus(id, status, `Order ${status} via admin panel`, user.id);
      await refreshAdminData();
      showNotification(`Order ${status} successfully`, 'success');
    } catch (error) {
      console.error('Failed to update order status', error);
      showNotification(error.message || 'Failed to update order status', 'error');
    }
  };

  useEffect(() => {
    // Check if user is admin
    if (user && user.role !== 'admin') {
      navigate('/');
      return;
    }

    fetchData();
  }, [user, navigate]);

  useEffect(() => {
    const group = tabGroupMap[activeTab];
    if (!group) return;
    setExpandedGroups(prev => ({ ...prev, [group]: true }));
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'backup-restore') {
      fetchBackups();
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('admin-products-view', productViewMode);
  }, [productViewMode]);

  const toggleSidebarGroup = (groupKey) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (window.innerWidth <= 768) {
      setIsMobileSidebarOpen(false);
    }
  };

  const fetchData = async () => {
    try {
      await refreshAdminData();
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBackups = async () => {
    try {
      setBackupLoading(true);
      const rows = await adminApi.listBackups();
      setBackups(Array.isArray(rows) ? rows : []);
    } catch (error) {
      showNotification(error.message || 'Failed to load backups', 'error');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setBackupBusy(true);
      const result = await adminApi.createBackup();
      const backupName = result?.backup?.file_name || 'backup';
      showNotification(`Backup created: ${backupName}`, 'success');
      await fetchBackups();
    } catch (error) {
      showNotification(error.message || 'Failed to create backup', 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreBackup = async (fileName) => {
    if (!fileName) return;
    const ok = window.confirm(`Restore backup "${fileName}"?\n\nA pre-restore snapshot will be created automatically.`);
    if (!ok) return;

    try {
      setBackupBusy(true);
      const result = await adminApi.restoreBackup(fileName);
      showNotification(
        `Restore complete: ${result?.restored_file || fileName}. Pre-restore backup: ${result?.pre_restore_backup || 'created'}`,
        'success'
      );
      await fetchBackups();
      await refreshAdminData();
    } catch (error) {
      showNotification(error.message || 'Failed to restore backup', 'error');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    
    try {
      await productsApi.delete(id);
      setProducts(prev => prev.filter(p => p.id !== id));
      showNotification('Product deleted successfully', 'success');
      
      // Refresh stats
      const statsData = await statsApi.orders();
      setStats(statsData);
    } catch (error) {
      showNotification('Failed to delete product', 'error');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return;
    
    try {
      await usersApi.delete(id);
      setUsers(prev => prev.filter(u => u.id !== id));
      showNotification('Customer deleted successfully', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to delete customer', 'error');
    }
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    setShowProductForm(true);
  };

  const handleAddProduct = () => {
    setEditingProduct(null);
    setShowProductForm(true);
  };

  const handleProductSave = async (meta = {}) => {
    try {
      const updatedProducts = await productsApi.getAll();
      setProducts(updatedProducts);
      
      // Refresh stats
      const statsData = await statsApi.orders();
      setStats(statsData);

      if (meta?.mode === 'create' && Number(meta?.createdCount) > 1) {
        showNotification(`${meta.createdCount} products added successfully`, 'success');
      } else if (meta?.mode === 'edit') {
        showNotification('Product updated successfully', 'success');
      } else if (meta?.mode === 'create') {
        showNotification('Product added successfully', 'success');
      } else {
        showNotification(editingProduct ? 'Product updated successfully' : 'Product added successfully', 'success');
      }
    } catch (error) {
      showNotification('Failed to refresh products', 'error');
    }
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const closeNotification = () => {
    setNotification(null);
  };

  const productCategories = Array.from(
    new Set(products.map(p => String(p.category || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const resetQuickAdd = () => {
    setQuickAddForm({
      name: '',
      category: '',
      price: '',
      stock: '',
      image: ''
    });
  };

  const makeQuickPayload = (form, baseProduct = {}) => {
    const cleanName = String(form.name || '').trim();
    const cleanCategory = String(form.category || '').trim();
    const cleanDescription = String(baseProduct.description || '').trim() || `${cleanName} product`;
    const price = Number(form.price || 0);
    const stock = Number(form.stock || 0);

    return {
      name: cleanName,
      description: cleanDescription,
      brand: baseProduct.brand || '',
      content: baseProduct.content || '',
      color: baseProduct.color || '',
      price,
      mrp: Number(baseProduct.mrp || 0) > 0 ? Number(baseProduct.mrp) : price,
      uom: baseProduct.uom || 'pcs',
      base_unit: baseProduct.base_unit || 'pcs',
      uom_type: baseProduct.uom_type || 'selling',
      conversion_factor: Number(baseProduct.conversion_factor || 1) || 1,
      barcode: baseProduct.barcode || '',
      sku: baseProduct.sku || '',
      image: String(form.image || '').trim(),
      stock,
      expiry_date: baseProduct.expiry_date || null,
      category: cleanCategory,
      defaultDiscount: Number(baseProduct.defaultDiscount || 0) || 0,
      discountType: baseProduct.discountType || 'fixed'
    };
  };

  const validateQuickForm = (form) => {
    if (!String(form.name || '').trim()) {
      showNotification('Product name is required', 'error');
      return false;
    }
    if (!String(form.category || '').trim()) {
      showNotification('Category is required', 'error');
      return false;
    }
    if (!(Number(form.price) > 0)) {
      showNotification('Price must be greater than 0', 'error');
      return false;
    }
    if (!(Number(form.stock) >= 0)) {
      showNotification('Stock must be 0 or more', 'error');
      return false;
    }
    return true;
  };

  const handleQuickAddSave = async () => {
    if (!validateQuickForm(quickAddForm)) return;

    try {
      setQuickSaving(true);
      await productsApi.create(makeQuickPayload(quickAddForm));
      await handleProductSave({ mode: 'create', createdCount: 1 });
      setShowQuickAdd(false);
      resetQuickAdd();
    } catch (error) {
      showNotification(error.message || 'Failed to add product', 'error');
    } finally {
      setQuickSaving(false);
    }
  };

  const startQuickEdit = (product) => {
    setQuickEditId(product.id);
    setQuickEditForm({
      name: product.name || '',
      category: product.category || '',
      price: String(product.price ?? ''),
      stock: String(product.stock ?? 0),
      image: product.image || ''
    });
  };

  const cancelQuickEdit = () => {
    setQuickEditId(null);
    setQuickEditForm({
      name: '',
      category: '',
      price: '',
      stock: '',
      image: ''
    });
  };

  const handleQuickEditSave = async (product) => {
    if (!validateQuickForm(quickEditForm)) return;

    try {
      setQuickSaving(true);
      await productsApi.update(product.id, makeQuickPayload(quickEditForm, product));
      await handleProductSave({ mode: 'edit', createdCount: 0 });
      cancelQuickEdit();
    } catch (error) {
      showNotification(error.message || 'Failed to update product', 'error');
    } finally {
      setQuickSaving(false);
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
  };

  const handleUserSave = async () => {
    try {
      const updatedUsers = await usersApi.getAll();
      setUsers(updatedUsers);
      showNotification('User updated successfully', 'success');
    } catch (error) {
      showNotification('Failed to refresh users', 'error');
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setIsCreatingUser(true);
    setShowUserForm(true);
  };

  const handleCreateUser = async () => {
    try {
      const updatedUsers = await usersApi.getAll();
      setUsers(updatedUsers);
      showNotification('User created successfully', 'success');
    } catch (error) {
      showNotification('Failed to refresh users', 'error');
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="admin-page">
        <div className="admin-container">
          <h1>Access Denied</h1>
          <p>You must be an admin to access this page.</p>
          <Link to="/login" className="admin-btn">Go to Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      {/* Notification */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          <span>{notification.message}</span>
          <button onClick={closeNotification}><X size={16} /></button>
        </div>
      )}

      <div className="admin-mobile-topbar">
        <button
          type="button"
          className="admin-mobile-menu-btn"
          onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
          aria-label="Toggle admin menu"
        >
          {isMobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <h2>Admin Panel</h2>
      </div>

      {isMobileSidebarOpen && (
        <button
          type="button"
          className="admin-sidebar-overlay"
          aria-label="Close admin menu"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      <div className={`admin-sidebar ${isMobileSidebarOpen ? 'open' : ''}`}>
        <h2>Admin Panel</h2>
        <nav>
          <div className="sidebar-group">
            <button
              type="button"
              className={`sidebar-group-toggle ${expandedGroups.general ? 'expanded' : ''}`}
              data-label="General"
              onClick={() => toggleSidebarGroup('general')}
            >
              <TrendingUp size={20} />
            </button>
            {expandedGroups.general && (
              <div className="sidebar-group-items">
                <button 
                  className={activeTab === 'dashboard' ? 'active' : ''}
                  onClick={() => handleTabChange('dashboard')}
                >
                  <TrendingUp size={20} /> Dashboard
                </button>
                <button 
                  className={activeTab === 'orders' ? 'active' : ''}
                  onClick={() => handleTabChange('orders')}
                >
                  <ShoppingCart size={20} /> Orders
                </button>
                <button
                  className={activeTab === 'offers' ? 'active' : ''}
                  onClick={() => handleTabChange('offers')}
                >
                  <Gift size={20} /> Offers
                </button>
                <button 
                  className={activeTab === 'credit-aging' ? 'active' : ''}
                  onClick={() => handleTabChange('credit-aging')}
                >
                  <BarChart2 size={20} /> Credit Aging
                </button>
              </div>
            )}
          </div>

          <div className="sidebar-group">
            <button
              type="button"
              className={`sidebar-group-toggle ${expandedGroups.products ? 'expanded' : ''}`}
              data-label="Products"
              onClick={() => toggleSidebarGroup('products')}
            >
              <Package size={20} />
            </button>
            {expandedGroups.products && (
              <div className="sidebar-group-items">
                <button 
                  className={activeTab === 'products' ? 'active' : ''}
                  onClick={() => handleTabChange('products')}
                >
                  <Package size={20} /> Products
                </button>
                <button 
                  className={`${activeTab === 'categories' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('categories')}
                >
                  <FolderOpen size={18} /> Categories
                </button>
              </div>
            )}
          </div>

          <div className="sidebar-group">
            <button
              type="button"
              className={`sidebar-group-toggle ${expandedGroups.billing ? 'expanded' : ''}`}
              data-label="Billing"
              onClick={() => toggleSidebarGroup('billing')}
            >
              <FileText size={20} />
            </button>
            {expandedGroups.billing && (
              <div className="sidebar-group-items">
                <button 
                  className={activeTab === 'billing' ? 'active' : ''}
                  onClick={() => handleTabChange('billing')}
                >
                  <FileText size={20} /> Billing
                </button>
                <button 
                  className={`${activeTab === 'view-bills' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('view-bills')}
                >
                  <Eye size={18} /> Bills History
                </button>
              </div>
            )}
          </div>

          <div className="sidebar-group">
            <button
              type="button"
              className={`sidebar-group-toggle ${expandedGroups.purchase ? 'expanded' : ''}`}
              data-label="Purchase"
              onClick={() => toggleSidebarGroup('purchase')}
            >
              <ShoppingBag size={20} />
            </button>
            {expandedGroups.purchase && (
              <div className="sidebar-group-items">
                <button 
                  className={activeTab === 'purchases' ? 'active' : ''}
                  onClick={() => handleTabChange('purchases')}
                >
                  <ShoppingBag size={20} /> Purchases
                </button>
                <button 
                  className={`${activeTab === 'distributors' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('distributors')}
                >
                  <Truck size={18} /> Distributors
                </button>
                <button 
                  className={`${activeTab === 'stock-ledger' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('stock-ledger')}
                >
                  <History size={18} /> Stock History
                </button>
              </div>
            )}
          </div>

          <div className="sidebar-group">
            <button
              type="button"
              className={`sidebar-group-toggle ${expandedGroups.users ? 'expanded' : ''}`}
              data-label="Users"
              onClick={() => toggleSidebarGroup('users')}
            >
              <Users size={20} />
            </button>
            {expandedGroups.users && (
              <div className="sidebar-group-items">
                <button 
                  className={activeTab === 'users' ? 'active' : ''}
                  onClick={() => handleTabChange('users')}
                >
                  <Users size={20} /> Users
                </button>
                <button
                  className={`${activeTab === 'credit-khata' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('credit-khata')}
                >
                  <CreditCard size={18} /> Credit Khata
                </button>
                <button
                  className={`${activeTab === 'password-resets' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('password-resets')}
                >
                  <KeyRound size={18} /> Password Resets
                </button>
                <button
                  className={`${activeTab === 'backup-restore' ? 'active' : ''} sub-item`}
                  onClick={() => handleTabChange('backup-restore')}
                >
                  <History size={18} /> Backup & Restore
                </button>
              </div>
            )}
          </div>

          <Link to="/" className="logout-link">
            <LogOut size={20} /> 
          </Link>
        </nav>
      </div>

      <div className="admin-content">
        {activeTab === 'dashboard' && (
          <div className="dashboard">
            <h1>Dashboard</h1>
            <div className="stats-grid">
              <div className="stat-card">
                <ShoppingCart size={40} />
                <div>
                  <h3>{stats.totalOrders}</h3>
                  <p>Total Orders</p>
                </div>
              </div>
              <div className="stat-card">
                <TrendingUp size={40} />
                <div>
                  <h3>{formatCurrencyColored(stats.totalRevenue)}</h3>
                  <p>Total Revenue</p>
                </div>
              </div>
              <div className="stat-card">
                <Package size={40} />
                <div>
                  <h3>{products.length}</h3>
                  <p>Products</p>
                </div>
              </div>
              <div className="stat-card">
                <Users size={40} />
                <div>
                  <h3>{users.length}</h3>
                  <p>Users</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'products' && (
          <div className="products-management">
            <div className="section-header">
              <h1>Products Management</h1>
              <div className="products-actions">
                <div className="view-toggle">
                  <button
                    className={`admin-btn ${productViewMode === 'table' ? 'primary' : ''}`}
                    onClick={() => setProductViewMode('table')}
                  >
                    Table
                  </button>
                  <button
                    className={`admin-btn ${productViewMode === 'grid' ? 'primary' : ''}`}
                    onClick={() => setProductViewMode('grid')}
                  >
                    Grid
                  </button>
                </div>
                <button className="admin-btn primary" onClick={handleAddProduct}>
                  <Plus size={20} /> Add Product
                </button>
              </div>
            </div>
            {productViewMode === 'table' ? (
              <div className="products-table">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Image</th>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(product => (
                      <tr key={product.id}>
                        <td>{product.id}</td>
                        <td>
                          <img 
                            src={product.image} 
                            alt={product.name}
                            className="product-thumbnail"
                            onError={(e) => e.target.src = '/logo.png'}
                          />
                        </td>
                        <td>{product.name}</td>
                        <td>{product.category}</td>
                        <td>{formatCurrencyColored(product.price)}</td>
                        <td>
                          <span className={product.stock < 10 ? 'low-stock' : ''}>
                            {product.stock}
                          </span>
                        </td>
                        <td>
                          <button className="action-btn edit" onClick={() => handleEditProduct(product)}>
                            <Edit size={16} />
                          </button>
                          <button className="action-btn delete" onClick={() => handleDeleteProduct(product.id)}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="products-grid-admin">
                <div className="product-admin-card add-product-card">
                  {!showQuickAdd ? (
                    <button className="quick-add-trigger" onClick={() => setShowQuickAdd(true)}>
                      <Plus size={18} /> Quick Add Product
                    </button>
                  ) : (
                    <div className="quick-form">
                      <h3>Quick Add</h3>
                      <input
                        type="text"
                        placeholder="Product name"
                        value={quickAddForm.name}
                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, name: e.target.value }))}
                      />
                      <input
                        type="text"
                        list="admin-product-category-list"
                        placeholder="Category"
                        value={quickAddForm.category}
                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, category: e.target.value }))}
                      />
                      <input
                        type="number"
                        placeholder="Price"
                        min="0"
                        step="0.01"
                        value={quickAddForm.price}
                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, price: e.target.value }))}
                      />
                      <input
                        type="number"
                        placeholder="Stock"
                        min="0"
                        step="1"
                        value={quickAddForm.stock}
                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, stock: e.target.value }))}
                      />
                      <input
                        type="text"
                        placeholder="Image URL (optional)"
                        value={quickAddForm.image}
                        onChange={(e) => setQuickAddForm(prev => ({ ...prev, image: e.target.value }))}
                      />
                      <div className="quick-form-actions">
                        <button className="admin-btn" onClick={() => { setShowQuickAdd(false); resetQuickAdd(); }} disabled={quickSaving}>
                          Cancel
                        </button>
                        <button className="admin-btn primary" onClick={handleQuickAddSave} disabled={quickSaving}>
                          {quickSaving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {products.map(product => {
                  const isEditingQuick = quickEditId === product.id;
                  return (
                    <div key={product.id} className="product-admin-card">
                      <img
                        src={(isEditingQuick ? quickEditForm.image : product.image) || '/logo.png'}
                        alt={product.name}
                        className="product-thumbnail-large"
                        onError={(e) => e.target.src = '/logo.png'}
                      />
                      {isEditingQuick ? (
                        <div className="quick-form">
                          <input
                            type="text"
                            placeholder="Product name"
                            value={quickEditForm.name}
                            onChange={(e) => setQuickEditForm(prev => ({ ...prev, name: e.target.value }))}
                          />
                          <input
                            type="text"
                            list="admin-product-category-list"
                            placeholder="Category"
                            value={quickEditForm.category}
                            onChange={(e) => setQuickEditForm(prev => ({ ...prev, category: e.target.value }))}
                          />
                          <input
                            type="number"
                            placeholder="Price"
                            min="0"
                            step="0.01"
                            value={quickEditForm.price}
                            onChange={(e) => setQuickEditForm(prev => ({ ...prev, price: e.target.value }))}
                          />
                          <input
                            type="number"
                            placeholder="Stock"
                            min="0"
                            step="1"
                            value={quickEditForm.stock}
                            onChange={(e) => setQuickEditForm(prev => ({ ...prev, stock: e.target.value }))}
                          />
                          <input
                            type="text"
                            placeholder="Image URL (optional)"
                            value={quickEditForm.image}
                            onChange={(e) => setQuickEditForm(prev => ({ ...prev, image: e.target.value }))}
                          />
                          <div className="quick-form-actions">
                            <button className="admin-btn" onClick={cancelQuickEdit} disabled={quickSaving}>
                              Cancel
                            </button>
                            <button className="admin-btn primary" onClick={() => handleQuickEditSave(product)} disabled={quickSaving}>
                              {quickSaving ? 'Saving...' : 'Update'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3>{product.name}</h3>
                          <p className="product-meta">{product.category}</p>
                          <p className="product-meta">{formatCurrencyColored(product.price)}</p>
                          <p className={product.stock < 10 ? 'product-stock-label low-stock' : 'product-stock-label'}>
                            Stock: {product.stock}
                          </p>
                          <div className="product-card-actions">
                            <button className="action-btn edit" onClick={() => startQuickEdit(product)} title="Quick edit">
                              <Edit size={16} />
                            </button>
                            <button className="action-btn edit" onClick={() => handleEditProduct(product)} title="Advanced edit">
                              <FolderOpen size={16} />
                            </button>
                            <button className="action-btn delete" onClick={() => handleDeleteProduct(product.id)} title="Delete">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                <datalist id="admin-product-category-list">
                  {productCategories.map(category => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="orders-management">
            <h1>Orders Management</h1>
            <div className="orders-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Customer</th>
                    <th>Email</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order.id}>
                      <td>{order.id}</td>
                      <td>{order.customer_name}</td>
                      <td>{order.customer_email}</td>
                      <td>{formatCurrencyColored(order.total_amount)}</td>
                      <td>
                        <span className={`status ${order.status}`}>{order.status}</span>
                      </td>
                      <td>
                        {order.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="admin-btn" onClick={() => openApproveModal(order.id)}>Approve</button>
                            <button className="admin-btn" onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}>Cancel</button>
                          </div>
                        ) : (
                          <span style={{ opacity: 0.8 }}>—</span>
                        )}
                      </td>
                      <td>{new Date(order.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="categories-management">
            <div className="section-header">
              <h1>Categories Management</h1>
              <button className="admin-btn primary" onClick={() => setShowCategoryManagement(true)}>
                <Plus size={20} /> Manage Categories
              </button>
            </div>
            <div className="categories-info">
              <p>Click "Manage Categories" to create, edit, or delete product categories.</p>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="users-management">
            <div className="section-header">
              <h1>Users Management</h1>
              <button className="admin-btn primary" onClick={handleAddUser}>
                <Plus size={20} /> Add Customer
              </button>
            </div>
            <div className="users-table">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td>{u.name}</td>
                      <td>{u.email || '-'}</td>
                      <td>{u.phone || '-'}</td>
                      <td>
                        <span className={`role ${u.role}`}>{u.role}</span>
                      </td>
                      <td>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td>
                        {u.role !== 'admin' ? (
                          <>
                            <Link 
                              to={`/admin/users/${u.id}/credit`}
                              className="action-btn credit"
                              title="Credit History"
                            >
                              <CreditCard size={16} />
                            </Link>
                            <button 
                              className="action-btn edit" 
                              onClick={() => handleEditUser(u)}
                              title="Edit user"
                            >
                              <Edit size={16} />
                            </button>
                            <button 
                              className="action-btn delete" 
                              onClick={() => handleDeleteUser(u.id)}
                              title="Delete user"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        ) : (
                          <span className="admin-badge">Admin</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'backup-restore' && (
          <div className="users-management">
            <div className="section-header">
              <h1>Backup & Restore</h1>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="admin-btn" onClick={fetchBackups} disabled={backupLoading || backupBusy}>
                  Refresh
                </button>
                <button className="admin-btn primary" onClick={handleCreateBackup} disabled={backupBusy}>
                  <Plus size={20} /> Create Backup
                </button>
              </div>
            </div>
            <div className="categories-info">
              <p>Restoring data will replace the current database. A pre-restore backup is created automatically.</p>
            </div>
            <div className="users-table">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Created</th>
                    <th>Size</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backupLoading ? (
                    <tr>
                      <td colSpan="4">Loading backups...</td>
                    </tr>
                  ) : backups.length === 0 ? (
                    <tr>
                      <td colSpan="4">No backups found</td>
                    </tr>
                  ) : backups.map((backup) => (
                    <tr key={backup.file_name}>
                      <td>{backup.file_name}</td>
                      <td>{backup.created_at ? new Date(backup.created_at).toLocaleString() : '-'}</td>
                      <td>{formatBytes(backup.size_bytes)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <a
                            className="admin-btn"
                            href={`/api/admin/backup/download/${encodeURIComponent(backup.file_name)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download
                          </a>
                          <button
                            className="admin-btn"
                            onClick={() => handleRestoreBackup(backup.file_name)}
                            disabled={backupBusy}
                          >
                            Restore
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'billing' && <BillingTab />}
        {activeTab === 'view-bills' && <BillsViewer />}

        {activeTab === 'distributors' && (
          <DistributorManagement user={user} />
        )}

        {activeTab === 'purchases' && (
          <PurchaseManagement user={user} />
        )}

        {activeTab === 'stock-ledger' && (
          <StockLedgerHistory user={user} />
        )}

        {activeTab === 'credit-aging' && (
          <CreditAgingReport user={user} />
        )}
        {activeTab === 'credit-khata' && <CreditKhata user={user} />}
        {activeTab === 'offers' && <OfferManagement />}
        {activeTab === 'password-resets' && <PasswordResetRequests />}
      </div>

      {/* Product Form Modal */}
      {showProductForm && (
        <ProductForm
          product={editingProduct}
          onClose={() => {
            setShowProductForm(false);
            setEditingProduct(null);
          }}
          onSave={handleProductSave}
        />
      )}
    {showApproveModal && modalOrder && (
      <div className="modal-backdrop">
        <div className="modal-card">
          <h2>Approve Order {modalOrder.order_number || `#${modalOrder.id}`}</h2>
          {modalLoading ? (
            <p>Loading...</p>
          ) : (
            <>
              <p>Customer: {modalOrder.customer_name} ({modalOrder.customer_email})</p>
              <div style={{ maxHeight: 300, overflow: 'auto', marginTop: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalItems.map(it => (
                      <tr key={it.id}>
                        <td style={{ padding: 6 }}>{it.product_name || it.name}</td>
                        <td style={{ padding: 6 }}>{it.quantity}</td>
                        <td style={{ padding: 6 }}>{/* we will fetch current stock via server when loading */}
                          {it.stock !== undefined ? it.stock : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="admin-btn" onClick={() => setShowApproveModal(false)} disabled={modalLoading}>Close</button>
                <button className="admin-btn primary" onClick={confirmApprove} disabled={modalLoading}>Confirm Approve</button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
      {/* Category Management Modal */}
      {showCategoryManagement && (
        <CategoryManagement
          onClose={() => setShowCategoryManagement(false)}
        />
      )}
      {/* User Edit Modal */}
      {editingUser && (
        <UserEditModal
          user={editingUser}
          onClose={() => {
            setEditingUser(null);
            setShowUserForm(false);
            setIsCreatingUser(false);
          }}
          onSave={handleUserSave}
        />
      )}
      {/* User Create Modal */}
      {showUserForm && isCreatingUser && (
        <UserEditModal
          isCreate={true}
          onClose={() => {
            setShowUserForm(false);
            setIsCreatingUser(false);
          }}
          onSave={handleCreateUser}
        />
      )}
    </div>
  );
}

export default Admin;
