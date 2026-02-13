# Admin Bill Generation Workflow - Complete Guide

## Overview

The Admin Bill Generation feature in the Barman Store React application enables administrators to create bills for walk-in or counter sales. This document covers the complete workflow from accessing the Billing page to generating and displaying the final bill.

---

## Table of Contents
1. [Access Control](#access-control)
2. [Frontend Workflow (Billing.jsx)](#frontend-workflow-billingjsx)
3. [Backend API Endpoints](#backend-api-endpoints)
4. [Database Schema](#database-schema)
5. [Complete Workflow Sequence](#complete-workflow-sequence)
6. [State Management](#state-management)
7. [Calculations & Totals](#calculations--totals)
8. [Customer Creation on-the-Fly](#customer-creation-on-the-fly)
9. [Bill Number Generation](#bill-number-generation)
10. [Payment Status Handling](#payment-status-handling)

---

## Access Control

### Route Configuration (`src/App.jsx`)
```javascript
<Route path="/billing" element={<Billing />} />
```

### Role-Based Access Check (`src/pages/Billing.jsx:322-332`)
```javascript
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
```

**Access Rules:**
- Only users with `role === 'admin'` can access the Billing page
- Regular customers are redirected to access denied message
- Default admin credentials: `admin@admin.com` / `admin123`

---

## Frontend Workflow (Billing.jsx)

### 1. Component Initialization

```javascript
function Billing() {
  const navigate = useNavigate();
  
  // Loading states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Statistics
  const [stats, setStats] = useState({
    todayBills: 0,
    todayRevenue: 0,
    pendingBalance: 0
  });
  
  // Current user
  const [currentUser, setCurrentUser] = useState(null);
  
  // Load user and stats on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
    loadStats();
  }, []);
}
```

### 2. Dashboard Statistics

**API Call:**
```javascript
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
```

**Display:**
```jsx
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
```

---

## Backend API Endpoints

### 1. Create Bill

**Endpoint:** `POST /api/bills/create`

**Request Body:**
```javascript
{
  customer: {
    name: string,           // Required
    phone: string,         // Required
    email?: string,        // Optional
    address?: string       // Optional
  },
  items: [{
    name: string,          // Required
    mrp: number,          // Required
    quantity: number,     // Default: 1
    unit: string,         // Default: 'pcs'
    discount_percent: number, // Default: 0
    category?: string      // Default: 'General'
  }],
  paid_amount: number,     // Required
  discount_percent: number, // Default: 0
  notes?: string,
  created_by: number       // Admin user ID
}
```

**Response:**
```javascript
{
  success: true,
  bill: {
    id: number,
    bill_number: string,
    customer_id: number,
    customer_name: string,
    customer_phone: string,
    subtotal: number,
    discount_percent: number,
    discount_amount: number,
    total_amount: number,
    paid_amount: number,
    balance_amount: number,
    status: string,        // 'paid' or 'pending'
    notes: string,
    created_at: datetime,
    items: [{
      id: number,
      bill_id: number,
      product_id: number,
      product_name: string,
      quantity: number,
      unit: string,
      mrp: number,
      discount_percent: number,
      discount_amount: number,
      amount: number
    }]
  },
  customer: {
    id: number,
    name: string,
    phone: string,
    email: string,
    address: string
  },
  message: string
}
```

### 2. Search Customers

**Endpoint:** `GET /api/billing/customers/search?q={searchTerm}`

**Response:**
```javascript
[{
  id: number,
  name: string,
  phone: string,
  email: string,
  address: string,
  pending_balance: number  // Shows existing balance
}]
```

### 3. Search Products

**Endpoint:** `GET /api/billing/products/search?q={searchTerm}&category={category}`

**Response:**
```javascript
[{
  id: number,
  name: string,
  price: number,      // Used as MRP
  category: string,
  stock: number
}]
```

### 4. Get Billing Statistics

**Endpoint:** `GET /api/bills/stats/summary`

**Response:**
```javascript
{
  totalBills: number,
  totalRevenue: number,
  pendingBalance: number,
  todayBills: number,
  todayRevenue: number
}
```

---

## Database Schema

### bills Table
```sql
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  subtotal REAL DEFAULT 0,
  discount_percent REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  paid_amount REAL DEFAULT 0,
  balance_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
)
```

### bill_items Table
```sql
CREATE TABLE IF NOT EXISTS bill_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL,
  product_id INTEGER,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT DEFAULT 'pcs',
  mrp REAL NOT NULL,
  discount_percent REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bill_id) REFERENCES bills(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
)
```

---

## Complete Workflow Sequence

### Step 1: Admin Accesses Billing Page
```
Admin logs in → Navigates to /billing
                    ↓
     Billing.jsx component mounts
                    ↓
     useEffect triggers → Load stats (todayBills, todayRevenue, pendingBalance)
     Load current user from localStorage
```

### Step 2: Customer Selection
**Option A: Search Existing Customer**
```
1. Admin types in customer search box
2. onChange triggers searchCustomers()
3. API call: GET /api/billing/customers/search?q={searchTerm}
4. Results displayed in dropdown
5. Admin clicks customer → selectCustomer(customer)
6. selectedCustomer state updated
7. Dropdown closes
```

**Option B: Create New Customer**
```
1. Admin clicks "New Customer" button
2. toggleNewCustomer() → newCustomerMode = true
3. Form displays: Name, Phone, Email, Address
4. Admin fills form
5. On submit: newCustomer state updated
```

**Customer Toggle Code:**
```javascript
const toggleNewCustomer = () => {
  setNewCustomerMode(!newCustomerMode);
  setSelectedCustomer(null);
  setShowCustomerDropdown(false);
};
```

### Step 3: Add Items to Bill

**Option A: Search Existing Product**
```
1. Admin clicks "Search Product" tab
2. Types product name
3. onChange triggers searchProducts()
4. API call: GET /api/billing/products/search?q={searchTerm}
5. Results displayed in dropdown
6. Admin clicks product → addProductToBill(product)
7. Item added to billItems state
```

**Option B: Create New Item (Custom Product)**
```
1. Admin clicks "New Item" tab
2. toggleNewItem() → newItemMode = true
3. Form displays: Name, MRP, Quantity, Unit, Discount %, Category
4. Admin fills form
5. Clicks "Add Item" → addNewItemToBill()
6. Item added to billItems state
```

**Item Addition Code:**
```javascript
const addProductToBill = (product) => {
  const existingIndex = billItems.findIndex(item => item.product_id === product.id);
  
  if (existingIndex >= 0) {
    // Update quantity if already exists
    const updated = [...billItems];
    updated[existingIndex].quantity += 1;
    setBillItems(updated);
  } else {
    // Add new item
    setBillItems([...billItems, {
      product_id: product.id,
      name: product.name,
      mrp: product.price,
      quantity: 1,
      unit: 'pcs',
      discount_percent: 0
    }]);
  }
  
  setProductSearch('');
  setShowProductDropdown(false);
};

const addNewItemToBill = () => {
  if (!newItem.name || !newItem.mrp) {
    setError('Please enter item name and MRP');
    return;
  }
  
  setBillItems([...billItems, {
    product_id: null,
    name: newItem.name,
    mrp: parseFloat(newItem.mrp),
    quantity: parseFloat(newItem.quantity) || 1,
    unit: newItem.unit,
    discount_percent: parseFloat(newItem.discount_percent) || 0,
    isNewItem: true
  }]);
  
  // Reset form
  setNewItem({
    name: '',
    mrp: '',
    quantity: 1,
    unit: 'pcs',
    discount_percent: 0,
    category: 'General'
  });
  setNewItemMode(false);
};
```

### Step 4: Modify Bill Items

**Update Item:**
```javascript
const updateBillItem = (index, field, value) => {
  const updated = [...billItems];
  updated[index][field] = value;
  setBillItems(updated);
};
```

**Remove Item:**
```javascript
const removeBillItem = (index) => {
  setBillItems(billItems.filter((_, i) => i !== index));
};
```

### Step 5: Payment Details

```javascript
const [paidAmount, setPaidAmount] = useState(0);
const [discountPercent, setDiscountPercent] = useState(0);
const [notes, setNotes] = useState('');
```

---

## Calculations & Totals

### Dynamic Calculation Function
```javascript
const calculateTotals = useCallback(() => {
  let subtotal = 0;
  
  // Calculate each item's amount
  billItems.forEach(item => {
    const mrp = parseFloat(item.mrp) || 0;
    const quantity = parseFloat(item.quantity) || 0;
    const discountPercent = parseFloat(item.discount_percent) || 0;
    const discountAmount = (mrp * quantity * discountPercent) / 100;
    subtotal += (mrp * quantity) - discountAmount;
  });
  
  // Apply overall bill discount
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
```

### Calculation Flow
```
Items → Per-Item Calculations → Subtotal → Bill Discount → Total Amount → Balance
         ↓                      ↓            ↓              ↓              ↓
    (MRP × Qty) - Item%    Sum of all    Subtotal ×    Total -       Total -
    = Item Amount          items         Bill%         Discount      Paid
```

### Summary Display
```jsx
<div className="billing-summary">
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
    <span>- {formatCurrency(...)}</span>
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
</div>
```

---

## Customer Creation on-the-Fly

### Backend Function: getOrCreateCustomer
```javascript
const getOrCreateCustomer = async (customerData) => {
  const { name, phone, email, address } = customerData;
  
  // Normalize phone number (remove non-digits)
  const phoneValidation = validatePhone(phone);
  if (!phoneValidation.valid) {
    throw new Error(phoneValidation.message);
  }
  const normalizedPhone = phoneValidation.phone;
  
  // Check if customer exists by phone
  let customer = dbGet(
    'SELECT * FROM users WHERE phone = ? AND role = ?',
    [normalizedPhone, 'customer']
  );
  
  // Check by email if provided and not found by phone
  if (!customer && email) {
    customer = dbGet(
      'SELECT * FROM users WHERE email = ? AND role = ?',
      [email, 'customer']
    );
  }
  
  if (customer) {
    // Update existing customer
    const hashedPassword = hashPassword('123456');
    dbRun(`
      UPDATE users SET 
        name = ?, 
        email = ?,
        address = ?,
        phone_verified = 1
      WHERE id = ?
    `, [name, email, address, customer.id]);
    return dbGet('SELECT * FROM users WHERE id = ?', [customer.id]);
  }
  
  // Create new customer
  const hashedPassword = hashPassword('123456');
  dbRun(`
    INSERT INTO users (name, phone, email, address, password, role, phone_verified)
    VALUES (?, ?, ?, ?, ?, 'customer', 1)
  `, [name, normalizedPhone, email || null, address || null, hashedPassword]);
  
  return dbGet('SELECT * FROM users WHERE id = last_insert_rowid()');
};
```

### Frontend Data Preparation
```javascript
// If creating new customer
if (newCustomerMode) {
  if (!newCustomer.name || !newCustomer.phone) {
    throw new Error('Please enter customer name and phone number');
  }
  customerData = {
    name: newCustomer.name,
    phone: newCustomer.phone,
    email: newCustomer.email || null,
    address: newCustomer.address || null
  };
} else if (selectedCustomer) {
  // Using existing customer
  customerData = {
    name: selectedCustomer.name,
    phone: selectedCustomer.phone,
    email: selectedCustomer.email || null,
    address: selectedCustomer.address || null
  };
} else {
  throw new Error('Please select or create a customer');
}
```

---

## Bill Number Generation

### Backend Function
```javascript
const generateBillNumber = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.random().toString().substr(2, 5).toUpperCase();
  return `BILL-${year}${month}${day}-${random}`;
};
```

**Examples:**
- `BILL-240215-A7X9K2`
- `BILL-240216-B3K8M1`
- `BILL-240217-C9P2N4`

**Format Breakdown:**
```
BILL-YYMMDD-XXXXX
│   │ │ │ │ └─── 5-character random (A-Z, 0-9)
│   │ │ │ └───── Day of month (01-31)
│   │ │ └─────── Month (01-12)
│   │ └────────── Year (last 2 digits)
└── Bill Prefix
```

---

## Payment Status Handling

### Status Determination
```javascript
// In backend bill creation
const balanceAmount = totalBillAmount - paidAmount;

const status = balanceAmount > 0 ? 'pending' : 'paid';

// In database
dbRun(`
  INSERT INTO bills (
    bill_number, customer_id, customer_name, customer_phone,
    subtotal, discount_percent, discount_amount, total_amount,
    paid_amount, balance_amount, status, notes, created_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, [
  billNumber,
  customer.id,
  customer.name,
  customer.phone,
  subtotal,
  discount_percent,
  0,
  totalBillAmount,
  paidAmount,
  balanceAmount,
  balanceAmount > 0 ? 'pending' : 'paid',
  notes || null,
  created_by || null
]);
```

### Balance Tracking
```javascript
// Update customer credit if there's a balance
if (balanceAmount > 0) {
  const lastBalance = dbGet(`
    SELECT balance FROM credit_history 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT 1
  `, [customer.id]);
  
  const currentBalance = lastBalance?.balance || 0;
  const newBalance = currentBalance + balanceAmount;
  
  dbRun(`
    INSERT INTO credit_history (
      user_id, type, amount, balance, description, reference, created_by, invoice_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    customer.id,
    'billing',
    balanceAmount,
    newBalance,
    `Bill ${billNumber} - Balance amount`,
    billNumber,
    created_by || null,
    billNumber
  ]);
}
```

---

## Form Submission Workflow

### handleSubmit Function
```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  setError(null);
  setSaving(true);
  
  try {
    // 1. Validate customer
    let customerData;
    if (newCustomerMode) {
      if (!newCustomer.name || !newCustomer.phone) {
        throw new Error('Please enter customer name and phone number');
      }
      customerData = {
        name: newCustomer.name,
        phone: newCustomer.phone,
        email: newCustomer.email || null,
        address: newCustomer.address || null
      };
    } else if (selectedCustomer) {
      customerData = {
        name: selectedCustomer.name,
        phone: selectedCustomer.phone,
        email: selectedCustomer.email || null,
        address: selectedCustomer.address || null
      };
    } else {
      throw new Error('Please select or create a customer');
    }
    
    // 2. Validate items
    if (billItems.length === 0) {
      throw new Error('Please add at least one item to the bill');
    }
    
    // 3. Prepare items
    const items = billItems.map(item => ({
      name: item.name,
      mrp: parseFloat(item.mrp),
      quantity: parseFloat(item.quantity),
      unit: item.unit,
      discount_percent: parseFloat(item.discount_percent) || 0,
      category: item.category || 'General'
    }));
    
    // 4. Create bill via API
    const result = await billingApi.createBill({
      customer: customerData,
      items,
      paid_amount: parseFloat(paidAmount) || 0,
      discount_percent: parseFloat(discountPercent) || 0,
      notes,
      created_by: currentUser?.id
    });
    
    // 5. Show success and navigate
    setSuccess(`Bill ${result.bill.bill_number} created successfully!`);
    setTimeout(() => {
      navigate(`/billing/${result.bill.bill_number}`);
    }, 2000);
    
    // 6. Reset form
    setBillItems([]);
    setSelectedCustomer(null);
    setCustomerSearch('');
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
```

---

## State Management Summary

### State Variables
```javascript
// Loading states
const [loading, setLoading] = useState(false);
const [saving, setSaving] = useState(false);
const [error, setError] = useState(null);
const [success, setSuccess] = useState(null);

// Data states
const [stats, setStats] = useState({...});
const [currentUser, setCurrentUser] = useState(null);

// Customer states
const [customerSearch, setCustomerSearch] = useState('');
const [customerResults, setCustomerResults] = useState([]);
const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
const [selectedCustomer, setSelectedCustomer] = useState(null);
const [newCustomerMode, setNewCustomerMode] = useState(false);
const [newCustomer, setNewCustomer] = useState({...});

// Product/Item states
const [productSearch, setProductSearch] = useState('');
const [productResults, setProductResults] = useState([]);
const [showProductDropdown, setShowProductDropdown] = useState(false);
const [newItemMode, setNewItemMode] = useState(false);
const [newItem, setNewItem] = useState({...});
const [billItems, setBillItems] = useState([]);

// Payment states
const [paidAmount, setPaidAmount] = useState(0);
const [discountPercent, setDiscountPercent] = useState(0);
const [notes, setNotes] = useState('');

// Computed states
const totals = calculateTotals();
```

---

## UI Components

### Main Sections
1. **Stats Dashboard** - Today's metrics
2. **Customer Section** - Select or create customer
3. **Items Section** - Add/remove products
4. **Payment Section** - Payment details
5. **Summary Sidebar** - Live calculations

### User Flow
```
┌─────────────────────────────────────────────────────────────┐
│                        BILLING PAGE                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Stats: Today's Bills | Revenue | Pending Balance    │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────┐   │
│  │ CUSTOMER SECTION     │  │   BILL SUMMARY            │   │
│  │ ───────────────────  │  │   ──────────────          │   │
│  │ [Select Existing]    │  │                          │   │
│  │ [New Customer]        │  │   Subtotal: ₹XXX         │   │
│  │                      │  │   Discount: -₹XX         │   │
│  │ [Search customer...] │  │   Total: ₹XXXX           │   │
│  │                      │  │   Paid: ₹XXX             │   │
│  │ ┌──────────────────┐ │  │   Balance: ₹XXX          │   │
│  │ │ Dropdown results │ │  │                          │   │
│  │ └──────────────────┘ │  │   [GENERATE BILL]        │   │
│  └──────────────────────┘  └──────────────────────────┘   │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────┐   │
│  │ ITEMS SECTION         │  │                          │   │
│  │ ───────────────────  │  │                          │   │
│  │ [Search Product]      │  │                          │   │
│  │ [New Item]            │  │                          │   │
│  │                      │  │                          │   │
│  │ ┌─────────────────────────────────────────────────┐ │   │
│  │ │ Item    │ MRP  │ Qty │ Unit │ Disc% │ Amount   │ │   │
│  │ │ Coffee  │ 150  │ 2   │ pcs │ 0     │ 300     │ │   │
│  │ │ Tea     │ 80   │ 1   │ pcs │ 10    │ 72      │ │   │
│  │ └─────────────────────────────────────────────────┘ │   │
│  └──────────────────────┘  └──────────────────────────┘   │
│                                                             │
│  ┌──────────────────────┐                                  │
│  │ PAYMENT DETAILS       │                                  │
│  │ ───────────────────   │                                  │
│  │ Paid Amount: [_____]  │                                  │
│  │ Bill Discount: [____] │                                  │
│  │ Notes: [____________] │                                  │
│  └──────────────────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Error Handling

### Frontend Error Display
```jsx
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
```

### Validation Checks
```javascript
// Customer validation
if (!newCustomer.name || !newCustomer.phone) {
  throw new Error('Please enter customer name and phone number');
}

// Item validation
if (!newItem.name || !newItem.mrp) {
  throw new Error('Please enter item name and MRP');
}

// Bill validation
if (billItems.length === 0) {
  throw new Error('Please add at least one item to the bill');
}
```

---

## Audit Trail

### Backend Audit Log
```javascript
// Add audit trail
dbRun(`
  INSERT INTO audit_log (action, table_name, record_id, user_id, details)
  VALUES (?, ?, ?, ?, ?)
`, [
  'CREATE',
  'bills',
  billId,
  created_by,
  `Bill ${billNumber} created for ${customer.name}`
]);
```

**Audit Log Table Structure:**
```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id INTEGER,
  user_id INTEGER,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
)
```

---

*Document Version: 1.0*  
*Last Updated: 2024-02-15*  
*Component: src/pages/Billing.jsx, server/index.js*
