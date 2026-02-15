import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, Clock, Truck, CheckCircle, XCircle, 
  Search, Filter, Eye, RotateCcw, Download 
} from 'lucide-react';
import { ordersApi } from '../services/api';
import './OrderHistory.css';

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const getStatusConfig = (status) => {
  const configs = {
    pending: { icon: Clock, color: 'pending', label: 'Pending' },
    confirmed: { icon: CheckCircle, color: 'confirmed', label: 'Confirmed' },
    processing: { icon: Package, color: 'processing', label: 'Processing' },
    shipped: { icon: Truck, color: 'shipped', label: 'Shipped' },
    delivered: { icon: CheckCircle, color: 'delivered', label: 'Delivered' },
    cancelled: { icon: XCircle, color: 'cancelled', label: 'Cancelled' },
    refunded: { icon: RotateCcw, color: 'refunded', label: 'Refunded' }
  };
  return configs[status] || { icon: Package, color: 'default', label: status };
};

const statusFilters = ['all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

const sortOptions = [
  { value: 'date_desc', label: 'Newest First' },
  { value: 'date_asc', label: 'Oldest First' },
  { value: 'amount_desc', label: 'Highest Amount' },
  { value: 'amount_asc', label: 'Lowest Amount' }
];

function HistoryHeader() {
  return (
    <div className="history-header fade-in-up">
      <h1>Order History</h1>
      <p>View and manage all your orders</p>
    </div>
  );
}

function OrderFilters({
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  statusCounts
}) {
  return (
    <div className="filters-section fade-in-up">
      <div className="search-box">
        <Search size={20} />
        <input
          type="text"
          placeholder="Search by order number, name, or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="filter-controls">
        <div className="filter-group">
          <Filter size={18} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {statusFilters.map((status) => (
              <option key={status} value={status}>
                {status === 'all'
                  ? `All Orders (${statusCounts.all})`
                  : `${getStatusConfig(status).label} (${statusCounts[status] || 0})`}
              </option>
            ))}
          </select>
        </div>

        <div className="sort-group">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function StatusTabs({ statusCounts, statusFilter, setStatusFilter }) {
  return (
    <div className="status-tabs fade-in-up">
      {Object.entries(statusCounts).map(([status, count]) => (
        <button
          key={status}
          className={`status-tab ${statusFilter === status ? 'active' : ''}`}
          onClick={() => setStatusFilter(status)}
        >
          {status === 'all' ? 'All' : getStatusConfig(status).label}
          <span className="tab-count">{count}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyOrdersState({ hasActiveFilters, onStartShopping }) {
  return (
    <div className="empty-state fade-in-up">
      <Package size={80} />
      <h2>No Orders Found</h2>
      <p>{hasActiveFilters ? 'Try adjusting your filters' : 'You haven\'t placed any orders yet'}</p>
      <button onClick={onStartShopping}>Start Shopping</button>
    </div>
  );
}

function OrderCard({ order, index, onViewOrder, onRetryPayment }) {
  const statusConfig = getStatusConfig(order.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div
      className="order-card slide-in-up"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="order-header">
        <div className="order-info">
          <button
            type="button"
            className="order-number"
            onClick={onViewOrder}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            {order.order_number || `#${order.id}`}
          </button>
          <span className="order-date">{formatDate(order.created_at)}</span>
        </div>
        <div className="order-status">
          <StatusIcon size={18} className={`status-icon ${statusConfig.color}`} />
          <span className={`status-text ${statusConfig.color}`}>{statusConfig.label}</span>
        </div>
      </div>

      <div className="order-items-preview">
        {order.items?.slice(0, 3).map((item, itemIndex) => (
          <div key={item.id || itemIndex} className="item-preview">
            <span className="item-name">{item.product_name || item.name}</span>
            <span className="item-qty">x{item.quantity}</span>
          </div>
        ))}
        {order.items?.length > 3 && (
          <span className="more-items">+{order.items.length - 3} more</span>
        )}
      </div>

      <div className="order-footer">
        <div className="order-total">
          <span className="total-label">Total</span>
          <span className="total-amount">{formatCurrency(order.total_amount)}</span>
        </div>
        <div className="order-actions">
          <button className="view-btn" onClick={onViewOrder}>
            <Eye size={16} />
            View Details
          </button>
          {order.status === 'pending' && (
            <button className="retry-btn" onClick={onRetryPayment}>
              Retry Payment
            </button>
          )}
          {order.fulfillment_status === 'shipped' && order.shipping_tracking_number && (
            <button className="track-btn">
              <Truck size={16} />
              Track
            </button>
          )}
        </div>
      </div>

      {order.payment_status !== 'paid' && (
        <div className={`payment-warning ${order.payment_status}`}>
          {order.payment_status === 'pending' && 'Payment Pending'}
          {order.payment_status === 'declined' && 'Payment Declined - Action Required'}
          {order.payment_status === 'refunded' && 'Refund Processed'}
        </div>
      )}
    </div>
  );
}

function ExportSection() {
  return (
    <div className="export-section fade-in-up">
      <button className="export-btn">
        <Download size={18} />
        Export Order History
      </button>
    </div>
  );
}

function OrderHistory() {
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date_desc');
  const navigate = useNavigate();

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    filterAndSortOrders();
  }, [orders, searchTerm, statusFilter, sortBy]);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (!user.id) {
        navigate('/login');
        return;
      }
      const userOrders = await ordersApi.getByUser(user.id);
      setOrders(userOrders || []);
    } catch (err) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const filterAndSortOrders = () => {
    let result = [...orders];

    // Filter by search term
    if (searchTerm) {
      result = result.filter(order => 
        order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer_email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter(order => order.status === statusFilter);
    }

    // Sort
    switch (sortBy) {
      case 'date_desc':
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
      case 'date_asc':
        result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case 'amount_desc':
        result.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0));
        break;
      case 'amount_asc':
        result.sort((a, b) => (a.total_amount || 0) - (b.total_amount || 0));
        break;
      default:
        break;
    }

    setFilteredOrders(result);
  };

  const getStatusCounts = () => {
    const counts = {
      all: orders.length,
      pending: orders.filter(o => o.status === 'pending').length,
      confirmed: orders.filter(o => o.status === 'confirmed').length,
      processing: orders.filter(o => o.status === 'processing').length,
      shipped: orders.filter(o => o.status === 'shipped').length,
      delivered: orders.filter(o => o.status === 'delivered').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length
    };
    return counts;
  };

  const statusCounts = getStatusCounts();

  const handleViewOrder = (orderId) => {
    navigate(`/orders/${orderId}`);
  };

  const handleRetryPayment = (orderId) => {
    navigate(`/checkout?retry=${orderId}`);
  };

  if (loading) {
    return (
      <div className="order-history-page">
        <div className="loading-container">
          <RotateCcw size={40} className="spinning" />
          <p>Loading your orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="order-history-page">
        <div className="error-container">
          <Package size={60} />
          <h2>Unable to Load Orders</h2>
          <p>{error}</p>
          <button onClick={loadOrders}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="order-history-page">
      <HistoryHeader />
      <OrderFilters
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        statusCounts={statusCounts}
      />
      <StatusTabs
        statusCounts={statusCounts}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
      />
      {filteredOrders.length === 0 ? (
        <EmptyOrdersState
          hasActiveFilters={Boolean(searchTerm) || statusFilter !== 'all'}
          onStartShopping={() => navigate('/products')}
        />
      ) : (
        <div className="orders-list">
          {filteredOrders.map((order, index) => (
            <OrderCard
              key={order.id}
              order={order}
              index={index}
              onViewOrder={() => handleViewOrder(order.id)}
              onRetryPayment={() => handleRetryPayment(order.id)}
            />
          ))}
        </div>
      )}
      {orders.length > 0 && <ExportSection />}
    </div>
  );
}

export default OrderHistory;
