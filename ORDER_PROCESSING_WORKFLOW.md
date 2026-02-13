# Complete Order Processing Workflow & Best Practices

## Table of Contents
1. [Order Capture Methods](#order-capture-methods)
2. [Inventory Verification Procedures](#inventory-verification-procedures)
3. [Bill Generation Process](#bill-generation-process)
4. [Payment Authorization & Processing](#payment-authorization--processing)
5. [Fulfillment Options](#fulfillment-options)
6. [Shipping Label Generation](#shipping-label-generation)
7. [Customer Notification Protocols](#customer-notification-protocols)
8. [Post-Processing Documentation](#post-processing-documentation)
9. [Exception Handling](#exception-handling)
10. [Best Practices](#best-practices)

---

## Order Capture Methods

### 1. Online Order Placement (Customer Self-Service)
**Endpoint:** `POST /api/orders/create-validated`

**Workflow:**
1. Customer browses products and adds items to cart
2. Customer proceeds to checkout
3. System validates customer profile (phone, address)
4. Customer enters shipping address
5. Customer selects payment method (online payment or COD)
6. System processes order

**Required Data:**
```javascript
{
  user_id: number,           // Customer ID
  customer_name: string,     // Full name
  customer_email: string,    // Email address
  customer_phone: string,    // Phone number
  shipping_address: {        // Shipping address object
    street: string,
    city: string,
    state: string,
    zip: string,
    country: string
  },
  items: [{                  // Array of order items
    product_id: number,
    quantity: number,
    price: number
  }],
  payment_method: string,     // 'credit_card', 'cod', etc.
  payment_data?: {          // Required for online payments
    cardNumber: string,
    expiry: string,
    cvv: string
  },
  shipping_method: object,   // Selected shipping option
  notes?: string            // Optional order notes
}
```

### 2. Admin Bill Generation (Walk-in/Counter Sales)
**Endpoint:** `POST /api/bills/create`

**Workflow:**
1. Admin accesses Billing page (`/billing`)
2. Searches for existing customer or creates new one
3. Adds products to bill (search or custom item)
4. Applies discounts
5. Records payment amount
6. Generates bill

**Required Data:**
```javascript
{
  customer: {
    name: string,           // Customer name
    phone: string,         // Phone number (required)
    email?: string,        // Email (optional)
    address?: string       // Address (optional)
  },
  items: [{
    name: string,          // Product name
    mrp: number,           // Unit price
    quantity: number,      // Quantity
    unit: string,          // Unit (pcs, kg, etc.)
    discount_percent: number, // Per-item discount %
    category?: string       // Product category
  }],
  paid_amount: number,     // Amount paid by customer
  discount_percent: number, // Overall bill discount %
  notes?: string,          // Optional notes
  created_by: number       // Admin user ID
}
```

### 3. Cart-Based Order
**Workflow:**
1. Customer adds items to cart via `POST /api/cart`
2. Cart session maintained via session_id
3. Customer reviews cart at `GET /api/cart/:sessionId`
4. Proceeds to checkout

---

## Inventory Verification Procedures

### 1. Real-Time Stock Check
**Endpoint:** `POST /api/orders/verify-inventory`

**Implementation:**
```javascript
const checkInventory = async (items) => {
  const results = [];
  
  for (const item of items) {
    const product = dbGet(
      'SELECT id, name, stock FROM products WHERE id = ?',
      [item.product_id]
    );
    
    const available = product && product.stock >= item.quantity;
    
    results.push({
      product_id: item.product_id,
      product_name: product?.name,
      requested: item.quantity,
      available: available,
      current_stock: product?.stock || 0,
      message: available 
        ? 'In stock' 
        : `Only ${product?.stock || 0} available`
    });
  }
  
  return results;
};
```

### 2. Inventory Reservation
**On Successful Order:**
```javascript
const reserveInventory = async (items) => {
  for (const item of items) {
    dbRun(
      'UPDATE products SET stock = stock - ? WHERE id = ?',
      [item.quantity, item.product_id]
    );
  }
  return { success: true };
};
```

### 3. Inventory Restoration (On Cancellation)
```javascript
const restoreInventory = async (items) => {
  for (const item of items) {
    dbRun(
      'UPDATE products SET stock = stock + ? WHERE id = ?',
      [item.quantity, item.product_id]
    );
  }
  return { success: true };
};
```

---

## Bill Generation Process

### 1. Bill Number Generation
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

**Format:** `BILL-YYMMDD-XXXXX` (e.g., `BILL-240215-A7X9K2`)

### 2. Customer Creation (On-the-Fly)
```javascript
const getOrCreateCustomer = async (customerData) => {
  const { name, phone, email, address } = customerData;
  
  // Normalize phone number
  const normalizedPhone = phone.toString().replace(/\D/g, '');
  
  // Check existing customer
  let customer = dbGet(
    'SELECT * FROM users WHERE phone = ? AND role = ?',
    [normalizedPhone, 'customer']
  );
  
  if (!customer && email) {
    customer = dbGet(
      'SELECT * FROM users WHERE email = ? AND role = ?',
      [email, 'customer']
    );
  }
  
  if (!customer) {
    // Create new customer
    dbRun(`
      INSERT INTO users (name, phone, email, address, password, role, phone_verified)
      VALUES (?, ?, ?, ?, ?, 'customer', 1)
    `, [name, normalizedPhone, email || null, address || null, hashPassword('123456')]);
    
    customer = dbGet('SELECT * FROM users WHERE id = last_insert_rowid()');
  }
  
  return customer;
};
```

### 3. Dynamic Calculations
```javascript
const calculateBillTotals = (items, discountPercent) => {
  let subtotal = 0;
  
  // Calculate per-item amounts
  const processedItems = items.map(item => {
    const mrp = parseFloat(item.mrp);
    const quantity = parseFloat(item.quantity);
    const discount = parseFloat(item.discount_percent) || 0;
    const discountAmount = (mrp * quantity * discount) / 100;
    const amount = (mrp * quantity) - discountAmount;
    
    subtotal += amount;
    
    return {
      ...item,
      discount_amount: discountAmount,
      amount
    };
  });
  
  const totalDiscount = (subtotal * discountPercent) / 100;
  const totalAmount = subtotal - totalDiscount;
  
  return {
    items: processedItems,
    subtotal,
    discount_amount: totalDiscount,
    total_amount: totalAmount
  };
};
```

---

## Payment Authorization & Processing

### 1. Payment Processing Endpoint
**Endpoint:** `POST /api/orders/process` (internal function)

### 2. Mock Payment Gateway Integration
```javascript
const processPayment = async (paymentData) => {
  const { amount, cardNumber } = paymentData;
  
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Mock decline scenarios
  if (cardNumber.endsWith('0000')) {
    return {
      success: false,
      declineCode: 'INSUFFICIENT_FUNDS',
      message: 'Payment declined due to insufficient funds'
    };
  }
  
  if (cardNumber.endsWith('1111')) {
    return {
      success: false,
      declineCode: 'FRAUD_SUSPECTED',
      message: 'Transaction flagged as potentially fraudulent'
    };
  }
  
  // Successful payment
  return {
    success: true,
    transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
    authorizationCode: `AUTH${Math.random().toString().slice(2, 8)}`,
    last4: cardNumber.slice(-4),
    cardType: detectCardType(cardNumber)
  };
};
```

### 3. Payment Recording
```javascript
// Create payment record
dbRun(`
  INSERT INTO payments (
    order_id, transaction_id, amount, currency, payment_method,
    card_last4, card_type, status, authorization_code
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`, [
  orderId,
  paymentResult.transactionId,
  totalAmount,
  'USD',
  paymentMethod,
  paymentResult.last4,
  paymentResult.cardType,
  'completed',
  paymentResult.authorizationCode
]);
```

### 4. Cash on Delivery (COD)
```javascript
if (isCOD) {
  paymentResult = {
    success: true,
    transactionId: `COD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
    message: 'Cash on Delivery - Payment due on delivery'
  };
  paymentStatus = 'pending';
}
```

---

## Fulfillment Options

### 1. Shipping Options Calculation
**Endpoint:** `POST /api/orders/shipping-options`

```javascript
const shippingOptions = [
  {
    carrier: 'USPS',
    service: 'Ground',
    estimatedDays: 5,
    cost: 9.99,
    tracking: true
  },
  {
    carrier: 'USPS',
    service: 'Priority',
    estimatedDays: 3,
    cost: 14.99,
    tracking: true
  },
  {
    carrier: 'UPS',
    service: 'Ground',
    estimatedDays: 4,
    cost: 11.99,
    tracking: true
  },
  {
    carrier: 'FedEx',
    service: 'Express',
    estimatedDays: 2,
    cost: 24.99,
    tracking: true
  }
];
```

### 2. Fulfillment Status Tracking
```javascript
const fulfillmentStatuses = [
  'unfulfilled',      // Order placed, not yet fulfilled
  'label_created',    // Shipping label generated
  'shipped',          // Package shipped
  'delivered',        // Package delivered
  'fulfilled'         // Complete (delivered + payment confirmed)
];
```

### 3. Order Status Workflow
```
pending → confirmed → processing → shipped → delivered → fulfilled
                                     ↓
                               cancelled
                                     ↓
                                 refunded
```

---

## Shipping Label Generation

### 1. Label Generation Endpoint
**Endpoint:** `POST /api/orders/:id/generate-label`

### 2. Mock Shipping Label Generation
```javascript
const generateShippingLabel = async (order, shippingInfo) => {
  const { carrier, serviceType } = shippingInfo;
  
  // Generate tracking number based on carrier
  const trackingPrefix = carrier === 'UPS' ? '1Z' 
    : carrier === 'FedEx' ? '7489' 
    : '9400';
  
  const trackingNumber = `${trackingPrefix}${Math.random().toString().slice(2, 14).padEnd(14, '0')}`;
  
  // Mock label URL (in production, integrate with carrier API)
  const labelUrl = `https://shipping.example.com/labels/${trackingNumber}.pdf`;
  
  return {
    success: true,
    trackingNumber,
    labelUrl,
    carrier,
    serviceType,
    estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    cost: shippingInfo.cost || 9.99
  };
};
```

### 3. Shipping Record Creation
```javascript
dbRun(`
  INSERT INTO shipping_records (
    order_id, tracking_number, carrier, service_type,
    label_url, cost, status, weight
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`, [
  orderId,
  labelResult.trackingNumber,
  labelResult.carrier,
  labelResult.serviceType,
  labelResult.labelUrl,
  labelResult.cost,
  'label_created',
  weight || 1
]);
```

---

## Customer Notification Protocols

### 1. Notification Types
- **Email:** Order confirmation, status updates, shipping notifications
- **SMS:** Quick alerts for order status changes

### 2. Notification Sending Function
```javascript
const sendNotification = async (notificationData) => {
  const { type, recipient, subject, message, orderId } = notificationData;
  
  // Mock notification sending
  console.log(`Sending ${type} to ${recipient}: ${subject}`);
  
  // In production, integrate with email/SMS providers
  // - Email: SendGrid, AWS SES, Mailgun
  // - SMS: Twilio, AWS SNS
  
  dbRun(`
    INSERT INTO notifications (
      order_id, type, recipient, subject, message,
      status, sent_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [orderId, type, recipient, subject, message, 'sent']);
  
  return { success: true, type, recipient };
};
```

### 3. Notification Triggers

| Event | Notification Type | Subject | Timing |
|-------|-------------------|---------|--------|
| Order Placed | Email + SMS | `Order Confirmed - {order_number}` | Immediate |
| Payment Confirmed | Email | `Payment Received - {order_number}` | Immediate |
| Shipped | Email + SMS | `Your Order Has Been Shipped!` | On label generation |
| Status Change | Email | `Order Status Update - {order_number}` | On status change |
| Delivered | Email | `Your Order Has Been Delivered` | On delivery scan |
| Cancelled | Email | `Order Cancelled - {order_number}` | On cancellation |

---

## Post-Processing Documentation

### 1. Audit Trail
```javascript
// Log all bill creation actions
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

// Log payment actions
dbRun(`
  INSERT INTO audit_log (action, table_name, record_id, user_id, details)
  VALUES (?, ?, ?, ?, ?)
`, [
  'PAYMENT',
  'bills',
  billId,
  created_by,
  `Payment of ${amount} added to Bill ${billNumber}`
]);
```

### 2. Order Status History
```javascript
dbRun(`
  INSERT INTO order_status_history (order_id, status, description, created_by)
  VALUES (?, ?, ?, ?)
`, [
  orderId,
  status,
  description || `Status changed to ${status}`,
  user_id || null
]);
```

### 3. Statistics & Reporting
```javascript
// Get billing statistics
app.get('/api/bills/stats/summary', (req, res) => {
  const stats = {
    totalBills: dbGet('SELECT COUNT(*) as count FROM bills').count,
    totalRevenue: dbGet('SELECT COALESCE(SUM(paid_amount), 0) as total FROM bills').total,
    pendingBalance: dbGet('SELECT COALESCE(SUM(balance_amount), 0) as total FROM bills WHERE status = "pending"').total,
    todayBills: dbGet("SELECT COUNT(*) as count FROM bills WHERE DATE(created_at) = DATE('now')").count,
    todayRevenue: dbGet("SELECT COALESCE(SUM(paid_amount), 0) as total FROM bills WHERE DATE(created_at) = DATE('now')").total
  };
  res.json(stats);
});
```

---

## Exception Handling

### 1. Payment Declined
```javascript
// Mock decline scenarios in processPayment()
if (cardNumber.endsWith('0000')) {
  return {
    success: false,
    declineCode: 'INSUFFICIENT_FUNDS',
    message: 'Payment declined due to insufficient funds'
  };
}

if (cardNumber.endsWith('1111')) {
  return {
    success: false,
    declineCode: 'FRAUD_SUSPECTED',
    message: 'Transaction flagged as potentially fraudulent'
  };
}

if (cardNumber.endsWith('2222')) {
  return {
    success: false,
    declineCode: 'INVALID_CARD',
    message: 'Invalid card number'
  };
}
```

**Client Handling:**
```javascript
try {
  const result = await ordersApi.createValidated(orderData);
  // Success - redirect to confirmation
} catch (err) {
  if (err.message.includes('PAYMENT_DECLINED')) {
    // Show decline message with retry option
    showError(`Payment declined: ${err.message}. Please try a different payment method.`);
  }
}
```

### 2. Inventory Shortages
```javascript
const inventoryResults = await checkInventory(items);
const unavailableItems = inventoryResults.filter(item => !item.available);

if (unavailableItems.length > 0) {
  return res.status(409).json({
    error: 'INSUFFICIENT_INVENTORY',
    message: 'Some items are out of stock',
    unavailable_items: unavailableItems.map(item => ({
      product_name: item.product_name,
      requested: item.requested,
      available: item.available,
      current_stock: item.current_stock
    }))
  });
}
```

**Client Handling:**
```javascript
try {
  await ordersApi.verifyInventory(items);
} catch (err) {
  if (err.message.includes('INSUFFICIENT_INVENTORY')) {
    // Show unavailable items and suggest alternatives
    const unavailable = err.unavailable_items;
    showWarning(`The following items are out of stock: ${unavailable.map(i => i.product_name).join(', ')}`);
  }
}
```

### 3. Address Verification Failures
```javascript
const verifyAddress = (address) => {
  const { street, city, state, zip } = address;
  
  if (!street || !city || !state || !zip) {
    return {
      valid: false,
      code: 'MISSING_FIELDS',
      message: 'Please provide complete address information'
    };
  }
  
  return {
    valid: true,
    avsCode: 'Y',
    standardizedAddress: {
      street: street.toUpperCase(),
      city: city.toUpperCase(),
      state: state.toUpperCase(),
      zip: zip,
      country: 'IN'
    }
  };
};
```

**Client Handling:**
```javascript
try {
  await ordersApi.verifyAddress(address);
} catch (err) {
  if (!err.valid) {
    showError(`Address verification failed: ${err.message}`);
    // Highlight missing fields
  }
}
```

### 4. Order Modifications
**Endpoint:** `PUT /api/orders/:id/modify`

```javascript
app.put('/api/orders/:id/modify', async (req, res) => {
  const { items: newItems, shipping_address, notes, user_id } = req.body;
  
  // Check if order can be modified
  if (['shipped', 'delivered', 'cancelled', 'refunded'].includes(order.status)) {
    return res.status(400).json({
      error: 'ORDER_CANNOT_BE_MODIFIED',
      message: `Order cannot be modified in ${order.status} status`
    });
  }
  
  // Restore old inventory
  await restoreInventory(oldItems);
  
  // Check new inventory
  const inventoryResults = await checkInventory(newItems);
  const unavailableItems = inventoryResults.filter(item => !item.available);
  
  if (unavailableItems.length > 0) {
    // Restore old items
    await reserveInventory(oldItems);
    return res.status(409).json({
      error: 'INSUFFICIENT_INVENTORY',
      message: 'New items are unavailable',
      unavailable_items: unavailableItems
    });
  }
  
  // Process modification
  // ...
});
```

### 5. Order Cancellations
**Endpoint:** `POST /api/orders/:id/cancel`

```javascript
app.post('/api/orders/:id/cancel', async (req, res) => {
  const { reason, user_id } = req.body;
  
  // Check if order can be cancelled
  if (['shipped', 'delivered', 'cancelled', 'refunded'].includes(order.status)) {
    return res.status(400).json({
      error: 'ORDER_CANNOT_BE_CANCELLED',
      message: `Order cannot be cancelled in ${order.status} status`
    });
  }
  
  // Restore inventory
  await restoreInventory(items);
  
  // Process refund if payment was made
  if (order.payment_status === 'paid') {
    dbRun(`
      INSERT INTO payments (order_id, amount, payment_method, status, decline_code)
      VALUES (?, ?, ?, 'refunded', 'USER_REQUESTED')
    `, [order.id, order.total_amount, order.payment_method]);
  }
  
  // Update order status
  dbRun('UPDATE orders SET status = ? WHERE id = ?', ['cancelled', req.params.id]);
  
  // Send notification
  await sendNotification({
    type: 'email',
    recipient: order.customer_email,
    subject: 'Order Cancelled',
    message: `Your order ${order.order_number} has been cancelled.`
  });
});
```

---

## Best Practices

### 1. Order Processing Best Practices

#### Transaction Management
- **Always use database transactions** for order creation (in production with real DB)
- **Roll back on any failure** to maintain data consistency
- **Reserve inventory atomically** with order creation

#### Idempotency
- Use idempotent keys for payment processing
- Prevent duplicate order creation on network retries
- Check for existing orders before creating new ones

#### Validation Layers
```
Layer 1: Client-side validation (form validation)
Layer 2: API validation (required fields, data types)
Layer 3: Business logic validation (inventory, customer status)
Layer 4: Payment gateway validation
```

### 2. Inventory Management Best Practices

#### Real-Time Tracking
- Update stock levels immediately on order placement
- Use optimistic locking for concurrent updates
- Implement low-stock alerts

#### Reservation Timeouts
```javascript
// Example: Reserve inventory with timeout
const RESERVATION_TIMEOUT = 15 * 60 * 1000; // 15 minutes

// On order placement
await reserveInventory(items);

// If payment not received within timeout
setTimeout(async () => {
  const order = dbGet('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (order.payment_status === 'pending') {
    await restoreInventory(items);
    await cancelOrder(orderId, 'Payment timeout');
  }
}, RESERVATION_TIMEOUT);
```

### 3. Payment Processing Best Practices

#### Security
- Never log full card numbers
- Use PCI-compliant payment gateways
- Implement rate limiting for payment endpoints
- Use 3D Secure for high-value transactions

#### Error Handling
```javascript
// Always handle payment failures gracefully
try {
  const paymentResult = await processPayment(paymentData);
  
  if (!paymentResult.success) {
    // Log decline with decline code
    logPaymentDecline({
      orderId,
      declineCode: paymentResult.declineCode,
      amount
    });
    
    // Return user-friendly message
    return res.status(402).json({
      error: 'PAYMENT_DECLINED',
      declineCode: paymentResult.declineCode,
      message: getUserFriendlyMessage(paymentResult.declineCode),
      retry: true
    });
  }
} catch (error) {
  // Handle gateway errors
  logPaymentError({ orderId, error: error.message });
  return res.status(500).json({
    error: 'PAYMENT_ERROR',
    message: 'An error occurred while processing payment. Please try again.'
  });
}
```

### 4. Customer Communication Best Practices

#### Timing
- Send confirmation within 1 minute of order placement
- Update status within 15 minutes of status change
- Send shipping notification immediately after label generation

#### Content
- Include order number in all communications
- Provide tracking links when available
- Include expected delivery date
- Offer customer support contact

### 5. Documentation & Audit Best Practices

#### Complete Audit Trail
```javascript
// Log every significant action
dbRun(`
  INSERT INTO audit_log (action, table_name, record_id, user_id, details, ip_address)
  VALUES (?, ?, ?, ?, ?, ?)
`, [
  action,
  tableName,
  recordId,
  userId,
  JSON.stringify(details),
  ipAddress
]);
```

#### Report Generation
- Daily sales reports
- Inventory movement reports
- Payment success/failure rates
- Order fulfillment metrics

---

## API Endpoints Summary

### Order Processing
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders/process` | Process complete order |
| POST | `/api/orders/create-validated` | Create order with validation |
| GET | `/api/orders` | Get all orders |
| GET | `/api/orders/:id` | Get order by ID |
| PUT | `/api/orders/:id/modify` | Modify order |
| POST | `/api/orders/:id/cancel` | Cancel order |
| PUT | `/api/orders/:id/status` | Update order status |

### Billing
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bills/create` | Create new bill |
| GET | `/api/bills` | Get all bills |
| GET | `/api/bills/:identifier` | Get bill by ID/number |
| PUT | `/api/bills/:id/payment` | Update bill payment |
| GET | `/api/bills/stats/summary` | Get billing statistics |

### Verification
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders/verify-inventory` | Check inventory availability |
| POST | `/api/orders/verify-address` | Verify shipping address |
| POST | `/api/orders/shipping-options` | Get shipping options |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders/:id/notifications` | Get order notifications |
| POST | `/api/notifications/:id/resend` | Resend notification |

---

## Database Schema Reference

### Core Tables
- **users** - Customer and admin accounts
- **products** - Product catalog
- **orders** - Order records
- **order_items** - Line items per order
- **payments** - Payment transactions
- **bills** - Bill records (counter sales)
- **bill_items** - Bill line items
- **shipping_records** - Shipping labels and tracking
- **notifications** - Customer notifications
- **audit_log** - Audit trail
- **credit_history** - Customer credit tracking

---

## Quick Start Guide

### For New Order (Customer)
1. Login at `/login`
2. Browse products at `/products`
3. Add items to cart
4. Proceed to checkout
5. Enter shipping address
6. Select payment method
7. Confirm order

### For New Bill (Admin)
1. Login as admin at `/login`
2. Navigate to `/billing`
3. Search or create customer
4. Add products to bill
5. Set discounts if applicable
6. Enter payment amount
7. Generate bill

### For Order Management (Admin)
1. Navigate to `/admin`
2. View orders at `/admin/orders`
3. Update status as needed
4. Generate shipping labels
5. Track deliveries

---

*Document Version: 1.0*  
*Last Updated: 2024-02-15*  
*System: Barman Store E-Commerce Platform*
