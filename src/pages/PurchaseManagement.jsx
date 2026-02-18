import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, X, Search, Package, Truck, RotateCcw, Eye, Check, Clock, ArrowUpDown } from 'lucide-react';
import { purchaseOrdersApi, distributorsApi, productsApi, purchaseReturnsApi, stockLedgerApi, distributorLedgerApi } from '../services/api';
import './PurchaseManagement.css';

function PurchaseManagement({ user }) {
  const getTodayDate = () => new Date().toISOString().split('T')[0];
  const LOCAL_LEDGER_KEY = 'purchase_distributor_ledger_local_entries';
  const getDefaultQuickOrderFormData = () => ({
    distributor_id: '',
    distributor_name: '',
    order_date: getTodayDate(),
    notes: '',
    items: []
  });

  const getDefaultLedgerFormData = () => ({
    distributor_id: '',
    type: 'payment',
    amount: '',
    payment_mode: 'cash',
    transaction_date: getTodayDate(),
    reference: '',
    description: ''
  });

  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const getRecordDate = (entry) => new Date(entry.created_at || entry.transaction_date || entry.date || Date.now()).getTime();
  const getLedgerDistributorKey = (entry) => {
    if (entry?.distributor_id !== undefined && entry?.distributor_id !== null) return String(entry.distributor_id);
    if (entry?.distributor_name) return `name:${String(entry.distributor_name).toLowerCase()}`;
    return 'unknown';
  };

  const getLedgerTypeKey = (entry) => String(entry?.type || entry?.transaction_type || '').toLowerCase();

  const getSignedLedgerAmount = (entry) => {
    const amount = Math.abs(toNumber(entry?.amount));
    const type = getLedgerTypeKey(entry);
    if (type === 'payment') return -amount;
    return amount;
  };

  const calculateOrderBalanceAmount = (order) => {
    const explicitTotal = toNumber(
      order?.total_amount ??
      order?.grand_total ??
      order?.line_total
    );
    if (explicitTotal > 0) return explicitTotal;

    const items = Array.isArray(order?.items) ? order.items : [];
    const itemsTotal = items.reduce((sum, item) => {
      const lineTotal = toNumber(item?.line_total ?? item?.total_amount ?? item?.total);
      if (lineTotal > 0) return sum + lineTotal;
      const lineTaxable = toNumber(item?.taxable_value);
      const lineTax = toNumber(item?.tax_amount);
      if (lineTaxable > 0 || lineTax > 0) return sum + lineTaxable + lineTax;
      const qty = toNumber(item?.quantity);
      const rate = toNumber(item?.rate ?? item?.unit_price);
      return sum + (qty * rate);
    }, 0);
    if (itemsTotal > 0) return itemsTotal;

    const taxable = toNumber(order?.taxable_value);
    const tax = toNumber(order?.tax_amount);
    if (taxable > 0 || tax > 0) return taxable + tax;

    return toNumber(order?.total);
  };

  const getOrderDisplayTotal = (order) => {
    return calculateOrderBalanceAmount(order);
  };

  const getLocalLedgerEntries = () => {
    try {
      const raw = localStorage.getItem(LOCAL_LEDGER_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  const saveLocalLedgerEntries = (entries) => {
    try {
      localStorage.setItem(LOCAL_LEDGER_KEY, JSON.stringify(entries));
    } catch (e) {
      // ignore storage failure
    }
  };

  const addLocalLedgerEntry = (entry) => {
    const existing = getLocalLedgerEntries();
    saveLocalLedgerEntries([entry, ...existing]);
  };

  const getDerivedLedgerFromOrders = (orders, selectedDistributorId) => {
    const validStatuses = new Set(['confirmed', 'shipped', 'received']);
    const derived = (orders || [])
      .filter(order => validStatuses.has(String(order.status || '').toLowerCase()))
      .map(order => ({
      id: `po-${order.id}`,
      distributor_id: order.distributor_id,
      distributor_name: order.distributor_name,
      type: 'credit',
      transaction_type: 'credit',
      amount: calculateOrderBalanceAmount(order),
      payment_mode: 'credit',
      reference: order.po_number,
      bill_number: order.bill_number || order.invoice_number || null,
      description: `Purchase Order ${order.po_number || ''}`.trim(),
      transaction_date: order.created_at || order.order_date || order.expected_delivery || getTodayDate(),
      mode: 'automatic'
    }));

    if (!selectedDistributorId) return derived;
    return derived.filter(entry => String(entry.distributor_id) === String(selectedDistributorId));
  };

  const mergeLedgerRecords = (apiRecords, localRecords, derivedRecords) => {
    const baseRecords = Array.isArray(apiRecords) ? apiRecords : [];
    const merged = baseRecords.length > 0
      ? [...baseRecords, ...localRecords]
      : [...localRecords, ...derivedRecords];

    const deduped = [];
    const seen = new Set();
    for (const entry of merged) {
      const key = entry.id || `${entry.distributor_id || ''}-${entry.reference || ''}-${entry.amount || ''}-${getRecordDate(entry)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(entry);
    }

    const runningBalanceByDistributor = {};
    const chronological = [...deduped].sort((a, b) => getRecordDate(a) - getRecordDate(b));
    const withBalances = chronological.map(entry => {
      const distributorKey = getLedgerDistributorKey(entry);
      const prevBalance = runningBalanceByDistributor[distributorKey] || 0;
      const nextBalance = prevBalance + getSignedLedgerAmount(entry);
      runningBalanceByDistributor[distributorKey] = nextBalance;
      return {
        ...entry,
        computed_balance: nextBalance
      };
    });

    return withBalances.sort((a, b) => getRecordDate(b) - getRecordDate(a));
  };

  const getLedgerBalanceSummary = (records, selectedDistributorId) => {
    const balancesByDistributor = {};
    for (const entry of records || []) {
      const key = getLedgerDistributorKey(entry);
      if (balancesByDistributor[key] === undefined) {
        balancesByDistributor[key] = toNumber(entry.computed_balance ?? entry.balance);
      }
    }

    if (selectedDistributorId) {
      const selectedKey = String(selectedDistributorId);
      let selectedBalance = 0;
      for (const [key, balance] of Object.entries(balancesByDistributor)) {
        if (key === selectedKey) {
          selectedBalance = balance;
          break;
        }
      }
      return {
        label: 'Distributor Balance',
        value: selectedBalance
      };
    }

    const totalBalance = Object.values(balancesByDistributor).reduce((sum, value) => sum + toNumber(value), 0);
    return {
      label: 'Total Balance (All Distributors)',
      value: totalBalance
    };
  };

  const calculateOrderItem = (item) => {
    const quantity = toNumber(item.quantity);
    const rate = toNumber(item.rate ?? item.unit_price);
    const grossAmount = quantity * rate;
    const discountType = item.discount_type === 'fixed' ? 'fixed' : 'percent';
    const discountValue = toNumber(item.discount_value);
    const discountAmountRaw = discountType === 'percent'
      ? (grossAmount * discountValue) / 100
      : discountValue;
    const discountAmount = Math.max(0, Math.min(discountAmountRaw, grossAmount));
    const taxableValue = Math.max(0, grossAmount - discountAmount);
    const gstRate = Math.max(0, toNumber(item.gst_rate));
    const taxAmount = (taxableValue * gstRate) / 100;
    const totalAmount = taxableValue + taxAmount;

    return {
      quantity,
      rate,
      grossAmount,
      discountType,
      discountValue,
      discountAmount,
      taxableValue,
      gstRate,
      taxAmount,
      totalAmount
    };
  };

  const calculateOrderTotals = (items = []) => {
    return items.reduce((totals, item) => {
      const line = calculateOrderItem(item);
      totals.grossAmount += line.grossAmount;
      totals.discountAmount += line.discountAmount;
      totals.taxableValue += line.taxableValue;
      totals.taxAmount += line.taxAmount;
      totals.totalAmount += line.totalAmount;
      return totals;
    }, {
      grossAmount: 0,
      discountAmount: 0,
      taxableValue: 0,
      taxAmount: 0,
      totalAmount: 0
    });
  };

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
  const [showQuickOrderForm, setShowQuickOrderForm] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [ledgerRecords, setLedgerRecords] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerFormData, setLedgerFormData] = useState(getDefaultLedgerFormData());
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [orderDetail, setOrderDetail] = useState(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(null);

  // Order form data
  const [orderFormData, setOrderFormData] = useState({
    distributor_id: '',
    distributor_name: '',
    expected_delivery: '',
    notes: '',
    items: []
  });
  const [quickOrderFormData, setQuickOrderFormData] = useState(getDefaultQuickOrderFormData());

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

  useEffect(() => {
    if (activeSubTab === 'orders') {
      fetchDistributorLedger();
    }
  }, [activeSubTab, filters.distributor_id, purchaseOrders]);

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

  const resolveDistributorByInput = (value) => {
    const query = String(value || '').trim().toLowerCase();
    if (!query) return null;
    return distributors.find(d =>
      d.status === 'active' && (
        String(d.id) === query ||
        String(d.name || '').trim().toLowerCase() === query
      )
    ) || null;
  };

  const resolveProductByInput = (value) => {
    const query = String(value || '').trim().toLowerCase();
    if (!query) return null;
    return products.find(p =>
      String(p.id) === query ||
      String(p.name || '').trim().toLowerCase() === query ||
      String(p.sku || '').trim().toLowerCase() === query
    ) || null;
  };

  const handleDistributorInputChange = (value) => {
    const match = resolveDistributorByInput(value);
    setOrderFormData(prev => ({
      ...prev,
      distributor_name: value,
      distributor_id: match ? String(match.id) : ''
    }));
  };

  const handleQuickDistributorInputChange = (value) => {
    const match = resolveDistributorByInput(value);
    setQuickOrderFormData(prev => ({
      ...prev,
      distributor_name: value,
      distributor_id: match ? String(match.id) : ''
    }));
  };

  const toDateInputValue = (value) => {
    if (!value) return '';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().split('T')[0];
  };

  // Order form handlers
  const handleOrderItemAdd = () => {
    setOrderFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        product_id: '',
        product_query: '',
        product_name: '',
        quantity: 1,
        uom: 'pcs',
        unit_price: 0,
        rate: 0,
        gst_rate: 5,
        discount_type: 'percent',
        discount_value: 0
      }]
    }));
  };

  const fetchDistributorLedger = async () => {
    try {
      setLedgerLoading(true);
      const localEntries = getLocalLedgerEntries().filter(entry => !filters.distributor_id || String(entry.distributor_id) === String(filters.distributor_id));
      const derivedEntries = getDerivedLedgerFromOrders(purchaseOrders, filters.distributor_id);
      const response = filters.distributor_id
        ? await distributorLedgerApi.getByDistributor(filters.distributor_id, { limit: 100 })
        : await distributorLedgerApi.getAll({ limit: 100 });
      const apiRecords = Array.isArray(response)
        ? response
        : (response?.rows || response?.data || response?.transactions || []);
      setLedgerRecords(mergeLedgerRecords(apiRecords, localEntries, derivedEntries));
    } catch (err) {
      const localEntries = getLocalLedgerEntries().filter(entry => !filters.distributor_id || String(entry.distributor_id) === String(filters.distributor_id));
      const derivedEntries = getDerivedLedgerFromOrders(purchaseOrders, filters.distributor_id);
      setLedgerRecords(mergeLedgerRecords([], localEntries, derivedEntries));
    } finally {
      setLedgerLoading(false);
    }
  };

  const createAutoDistributorCredit = async ({ distributorId, amount, poNumber, orderId, billNumber }) => {
    if (!distributorId || amount <= 0) return;

    await distributorLedgerApi.addTransaction(distributorId, {
      type: 'credit',
      transaction_type: 'credit',
      amount: Number(amount.toFixed(2)),
      payment_mode: 'credit',
      reference: poNumber || (orderId ? `PO-${orderId}` : ''),
      bill_number: billNumber || null,
      description: `Purchase Order ${poNumber || ''}${billNumber ? ` (Bill: ${billNumber})` : ''}`.trim(),
      transactionDate: getTodayDate(),
      source: 'purchase_order',
      source_id: orderId,
      mode: 'automatic',
      created_by: user?.id
    });
  };

  const handleOrderItemChange = async (index, field, value) => {
    const items = [...orderFormData.items];
    items[index][field] = value;

    if (field === 'product_id') {
      const selectedProductId = String(value || '');
      const product = products.find(p => String(p.id) === selectedProductId);
      if (product) {
        const baseRate = toNumber(product.price);
        items[index].product_name = product.name;
        items[index].product_query = product.name;
        items[index].unit_price = baseRate;
        items[index].rate = baseRate;
        items[index].uom = product.uom || 'pcs';
        items[index].last_purchase_hint = '';
      } else {
        items[index].product_name = '';
        items[index].last_purchase_hint = '';
      }
      setOrderFormData(prev => ({ ...prev, items }));

      if (!selectedProductId) return;

      try {
        const suggestion = await productsApi.getLastPurchase(selectedProductId);
        if (!suggestion?.found) return;

        setOrderFormData(prev => {
          const nextItems = [...prev.items];
          const current = nextItems[index];
          if (!current || String(current.product_id) !== selectedProductId) return prev;

          const suggestedRate = toNumber(suggestion.rate ?? suggestion.unit_price ?? current.rate ?? current.unit_price);
          const suggestedGst = toNumber(suggestion.gst_rate ?? current.gst_rate ?? 5);
          const suggestedDate = suggestion.created_at ? new Date(suggestion.created_at).toLocaleDateString() : '';
          const suggestedPo = suggestion.po_number || 'last PO';

          nextItems[index] = {
            ...current,
            unit_price: suggestedRate,
            rate: suggestedRate,
            gst_rate: suggestedGst,
            uom: suggestion.uom || current.uom || 'pcs',
            last_purchase_hint: `Suggested from ${suggestedPo}${suggestedDate ? ` (${suggestedDate})` : ''}`,
          };
          return { ...prev, items: nextItems };
        });
      } catch (_) {
        // keep product defaults when suggestion API is unavailable
      }
      return;
    }

    if (field === 'rate') {
      items[index].unit_price = toNumber(value);
    }

    if (field === 'unit_price') {
      items[index].rate = toNumber(value);
    }

    setOrderFormData(prev => ({ ...prev, items }));
  };

  const handleOrderProductInputChange = (index, value) => {
    const items = [...orderFormData.items];
    items[index].product_query = value;
    const match = resolveProductByInput(value);
    if (!match) {
      items[index].product_id = '';
      items[index].product_name = value;
      items[index].last_purchase_hint = '';
      setOrderFormData(prev => ({ ...prev, items }));
      return;
    }
    setOrderFormData(prev => ({ ...prev, items }));
    handleOrderItemChange(index, 'product_id', String(match.id));
  };

  const handleOrderItemRemove = (index) => {
    setOrderFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const resetOrderForm = () => {
    setOrderFormData({ distributor_id: '', distributor_name: '', expected_delivery: '', notes: '', items: [] });
    setEditingOrderId(null);
  };

  const openCreateOrderForm = () => {
    setError('');
    resetOrderForm();
    setShowOrderForm(true);
  };

  const closeOrderForm = () => {
    setShowOrderForm(false);
    resetOrderForm();
  };

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const selectedDistributor = distributors.find(d => String(d.id) === String(orderFormData.distributor_id) && d.status === 'active');
      if (!selectedDistributor) {
        setError('Please select a valid distributor');
        return;
      }

      const invalidTypedProducts = orderFormData.items.filter(item =>
        String(item.product_query || '').trim() && !item.product_id
      );
      if (invalidTypedProducts.length > 0) {
        setError('Please select valid products from suggestions for all typed product names');
        return;
      }

      const validItems = orderFormData.items.filter(item => item.product_id && item.quantity > 0);
      if (validItems.length === 0) {
        setError('Please add at least one item');
        return;
      }

      const calculatedItems = validItems.map(item => {
        const line = calculateOrderItem(item);
        return {
          ...item,
          quantity: line.quantity,
          unit_price: line.rate,
          rate: line.rate,
          gst_rate: line.gstRate,
          discount_type: line.discountType,
          discount_value: line.discountValue,
          taxable_value: line.taxableValue,
          tax_amount: line.taxAmount,
          line_total: line.totalAmount
        };
      });

      const orderTotals = calculateOrderTotals(calculatedItems);
      const payload = {
        distributor_id: orderFormData.distributor_id,
        expected_delivery: orderFormData.expected_delivery,
        notes: orderFormData.notes,
        subtotal: orderTotals.taxableValue,
        taxable_value: orderTotals.taxableValue,
        tax_amount: orderTotals.taxAmount,
        total_amount: orderTotals.totalAmount,
        grand_total: orderTotals.totalAmount,
        total: orderTotals.totalAmount,
        items: calculatedItems,
        created_by: user?.id
      };

      if (editingOrderId) {
        await purchaseOrdersApi.update(editingOrderId, payload);
      } else {
        await purchaseOrdersApi.create(payload);
      }

      closeOrderForm();
      await fetchOrders();
    } catch (err) {
      setError(err.message || (editingOrderId ? 'Failed to update purchase order' : 'Failed to create purchase order'));
    }
  };

  const handleEditOrder = async (orderId) => {
    try {
      setError('');
      const order = await purchaseOrdersApi.getById(orderId);
      if (!order || String(order.status || '').toLowerCase() !== 'pending') {
        setError('Only pending orders can be edited');
        return;
      }

      const mappedItems = (order.items || []).map(item => ({
        product_id: item.product_id ? String(item.product_id) : '',
        product_query: item.product_name || '',
        product_name: item.product_name || '',
        quantity: toNumber(item.quantity),
        uom: item.uom || 'pcs',
        unit_price: toNumber(item.unit_price ?? item.rate),
        rate: toNumber(item.rate ?? item.unit_price),
        gst_rate: toNumber(item.gst_rate),
        discount_type: item.discount_type === 'fixed' ? 'fixed' : 'percent',
        discount_value: toNumber(item.discount_value),
        last_purchase_hint: ''
      }));

      setOrderFormData({
        distributor_id: order.distributor_id ? String(order.distributor_id) : '',
        distributor_name: order.distributor_name || distributors.find(d => String(d.id) === String(order.distributor_id))?.name || '',
        expected_delivery: toDateInputValue(order.expected_delivery),
        notes: order.notes || '',
        items: mappedItems
      });
      setEditingOrderId(order.id);
      setShowOrderForm(true);
    } catch (err) {
      setError(err.message || 'Failed to load order for edit');
    }
  };

  const handleQuickOrderItemAdd = () => {
    setQuickOrderFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        product_id: '',
        product_query: '',
        product_name: '',
        quantity: 1,
        uom: 'pcs'
      }]
    }));
  };

  const handleQuickOrderItemRemove = (index) => {
    setQuickOrderFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleQuickOrderItemChange = (index, field, value) => {
    const items = [...quickOrderFormData.items];
    items[index][field] = value;

    if (field === 'product_id') {
      const selectedProductId = String(value || '');
      const product = products.find(p => String(p.id) === selectedProductId);
      if (product) {
        items[index].product_name = product.name;
        items[index].product_query = product.name;
        items[index].uom = product.uom || 'pcs';
      } else {
        items[index].product_name = '';
      }
    }

    setQuickOrderFormData(prev => ({ ...prev, items }));
  };

  const handleQuickOrderProductInputChange = (index, value) => {
    const items = [...quickOrderFormData.items];
    items[index].product_query = value;
    const match = resolveProductByInput(value);
    if (!match) {
      items[index].product_id = '';
      items[index].product_name = value;
      setQuickOrderFormData(prev => ({ ...prev, items }));
      return;
    }
    setQuickOrderFormData(prev => ({ ...prev, items }));
    handleQuickOrderItemChange(index, 'product_id', String(match.id));
  };

  const closeQuickOrderForm = () => {
    setShowQuickOrderForm(false);
    setQuickOrderFormData(getDefaultQuickOrderFormData());
  };

  const handleQuickOrderSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const selectedDistributor = distributors.find(d => String(d.id) === String(quickOrderFormData.distributor_id) && d.status === 'active');
      if (!selectedDistributor) {
        setError('Please select a valid distributor');
        return;
      }

      const invalidTypedProducts = quickOrderFormData.items.filter(item =>
        String(item.product_query || '').trim() && !item.product_id
      );
      if (invalidTypedProducts.length > 0) {
        setError('Please select valid products from suggestions for all typed product names');
        return;
      }

      const validItems = quickOrderFormData.items.filter(item => item.product_id && toNumber(item.quantity) > 0);
      if (validItems.length === 0) {
        setError('Please add at least one item');
        return;
      }

      const mappedItems = validItems.map(item => ({
        product_id: Number(item.product_id),
        product_name: item.product_name,
        quantity: toNumber(item.quantity),
        uom: item.uom || 'pcs',
        unit_price: 0,
        rate: 0,
        gst_rate: 0,
        discount_type: 'percent',
        discount_value: 0,
        taxable_value: 0,
        tax_amount: 0,
        line_total: 0
      }));

      await purchaseOrdersApi.create({
        distributor_id: Number(quickOrderFormData.distributor_id),
        expected_delivery: quickOrderFormData.order_date,
        notes: quickOrderFormData.notes || 'Quick entry draft',
        subtotal: 0,
        taxable_value: 0,
        tax_amount: 0,
        total_amount: 0,
        grand_total: 0,
        total: 0,
        items: mappedItems,
        created_by: user?.id
      });

      closeQuickOrderForm();
      await fetchOrders();
    } catch (err) {
      setError(err.message || 'Failed to create quick purchase order');
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
      setError('');
      let order = purchaseOrders.find(po => String(po.id) === String(orderId));
      let billNumber = '';

      if (status === 'confirmed') {
        const existingBill = String(order?.bill_number || order?.invoice_number || '').trim();
        const inputValue = window.prompt('Enter Bill No (optional). Leave blank to continue.', existingBill);
        if (inputValue === null) return;
        billNumber = String(inputValue).trim();
      }

      await purchaseOrdersApi.updateStatus(orderId, status, billNumber ? { bill_number: billNumber } : {});
      if (status === 'confirmed') {
        try {
          const detailedOrder = await purchaseOrdersApi.getById(orderId);
          if (detailedOrder) {
            order = detailedOrder;
          }
        } catch (detailErr) {
          // keep list-order fallback
        }
        if (order) {
          try {
            await createAutoDistributorCredit({
              distributorId: order.distributor_id,
              amount: calculateOrderBalanceAmount(order),
              poNumber: order.po_number,
              orderId: order.id,
              billNumber: billNumber || order.bill_number || order.invoice_number || ''
            });
          } catch (ledgerErr) {
            console.warn('Auto distributor credit entry failed on confirmation:', ledgerErr);
          }
        }
      }
      fetchOrders();
      fetchDistributorLedger();
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

  // View order details
  const handleViewOrder = async (orderId) => {
    try {
      setOrderDetailLoading(true);
      const order = await purchaseOrdersApi.getById(orderId);
      setOrderDetail(order);
      setShowOrderDetail(true);
    } catch (err) {
      setError('Failed to load order details');
    } finally {
      setOrderDetailLoading(false);
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

  const getLedgerTypeLabel = (entry) => {
    const rawType = String(entry?.type || entry?.transaction_type || '').toLowerCase();
    if (rawType === 'payment') return 'Payment';
    if (rawType === 'credit' || rawType === 'given') return 'Credit';
    return rawType ? rawType.charAt(0).toUpperCase() + rawType.slice(1) : '-';
  };

  const getDistributorName = (entry) => {
    if (entry?.distributor_name) return entry.distributor_name;
    const distributorId = entry?.distributor_id;
    if (!distributorId) return '-';
    const distributor = distributors.find(d => String(d.id) === String(distributorId));
    return distributor?.name || '-';
  };

  const getLedgerBillNumber = (entry) => {
    return entry?.bill_number || entry?.linked_bill_number || entry?.po_bill_number || entry?.invoice_number || entry?.po_invoice_number || '-';
  };

  const handleOpenLedgerForm = () => {
    setLedgerFormData({
      ...getDefaultLedgerFormData(),
      distributor_id: filters.distributor_id || ''
    });
    setShowLedgerForm(true);
  };

  const handleLedgerSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const amount = toNumber(ledgerFormData.amount);
    if (!ledgerFormData.distributor_id) {
      setError('Please select a distributor for ledger entry');
      return;
    }
    if (amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      await distributorLedgerApi.addTransaction(ledgerFormData.distributor_id, {
        type: ledgerFormData.type,
        transaction_type: ledgerFormData.type,
        amount: Number(amount.toFixed(2)),
        payment_mode: ledgerFormData.payment_mode,
        reference: ledgerFormData.reference,
        description: ledgerFormData.description || `Manual ${ledgerFormData.type} entry`,
        transactionDate: ledgerFormData.transaction_date,
        mode: 'manual',
        created_by: user?.id
      });

      setShowLedgerForm(false);
      setLedgerFormData(getDefaultLedgerFormData());
      fetchDistributorLedger();
    } catch (err) {
      const localEntry = {
        id: `local-${Date.now()}`,
        distributor_id: ledgerFormData.distributor_id,
        type: ledgerFormData.type,
        transaction_type: ledgerFormData.type,
        amount: Number(amount.toFixed(2)),
        payment_mode: ledgerFormData.payment_mode,
        reference: ledgerFormData.reference,
        description: ledgerFormData.description || `Manual ${ledgerFormData.type} entry`,
        transaction_date: ledgerFormData.transaction_date,
        created_at: new Date().toISOString(),
        mode: 'manual'
      };
      addLocalLedgerEntry(localEntry);
      setShowLedgerForm(false);
      setLedgerFormData(getDefaultLedgerFormData());
      fetchDistributorLedger();
    }
  };

  const orderTotals = calculateOrderTotals(orderFormData.items);
  const ledgerBalanceSummary = getLedgerBalanceSummary(ledgerRecords, filters.distributor_id);

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
              <button className="admin-btn secondary" onClick={handleOpenLedgerForm}>
                <Plus size={18} /> Payment / Credit Entry
              </button>
              <button className="admin-btn secondary" onClick={handleReturnFormOpen}>
                <RotateCcw size={18} /> Return / Exchange
              </button>
              <button className="admin-btn secondary" onClick={() => setShowQuickOrderForm(true)}>
                <Plus size={18} /> Quick Entry
              </button>
              <button className="admin-btn primary" onClick={openCreateOrderForm}>
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
                      <td>{formatCurrency(getOrderDisplayTotal(order))}</td>
                      <td>{getStatusBadge(order.status)}</td>
                      <td>{order.expected_delivery ? new Date(order.expected_delivery).toLocaleDateString() : '-'}</td>
                       <td className="actions-cell">
                         <button className="action-btn view" title="View Details" onClick={() => handleViewOrder(order.id)}>
                           <Eye size={16} />
                         </button>
                         {order.status === 'pending' && (
                           <>
                             <button className="action-btn edit" title="Edit" onClick={() => handleEditOrder(order.id)}>
                               <Edit size={16} />
                             </button>
                             <button className="action-btn" title="Confirm" onClick={() => handleUpdateStatus(order.id, 'confirmed')}>
                               <Check size={16} />
                             </button>
                             {/*<button className="action-btn" title="Ship" onClick={() => handleUpdateStatus(order.id, 'shipped')}>
                               <Truck size={16} />
                             </button>*/}
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

          {/* Distributor Ledger */}
          <div className="actions-bar ledger-header">
            <h2>Distributor Credit / Payment Ledger</h2>
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
                  <th>Distributor</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Balance</th>
                  <th>Mode</th>
                  <th>Reference</th>
                  <th>Bill No</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {ledgerLoading ? (
                  <tr>
                    <td colSpan="9" className="empty-state">Loading ledger records...</td>
                  </tr>
                ) : ledgerRecords.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty-state">No distributor payment/credit records found</td>
                  </tr>
                ) : (
                  ledgerRecords.map((entry, index) => (
                    <tr key={entry.id || index}>
                      <td>{new Date(entry.created_at || entry.transaction_date || Date.now()).toLocaleDateString()}</td>
                      <td>{getDistributorName(entry)}</td>
                      <td>{getLedgerTypeLabel(entry)}</td>
                      <td>{formatCurrency(toNumber(entry.amount))}</td>
                      <td>{formatCurrency(toNumber(entry.computed_balance ?? entry.balance))}</td>
                      <td>{entry.payment_mode || entry.method || '-'}</td>
                      <td>{entry.reference || entry.po_number || '-'}</td>
                      <td>{getLedgerBillNumber(entry)}</td>
                      <td>{entry.description || '-'}</td>
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

      {/* Quick Entry Modal */}
      {showQuickOrderForm && (
        <div className="modal-overlay" onClick={closeQuickOrderForm}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Quick Purchase Entry</h2>
              <button className="close-btn" onClick={closeQuickOrderForm}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleQuickOrderSubmit}>
              <div className="form-section">
                <div className="form-row">
                  <div className="form-group">
                    <label>Distributor *</label>
                    <input
                      type="text"
                      list="po-distributor-list-quick"
                      value={quickOrderFormData.distributor_name || ''}
                      onChange={e => handleQuickDistributorInputChange(e.target.value)}
                      placeholder="Type distributor name"
                      required
                    />
                    <datalist id="po-distributor-list-quick">
                      {distributors.filter(d => d.status === 'active').map(d => (
                        <option key={d.id} value={d.name} />
                      ))}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label>Date</label>
                    <input
                      type="date"
                      value={quickOrderFormData.order_date}
                      onChange={e => setQuickOrderFormData(prev => ({ ...prev, order_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={quickOrderFormData.notes}
                    onChange={e => setQuickOrderFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows="2"
                    placeholder="Optional short note"
                  />
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Items (Product + Qty)</h3>
                  <button type="button" className="add-item-btn" onClick={handleQuickOrderItemAdd}>
                    <Plus size={16} /> Add Row
                  </button>
                </div>
                <div className="quick-entry-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>UOM</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {quickOrderFormData.items.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="empty-state">No rows added</td>
                        </tr>
                      ) : quickOrderFormData.items.map((item, index) => (
                        <tr key={index}>
                          <td>
                            <input
                              type="text"
                              list={`po-quick-product-list-${index}`}
                              value={item.product_query || item.product_name || ''}
                              onChange={e => handleQuickOrderProductInputChange(index, e.target.value)}
                              placeholder="Type product name or SKU"
                            />
                            <datalist id={`po-quick-product-list-${index}`}>
                              {products.map(p => (
                                <option key={p.id} value={p.name}>{p.sku}</option>
                              ))}
                            </datalist>
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e => handleQuickOrderItemChange(index, 'quantity', toNumber(e.target.value))}
                            />
                          </td>
                          <td>
                            <input type="text" value={item.uom || 'pcs'} readOnly />
                          </td>
                          <td>
                            <button type="button" className="remove-item-btn" onClick={() => handleQuickOrderItemRemove(index)}>
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeQuickOrderForm}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Save Quick Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Order Modal */}
      {showOrderForm && (
        <div className="modal-overlay" onClick={closeOrderForm}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingOrderId ? 'Edit Purchase Order' : 'Create Purchase Order'}</h2>
              <button className="close-btn" onClick={closeOrderForm}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleOrderSubmit}>
              <div className="form-section">
                <div className="form-row">
                  <div className="form-group">
                    <label>Distributor *</label>
                    <input
                      type="text"
                      list="po-distributor-list"
                      value={orderFormData.distributor_name || ''}
                      onChange={e => handleDistributorInputChange(e.target.value)}
                      placeholder="Type distributor name"
                      required
                    />
                    <datalist id="po-distributor-list">
                      {distributors.filter(d => d.status === 'active').map(d => (
                        <option key={d.id} value={d.name} />
                      ))}
                    </datalist>
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
                  {orderFormData.items.map((item, index) => {
                    const line = calculateOrderItem(item);
                    return (
                      <div key={index} className="item-row order-item-row">
                        <div className="item-field product">
                          <label>Product</label>
                          <input
                            type="text"
                            list={`po-product-list-${index}`}
                            value={item.product_query || item.product_name || ''}
                            onChange={e => handleOrderProductInputChange(index, e.target.value)}
                            placeholder="Type product name or SKU"
                          />
                          <datalist id={`po-product-list-${index}`}>
                            {products.map(p => (
                              <option key={p.id} value={p.name}>{p.sku}</option>
                            ))}
                          </datalist>
                          {!!(String(item.product_query || '').trim() && !item.product_id) && (
                            <small style={{ display: 'block', marginTop: 4, color: '#c62828' }}>
                              Select a valid product from suggestions
                            </small>
                          )}
                          {item.last_purchase_hint && (
                            <small style={{ display: 'block', marginTop: 4, color: '#666' }}>{item.last_purchase_hint}</small>
                          )}
                        </div>
                        <div className="item-field qty">
                          <label>Qty</label>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={e => handleOrderItemChange(index, 'quantity', toNumber(e.target.value))}
                          />
                        </div>
                        <div className="item-field uom">
                          <label>UOM</label>
                          <input type="text" value={item.uom} readOnly />
                        </div>
                        <div className="item-field price">
                          <label>Rate</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.rate ?? item.unit_price}
                            onChange={e => handleOrderItemChange(index, 'rate', toNumber(e.target.value))}
                          />
                        </div>
                        <div className="item-field gst">
                          <label>GST %</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.gst_rate ?? 0}
                            onChange={e => handleOrderItemChange(index, 'gst_rate', toNumber(e.target.value))}
                          />
                        </div>
                        <div className="item-field discount-type">
                          <label>Discount Type</label>
                          <select
                            value={item.discount_type || 'percent'}
                            onChange={e => handleOrderItemChange(index, 'discount_type', e.target.value)}
                          >
                            <option value="percent">%</option>
                            <option value="fixed">Fixed</option>
                          </select>
                        </div>
                        <div className="item-field discount-value">
                          <label>Discount</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.discount_value ?? 0}
                            onChange={e => handleOrderItemChange(index, 'discount_value', toNumber(e.target.value))}
                          />
                        </div>
                        <div className="item-field taxable">
                          <label>Taxable Value</label>
                          <span>{formatCurrency(line.taxableValue)}</span>
                        </div>
                        <div className="item-field tax">
                          <label>Tax</label>
                          <span>{formatCurrency(line.taxAmount)}</span>
                        </div>
                        <div className="item-field total">
                          <label>Total Amount</label>
                          <span>{formatCurrency(line.totalAmount)}</span>
                        </div>
                        <button type="button" className="remove-item-btn" onClick={() => handleOrderItemRemove(index)}>
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                  {orderFormData.items.length === 0 && (
                    <p className="no-items">No items added. Click "Add Item" to add products.</p>
                  )}
                </div>
                {orderFormData.items.length > 0 && (
                  <div className="order-summary">
                    <div className="summary-row">
                      <span>Gross Amount</span>
                      <strong>{formatCurrency(orderTotals.grossAmount)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Discount</span>
                      <strong>{formatCurrency(orderTotals.discountAmount)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Taxable Value</span>
                      <strong>{formatCurrency(orderTotals.taxableValue)}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Tax</span>
                      <strong>{formatCurrency(orderTotals.taxAmount)}</strong>
                    </div>
                    <div className="summary-row grand-total">
                      <span>Total Amount</span>
                      <strong>{formatCurrency(orderTotals.totalAmount)}</strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeOrderForm}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  {editingOrderId ? 'Update Order' : 'Create Order'}
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

      {/* Order Detail Modal */}
      {showOrderDetail && orderDetail && (
        <div className="modal-overlay" onClick={() => setShowOrderDetail(false)}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Purchase Order: {orderDetail.po_number}</h2>
              <button className="close-btn" onClick={() => setShowOrderDetail(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="order-detail-body">
              <div className="detail-row">
                <span>Distributor:</span>
                <strong>{orderDetail.distributor_name}</strong>
              </div>
              <div className="detail-row">
                <span>Status:</span>
                {getStatusBadge(orderDetail.status)}
              </div>
              <div className="detail-row">
                <span>Bill Number:</span>
                <strong>{orderDetail.bill_number || orderDetail.invoice_number || '-'}</strong>
              </div>
              <div className="detail-row">
                <span>Expected Delivery:</span>
                <strong>{orderDetail.expected_delivery ? new Date(orderDetail.expected_delivery).toLocaleDateString() : '-'}</strong>
              </div>
              {orderDetail.notes && (
                <div className="detail-row">
                  <span>Notes:</span>
                  <strong>{orderDetail.notes}</strong>
                </div>
              )}

              <h3>Items</h3>
              <div className="data-table">
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>UOM</th>
                      <th>Rate</th>
                      <th>GST %</th>
                      <th>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(orderDetail.items || []).map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.product_name}</td>
                        <td>{item.quantity}</td>
                        <td>{item.uom || '-'}</td>
                        <td>{formatCurrency(item.rate || item.unit_price)}</td>
                        <td>{item.gst_rate || 0}%</td>
                        <td>{formatCurrency(item.line_total || item.total || (item.quantity * (item.rate || item.unit_price)))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="order-totals">
                <div className="total-row">
                  <span>Taxable Value:</span>
                  <strong>{formatCurrency(orderDetail.taxable_value || 0)}</strong>
                </div>
                <div className="total-row">
                  <span>GST:</span>
                  <strong>{formatCurrency(orderDetail.tax_amount || 0)}</strong>
                </div>
                <div className="total-row grand">
                  <span>Grand Total:</span>
                  <strong>{formatCurrency(orderDetail.total_amount || getOrderDisplayTotal(orderDetail))}</strong>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={() => setShowOrderDetail(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Distributor Ledger Modal */}
      {showLedgerForm && (
        <div className="modal-overlay" onClick={() => setShowLedgerForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Distributor Payment / Credit</h2>
              <button className="close-btn" onClick={() => setShowLedgerForm(false)}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleLedgerSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Distributor *</label>
                  <select
                    value={ledgerFormData.distributor_id}
                    onChange={e => setLedgerFormData(prev => ({ ...prev, distributor_id: e.target.value }))}
                    required
                  >
                    <option value="">Select distributor</option>
                    {distributors.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Type *</label>
                  <select
                    value={ledgerFormData.type}
                    onChange={e => setLedgerFormData(prev => ({ ...prev, type: e.target.value }))}
                  >
                    <option value="payment">Payment (Reduce due)</option>
                    <option value="credit">Credit (Increase due)</option>
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
                    onChange={e => setLedgerFormData(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="Enter amount"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Payment Mode</label>
                  <select
                    value={ledgerFormData.payment_mode}
                    onChange={e => setLedgerFormData(prev => ({ ...prev, payment_mode: e.target.value }))}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Transaction Date</label>
                  <input
                    type="date"
                    value={ledgerFormData.transaction_date}
                    onChange={e => setLedgerFormData(prev => ({ ...prev, transaction_date: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Reference</label>
                  <input
                    type="text"
                    value={ledgerFormData.reference}
                    onChange={e => setLedgerFormData(prev => ({ ...prev, reference: e.target.value }))}
                    placeholder="Invoice / PO / Bank ref"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows="2"
                  value={ledgerFormData.description}
                  onChange={e => setLedgerFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional notes"
                />
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
