import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { creditApi, usersApi } from '../services/api';
import './CreditKhata.css';

const getTodayDate = () => new Date().toISOString().split('T')[0];

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const getRecordDate = (entry) => new Date(entry.transaction_date || entry.created_at || entry.date || Date.now()).getTime();

const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR'
}).format(toNumber(amount));

const getLedgerTypeKey = (entry) => String(entry?.type || entry?.transaction_type || '').toLowerCase();

const getSignedLedgerAmount = (entry) => {
  const amount = Math.abs(toNumber(entry?.amount));
  return getLedgerTypeKey(entry) === 'payment' ? -amount : amount;
};

const getLedgerTypeLabel = (entry) => {
  const type = getLedgerTypeKey(entry);
  if (type === 'payment') return 'Payment';
  if (type === 'given' || type === 'credit') return 'Credit';
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : '-';
};

const getDefaultFormData = () => ({
  user_id: '',
  type: 'payment',
  amount: '',
  transactionDate: getTodayDate(),
  reference: '',
  description: ''
});

function CreditKhata({ user }) {
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [ledgerRecords, setLedgerRecords] = useState([]);
  const [filters, setFilters] = useState({ user_id: '' });
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [ledgerFormData, setLedgerFormData] = useState(getDefaultFormData());

  const usersById = useMemo(() => {
    const map = {};
    users.forEach((row) => {
      map[String(row.id)] = row;
    });
    return map;
  }, [users]);

  const fetchUsers = async () => {
    const allUsers = await usersApi.getAll();
    const customers = (allUsers || []).filter((row) => row.role !== 'admin');
    setUsers(customers);
    return customers;
  };

  const fetchLedger = async (selectedUserId, customerRows = users) => {
    setLedgerLoading(true);
    setError('');
    try {
      let merged = [];
      try {
        merged = await creditApi.getLedger(selectedUserId || '');
      } catch (err) {
        const errMsg = String(err?.message || '').toLowerCase();
        const isMissingLedgerEndpoint =
          errMsg.includes('not found') ||
          errMsg.includes('cannot get') ||
          errMsg.includes('not available');
        if (!isMissingLedgerEndpoint) throw err;

        // Backward-compatible fallback for older backend versions without /api/credit/ledger.
        const sourceUsers = selectedUserId
          ? customerRows.filter((row) => String(row.id) === String(selectedUserId))
          : customerRows;

        const responses = await Promise.all(
          sourceUsers.map(async (customer) => {
            const rows = await creditApi.getHistory(customer.id);
            return (rows || []).map((entry) => ({
              ...entry,
              user_id: entry.user_id ?? customer.id,
              customer_name: entry.customer_name || customer.name
            }));
          })
        );
        merged = responses.flat();
      }

      const runningBalanceByUser = {};
      const chronological = [...(merged || [])].sort((a, b) => {
        const dateDiff = getRecordDate(a) - getRecordDate(b);
        if (dateDiff !== 0) return dateDiff;
        return Number(a.id || 0) - Number(b.id || 0);
      });
      const withBalances = chronological.map((entry) => {
        const userKey = String(entry.user_id || 'unknown');
        const previous = runningBalanceByUser[userKey] || 0;
        const next = previous + getSignedLedgerAmount(entry);
        runningBalanceByUser[userKey] = next;
        return {
          ...entry,
          computed_balance: next
        };
      });

      setLedgerRecords(withBalances.sort((a, b) => {
        const dateDiff = getRecordDate(b) - getRecordDate(a);
        if (dateDiff !== 0) return dateDiff;
        return Number(b.id || 0) - Number(a.id || 0);
      }));
    } catch (err) {
      if (err?.status === 401) {
        localStorage.removeItem('user');
        window.location.href = '/login';
        return;
      }
      setError(err.message || 'Failed to load credit khata ledger');
      setLedgerRecords([]);
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      setError('');
      try {
        await fetchUsers();
      } catch (err) {
        if (err?.status === 401) {
          localStorage.removeItem('user');
          window.location.href = '/login';
          return;
        }
        setError(err.message || 'Failed to load credit khata data');
      } finally {
        setLoading(false);
      }
    };

    loadInitial();
  }, []);

  useEffect(() => {
    if (loading) return;
    fetchLedger(filters.user_id, users);
  }, [filters.user_id, loading]);

  const handleFilterChange = (e) => {
    setFilters({ user_id: e.target.value });
  };

  const handleOpenLedgerForm = () => {
    setError('');
    setLedgerFormData({
      ...getDefaultFormData(),
      user_id: filters.user_id || ''
    });
    setShowLedgerForm(true);
  };

  const handleLedgerSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const amount = toNumber(ledgerFormData.amount);
    if (!ledgerFormData.user_id) {
      setError('Please select a customer');
      return;
    }
    if (amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (!ledgerFormData.description.trim()) {
      setError('Please enter a description');
      return;
    }

    try {
      await creditApi.addTransaction(ledgerFormData.user_id, {
        type: ledgerFormData.type,
        amount: Number(amount.toFixed(2)),
        reference: ledgerFormData.reference,
        description: ledgerFormData.description,
        transactionDate: ledgerFormData.transactionDate,
        created_by: user?.id
      });
      setShowLedgerForm(false);
      setLedgerFormData(getDefaultFormData());
      await fetchLedger(filters.user_id, users);
    } catch (err) {
      if (err?.status === 401) {
        localStorage.removeItem('user');
        window.location.href = '/login';
        return;
      }
      setError(err.message || 'Failed to add ledger transaction');
    }
  };

  const ledgerBalanceSummary = useMemo(() => {
    const balanceByUser = {};
    for (const entry of ledgerRecords) {
      const userKey = String(entry.user_id || 'unknown');
      if (balanceByUser[userKey] === undefined) {
        balanceByUser[userKey] = toNumber(entry.computed_balance ?? entry.balance);
      }
    }

    if (filters.user_id) {
      return {
        label: 'Customer Balance',
        value: toNumber(balanceByUser[String(filters.user_id)] || 0)
      };
    }

    return {
      label: 'Total Balance (All Customers)',
      value: Object.values(balanceByUser).reduce((sum, value) => sum + toNumber(value), 0)
    };
  }, [filters.user_id, ledgerRecords]);

  if (loading) {
    return (
      <div className="credit-khata">
        <div className="loading">Loading credit khata...</div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="credit-khata">
        <div className="error-message">Only administrators can access Credit Khata.</div>
      </div>
    );
  }

  return (
    <div className="credit-khata purchase-management">
      {error && <div className="error-message">{error}</div>}

      <div className="filters-bar">
        <div className="filter-group">
          <label>Customer:</label>
          <select name="user_id" value={filters.user_id} onChange={handleFilterChange}>
            <option value="">All Customers</option>
            {users.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="actions-bar ledger-header">
        <h2>Customer Credit / Payment Ledger</h2>
        <div className="action-buttons">
          <button className="admin-btn primary" onClick={handleOpenLedgerForm}>
            <Plus size={18} /> Payment / Credit Entry
          </button>
        </div>
      </div>

      <div className="ledger-balance-summary">
        <span className="ledger-balance-label">{ledgerBalanceSummary.label}</span>
        <strong className={`ledger-balance-value ${ledgerBalanceSummary.value >= 0 ? 'positive' : 'negative'}`}>
          {formatCurrency(ledgerBalanceSummary.value)}
        </strong>
      </div>

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Balance</th>
              <th>Reference</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {ledgerLoading ? (
              <tr>
                <td colSpan="7" className="empty-state">Loading ledger records...</td>
              </tr>
            ) : ledgerRecords.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-state">No customer payment/credit records found</td>
              </tr>
            ) : (
              ledgerRecords.map((entry, index) => (
                <tr key={entry.id || index}>
                  <td>{new Date(entry.created_at || entry.transaction_date || Date.now()).toLocaleDateString()}</td>
                  <td>{usersById[String(entry.user_id)]?.name || entry.customer_name || '-'}</td>
                  <td>{getLedgerTypeLabel(entry)}</td>
                  <td>{formatCurrency(toNumber(entry.amount))}</td>
                  <td>{formatCurrency(toNumber(entry.computed_balance ?? entry.balance))}</td>
                  <td>{entry.reference || entry.invoice_number || '-'}</td>
                  <td>{entry.description || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showLedgerForm && (
        <div className="modal-overlay" onClick={() => setShowLedgerForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Customer Payment / Credit</h2>
              <button className="close-btn" onClick={() => setShowLedgerForm(false)}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleLedgerSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Customer *</label>
                  <select
                    value={ledgerFormData.user_id}
                    onChange={(e) => setLedgerFormData((prev) => ({ ...prev, user_id: e.target.value }))}
                    required
                  >
                    <option value="">Select customer</option>
                    {users.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Type *</label>
                  <select
                    value={ledgerFormData.type}
                    onChange={(e) => setLedgerFormData((prev) => ({ ...prev, type: e.target.value }))}
                  >
                    <option value="payment">Payment (Reduce due)</option>
                    <option value="given">Credit (Increase due)</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={ledgerFormData.amount}
                    onChange={(e) => setLedgerFormData((prev) => ({ ...prev, amount: e.target.value }))}
                    placeholder="Enter amount"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Transaction Date</label>
                  <input
                    type="date"
                    value={ledgerFormData.transactionDate}
                    onChange={(e) => setLedgerFormData((prev) => ({ ...prev, transactionDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Reference</label>
                  <input
                    type="text"
                    value={ledgerFormData.reference}
                    onChange={(e) => setLedgerFormData((prev) => ({ ...prev, reference: e.target.value }))}
                    placeholder="Bill / UPI / Bank ref"
                  />
                </div>
                <div className="form-group">
                  <label>Description *</label>
                  <input
                    type="text"
                    value={ledgerFormData.description}
                    onChange={(e) => setLedgerFormData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter description"
                    required
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowLedgerForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreditKhata;
