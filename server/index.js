const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 5000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'barman-store.db');
const db = new Database(DB_PATH);

// Restrict CORS when FRONTEND_ORIGIN is provided, otherwise allow all for dev
const corsOptions = {};
if (process.env.FRONTEND_ORIGIN) {
  // support comma-separated origins
  const origins = process.env.FRONTEND_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  corsOptions.origin = origins.length === 1 ? origins[0] : origins;
}
app.use(cors(Object.keys(corsOptions).length ? corsOptions : undefined));
app.use(express.json());

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

const sha256 = (password) => crypto.createHash('sha256').update(String(password || '')).digest('hex');

// bcrypt-based hasher (synchronous for simplicity)
const hashPassword = (password) => bcrypt.hashSync(String(password || ''), SALT_ROUNDS);

// verify password against stored hashes (bcrypt or legacy sha256/raw)
const verifyPassword = (plain, user) => {
  if (!user) return false;
  const storedHash = user.password_hash;
  const legacy = user.password;

  if (storedHash) {
    if (isSha256Hex(storedHash)) {
      return sha256(plain) === String(storedHash).toLowerCase();
    }
    try {
      return bcrypt.compareSync(String(plain || ''), storedHash);
    } catch (_) {
      return false;
    }
  }

  if (legacy) {
    if (isSha256Hex(legacy)) {
      return sha256(plain) === String(legacy).toLowerCase();
    }
    return String(plain || '') === String(legacy);
  }

  return false;
};

const normalizePhone = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  return digits || null;
};

const generateToken = () => `${crypto.randomBytes(24).toString('hex')}.${Date.now()}`;
const isSha256Hex = (value) => /^[a-f0-9]{64}$/i.test(String(value || ''));

const generateOrderNumber = () => {
  const now = new Date();
  const y = String(now.getFullYear()).slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${y}${m}${d}-${r}`;
};

const generatePONumber = () => `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const generateReturnNumber = () => `RET-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const generateBillNumber = () => `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const normalizePaymentMethod = (method) => {
  const raw = String(method || '').trim().toLowerCase();
  if (!raw) return 'cash';
  if (raw === 'cod' || raw === 'cash') return 'cash';
  if (raw === 'credit' || raw === 'store_credit' || raw === 'store-credit') return 'credit';
  return 'cash';
};

const generateSku = (name, brand, content, mrp) => {
  const part = (v) => String(v || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const n = part(name).slice(0, 2).padEnd(2, 'X');
  const b = part(brand).slice(0, 2).padEnd(2, 'X');
  const c = part(content).slice(0, 2).padEnd(2, 'X');
  const p = String(Math.round(Number(mrp || 0))).replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `${n}${b}${c}${p}`.slice(0, 10);
};

const dbRun = (sql, params = []) => db.prepare(sql).run(params);
const dbGet = (sql, params = []) => db.prepare(sql).get(params);
const dbAll = (sql, params = []) => db.prepare(sql).all(params);

const alterTableSafe = (sql) => {
  try {
    db.exec(sql);
  } catch (_) {
    // ignore duplicate-column failures
  }
};

const initDB = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL DEFAULT 'customer',
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT UNIQUE,
      address TEXT,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      brand TEXT,
      content TEXT,
      color TEXT,
      price REAL NOT NULL,
      mrp REAL,
      uom TEXT DEFAULT 'pcs',
      sku TEXT,
      image TEXT,
      stock INTEGER DEFAULT 0,
      category TEXT NOT NULL,
      expiry_date DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE,
      user_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      shipping_address TEXT,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      payment_method TEXT DEFAULT 'cash',
      payment_status TEXT DEFAULT 'pending',
      stock_applied INTEGER DEFAULT 0,
      credit_applied INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credit_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balance REAL DEFAULT 0,
      description TEXT,
      reference TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stock_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      product_name TEXT,
      sku TEXT,
      transaction_type TEXT NOT NULL,
      quantity_change REAL NOT NULL,
      previous_balance REAL DEFAULT 0,
      new_balance REAL DEFAULT 0,
      reference_type TEXT,
      reference_id TEXT,
      user_id INTEGER,
      user_name TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS distributors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      salesman_name TEXT,
      contacts TEXT,
      address TEXT,
      products_supplied TEXT,
      order_day TEXT,
      delivery_day TEXT,
      payment_terms TEXT DEFAULT 'Net 30',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT UNIQUE NOT NULL,
      distributor_id INTEGER NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      expected_delivery DATE,
      invoice_number TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      received_quantity REAL DEFAULT 0,
      uom TEXT DEFAULT 'pcs',
      unit_price REAL NOT NULL,
      total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_number TEXT UNIQUE NOT NULL,
      distributor_id INTEGER NOT NULL,
      total REAL NOT NULL DEFAULT 0,
      reason TEXT,
      return_type TEXT DEFAULT 'return',
      reference_po TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      uom TEXT DEFAULT 'pcs',
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      reason TEXT
    );

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      customer_phone TEXT,
      customer_address TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      credit_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      payment_status TEXT DEFAULT 'pending',
      bill_type TEXT DEFAULT 'sales',
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      mrp REAL DEFAULT 0,
      qty REAL NOT NULL,
      unit TEXT DEFAULT 'pcs',
      discount REAL DEFAULT 0,
      amount REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      recipient_id INTEGER,
      subject TEXT,
      body TEXT,
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT,
      phone TEXT,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      admin_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      description TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      value REAL DEFAULT 0,
      min_quantity INTEGER DEFAULT 1,
      apply_to_category TEXT,
      apply_to_product INTEGER,
      buy_product_id INTEGER,
      buy_quantity INTEGER DEFAULT 1,
      get_product_id INTEGER,
      get_quantity INTEGER DEFAULT 1,
      start_date DATE,
      end_date DATE,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  alterTableSafe(`ALTER TABLE products ADD COLUMN brand TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN content TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN color TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN mrp REAL`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN uom TEXT DEFAULT 'pcs'`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN sku TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN expiry_date DATE`);
  alterTableSafe(`ALTER TABLE orders ADD COLUMN order_number TEXT`);
  alterTableSafe(`ALTER TABLE orders ADD COLUMN user_id INTEGER`);
  alterTableSafe(`ALTER TABLE orders ADD COLUMN shipping_address TEXT`);
  alterTableSafe(`ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'cash'`);
  alterTableSafe(`ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'pending'`);
  alterTableSafe(`ALTER TABLE orders ADD COLUMN stock_applied INTEGER DEFAULT 0`);
  alterTableSafe(`ALTER TABLE orders ADD COLUMN credit_applied INTEGER DEFAULT 0`);
  alterTableSafe(`ALTER TABLE order_items ADD COLUMN total REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'customer'`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN email TEXT`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN phone TEXT`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN address TEXT`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN password_hash TEXT`);
  alterTableSafe(`ALTER TABLE users ADD COLUMN credit_limit REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN product_name TEXT`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN sku TEXT`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN transaction_type TEXT`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN quantity_change REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN previous_balance REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN new_balance REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN reference_type TEXT`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN reference_id TEXT`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN user_id INTEGER`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN user_name TEXT`);
  alterTableSafe(`ALTER TABLE stock_ledger ADD COLUMN notes TEXT`);
  alterTableSafe(`ALTER TABLE bills ADD COLUMN paid_amount REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE bills ADD COLUMN credit_amount REAL DEFAULT 0`);

  // Backfill from legacy "password" column if present.
  try {
    const legacyUsers = dbAll(`SELECT id, password, password_hash FROM users`);
    legacyUsers.forEach((u) => {
      if (!u.password_hash && u.password) {
        const normalized = isSha256Hex(u.password) ? String(u.password).toLowerCase() : hashPassword(u.password);
        dbRun(`UPDATE users SET password_hash = ? WHERE id = ?`, [normalized, u.id]);
      }
    });

// Simple notify endpoint used by admin UI to send in-app messages to customers when order status changes.
app.post('/api/notify-order/:orderId', (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = dbGet(`SELECT * FROM orders WHERE id = ?`, [orderId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const userId = order.user_id;
    const action = req.body?.action || 'updated';
    const message = `Your order ${order.order_number || `#${order.id}`} was ${action}.`;
    if (userId) {
      dbRun(`INSERT INTO messages (sender_id, recipient_id, subject, body, read) VALUES (?, ?, ?, ?, 0)`, [null, userId, `Order ${action}`, message]);
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
  } catch (_) {
    // ignore when legacy password column does not exist
  }

  const admin = dbGet(`SELECT id FROM users WHERE email = ?`, ['admin@admin.com']);
  if (!admin) {
    dbRun(
      `INSERT INTO users (role, name, email, phone, address, password_hash) VALUES (?, ?, ?, ?, ?, ?)`,
      ['admin', 'Administrator', 'admin@admin.com', null, null, hashPassword('admin123')]
    );
  } else {
    const adminUser = dbGet(`SELECT id, password_hash FROM users WHERE email = ?`, ['admin@admin.com']);
    if (!adminUser?.password_hash) {
      dbRun(`UPDATE users SET password_hash = ?, role = ? WHERE id = ?`, [
        hashPassword('admin123'),
        'admin',
        adminUser.id,
      ]);
    }
  }

  const productCount = dbGet(`SELECT COUNT(*) AS count FROM products`)?.count || 0;
  if (productCount === 0) {
    const products = [
      ['Premium Coffee Beans', 'Artisan roasted coffee beans from Colombia', 'CoffeeCo', '250g', 'Brown', 24.99, 29.99, 'pcs', 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=500', 50, 'Groceries'],
      ['Barista Apron', 'Premium cotton barista apron', 'BarWear', 'L', 'Black', 34.99, 39.99, 'pcs', 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=500', 30, 'Stationery'],
      ['Corn Flakes', 'Crunchy breakfast cereal', 'CerealPro', '500g', 'Yellow', 119.0, 129.0, 'box', 'https://images.unsplash.com/photo-1571748982800-fa51082c2224?w=500', 100, 'Cereals'],
      ['Digestive Biscuits', 'Whole wheat digestive biscuits', 'WheatB', '250g', 'Brown', 49.0, 55.0, 'pack', 'https://images.unsplash.com/photo-1612203985729-70726954388c?w=500', 150, 'Biscuits'],
    ];
    const stmt = db.prepare(`
      INSERT INTO products
      (name, description, brand, content, color, price, mrp, uom, sku, image, stock, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction((rows) => {
      rows.forEach((p) => {
        const sku = generateSku(p[0], p[2], p[3], p[6]);
        stmt.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], sku, p[8], p[9], p[10]);
      });
    });
    tx(products);
  }

  const categories = dbAll(`SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''`);
  categories.forEach((c) => {
    dbRun(`INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)`, [
      c.category,
      `${c.category} products`,
    ]);
  });
};

initDB();

const sanitizeUser = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    created_at: row.created_at,
  };
};

const logStockLedger = ({
  productId,
  transactionType,
  quantityChange,
  previousBalance,
  newBalance,
  referenceType = null,
  referenceId = null,
  userId = null,
  userName = null,
  notes = null,
}) => {
  const product = dbGet(`SELECT name, sku FROM products WHERE id = ?`, [productId]);
  dbRun(
    `INSERT INTO stock_ledger
    (product_id, product_name, sku, transaction_type, quantity_change, previous_balance, new_balance, reference_type, reference_id, user_id, user_name, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      productId,
      product?.name || null,
      product?.sku || null,
      transactionType,
      Number(quantityChange || 0),
      Number(previousBalance || 0),
      Number(newBalance || 0),
      referenceType || null,
      referenceId || null,
      userId || null,
      userName || null,
      notes || null,
    ]
  );
};

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, phone, password } = req.body || {};
    let user = null;
    if (email) {
      user = dbGet(`SELECT * FROM users WHERE email = ?`, [String(email).trim()]);
    } else if (phone) {
      const normalizedPhone = normalizePhone(phone);
      user = dbGet(`SELECT * FROM users WHERE phone = ?`, [normalizedPhone]);
    } else {
      return res.status(400).json({ error: 'Email or phone number is required' });
    }

    const passwordOk = verifyPassword(password, user);
    if (!passwordOk) return res.status(401).json({ error: 'Invalid credentials' });

    return res.json({
      success: true,
      user: sanitizeUser(user),
      token: generateToken(),
      message: `Welcome back, ${user.name}`,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/register', (req, res) => {
  try {
    const { email, phone, password, name, address } = req.body || {};
    const normalizedPhone = normalizePhone(phone);
    if (!email && !normalizedPhone) {
      return res.status(400).json({ error: 'Email or phone number is required' });
    }
    if (!password || String(password).length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    if (email && dbGet(`SELECT id FROM users WHERE email = ?`, [String(email).trim()])) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    if (normalizedPhone && dbGet(`SELECT id FROM users WHERE phone = ?`, [normalizedPhone])) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    const result = dbRun(
      `INSERT INTO users (role, name, email, phone, address, password_hash) VALUES (?, ?, ?, ?, ?, ?)`,
      ['customer', name || 'Customer', email ? String(email).trim() : null, normalizedPhone, address || null, hashPassword(password)]
    );
    const user = dbGet(`SELECT * FROM users WHERE id = ?`, [result.lastInsertRowid]);
    return res.status(201).json({ success: true, user: sanitizeUser(user), token: generateToken() });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/change-password', (req, res) => {
  try {
    const { email, phone, currentPassword, newPassword } = req.body || {};
    let user = null;
    if (email) {
      user = dbGet(`SELECT * FROM users WHERE email = ?`, [String(email).trim()]);
    } else if (phone) {
      user = dbGet(`SELECT * FROM users WHERE phone = ?`, [normalizePhone(phone)]);
    }
    if (!user) return res.status(404).json({ error: 'User not found' });
    const passwordOk = verifyPassword(currentPassword, user);
    if (!passwordOk) return res.status(401).json({ error: 'Current password is incorrect' });
    if (!newPassword || String(newPassword).length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' });
    }
    dbRun(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashPassword(newPassword), user.id]);
    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/request-password-reset', (req, res) => {
  try {
    const { email, phone, reason } = req.body || {};
    let user = null;
    if (email) {
      user = dbGet(`SELECT id, email, phone FROM users WHERE email = ?`, [String(email).trim()]);
    } else if (phone) {
      user = dbGet(`SELECT id, email, phone FROM users WHERE phone = ?`, [normalizePhone(phone)]);
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const result = dbRun(
      `INSERT INTO password_reset_requests (user_id, email, phone, reason, status) VALUES (?, ?, ?, ?, 'pending')`,
      [user.id, user.email || null, user.phone || null, reason || null]
    );
    return res.status(201).json({
      success: true,
      request_id: result.lastInsertRowid,
      message: 'Password reset request submitted to admin',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/password-reset-requests', (_, res) => {
  try {
    const rows = dbAll(`
      SELECT prr.*, u.name as user_name
      FROM password_reset_requests prr
      LEFT JOIN users u ON u.id = prr.user_id
      ORDER BY prr.created_at DESC
    `);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/password-reset-requests/:id', (req, res) => {
  try {
    const { status, admin_note, new_password } = req.body || {};
    if (!['approved', 'rejected', 'pending'].includes(String(status || '').toLowerCase())) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const request = dbGet(`SELECT * FROM password_reset_requests WHERE id = ?`, [req.params.id]);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    const normalizedStatus = String(status).toLowerCase();
    if (normalizedStatus === 'approved' && request.user_id) {
      const nextPassword = new_password && String(new_password).length >= 4 ? String(new_password) : '1234';
      dbRun(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashPassword(nextPassword), request.user_id]);
    }
    dbRun(
      `UPDATE password_reset_requests SET status = ?, admin_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [normalizedStatus, admin_note || null, req.params.id]
    );
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/users', (_, res) => {
  try {
    const users = dbAll(`SELECT * FROM users ORDER BY created_at DESC`).map(sanitizeUser);
    return res.json(users);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:id', (req, res) => {
  try {
    const user = sanitizeUser(dbGet(`SELECT * FROM users WHERE id = ?`, [req.params.id]));
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', (req, res) => {
  try {
    const { name, email, phone, address, password, role } = req.body || {};
    const normalizedPhone = normalizePhone(phone);
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }
    if (!email && !normalizedPhone) {
      return res.status(400).json({ error: 'Email or phone number is required' });
    }
    if (email && dbGet(`SELECT id FROM users WHERE email = ?`, [String(email).trim()])) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    if (normalizedPhone && dbGet(`SELECT id FROM users WHERE phone = ?`, [normalizedPhone])) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }
    const userRole = role === 'admin' ? 'admin' : 'customer';
    const result = dbRun(
      `INSERT INTO users (role, name, email, phone, address, password_hash) VALUES (?, ?, ?, ?, ?, ?)`,
      [userRole, String(name).trim(), email ? String(email).trim() : null, normalizedPhone, address || null, hashPassword(password || '123')]
    );
    const user = sanitizeUser(dbGet(`SELECT * FROM users WHERE id = ?`, [result.lastInsertRowid]));
    return res.status(201).json({ success: true, user, message: 'User created successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', (req, res) => {
  try {
    const { name, email, phone, address, role } = req.body || {};
    const current = dbGet(`SELECT * FROM users WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'User not found' });
    const normalizedPhone = phone !== undefined ? normalizePhone(phone) : current.phone;
    const emailValue = email !== undefined ? (email ? String(email).trim() : null) : current.email;
    if (emailValue) {
      const existing = dbGet(`SELECT id FROM users WHERE email = ? AND id != ?`, [emailValue, req.params.id]);
      if (existing) return res.status(400).json({ error: 'Email already in use' });
    }
    if (normalizedPhone) {
      const existing = dbGet(`SELECT id FROM users WHERE phone = ? AND id != ?`, [normalizedPhone, req.params.id]);
      if (existing) return res.status(400).json({ error: 'Phone number already in use' });
    }
    dbRun(
      `UPDATE users SET name = ?, email = ?, phone = ?, address = ?, role = ? WHERE id = ?`,
      [
        name !== undefined ? String(name).trim() : current.name,
        emailValue,
        normalizedPhone,
        address !== undefined ? address : current.address,
        role || current.role,
        req.params.id,
      ]
    );
    return res.json(sanitizeUser(dbGet(`SELECT * FROM users WHERE id = ?`, [req.params.id])));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    const user = dbGet(`SELECT * FROM users WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin user' });
    dbRun(`DELETE FROM users WHERE id = ?`, [req.params.id]);
    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/customers', (_, res) => {
  try {
    const customers = dbAll(`SELECT id, name, email, phone, address, created_at FROM users WHERE role = 'customer' ORDER BY name ASC`);
    return res.json(customers);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/customers/search', (req, res) => {
  try {
    const q = String(req.query.q || req.query.name || '').trim();
    const limit = Number(req.query.limit || 20);
    if (!q) {
      const rows = dbAll(`SELECT id, name, email, phone, address, created_at FROM users WHERE role='customer' ORDER BY name LIMIT ?`, [limit]);
      return res.json(rows);
    }
    const like = `%${q}%`;
    const rows = dbAll(
      `SELECT id, name, email, phone, address, created_at
       FROM users
       WHERE role='customer' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)
       ORDER BY name LIMIT ?`,
      [like, like, like, limit]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const validateCustomerProfile = (user, addressObj) => {
  const issues = [];
  if (!user?.phone || normalizePhone(user.phone)?.length < 10) {
    issues.push({ field: 'phone', message: 'Mobile number is required' });
  }
  if (!addressObj?.street) issues.push({ field: 'street', message: 'Street address is required' });
  if (!addressObj?.city) issues.push({ field: 'city', message: 'City is required' });
  if (!addressObj?.state) issues.push({ field: 'state', message: 'State is required' });
  if (!addressObj?.zip) issues.push({ field: 'zip', message: 'Postal code is required' });
  return { complete: issues.length === 0, issues };
};

app.get('/api/customers/:id/profile', (req, res) => {
  try {
    const user = dbGet(`SELECT id, name, email, phone, address, role FROM users WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Customer not found' });
    let address = {};
    if (user.address) {
      try {
        address = JSON.parse(user.address);
      } catch (_) {
        address = { street: user.address };
      }
    }
    return res.json({
      ...user,
      address,
      profileComplete: validateCustomerProfile(user, address),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders/validate-customer', (req, res) => {
  try {
    const userId = req.body?.user_id;
    if (!userId) return res.status(400).json({ error: 'MISSING_CUSTOMER', message: 'Customer ID is required' });
    const user = dbGet(`SELECT id, name, email, phone, address, role FROM users WHERE id = ?`, [userId]);
    if (!user) return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    let address = {};
    if (user.address) {
      try {
        address = JSON.parse(user.address);
      } catch (_) {
        address = { street: user.address };
      }
    }
    const validation = validateCustomerProfile(user, address);
    return res.json({
      valid: validation.complete,
      isAdmin: user.role === 'admin',
      profile: { id: user.id, name: user.name, email: user.email, phone: user.phone, address },
      validation,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products', (req, res) => {
  try {
    const qName = String(req.query?.name || '').trim();
    const qCategory = String(req.query?.category || '').trim();
    const qLowStock = String(req.query?.low_stock || '').trim();
    let sql = `SELECT * FROM products WHERE 1=1`;
    const params = [];
    if (qName) {
      sql += ` AND (name LIKE ? OR sku LIKE ? OR brand LIKE ?)`;
      const like = `%${qName}%`;
      params.push(like, like, like);
    }
    if (qCategory) {
      sql += ` AND category = ?`;
      params.push(qCategory);
    }
    if (qLowStock === 'true') {
      sql += ` AND stock <= 10`;
    }
    sql += ` ORDER BY created_at DESC`;
    return res.json(dbAll(sql, params));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const product = dbGet(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    return res.json(product);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/category/:category', (req, res) => {
  try {
    return res.json(dbAll(`SELECT * FROM products WHERE category = ? ORDER BY created_at DESC`, [req.params.category]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', (req, res) => {
  try {
    const body = req.body || {};
    const sku = body.sku || generateSku(body.name, body.brand, body.content, body.mrp || body.price);
    const result = dbRun(
      `INSERT INTO products
      (name, description, brand, content, color, price, mrp, uom, sku, image, stock, category, expiry_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.description || null,
        body.brand || null,
        body.content || null,
        body.color || null,
        Number(body.price || 0),
        body.mrp != null ? Number(body.mrp) : Number(body.price || 0),
        body.uom || 'pcs',
        sku,
        body.image || null,
        Number(body.stock || 0),
        body.category || 'Groceries',
        body.expiry_date || null,
      ]
    );
    dbRun(`INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)`, [body.category || 'Groceries', 'Product category']);
    return res.status(201).json(dbGet(`SELECT * FROM products WHERE id = ?`, [result.lastInsertRowid]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    const current = dbGet(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Product not found' });
    const body = req.body || {};
    dbRun(
      `UPDATE products SET
       name=?, description=?, brand=?, content=?, color=?, price=?, mrp=?, uom=?, sku=?, image=?, stock=?, category=?, expiry_date=?
       WHERE id=?`,
      [
        body.name ?? current.name,
        body.description ?? current.description,
        body.brand ?? current.brand,
        body.content ?? current.content,
        body.color ?? current.color,
        Number(body.price ?? current.price),
        Number(body.mrp ?? current.mrp ?? current.price),
        body.uom ?? current.uom,
        body.sku ?? current.sku ?? generateSku(body.name ?? current.name, body.brand ?? current.brand, body.content ?? current.content, body.mrp ?? current.mrp ?? current.price),
        body.image ?? current.image,
        Number(body.stock ?? current.stock),
        body.category ?? current.category,
        body.expiry_date ?? current.expiry_date,
        req.params.id,
      ]
    );
    return res.json(dbGet(`SELECT * FROM products WHERE id = ?`, [req.params.id]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    dbRun(`DELETE FROM products WHERE id = ?`, [req.params.id]);
    return res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/categories', (_, res) => {
  try {
    const rows = dbAll(`SELECT id, name, description, created_at FROM categories ORDER BY name ASC`);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories', (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const result = dbRun(`INSERT INTO categories (name, description) VALUES (?, ?)`, [name, req.body?.description || null]);
    return res.status(201).json(dbGet(`SELECT * FROM categories WHERE id = ?`, [result.lastInsertRowid]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/categories/:id', (req, res) => {
  try {
    const current = dbGet(`SELECT * FROM categories WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Category not found' });
    dbRun(`UPDATE categories SET name=?, description=? WHERE id=?`, [
      req.body?.name ?? current.name,
      req.body?.description ?? current.description,
      req.params.id,
    ]);
    return res.json(dbGet(`SELECT * FROM categories WHERE id = ?`, [req.params.id]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/categories/:id', (req, res) => {
  try {
    dbRun(`DELETE FROM categories WHERE id = ?`, [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', (_, res) => {
  try {
    const orders = dbAll(`SELECT * FROM orders ORDER BY created_at DESC`);
    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/:id', (req, res) => {
  try {
    const order = dbGet(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = dbAll(`SELECT * FROM order_items WHERE order_id = ?`, [req.params.id]);
    return res.json({ ...order, items });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/:id/history', (req, res) => {
  try {
    const rows = dbAll(
      `SELECT h.id, h.order_id, h.status, h.description, h.created_by, h.created_at, u.name as created_by_name
       FROM order_status_history h
       LEFT JOIN users u ON u.id = h.created_by
       WHERE h.order_id = ?
       ORDER BY h.created_at DESC`,
      [req.params.id]
    );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/number/:orderNumber', (req, res) => {
  try {
    const order = dbGet(`SELECT * FROM orders WHERE order_number = ?`, [req.params.orderNumber]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const items = dbAll(`SELECT * FROM order_items WHERE order_id = ?`, [order.id]);
    return res.json({ ...order, items });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:userId/orders', (req, res) => {
  try {
    const orders = dbAll(`SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`, [req.params.userId]);
    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const placeOrder = (payload) => {
  const {
    user_id = null,
    customer_name,
    customer_email,
    customer_phone = null,
    shipping_address = {},
    items = [],
    payment_method = 'cash',
  } = payload;

  if (!customer_name || !customer_email || !items.length) {
    throw new Error('Missing required fields');
  }

  const parsedItems = items.map((it) => ({
    product_id: Number(it.product_id),
    quantity: Number(it.quantity),
    price: Number(it.price),
  }));
  if (parsedItems.some((it) => !it.product_id || it.quantity <= 0 || it.price < 0)) {
    throw new Error('Invalid order items');
  }

  parsedItems.forEach((it) => {
    const p = dbGet(`SELECT id, stock FROM products WHERE id = ?`, [it.product_id]);
    if (!p) throw new Error(`Product ${it.product_id} not found`);
    if (p.stock < it.quantity) throw new Error(`Insufficient stock for product ${it.product_id}`);
  });

  const normalizedPaymentMethod = normalizePaymentMethod(payment_method);
  const subtotal = parsedItems.reduce((s, it) => s + it.price * it.quantity, 0);
  const tax = Math.round(subtotal * 0.1 * 100) / 100;
  const total = subtotal + tax;
  const orderNumber = generateOrderNumber();

  const tx = db.transaction(() => {
    const orderInsert = dbRun(
      `INSERT INTO orders
      (order_number, user_id, customer_name, customer_email, customer_phone, shipping_address, total_amount, status, payment_method, payment_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        user_id,
        customer_name,
        customer_email,
        normalizePhone(customer_phone),
        JSON.stringify(shipping_address || {}),
        total,
        'pending',
        normalizedPaymentMethod,
        'pending',
      ]
    );
    const orderId = orderInsert.lastInsertRowid;

    parsedItems.forEach((it) => {
      dbRun(
        `INSERT INTO order_items (order_id, product_id, quantity, price, total) VALUES (?, ?, ?, ?, ?)`,
        [orderId, it.product_id, it.quantity, it.price, it.price * it.quantity]
      );
    });

    // Add order placed entry to credit history if user has a credit account
    if (user_id) {
      const last = dbGet(`SELECT balance FROM credit_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`, [user_id]);
      const currentBalance = Number(last?.balance || 0);
      const orderRef = orderNumber || `ORDER-${orderId}`;
      dbRun(
        `INSERT INTO credit_history (user_id, type, amount, balance, description, reference) VALUES (?, ?, ?, ?, ?, ?)`,
        [user_id, 'order_placed', 0, currentBalance, `Order placed (Order #${orderRef})`, orderRef]
      );
    }

    return { orderId, orderNumber, totalAmount: total };
  });

  return tx();
};

app.post('/api/orders', (req, res) => {
  try {
    const result = placeOrder(req.body || {});
    return res.status(201).json({ ...result, message: 'Order created successfully' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/orders/create-validated', (req, res) => {
  try {
    const body = req.body || {};
    const effectiveUserId = body.user_id || body.selected_customer_id || null;
    if (body.is_admin_order && !body.selected_customer_id) {
      return res.status(400).json({ error: 'Selected customer is required for admin order' });
    }

    const result = placeOrder({
      ...body,
      user_id: effectiveUserId,
      customer_phone: body.customer_phone,
      shipping_address: body.shipping_address || {},
      payment_method: body.payment_method || 'cash',
    });
    return res.status(201).json({ success: true, ...result, message: 'Order placed successfully' });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.put('/api/orders/:id/status', (req, res) => {
  try {
    const status = req.body?.status;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    const order = dbGet(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // record status change in history
    const createdBy = req.body?.created_by || null;
    const description = req.body?.description || null;
    dbRun(`INSERT INTO order_status_history (order_id, status, description, created_by) VALUES (?, ?, ?, ?)`, [req.params.id, status, description, createdBy]);

    // Update credit history with status change
    if (order.user_id) {
      const last = dbGet(`SELECT balance FROM credit_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`, [order.user_id]);
      const currentBalance = Number(last?.balance || 0);
      const orderRef = order.order_number || `ORDER-${order.id}`;
      const statusDescription = `Order status updated to ${status} (Order #${orderRef})`;
      dbRun(
        `INSERT INTO credit_history (user_id, type, amount, balance, description, reference) VALUES (?, ?, ?, ?, ?, ?)`,
        [order.user_id, 'status_update', 0, currentBalance, statusDescription, orderRef]
      );
    }

    if (status === 'confirmed' && Number(order.stock_applied || 0) === 0) {
      const items = dbAll(`SELECT * FROM order_items WHERE order_id = ?`, [req.params.id]);
      const tx = db.transaction(() => {
        items.forEach((item) => {
          const current = dbGet(`SELECT id, stock FROM products WHERE id = ?`, [item.product_id]);
          if (!current) throw new Error(`Product ${item.product_id} not found`);
          if (Number(current.stock) < Number(item.quantity)) {
            throw new Error(`Insufficient stock for product ${item.product_id}`);
          }
          const before = Number(current.stock);
          dbRun(`UPDATE products SET stock = stock - ? WHERE id = ?`, [item.quantity, item.product_id]);
          const after = dbGet(`SELECT stock FROM products WHERE id = ?`, [item.product_id])?.stock || 0;
          logStockLedger({
            productId: item.product_id,
            transactionType: 'SALE',
            quantityChange: -Number(item.quantity),
            previousBalance: before,
            newBalance: Number(after),
            referenceType: 'ORDER',
            referenceId: String(req.params.id),
            userId: order.user_id || null,
          });
        });

        if (order.payment_method === 'credit' && order.user_id && Number(order.credit_applied || 0) === 0) {
          const last = dbGet(`SELECT balance FROM credit_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`, [order.user_id]);
          const currentBalance = Number(last?.balance || 0);
          const nextBalance = currentBalance + Number(order.total_amount || 0);
          const orderRef = order.order_number || `ORDER-${order.id}`;
          dbRun(
            `INSERT INTO credit_history (user_id, type, amount, balance, description, reference) VALUES (?, ?, ?, ?, ?, ?)`,
            [order.user_id, 'given', Number(order.total_amount || 0), nextBalance, `Approved credit order (Order #${orderRef})`, orderRef]
          );
        }

        dbRun(
          `UPDATE orders
           SET status = ?, payment_status = ?, stock_applied = 1, credit_applied = CASE WHEN payment_method='credit' THEN 1 ELSE credit_applied END
           WHERE id = ?`,
          [status, order.payment_method === 'cash' ? 'paid' : 'pending', req.params.id]
        );
      });
      tx();
      return res.json({ success: true, applied: true });
    }

    dbRun(`UPDATE orders SET status = ? WHERE id = ?`, [status, req.params.id]);
    return res.json({ success: true, applied: false });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.get('/api/stats/orders', (_, res) => {
  try {
    const totalOrders = dbGet(`SELECT COUNT(*) AS count FROM orders`)?.count || 0;
    const totalRevenue = dbGet(`SELECT COALESCE(SUM(total_amount),0) AS total FROM orders`)?.total || 0;
    const pendingOrders = dbGet(`SELECT COUNT(*) AS count FROM orders WHERE status = 'pending'`)?.count || 0;
    return res.json({
      totalOrders,
      totalRevenue,
      pendingOrders,
      byStatus: { pending: pendingOrders },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:userId/credit-history', (req, res) => {
  try {
    const rows = dbAll(`SELECT * FROM credit_history WHERE user_id = ? ORDER BY created_at DESC`, [req.params.userId]);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:userId/credit-balance', (req, res) => {
  try {
    const row = dbGet(`SELECT balance FROM credit_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`, [req.params.userId]);
    return res.json({ balance: row?.balance || 0 });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/:userId/credit', (req, res) => {
  try {
    const { type, amount, description, reference } = req.body || {};
    if (!type || !['given', 'payment'].includes(type)) {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }
    const last = dbGet(`SELECT balance FROM credit_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`, [req.params.userId]);
    const current = Number(last?.balance || 0);
    const next = type === 'given' ? current + Number(amount) : current - Number(amount);
    const result = dbRun(
      `INSERT INTO credit_history (user_id, type, amount, balance, description, reference) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.userId, type, Number(amount), next, description || null, reference || null]
    );
    return res.status(201).json({
      success: true,
      balance: next,
      transaction: dbGet(`SELECT * FROM credit_history WHERE id = ?`, [result.lastInsertRowid]),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/credit/check-limit', (req, res) => {
  try {
    const customerId = req.body?.customer_id;
    const additionalAmount = Number(req.body?.additional_amount || 0);
    if (!customerId) return res.status(400).json({ error: 'customer_id is required' });
    const user = dbGet(`SELECT id, name, credit_limit FROM users WHERE id = ?`, [customerId]);
    if (!user) return res.status(404).json({ error: 'Customer not found' });
    const last = dbGet(`SELECT balance FROM credit_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`, [customerId]);
    const currentBalance = Number(last?.balance || 0);
    const creditLimit = Number(user.credit_limit || 0);
    const projected = currentBalance + additionalAmount;
    const allowed = creditLimit <= 0 ? true : projected <= creditLimit;
    return res.json({
      allowed,
      customer_id: user.id,
      customer_name: user.name,
      current_balance: currentBalance,
      additional_amount: additionalAmount,
      projected_balance: projected,
      credit_limit: creditLimit,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/credit/aging', (_, res) => {
  try {
    const report = dbAll(`
      SELECT
        u.id as customer_id,
        u.name as customer_name,
        u.email,
        u.phone,
        COALESCE(u.credit_limit, 0) as credit_limit,
        COALESCE((SELECT balance FROM credit_history ch WHERE ch.user_id = u.id ORDER BY created_at DESC LIMIT 1), 0) as current_balance,
        COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND julianday('now') - julianday(ch.created_at) <= 30), 0) as days_0_30,
        COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND julianday('now') - julianday(ch.created_at) > 30 AND julianday('now') - julianday(ch.created_at) <= 60), 0) as days_31_60,
        COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND julianday('now') - julianday(ch.created_at) > 60 AND julianday('now') - julianday(ch.created_at) <= 90), 0) as days_61_90,
        COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND julianday('now') - julianday(ch.created_at) > 90), 0) as days_over_90
      FROM users u
      WHERE u.role = 'customer'
      ORDER BY current_balance DESC, u.name ASC
    `);
    const summary = report.reduce(
      (acc, r) => {
        acc.total_outstanding += Number(r.current_balance || 0);
        acc.aging_0_30 += Number(r.days_0_30 || 0);
        acc.aging_31_60 += Number(r.days_31_60 || 0);
        acc.aging_61_90 += Number(r.days_61_90 || 0);
        acc.aging_over_90 += Number(r.days_over_90 || 0);
        if (Number(r.days_31_60 || 0) > 0 || Number(r.days_61_90 || 0) > 0 || Number(r.days_over_90 || 0) > 0) {
          acc.customers_overdue += 1;
        }
        return acc;
      },
      { total_outstanding: 0, customers_overdue: 0, aging_0_30: 0, aging_31_60: 0, aging_61_90: 0, aging_over_90: 0 }
    );
    return res.json({ report, summary });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/distributors', (_, res) => {
  try {
    return res.json(dbAll(`SELECT * FROM distributors ORDER BY name ASC`));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/distributors/:id', (req, res) => {
  try {
    const row = dbGet(`SELECT * FROM distributors WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Distributor not found' });
    return res.json(row);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/distributors', (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Distributor name is required' });
    const result = dbRun(
      `INSERT INTO distributors (name, salesman_name, contacts, address, products_supplied, order_day, delivery_day, payment_terms, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(b.name).trim(),
        b.salesman_name || null,
        b.contacts || null,
        b.address || null,
        b.products_supplied || null,
        b.order_day || null,
        b.delivery_day || null,
        b.payment_terms || 'Net 30',
        b.status || 'active',
      ]
    );
    return res.status(201).json(dbGet(`SELECT * FROM distributors WHERE id = ?`, [result.lastInsertRowid]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/distributors/:id', (req, res) => {
  try {
    const cur = dbGet(`SELECT * FROM distributors WHERE id = ?`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Distributor not found' });
    const b = req.body || {};
    dbRun(
      `UPDATE distributors
       SET name=?, salesman_name=?, contacts=?, address=?, products_supplied=?, order_day=?, delivery_day=?, payment_terms=?, status=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [
        b.name ?? cur.name,
        b.salesman_name ?? cur.salesman_name,
        b.contacts ?? cur.contacts,
        b.address ?? cur.address,
        b.products_supplied ?? cur.products_supplied,
        b.order_day ?? cur.order_day,
        b.delivery_day ?? cur.delivery_day,
        b.payment_terms ?? cur.payment_terms,
        b.status ?? cur.status,
        req.params.id,
      ]
    );
    return res.json(dbGet(`SELECT * FROM distributors WHERE id = ?`, [req.params.id]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/distributors/:id', (req, res) => {
  try {
    dbRun(`DELETE FROM distributors WHERE id = ?`, [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/purchase-orders', (req, res) => {
  try {
    let sql = `
      SELECT po.*, d.name as distributor_name
      FROM purchase_orders po
      LEFT JOIN distributors d ON d.id = po.distributor_id
      WHERE 1=1
    `;
    const params = [];
    if (req.query.distributor_id) {
      sql += ` AND po.distributor_id = ?`;
      params.push(req.query.distributor_id);
    }
    if (req.query.status) {
      sql += ` AND po.status = ?`;
      params.push(req.query.status);
    }
    if (req.query.start_date) {
      sql += ` AND date(po.created_at) >= date(?)`;
      params.push(req.query.start_date);
    }
    if (req.query.end_date) {
      sql += ` AND date(po.created_at) <= date(?)`;
      params.push(req.query.end_date);
    }
    sql += ` ORDER BY po.created_at DESC`;
    const rows = dbAll(sql, params).map((row) => {
      const items = dbAll(`SELECT * FROM purchase_order_items WHERE order_id = ?`, [row.id]);
      return { ...row, items };
    });
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/purchase-orders/:id', (req, res) => {
  try {
    const row = dbGet(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Purchase order not found' });
    const items = dbAll(`SELECT * FROM purchase_order_items WHERE order_id = ?`, [row.id]);
    return res.json({ ...row, items });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchase-orders', (req, res) => {
  try {
    const b = req.body || {};
    if (!b.distributor_id) return res.status(400).json({ error: 'distributor_id is required' });
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return res.status(400).json({ error: 'At least one item is required' });
    const total = items.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
    const poNumber = generatePONumber();
    const tx = db.transaction(() => {
      const header = dbRun(
        `INSERT INTO purchase_orders (po_number, distributor_id, total, status, notes, expected_delivery, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [poNumber, b.distributor_id, total, 'pending', b.notes || null, b.expected_delivery || null, b.created_by || null]
      );
      const orderId = header.lastInsertRowid;
      items.forEach((it) => {
        dbRun(
          `INSERT INTO purchase_order_items (order_id, product_id, product_name, quantity, received_quantity, uom, unit_price, total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            it.product_id || null,
            it.product_name || dbGet(`SELECT name FROM products WHERE id = ?`, [it.product_id])?.name || 'Unknown',
            Number(it.quantity || 0),
            0,
            it.uom || 'pcs',
            Number(it.unit_price || 0),
            Number(it.quantity || 0) * Number(it.unit_price || 0),
          ]
        );
      });
      return orderId;
    });
    const orderId = tx();
    return res.status(201).json({ success: true, id: orderId, po_number: poNumber });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/purchase-orders/:id', (req, res) => {
  try {
    const cur = dbGet(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Purchase order not found' });
    const b = req.body || {};
    dbRun(
      `UPDATE purchase_orders SET distributor_id=?, notes=?, expected_delivery=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [b.distributor_id ?? cur.distributor_id, b.notes ?? cur.notes, b.expected_delivery ?? cur.expected_delivery, b.status ?? cur.status, req.params.id]
    );
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/purchase-orders/:id/status', (req, res) => {
  try {
    const status = req.body?.status;
    if (!status) return res.status(400).json({ error: 'status is required' });
    dbRun(`UPDATE purchase_orders SET status = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?`, [status, req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchase-orders/:id/receive', (req, res) => {
  try {
    const order = dbGet(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Purchase order not found' });
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : [];
    const tx = db.transaction(() => {
      items.forEach((it) => {
        const item = dbGet(`SELECT * FROM purchase_order_items WHERE id = ? AND order_id = ?`, [it.item_id, req.params.id]);
        if (!item) return;
        const qty = Number(it.received_quantity || 0);
        if (qty <= 0) return;
        const newReceived = Number(item.received_quantity || 0) + qty;
        const unitPrice = Number(it.unit_price || item.unit_price || 0);
        dbRun(`UPDATE purchase_order_items SET received_quantity = ?, unit_price = ?, total = quantity * ? WHERE id = ?`, [
          newReceived,
          unitPrice,
          unitPrice,
          item.id,
        ]);
        if (item.product_id) {
          const before = dbGet(`SELECT stock FROM products WHERE id = ?`, [item.product_id])?.stock || 0;
          dbRun(`UPDATE products SET stock = stock + ? WHERE id = ?`, [qty, item.product_id]);
          const after = dbGet(`SELECT stock FROM products WHERE id = ?`, [item.product_id])?.stock || 0;
          logStockLedger({
            productId: item.product_id,
            transactionType: 'PURCHASE',
            quantityChange: qty,
            previousBalance: before,
            newBalance: after,
            referenceType: 'PO',
            referenceId: String(req.params.id),
            userId: b.received_by || null,
          });
        }
      });
      dbRun(
        `UPDATE purchase_orders SET status = 'received', invoice_number = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?`,
        [b.invoice_number || order.invoice_number || null, req.params.id]
      );
    });
    tx();
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/purchase-orders/:id', (req, res) => {
  try {
    dbRun(`DELETE FROM purchase_order_items WHERE order_id = ?`, [req.params.id]);
    dbRun(`DELETE FROM purchase_orders WHERE id = ?`, [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/purchase-returns', (req, res) => {
  try {
    let sql = `
      SELECT pr.*, d.name as distributor_name
      FROM purchase_returns pr
      LEFT JOIN distributors d ON d.id = pr.distributor_id
      WHERE 1=1
    `;
    const params = [];
    if (req.query.distributor_id) {
      sql += ` AND pr.distributor_id = ?`;
      params.push(req.query.distributor_id);
    }
    sql += ` ORDER BY pr.created_at DESC`;
    const rows = dbAll(sql, params).map((row) => ({ ...row, items: dbAll(`SELECT * FROM purchase_return_items WHERE return_id = ?`, [row.id]) }));
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/purchase-returns/:id', (req, res) => {
  try {
    const row = dbGet(`SELECT * FROM purchase_returns WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Purchase return not found' });
    return res.json({ ...row, items: dbAll(`SELECT * FROM purchase_return_items WHERE return_id = ?`, [row.id]) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchase-returns', (req, res) => {
  try {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : [];
    if (!b.distributor_id) return res.status(400).json({ error: 'distributor_id is required' });
    if (!items.length) return res.status(400).json({ error: 'At least one item is required' });
    const total = items.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
    const returnNumber = generateReturnNumber();
    const tx = db.transaction(() => {
      const head = dbRun(
        `INSERT INTO purchase_returns (return_number, distributor_id, total, reason, return_type, reference_po, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [returnNumber, b.distributor_id, total, b.reason || null, b.return_type || 'return', b.reference_po || null, b.created_by || null]
      );
      const returnId = head.lastInsertRowid;
      items.forEach((it) => {
        dbRun(
          `INSERT INTO purchase_return_items (return_id, product_id, product_name, quantity, uom, unit_price, total, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            returnId,
            it.product_id || null,
            it.product_name || dbGet(`SELECT name FROM products WHERE id = ?`, [it.product_id])?.name || 'Unknown',
            Number(it.quantity || 0),
            it.uom || 'pcs',
            Number(it.unit_price || 0),
            Number(it.quantity || 0) * Number(it.unit_price || 0),
            it.reason || b.reason || null,
          ]
        );
        if (it.product_id) {
          const before = dbGet(`SELECT stock FROM products WHERE id = ?`, [it.product_id])?.stock || 0;
          dbRun(`UPDATE products SET stock = stock - ? WHERE id = ?`, [Number(it.quantity || 0), it.product_id]);
          const after = dbGet(`SELECT stock FROM products WHERE id = ?`, [it.product_id])?.stock || 0;
          logStockLedger({
            productId: it.product_id,
            transactionType: 'PURCHASE_RETURN',
            quantityChange: -Number(it.quantity || 0),
            previousBalance: before,
            newBalance: after,
            referenceType: 'PURCHASE_RETURN',
            referenceId: String(returnId),
            userId: b.created_by || null,
          });
        }
      });
      return returnId;
    });
    const returnId = tx();
    return res.status(201).json({ success: true, id: returnId, return_number: returnNumber });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/purchase-returns/:id', (req, res) => {
  try {
    const cur = dbGet(`SELECT * FROM purchase_returns WHERE id = ?`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Purchase return not found' });
    const b = req.body || {};
    dbRun(
      `UPDATE purchase_returns SET reason=?, return_type=?, reference_po=?, updated_at=CURRENT_TIMESTAMP WHERE id = ?`,
      [b.reason ?? cur.reason, b.return_type ?? cur.return_type, b.reference_po ?? cur.reference_po, req.params.id]
    );
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/purchase-returns/:id', (req, res) => {
  try {
    dbRun(`DELETE FROM purchase_return_items WHERE return_id = ?`, [req.params.id]);
    dbRun(`DELETE FROM purchase_returns WHERE id = ?`, [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/stock-ledger', (req, res) => {
  try {
    let sql = `SELECT * FROM stock_ledger WHERE 1=1`;
    const params = [];
    if (req.query.product_id) {
      sql += ` AND product_id = ?`;
      params.push(req.query.product_id);
    }
    if (req.query.transaction_type) {
      sql += ` AND transaction_type = ?`;
      params.push(req.query.transaction_type);
    }
    if (req.query.start_date) {
      sql += ` AND date(created_at) >= date(?)`;
      params.push(req.query.start_date);
    }
    if (req.query.end_date) {
      sql += ` AND date(created_at) <= date(?)`;
      params.push(req.query.end_date);
    }
    sql += ` ORDER BY created_at DESC`;
    return res.json(dbAll(sql, params));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/stock-ledger/product/:productId', (req, res) => {
  try {
    return res.json(dbAll(`SELECT * FROM stock_ledger WHERE product_id = ? ORDER BY created_at DESC`, [req.params.productId]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/stock-ledger/batch/:batchNumber', (_, res) => {
  return res.json([]);
});

app.get('/api/stock-ledger/summary', (_, res) => {
  try {
    const rows = dbAll(`SELECT transaction_type, COUNT(*) as count FROM stock_ledger GROUP BY transaction_type`);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/stock/verify', (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const result = items.map((it) => {
      const product = dbGet(`SELECT id, name, stock FROM products WHERE id = ?`, [it.product_id]);
      if (!product) return { product_id: it.product_id, available: false, reason: 'NOT_FOUND' };
      return {
        product_id: it.product_id,
        product_name: product.name,
        available: Number(product.stock) >= Number(it.quantity || 0),
        in_stock: Number(product.stock),
        requested: Number(it.quantity || 0),
      };
    });
    return res.json({ items: result, allAvailable: result.every((x) => x.available) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/billing/customers/search', (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const like = `%${q}%`;
    const rows = q
      ? dbAll(`SELECT id, name, email, phone, address FROM users WHERE role='customer' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 20`, [like, like, like])
      : dbAll(`SELECT id, name, email, phone, address FROM users WHERE role='customer' ORDER BY name LIMIT 20`);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/billing/products/search', (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    let sql = `SELECT * FROM products WHERE 1=1`;
    const params = [];
    if (q) {
      sql += ` AND (name LIKE ? OR sku LIKE ? OR brand LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    sql += ` ORDER BY name LIMIT 50`;
    return res.json(dbAll(sql, params));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/bills/create', (req, res) => {
  try {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : [];
    if (!b.customer_name || !items.length) return res.status(400).json({ error: 'customer_name and items are required' });
    const subtotal = items.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    const paidAmount = Math.max(0, Number(b.paid_amount || 0));
    const totalAmount = Number(b.total_amount || subtotal);
    const creditAmount = Math.max(0, Number(b.credit_amount || Math.max(0, totalAmount - paidAmount)));
    const billNumber = generateBillNumber();
    const tx = db.transaction(() => {
      const header = dbRun(
        `INSERT INTO bills (bill_number, customer_id, customer_name, customer_email, customer_phone, customer_address, subtotal, discount_amount, total_amount, paid_amount, credit_amount, payment_method, payment_status, bill_type, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          billNumber,
          b.customer_id || null,
          b.customer_name,
          b.customer_email || null,
          normalizePhone(b.customer_phone) || null,
          b.customer_address || null,
          subtotal,
          Number(b.discount_amount || 0),
          totalAmount,
          paidAmount,
          creditAmount,
          b.payment_method || 'cash',
          b.payment_status || 'paid',
          b.bill_type || 'sales',
          b.created_by || null,
        ]
      );
      const billId = header.lastInsertRowid;
      items.forEach((it) => {
        dbRun(
          `INSERT INTO bill_items (bill_id, product_id, product_name, mrp, qty, unit, discount, amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            billId,
            it.product_id || null,
            it.product_name || dbGet(`SELECT name FROM products WHERE id = ?`, [it.product_id])?.name || 'Unknown',
            Number(it.mrp || 0),
            Number(it.qty || 0),
            it.unit || 'pcs',
            Number(it.discount || 0),
            Number(it.amount || 0),
          ]
        );
      });
      return billId;
    });
    const billId = tx();
    return res.status(201).json({ success: true, bill_id: billId, bill_number: billNumber });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills', (_, res) => {
  try {
    return res.json(dbAll(`SELECT * FROM bills ORDER BY created_at DESC`));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills/:id', (req, res) => {
  try {
    const id = req.params.id;
    const bill = dbGet(`SELECT * FROM bills WHERE id = ? OR bill_number = ?`, [id, id]);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    const items = dbAll(`SELECT * FROM bill_items WHERE bill_id = ?`, [bill.id]);
    return res.json({ ...bill, items });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/bills/:id/payment', (req, res) => {
  try {
    const cur = dbGet(`SELECT * FROM bills WHERE id = ?`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Bill not found' });
    dbRun(`UPDATE bills SET payment_status = ?, payment_method = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?`, [
      req.body?.payment_status || cur.payment_status,
      req.body?.payment_method || cur.payment_method,
      req.params.id,
    ]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills/stats/summary', (_, res) => {
  try {
    const totalBills = dbGet(`SELECT COUNT(*) as count FROM bills`)?.count || 0;
    const totalSales = dbGet(`SELECT COALESCE(SUM(total_amount),0) as total FROM bills WHERE bill_type = 'sales'`)?.total || 0;
    const totalPurchase = dbGet(`SELECT COALESCE(SUM(total_amount),0) as total FROM bills WHERE bill_type = 'purchase'`)?.total || 0;
    return res.json({ totalBills, totalSales, totalPurchase });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/offers', (_, res) => {
  try {
    return res.json(dbAll(`SELECT * FROM offers ORDER BY created_at DESC`));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/offers', (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.type) return res.status(400).json({ error: 'name and type are required' });
    const result = dbRun(
      `INSERT INTO offers
      (name, description, type, value, min_quantity, apply_to_category, apply_to_product, buy_product_id, buy_quantity, get_product_id, get_quantity, start_date, end_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.name,
        b.description || null,
        b.type,
        Number(b.value || 0),
        Number(b.min_quantity || 1),
        b.apply_to_category || null,
        b.apply_to_product || null,
        b.buy_product_id || null,
        Number(b.buy_quantity || 1),
        b.get_product_id || null,
        Number(b.get_quantity || 1),
        b.start_date || null,
        b.end_date || null,
        b.status || 'active',
      ]
    );
    return res.status(201).json(dbGet(`SELECT * FROM offers WHERE id = ?`, [result.lastInsertRowid]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/offers/:id', (req, res) => {
  try {
    const cur = dbGet(`SELECT * FROM offers WHERE id = ?`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Offer not found' });
    const b = req.body || {};
    dbRun(
      `UPDATE offers SET
       name=?, description=?, type=?, value=?, min_quantity=?, apply_to_category=?, apply_to_product=?, buy_product_id=?, buy_quantity=?, get_product_id=?, get_quantity=?, start_date=?, end_date=?, status=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`,
      [
        b.name ?? cur.name,
        b.description ?? cur.description,
        b.type ?? cur.type,
        Number(b.value ?? cur.value ?? 0),
        Number(b.min_quantity ?? cur.min_quantity ?? 1),
        b.apply_to_category ?? cur.apply_to_category,
        b.apply_to_product ?? cur.apply_to_product,
        b.buy_product_id ?? cur.buy_product_id,
        Number(b.buy_quantity ?? cur.buy_quantity ?? 1),
        b.get_product_id ?? cur.get_product_id,
        Number(b.get_quantity ?? cur.get_quantity ?? 1),
        b.start_date ?? cur.start_date,
        b.end_date ?? cur.end_date,
        b.status ?? cur.status,
        req.params.id,
      ]
    );
    return res.json(dbGet(`SELECT * FROM offers WHERE id = ?`, [req.params.id]));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/offers/:id', (req, res) => {
  try {
    dbRun(`DELETE FROM offers WHERE id = ?`, [req.params.id]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/product-versions/:internalId', (_, res) => res.json([]));
app.get('/api/product-versions/sku/:sku', (_, res) => res.json([]));
app.get('/api/uom-conversions/:productId', (_, res) => res.json([]));
app.post('/api/uom-conversions', (_, res) => res.status(201).json({ success: true }));
app.delete('/api/uom-conversions/:id', (_, res) => res.json({ success: true }));
app.get('/api/batch-stock', (_, res) => res.json([]));
app.post('/api/batch-stock', (_, res) => res.status(201).json({ success: true }));

// Root route
app.get('/', (_, res) => {
  res.json({
    success: true,
    message: 'BARMAN STORE API',
    status: 'running',
    version: '1.0.0',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BARMAN STORE API running on http://localhost:${PORT}`);
  console.log('Admin login: admin@admin.com / admin123');
});
