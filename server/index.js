const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 5000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'barman-store.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, 'backups');
let db = new Database(DB_PATH);

// Restrict CORS when FRONTEND_ORIGIN is provided.
// In production, default to no cross-origin access unless explicitly allowed.
const corsOptions = {};
if (process.env.FRONTEND_ORIGIN) {
  // support comma-separated origins
  const origins = process.env.FRONTEND_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  corsOptions.origin = origins.length === 1 ? origins[0] : origins;
} else if (process.env.NODE_ENV === 'production') {
  corsOptions.origin = false;
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
const normalizeEmail = (email) => {
  const v = String(email || '').trim().toLowerCase();
  return v || null;
};

const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'barman-store-local-secret';
const base64UrlEncode = (value) => Buffer.from(value).toString('base64url');
const base64UrlDecode = (value) => Buffer.from(value, 'base64url').toString('utf8');
const signTokenPayload = (payloadEncoded) =>
  crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(payloadEncoded).digest('base64url');

const generateToken = (user = {}) => {
  const payload = {
    uid: Number(user.id || 0),
    role: String(user.role || 'customer'),
    iat: Date.now(),
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = signTokenPayload(encoded);
  return `${encoded}.${signature}`;
};

const verifyToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = signTokenPayload(encoded);
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    if (!payload || !Number(payload.uid)) return null;
    return payload;
  } catch (_) {
    return null;
  }
};

const getAuthUserFromRequest = (req) => {
  const header = String(req.headers.authorization || '');
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = sanitizeUser(dbGet(`SELECT * FROM users WHERE id = ?`, [payload.uid]));
  return user || null;
};

const requireAuth = (req, res, next) => {
  const user = getAuthUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.authUser = user;
  return next();
};

const requireAdmin = (req, res, next) => {
  const user = getAuthUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  req.authUser = user;
  return next();
};
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

const normalizeDistributorLedgerType = (type) => {
  const raw = String(type || '').trim().toLowerCase();
  if (raw === 'payment' || raw === 'paid') return 'payment';
  if (raw === 'credit' || raw === 'given' || raw === 'due') return 'credit';
  return 'credit';
};

const generateSku = (name, brand, content, mrp) => {
  const part = (v) => String(v || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const n = part(name).slice(0, 4).padEnd(4, 'X');
  const b = part(brand).slice(0, 4).padEnd(4, 'X');
  const c = part(content).slice(0, 2).padEnd(2, 'X');
  const p = String(Math.round(Number(mrp || 0))).replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `${n}${b}${c}${p}`;
};

const dbRun = (sql, params = []) => db.prepare(sql).run(params);
const dbGet = (sql, params = []) => db.prepare(sql).get(params);
const dbAll = (sql, params = []) => db.prepare(sql).all(params);

const PRODUCT_IMPORT_BATCH_TTL_MS = Number(process.env.PRODUCT_IMPORT_BATCH_TTL_MS || 30 * 60 * 1000);
const PRODUCT_IMPORT_HEADERS = [
  'id',
  'sku',
  'barcode',
  'name',
  'category',
  'brand',
  'content',
  'color',
  'uom',
  'price',
  'mrp',
  'stock',
  'expiry_date',
  'image',
  'description',
  'defaultDiscount',
  'discountType',
  'is_active',
];
const PRODUCT_IMPORT_SAMPLE = {
  id: '',
  sku: 'NESCBRAN250G0129',
  barcode: '',
  name: 'Sample Product',
  category: 'Groceries',
  brand: 'BrandX',
  content: '250g',
  color: '',
  uom: 'pcs',
  price: 99,
  mrp: 120,
  stock: 25,
  expiry_date: '',
  image: '',
  description: 'Sample product description',
  defaultDiscount: 0,
  discountType: 'fixed',
  is_active: 1,
};
const productImportBatches = new Map();

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toPositiveIntOrNull = (value) => {
  const n = toNumberOrNull(value);
  if (n === null) return null;
  return Math.trunc(n);
};

const normalizeDiscountType = (value) => {
  const raw = String(value || 'fixed').trim().toLowerCase();
  return raw === 'percentage' ? 'percentage' : 'fixed';
};

const normalizeHttpImageUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    return null;
  } catch (_) {
    return null;
  }
};

const normalizeBooleanish = (value, fallback = 1) => {
  if (value === null || value === undefined || value === '') return fallback;
  const raw = String(value).trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'active') return 1;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'inactive') return 0;
  const n = Number(raw);
  if (!Number.isNaN(n)) return n > 0 ? 1 : 0;
  return fallback;
};

const normalizeProductRecord = (row) => {
  if (!row) return null;
  const out = { ...row };
  out.defaultDiscount = Number(out.default_discount ?? 0);
  out.discountType = String(out.discount_type || 'fixed');
  out.is_active = Number(out.is_active ?? 1);
  return out;
};

const normalizeProductInput = (input = {}, current = null) => {
  const body = input || {};
  const existing = current || {};
  const name = body.name ?? existing.name ?? '';
  const category = body.category ?? existing.category ?? 'Groceries';
  const description = body.description ?? existing.description ?? null;
  const brand = body.brand ?? existing.brand ?? null;
  const content = body.content ?? existing.content ?? null;
  const color = body.color ?? existing.color ?? null;
  const priceRaw = body.price ?? existing.price ?? 0;
  const mrpRaw = body.mrp ?? existing.mrp ?? priceRaw;
  const uom = body.uom ?? existing.uom ?? 'pcs';
  const skuCandidate = body.sku ?? existing.sku ?? '';
  const image = body.image ?? existing.image ?? null;
  const stockRaw = body.stock ?? existing.stock ?? 0;
  const expiryDate = body.expiry_date ?? existing.expiry_date ?? null;
  const defaultDiscountRaw = body.defaultDiscount ?? body.default_discount ?? existing.default_discount ?? existing.defaultDiscount ?? 0;
  const discountTypeRaw = body.discountType ?? body.discount_type ?? existing.discount_type ?? existing.discountType ?? 'fixed';
  const isActiveRaw = body.is_active ?? existing.is_active ?? 1;

  const price = Number(priceRaw);
  const mrp = Number(mrpRaw);
  const stock = Number(stockRaw);
  const defaultDiscount = Number(defaultDiscountRaw || 0);
  const discountType = normalizeDiscountType(discountTypeRaw);
  const isActive = normalizeBooleanish(isActiveRaw, 1);
  const sku = String(skuCandidate || '').trim() || generateSku(name, brand, content, mrp || price);

  return {
    name: String(name || '').trim(),
    description: description === null || description === undefined ? null : String(description).trim() || null,
    brand: brand === null || brand === undefined ? null : String(brand).trim() || null,
    content: content === null || content === undefined ? null : String(content).trim() || null,
    color: color === null || color === undefined ? null : String(color).trim() || null,
    price,
    mrp: Number.isFinite(mrp) ? mrp : price,
    uom: String(uom || 'pcs').trim() || 'pcs',
    sku,
    image: normalizeHttpImageUrl(image),
    stock,
    category: String(category || '').trim() || 'Groceries',
    expiry_date: expiryDate ? String(expiryDate).slice(0, 10) : null,
    default_discount: defaultDiscount,
    discount_type: discountType,
    is_active: isActive,
  };
};

const validateProductPayload = (payload, { partial = false } = {}) => {
  const errors = [];
  if (!partial || payload.name !== undefined) {
    if (!String(payload.name || '').trim()) errors.push('name is required');
  }
  if (!partial || payload.category !== undefined) {
    if (!String(payload.category || '').trim()) errors.push('category is required');
  }
  if (!partial || payload.price !== undefined) {
    if (!Number.isFinite(Number(payload.price)) || Number(payload.price) <= 0) errors.push('price must be greater than 0');
  }
  if (!partial || payload.stock !== undefined) {
    if (!Number.isFinite(Number(payload.stock)) || Number(payload.stock) < 0) errors.push('stock must be 0 or more');
  }
  if (payload.mrp !== undefined && (!Number.isFinite(Number(payload.mrp)) || Number(payload.mrp) < 0)) {
    errors.push('mrp must be 0 or more');
  }
  if (payload.default_discount !== undefined && (!Number.isFinite(Number(payload.default_discount)) || Number(payload.default_discount) < 0)) {
    errors.push('defaultDiscount must be 0 or more');
  }
  if (payload.discount_type !== undefined) {
    const type = normalizeDiscountType(payload.discount_type);
    if (!['fixed', 'percentage'].includes(type)) errors.push('discountType must be fixed or percentage');
  }
  if (payload.expiry_date) {
    const expiry = String(payload.expiry_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) errors.push('expiry_date must be YYYY-MM-DD');
  }
  return errors;
};

const findExistingProductForImport = (row) => {
  const id = toPositiveIntOrNull(row.id);
  if (id) {
    const byId = dbGet(`SELECT * FROM products WHERE id = ?`, [id]);
    if (byId) return byId;
  }
  const sku = String(row.sku || '').trim();
  if (sku) {
    const bySku = dbGet(`SELECT * FROM products WHERE sku = ?`, [sku]);
    if (bySku) return bySku;
  }
  const barcode = String(row.barcode || '').trim();
  if (barcode) {
    const byBarcode = dbGet(`SELECT * FROM products WHERE barcode = ?`, [barcode]);
    if (byBarcode) return byBarcode;
  }
  return null;
};

const resolveOrCreateCategoryName = (inputCategory) => {
  const requested = String(inputCategory || '').trim() || 'Groceries';
  const existing = dbGet(`SELECT name FROM categories WHERE lower(name) = lower(?)`, [requested]);
  if (existing?.name) return existing.name;
  dbRun(`INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)`, [requested, 'Product category']);
  return requested;
};

const createImportBatchChecksum = (rows, mode, stockMode) => {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ rows, mode, stockMode }))
    .digest('hex');
};

const cleanupExpiredImportBatches = () => {
  const now = Date.now();
  for (const [batchId, batch] of productImportBatches.entries()) {
    if (batch.expiresAt <= now) productImportBatches.delete(batchId);
  }
};

const applyProductImportBatch = ({ batchId, checksum, authUser }) => {
  cleanupExpiredImportBatches();
  const normalizedBatchId = String(batchId || '').trim();
  const normalizedChecksum = String(checksum || '').trim();
  if (!normalizedBatchId || !normalizedChecksum) {
    const err = new Error('batch_id and checksum are required');
    err.status = 400;
    throw err;
  }

  const batch = productImportBatches.get(normalizedBatchId);
  if (!batch) {
    const err = new Error('Import batch not found or expired');
    err.status = 404;
    throw err;
  }
  if (batch.checksum !== normalizedChecksum) {
    const err = new Error('Batch checksum mismatch');
    err.status = 409;
    throw err;
  }
  if ((authUser?.id || null) !== (batch.createdBy || null) && authUser?.role !== 'admin') {
    const err = new Error('Not allowed to confirm this batch');
    err.status = 403;
    throw err;
  }

  const result = {
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
  };

  const tx = db.transaction(() => {
    batch.rows.forEach((row) => {
      try {
        const existing = row.action === 'update'
          ? dbGet(`SELECT * FROM products WHERE id = ?`, [row.matched_product_id])
          : null;
        if (row.action === 'update' && !existing) {
          throw new Error('Matched product no longer exists');
        }

        const payload = normalizeProductInput(row.payload, existing || null);
        const validationErrors = validateProductPayload(payload);
        if (validationErrors.length) {
          throw new Error(validationErrors.join('; '));
        }

        if (row.action === 'create') {
          dbRun(
            `INSERT INTO products
            (name, description, brand, content, color, price, mrp, uom, sku, barcode, image, stock, category, expiry_date, default_discount, discount_type, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              payload.name,
              payload.description,
              payload.brand,
              payload.content,
              payload.color,
              payload.price,
              payload.mrp,
              payload.uom,
              payload.sku,
              row.barcode,
              payload.image,
              payload.stock,
              payload.category,
              payload.expiry_date,
              payload.default_discount,
              payload.discount_type,
              payload.is_active,
            ]
          );
          dbRun(`INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)`, [payload.category, 'Product category']);
          result.created += 1;
        } else {
          dbRun(
            `UPDATE products SET
             name=?, description=?, brand=?, content=?, color=?, price=?, mrp=?, uom=?, sku=?, barcode=?, image=?, stock=?, category=?, expiry_date=?, default_discount=?, discount_type=?, is_active=?
             WHERE id=?`,
            [
              payload.name,
              payload.description,
              payload.brand,
              payload.content,
              payload.color,
              payload.price,
              payload.mrp,
              payload.uom,
              payload.sku,
              row.barcode,
              payload.image,
              payload.stock,
              payload.category,
              payload.expiry_date,
              payload.default_discount,
              payload.discount_type,
              payload.is_active,
              row.matched_product_id,
            ]
          );
          dbRun(`INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)`, [payload.category, 'Product category']);
          result.updated += 1;
        }
      } catch (err) {
        result.failed += 1;
        result.errors.push({ row: row.row, message: err.message });
        throw err;
      }
    });
  });

  tx();
  productImportBatches.delete(normalizedBatchId);
  dbRun(`UPDATE import_batches SET status = 'applied' WHERE batch_id = ?`, [normalizedBatchId]);

  return {
    batch_id: normalizedBatchId,
    checksum: normalizedChecksum,
    result,
  };
};

const parseProductFileToRows = ({ fileName, fileContentBase64 }) => {
  if (!fileName || !fileContentBase64) {
    throw new Error('file_name and file_content_base64 are required');
  }
  const ext = String(path.extname(fileName || '')).toLowerCase();
  const buffer = Buffer.from(String(fileContentBase64 || ''), 'base64');
  let workbook;
  if (ext === '.csv') {
    workbook = XLSX.read(buffer.toString('utf8'), { type: 'string' });
  } else if (ext === '.xlsx' || ext === '.xls') {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } else {
    throw new Error('Unsupported file format. Use .csv, .xlsx or .xls');
  }

  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error('No sheet found in file');
  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('No data rows found');
  return rows;
};

const toProductExportRow = (row) => ({
  id: row.id,
  sku: row.sku || '',
  barcode: row.barcode || '',
  name: row.name || '',
  category: row.category || '',
  brand: row.brand || '',
  content: row.content || '',
  color: row.color || '',
  uom: row.uom || 'pcs',
  price: Number(row.price || 0),
  mrp: Number(row.mrp || 0),
  stock: Number(row.stock || 0),
  expiry_date: row.expiry_date || '',
  image: row.image || '',
  description: row.description || '',
  defaultDiscount: Number(row.default_discount || 0),
  discountType: row.discount_type || 'fixed',
  is_active: Number(row.is_active ?? 1),
});

const closeDatabase = () => {
  try {
    if (db) db.close();
  } catch (_) {
    // ignore close failures
  }
};

const reopenDatabase = () => {
  closeDatabase();
  db = new Database(DB_PATH);
};

const ensureBackupDir = () => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
};

const makeBackupFileName = (tag = 'manual') => {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  return `barman-store-${tag}-${stamp}.db`;
};

const validateBackupFileName = (name) => /^[a-zA-Z0-9._-]+\.db$/i.test(String(name || ''));

const createDatabaseBackup = (tag = 'manual') => {
  ensureBackupDir();
  const fileName = makeBackupFileName(tag);
  const filePath = path.join(BACKUP_DIR, fileName);
  const escapedPath = filePath.replace(/'/g, "''");

  // Flush WAL changes before creating backup snapshot.
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (_) {
    // not fatal if journal mode is not WAL
  }

  db.exec(`VACUUM INTO '${escapedPath}'`);
  const stat = fs.statSync(filePath);
  return {
    file_name: fileName,
    size_bytes: stat.size,
    created_at: stat.mtime.toISOString(),
    path: filePath,
  };
};

const listDatabaseBackups = () => {
  ensureBackupDir();
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((name) => validateBackupFileName(name))
    .map((name) => {
      const filePath = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(filePath);
      return {
        file_name: name,
        size_bytes: stat.size,
        created_at: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return files;
};

const assertBackupIntegrity = (filePath) => {
  const checkDb = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    const row = checkDb.prepare('PRAGMA integrity_check').get();
    const result = String(row?.integrity_check || '').toLowerCase();
    if (result !== 'ok') {
      throw new Error(`Backup integrity check failed: ${result || 'unknown result'}`);
    }
  } finally {
    checkDb.close();
  }
};

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
      barcode TEXT,
      image TEXT,
      stock INTEGER DEFAULT 0,
      category TEXT NOT NULL,
      expiry_date DATE,
      default_discount REAL DEFAULT 0,
      discount_type TEXT DEFAULT 'fixed',
      is_active INTEGER DEFAULT 1,
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

    CREATE TABLE IF NOT EXISTS distributor_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      distributor_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      balance REAL DEFAULT 0,
      payment_mode TEXT,
      reference TEXT,
      bill_number TEXT,
      description TEXT,
      transaction_date DATE,
      source TEXT,
      source_id TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      notes TEXT,
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

    CREATE TABLE IF NOT EXISTS import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT UNIQUE NOT NULL,
      kind TEXT NOT NULL,
      created_by INTEGER,
      payload TEXT NOT NULL,
      checksum TEXT NOT NULL,
      status TEXT DEFAULT 'staged',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    );
  `);

  alterTableSafe(`ALTER TABLE products ADD COLUMN brand TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN content TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN color TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN mrp REAL`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN uom TEXT DEFAULT 'pcs'`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN sku TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN barcode TEXT`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN expiry_date DATE`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN default_discount REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN discount_type TEXT DEFAULT 'fixed'`);
  alterTableSafe(`ALTER TABLE products ADD COLUMN is_active INTEGER DEFAULT 1`);
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
  alterTableSafe(`ALTER TABLE credit_history ADD COLUMN transaction_date DATE`);
  alterTableSafe(`ALTER TABLE credit_history ADD COLUMN created_by INTEGER`);
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
  alterTableSafe(`ALTER TABLE bills ADD COLUMN notes TEXT`);
  alterTableSafe(`ALTER TABLE purchase_orders ADD COLUMN subtotal REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_orders ADD COLUMN tax_amount REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_orders ADD COLUMN total_amount REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_orders ADD COLUMN bill_number TEXT`);
  alterTableSafe(`ALTER TABLE distributor_ledger ADD COLUMN source TEXT`);
  alterTableSafe(`ALTER TABLE distributor_ledger ADD COLUMN source_id TEXT`);
  alterTableSafe(`ALTER TABLE distributor_ledger ADD COLUMN transaction_date DATE`);
  alterTableSafe(`ALTER TABLE distributor_ledger ADD COLUMN created_by INTEGER`);
  alterTableSafe(`ALTER TABLE distributor_ledger ADD COLUMN bill_number TEXT`);
  alterTableSafe(`ALTER TABLE purchase_order_items ADD COLUMN rate REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_order_items ADD COLUMN gst_rate REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_order_items ADD COLUMN discount_type TEXT DEFAULT 'percent'`);
  alterTableSafe(`ALTER TABLE purchase_order_items ADD COLUMN discount_value REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_order_items ADD COLUMN taxable_value REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_order_items ADD COLUMN tax_amount REAL DEFAULT 0`);
  alterTableSafe(`ALTER TABLE purchase_order_items ADD COLUMN line_total REAL DEFAULT 0`);

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
      token: generateToken(user),
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
    return res.status(201).json({ success: true, user: sanitizeUser(user), token: generateToken(user) });
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

app.post('/api/admin/backup/create', (_, res) => {
  try {
    const backup = createDatabaseBackup('manual');
    return res.status(201).json({ success: true, backup });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/backup/list', (_, res) => {
  try {
    return res.json(listDatabaseBackups());
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/backup/download/:fileName', (req, res) => {
  try {
    const { fileName } = req.params;
    if (!validateBackupFileName(fileName)) {
      return res.status(400).json({ error: 'Invalid backup file name' });
    }
    const filePath = path.join(BACKUP_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }
    return res.download(filePath, fileName);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/backup/restore', (req, res) => {
  try {
    const fileName = String(req.body?.file_name || '').trim();
    if (!validateBackupFileName(fileName)) {
      return res.status(400).json({ error: 'Valid file_name is required' });
    }

    const sourcePath = path.join(BACKUP_DIR, fileName);
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    assertBackupIntegrity(sourcePath);
    const preRestoreBackup = createDatabaseBackup('pre-restore');

    closeDatabase();
    fs.copyFileSync(sourcePath, DB_PATH);
    reopenDatabase();

    return res.json({
      success: true,
      message: 'Database restored successfully',
      restored_file: fileName,
      pre_restore_backup: preRestoreBackup.file_name,
    });
  } catch (error) {
    try {
      db.prepare('SELECT 1').get();
    } catch (_) {
      try {
        reopenDatabase();
      } catch (_) {
        // ignore recovery failures
      }
    }
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
    const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
    let sql = `SELECT * FROM products WHERE 1=1`;
    const params = [];
    if (!includeInactive) {
      sql += ` AND COALESCE(is_active, 1) = 1`;
    }
    if (qName) {
      sql += ` AND (name LIKE ? OR sku LIKE ? OR brand LIKE ? OR barcode LIKE ?)`;
      const like = `%${qName}%`;
      params.push(like, like, like, like);
    }
    if (qCategory) {
      sql += ` AND category = ?`;
      params.push(qCategory);
    }
    if (qLowStock === 'true') {
      sql += ` AND stock <= 10`;
    }
    sql += ` ORDER BY created_at DESC`;
    return res.json(dbAll(sql, params).map(normalizeProductRecord));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id(\\d+)/last-purchase', (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!productId) return res.status(400).json({ error: 'Invalid product id' });

    const row = dbGet(
      `SELECT
         poi.product_id,
         COALESCE(NULLIF(poi.rate, 0), poi.unit_price, 0) as rate,
         poi.unit_price,
         poi.gst_rate,
         poi.uom,
         po.distributor_id,
         d.name as distributor_name,
         po.po_number,
         po.created_at
       FROM purchase_order_items poi
       INNER JOIN purchase_orders po ON po.id = poi.order_id
       LEFT JOIN distributors d ON d.id = po.distributor_id
       WHERE poi.product_id = ?
       ORDER BY datetime(po.created_at) DESC, poi.id DESC
       LIMIT 1`,
      [productId]
    );

    if (!row) return res.json({ found: false, product_id: productId });
    return res.json({ found: true, ...row });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id(\\d+)', (req, res) => {
  try {
    const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
    const product = dbGet(
      `SELECT * FROM products WHERE id = ? ${includeInactive ? '' : 'AND COALESCE(is_active, 1) = 1'}`,
      [req.params.id]
    );
    if (!product) return res.status(404).json({ error: 'Product not found' });
    return res.json(normalizeProductRecord(product));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/category/:category', (req, res) => {
  try {
    const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
    const rows = dbAll(
      `SELECT * FROM products WHERE category = ? ${includeInactive ? '' : 'AND COALESCE(is_active, 1) = 1'} ORDER BY created_at DESC`,
      [req.params.category]
    );
    return res.json(rows.map(normalizeProductRecord));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', requireAdmin, (req, res) => {
  try {
    const body = normalizeProductInput(req.body || {});
    const errors = validateProductPayload(body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    const categoryName = resolveOrCreateCategoryName(body.category || 'Groceries');
    const result = dbRun(
      `INSERT INTO products
      (name, description, brand, content, color, price, mrp, uom, sku, barcode, image, stock, category, expiry_date, default_discount, discount_type, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.description || null,
        body.brand || null,
        body.content || null,
        body.color || null,
        Number(body.price || 0),
        body.mrp != null ? Number(body.mrp) : Number(body.price || 0),
        body.uom || 'pcs',
        body.sku,
        req.body?.barcode ? String(req.body.barcode).trim() : null,
        body.image || null,
        Number(body.stock || 0),
        categoryName,
        body.expiry_date || null,
        Number(body.default_discount || 0),
        body.discount_type || 'fixed',
        Number(body.is_active ?? 1),
      ]
    );
    return res.status(201).json(normalizeProductRecord(dbGet(`SELECT * FROM products WHERE id = ?`, [result.lastInsertRowid])));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id(\\d+)', requireAdmin, (req, res) => {
  try {
    const current = dbGet(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Product not found' });
    const body = normalizeProductInput(req.body || {}, current);
    const errors = validateProductPayload(body);
    if (errors.length) return res.status(400).json({ error: 'Validation failed', details: errors });
    const categoryName = resolveOrCreateCategoryName(body.category || current.category || 'Groceries');
    dbRun(
      `UPDATE products SET
       name=?, description=?, brand=?, content=?, color=?, price=?, mrp=?, uom=?, sku=?, barcode=?, image=?, stock=?, category=?, expiry_date=?, default_discount=?, discount_type=?, is_active=?
       WHERE id=?`,
      [
        body.name,
        body.description,
        body.brand,
        body.content,
        body.color,
        Number(body.price),
        Number(body.mrp),
        body.uom,
        body.sku,
        req.body?.barcode !== undefined ? String(req.body.barcode || '').trim() || null : current.barcode || null,
        body.image,
        Number(body.stock),
        categoryName,
        body.expiry_date,
        Number(body.default_discount || 0),
        body.discount_type || 'fixed',
        Number(body.is_active ?? 1),
        req.params.id,
      ]
    );
    return res.json(normalizeProductRecord(dbGet(`SELECT * FROM products WHERE id = ?`, [req.params.id])));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id(\\d+)', requireAdmin, (req, res) => {
  try {
    const current = dbGet(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Product not found' });
    dbRun(`UPDATE products SET is_active = 0 WHERE id = ?`, [req.params.id]);
    return res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/template', requireAdmin, (req, res) => {
  try {
    const format = String(req.query?.format || 'csv').trim().toLowerCase();
    const rows = [PRODUCT_IMPORT_SAMPLE];
    if (format === 'xlsx' || format === 'xls') {
      const sheet = XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Products');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="products-template.xlsx"');
      return res.send(buffer);
    }
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS }));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="products-template.csv"');
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/export', requireAdmin, (req, res) => {
  try {
    const format = String(req.query?.format || 'csv').trim().toLowerCase();
    const includeInactive = String(req.query?.include_inactive || '').trim() === 'true';
    const rows = dbAll(
      `SELECT * FROM products ${includeInactive ? '' : 'WHERE COALESCE(is_active,1)=1'} ORDER BY created_at DESC`
    ).map(toProductExportRow);
    if (format === 'xlsx' || format === 'xls') {
      const sheet = XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Products');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.xlsx"`);
      return res.send(buffer);
    }
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows, { header: PRODUCT_IMPORT_HEADERS }));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/products/import/preview', requireAdmin, (req, res) => {
  try {
    cleanupExpiredImportBatches();
    const mode = String(req.body?.mode || 'upsert').trim().toLowerCase();
    const stockMode = String(req.body?.stock_mode || 'replace').trim().toLowerCase();
    if (!['create_only', 'update_only', 'upsert'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Use create_only, update_only or upsert' });
    }
    if (!['replace', 'delta'].includes(stockMode)) {
      return res.status(400).json({ error: 'Invalid stock_mode. Use replace or delta' });
    }

    const rows = parseProductFileToRows({
      fileName: req.body?.file_name,
      fileContentBase64: req.body?.file_content_base64,
    });

    const normalizedRows = [];
    const preview = [];
    let creates = 0;
    let updates = 0;
    let skips = 0;
    let errors = 0;

    rows.forEach((row, index) => {
      const rowNo = index + 2;
      const existing = findExistingProductForImport(row);
      const action = existing ? 'update' : 'create';
      const normalized = normalizeProductInput(
        {
          ...row,
          stock: stockMode === 'delta' && existing
            ? Number(existing.stock || 0) + Number(row.stock || 0)
            : row.stock,
        },
        existing || null
      );
      const rowErrors = validateProductPayload(normalized);

      if (mode === 'create_only' && existing) rowErrors.push('Row matches existing product but mode is create_only');
      if (mode === 'update_only' && !existing) rowErrors.push('Row does not match an existing product but mode is update_only');

      if (rowErrors.length) {
        errors += 1;
        preview.push({ row: rowNo, action, status: 'error', errors: rowErrors, matched_product_id: existing?.id || null });
        return;
      }

      normalizedRows.push({
        row: rowNo,
        action,
        matched_product_id: existing?.id || null,
        payload: normalized,
        barcode: row.barcode !== undefined ? String(row.barcode || '').trim() || null : (existing?.barcode || null),
      });

      if (action === 'create') creates += 1;
      if (action === 'update') updates += 1;
      preview.push({ row: rowNo, action, status: 'ready', errors: [], matched_product_id: existing?.id || null });
    });

    if (!normalizedRows.length) {
      return res.status(400).json({
        error: 'No valid rows found in import file',
        preview,
      });
    }

    const batchId = crypto.randomUUID();
    const checksum = createImportBatchChecksum(normalizedRows, mode, stockMode);
    const createdAt = Date.now();
    const expiresAt = createdAt + PRODUCT_IMPORT_BATCH_TTL_MS;

    const batchPayload = {
      mode,
      stockMode,
      rows: normalizedRows,
      createdBy: req.authUser?.id || null,
      createdAt,
      expiresAt,
    };
    productImportBatches.set(batchId, {
      ...batchPayload,
      checksum,
    });
    dbRun(
      `INSERT OR REPLACE INTO import_batches (batch_id, kind, created_by, payload, checksum, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime(? / 1000, 'unixepoch'))`,
      [
        batchId,
        'products',
        req.authUser?.id || null,
        JSON.stringify(batchPayload),
        checksum,
        errors ? 'staged_with_errors' : 'staged',
        expiresAt,
      ]
    );

    const responsePayload = {
      batch_id: batchId,
      checksum,
      expires_at: new Date(expiresAt).toISOString(),
      summary: {
        creates,
        updates,
        skips,
        errors,
      },
      preview,
    };

    if (Boolean(req.body?.auto_confirm)) {
      const applied = applyProductImportBatch({
        batchId,
        checksum,
        authUser: req.authUser,
      });
      responsePayload.auto_confirmed = true;
      responsePayload.apply_result = applied.result;
      responsePayload.notification = {
        type: 'success',
        title: 'Product import completed',
        message: `Created ${applied.result.created}, updated ${applied.result.updated}, failed ${applied.result.failed}`,
      };
    }

    return res.json(responsePayload);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/api/products/import/confirm', requireAdmin, (req, res) => {
  try {
    const applied = applyProductImportBatch({
      batchId: req.body?.batch_id,
      checksum: req.body?.checksum,
      authUser: req.authUser,
    });
    return res.json({
      success: true,
      ...applied.result,
      notification: {
        type: 'success',
        title: 'Product import completed',
        message: `Created ${applied.result.created}, updated ${applied.result.updated}, failed ${applied.result.failed}`,
      },
    });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
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

app.get('/api/users/:userId/credit-history', requireAuth, (req, res) => {
  try {
    const requestUserId = Number(req.params.userId);
    const isAdmin = req.authUser?.role === 'admin';
    if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const rows = dbAll(`SELECT * FROM credit_history WHERE user_id = ? ORDER BY created_at DESC`, [req.params.userId]);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:userId/credit-balance', requireAuth, (req, res) => {
  try {
    const requestUserId = Number(req.params.userId);
    const isAdmin = req.authUser?.role === 'admin';
    if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const row = dbGet(`SELECT balance FROM credit_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`, [req.params.userId]);
    return res.json({ balance: row?.balance || 0 });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/:userId/credit', requireAdmin, (req, res) => {
  try {
    const { type, amount, description, reference, transactionDate } = req.body || {};
    if (!type || !['given', 'payment'].includes(type)) {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }
    const last = dbGet(`SELECT balance FROM credit_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`, [req.params.userId]);
    const current = Number(last?.balance || 0);
    const next = type === 'given' ? current + Number(amount) : current - Number(amount);
    const normalizedDate = transactionDate && /^\d{4}-\d{2}-\d{2}$/.test(String(transactionDate))
      ? String(transactionDate)
      : null;
    const result = dbRun(
      `INSERT INTO credit_history (user_id, type, amount, balance, description, reference, transaction_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.userId, type, Number(amount), next, description || null, reference || null, normalizedDate, req.authUser?.id || null]
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

app.get('/api/credit/ledger', requireAdmin, (req, res) => {
  try {
    const selectedUserId = Number(req.query.user_id || 0);
    const rows = selectedUserId
      ? dbAll(
        `SELECT ch.*, u.name AS customer_name
         FROM credit_history ch
         LEFT JOIN users u ON u.id = ch.user_id
         WHERE ch.user_id = ?
         ORDER BY datetime(COALESCE(ch.transaction_date, ch.created_at)) ASC, ch.id ASC`,
        [selectedUserId]
      )
      : dbAll(
        `SELECT ch.*, u.name AS customer_name
         FROM credit_history ch
         LEFT JOIN users u ON u.id = ch.user_id
         ORDER BY datetime(COALESCE(ch.transaction_date, ch.created_at)) ASC, ch.id ASC`
      );
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/credit/check-limit', requireAuth, (req, res) => {
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

app.get('/api/credit/aging', requireAdmin, (_, res) => {
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

const getDistributorLedgerRows = (req, distributorIdOverride = null) => {
  let sql = `
    SELECT dl.*, d.name as distributor_name,
           po.bill_number as po_bill_number,
           po.invoice_number as po_invoice_number,
           COALESCE(dl.bill_number, po.bill_number, po.invoice_number) as linked_bill_number
    FROM distributor_ledger dl
    LEFT JOIN distributors d ON d.id = dl.distributor_id
    LEFT JOIN purchase_orders po
      ON dl.source = 'purchase_order'
     AND CAST(dl.source_id AS INTEGER) = po.id
    WHERE 1=1
  `;
  const params = [];
  const distributorId = distributorIdOverride ?? req.query.distributor_id;
  if (distributorId) {
    sql += ` AND dl.distributor_id = ?`;
    params.push(distributorId);
  }
  if (req.query.type) {
    sql += ` AND LOWER(dl.type) = LOWER(?)`;
    params.push(req.query.type);
  }
  if (req.query.start_date) {
    sql += ` AND date(COALESCE(dl.transaction_date, dl.created_at)) >= date(?)`;
    params.push(req.query.start_date);
  }
  if (req.query.end_date) {
    sql += ` AND date(COALESCE(dl.transaction_date, dl.created_at)) <= date(?)`;
    params.push(req.query.end_date);
  }
  sql += ` ORDER BY datetime(COALESCE(dl.transaction_date, dl.created_at)) DESC, dl.id DESC`;
  if (req.query.limit) {
    const limit = Math.max(1, Number(req.query.limit) || 100);
    sql += ` LIMIT ${limit}`;
  }
  return dbAll(sql, params);
};

const createDistributorLedgerEntry = (distributorIdRaw, body = {}) => {
  const distributorId = Number(distributorIdRaw || body.distributor_id || body.user_id);
  if (!distributorId) throw new Error('distributor_id is required');

  const distributor = dbGet(`SELECT id FROM distributors WHERE id = ?`, [distributorId]);
  if (!distributor) throw new Error('Distributor not found');

  const rawAmount = Math.abs(Number(body.amount || 0));
  if (!rawAmount) throw new Error('amount must be greater than 0');

  const type = normalizeDistributorLedgerType(body.type || body.transaction_type);
  const signedAmount = type === 'payment' ? -rawAmount : rawAmount;
  const last = dbGet(
    `SELECT balance FROM distributor_ledger WHERE distributor_id = ? ORDER BY datetime(COALESCE(transaction_date, created_at)) DESC, id DESC LIMIT 1`,
    [distributorId]
  );
  const previousBalance = Number(last?.balance || 0);
  const nextBalance = previousBalance + signedAmount;
  const transactionDateRaw = body.transaction_date || body.transactionDate || null;
  const transactionDate = transactionDateRaw ? String(transactionDateRaw).slice(0, 10) : null;
  const paymentMode = body.payment_mode || body.mode || null;
  const billNumberRaw = body.bill_number ?? body.billNo ?? body.invoice_number;
  const billNumber = billNumberRaw === undefined || billNumberRaw === null ? null : String(billNumberRaw).trim() || null;

  const result = dbRun(
    `INSERT INTO distributor_ledger
    (distributor_id, type, amount, balance, payment_mode, reference, bill_number, description, transaction_date, source, source_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      distributorId,
      type,
      rawAmount,
      nextBalance,
      paymentMode,
      body.reference || null,
      billNumber,
      body.description || null,
      transactionDate,
      body.source || null,
      body.source_id || null,
      body.created_by || null,
    ]
  );

  return dbGet(
    `SELECT dl.*, d.name as distributor_name,
            po.bill_number as po_bill_number,
            po.invoice_number as po_invoice_number,
            COALESCE(dl.bill_number, po.bill_number, po.invoice_number) as linked_bill_number
     FROM distributor_ledger dl
     LEFT JOIN distributors d ON d.id = dl.distributor_id
     LEFT JOIN purchase_orders po
       ON dl.source = 'purchase_order'
      AND CAST(dl.source_id AS INTEGER) = po.id
     WHERE dl.id = ?`,
    [result.lastInsertRowid]
  );
};

app.get('/api/distributor-ledger', (req, res) => {
  try {
    return res.json(getDistributorLedgerRows(req));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/distributors/ledger', (req, res) => {
  try {
    return res.json(getDistributorLedgerRows(req));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/distributors/:id/ledger', (req, res) => {
  try {
    return res.json(getDistributorLedgerRows(req, req.params.id));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/distributors/:id/credit-history', (req, res) => {
  try {
    return res.json(getDistributorLedgerRows(req, req.params.id));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const handleDistributorLedgerCreate = (req, res, distributorId = null) => {
  try {
    const row = createDistributorLedgerEntry(distributorId, req.body || {});
    return res.status(201).json(row);
  } catch (error) {
    const message = String(error.message || '');
    if (message.includes('required') || message.includes('not found') || message.includes('greater than 0')) {
      return res.status(400).json({ error: message });
    }
    return res.status(500).json({ error: message });
  }
};

app.post('/api/distributor-ledger', (req, res) => handleDistributorLedgerCreate(req, res));
app.post('/api/distributors/ledger', (req, res) => handleDistributorLedgerCreate(req, res));
app.post('/api/distributors/:id/ledger', (req, res) => handleDistributorLedgerCreate(req, res, req.params.id));
app.post('/api/distributors/:id/transactions', (req, res) => handleDistributorLedgerCreate(req, res, req.params.id));
app.post('/api/distributors/:id/credit', (req, res) => handleDistributorLedgerCreate(req, res, req.params.id));

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

    const normalizedItems = items.map((it) => {
      const qty = Number(it.quantity || 0);
      const rate = Number(it.rate ?? it.unit_price ?? 0);
      const gross = qty * rate;
      const discountType = String(it.discount_type || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent';
      const discountValue = Number(it.discount_value || 0);
      const discountAmountRaw = discountType === 'percent' ? (gross * discountValue) / 100 : discountValue;
      const discountAmount = Math.max(0, Math.min(discountAmountRaw, gross));
      const taxableValue = Number(it.taxable_value ?? (gross - discountAmount));
      const gstRate = Number(it.gst_rate || 0);
      const taxAmount = Number(it.tax_amount ?? ((taxableValue * gstRate) / 100));
      const lineTotal = Number(it.line_total ?? (taxableValue + taxAmount));

      return {
        ...it,
        quantity: qty,
        rate,
        unit_price: rate,
        discount_type: discountType,
        discount_value: discountValue,
        taxable_value: taxableValue,
        gst_rate: gstRate,
        tax_amount: taxAmount,
        line_total: lineTotal
      };
    });

    const subtotal = Number(b.subtotal ?? b.taxable_value ?? normalizedItems.reduce((sum, it) => sum + Number(it.taxable_value || 0), 0));
    const taxAmount = Number(b.tax_amount ?? normalizedItems.reduce((sum, it) => sum + Number(it.tax_amount || 0), 0));
    const totalAmount = Number(
      b.total_amount ??
      b.grand_total ??
      b.total ??
      normalizedItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0)
    );

    const poNumber = generatePONumber();
    const tx = db.transaction(() => {
      const header = dbRun(
        `INSERT INTO purchase_orders (po_number, distributor_id, subtotal, tax_amount, total_amount, total, status, notes, expected_delivery, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [poNumber, b.distributor_id, subtotal, taxAmount, totalAmount, totalAmount, 'pending', b.notes || null, b.expected_delivery || null, b.created_by || null]
      );
      const orderId = header.lastInsertRowid;
      normalizedItems.forEach((it) => {
        dbRun(
          `INSERT INTO purchase_order_items (order_id, product_id, product_name, quantity, received_quantity, uom, unit_price, rate, gst_rate, discount_type, discount_value, taxable_value, tax_amount, line_total, total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            it.product_id || null,
            it.product_name || dbGet(`SELECT name FROM products WHERE id = ?`, [it.product_id])?.name || 'Unknown',
            Number(it.quantity || 0),
            0,
            it.uom || 'pcs',
            Number(it.unit_price || 0),
            Number(it.rate || it.unit_price || 0),
            Number(it.gst_rate || 0),
            it.discount_type || 'percent',
            Number(it.discount_value || 0),
            Number(it.taxable_value || 0),
            Number(it.tax_amount || 0),
            Number(it.line_total || 0),
            Number(it.line_total || 0),
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
    const items = Array.isArray(b.items) ? b.items : null;
    if (items && cur.status === 'received') {
      return res.status(400).json({ error: 'Cannot modify items for a received purchase order' });
    }

    const normalizeItems = (rawItems) => rawItems.map((it) => {
      const qty = Number(it.quantity || 0);
      const rate = Number(it.rate ?? it.unit_price ?? 0);
      const gross = qty * rate;
      const discountType = String(it.discount_type || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent';
      const discountValue = Number(it.discount_value || 0);
      const discountAmountRaw = discountType === 'percent' ? (gross * discountValue) / 100 : discountValue;
      const discountAmount = Math.max(0, Math.min(discountAmountRaw, gross));
      const taxableValue = Number(it.taxable_value ?? (gross - discountAmount));
      const gstRate = Number(it.gst_rate || 0);
      const taxAmount = Number(it.tax_amount ?? ((taxableValue * gstRate) / 100));
      const lineTotal = Number(it.line_total ?? (taxableValue + taxAmount));
      return {
        ...it,
        quantity: qty,
        rate,
        unit_price: rate,
        discount_type: discountType,
        discount_value: discountValue,
        taxable_value: taxableValue,
        gst_rate: gstRate,
        tax_amount: taxAmount,
        line_total: lineTotal
      };
    });

    if (items) {
      if (!items.length) return res.status(400).json({ error: 'At least one item is required' });
      const normalizedItems = normalizeItems(items);
      const subtotal = Number(b.subtotal ?? b.taxable_value ?? normalizedItems.reduce((sum, it) => sum + Number(it.taxable_value || 0), 0));
      const taxAmount = Number(b.tax_amount ?? normalizedItems.reduce((sum, it) => sum + Number(it.tax_amount || 0), 0));
      const totalAmount = Number(
        b.total_amount ??
        b.grand_total ??
        b.total ??
        normalizedItems.reduce((sum, it) => sum + Number(it.line_total || 0), 0)
      );
      const tx = db.transaction(() => {
        dbRun(
          `UPDATE purchase_orders
           SET distributor_id=?, notes=?, expected_delivery=?, status=?, subtotal=?, tax_amount=?, total_amount=?, total=?, updated_at=CURRENT_TIMESTAMP
           WHERE id=?`,
          [
            b.distributor_id ?? cur.distributor_id,
            b.notes ?? cur.notes,
            b.expected_delivery ?? cur.expected_delivery,
            b.status ?? cur.status,
            subtotal,
            taxAmount,
            totalAmount,
            totalAmount,
            req.params.id
          ]
        );
        dbRun(`DELETE FROM purchase_order_items WHERE order_id = ?`, [req.params.id]);
        normalizedItems.forEach((it) => {
          dbRun(
            `INSERT INTO purchase_order_items (order_id, product_id, product_name, quantity, received_quantity, uom, unit_price, rate, gst_rate, discount_type, discount_value, taxable_value, tax_amount, line_total, total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              req.params.id,
              it.product_id || null,
              it.product_name || dbGet(`SELECT name FROM products WHERE id = ?`, [it.product_id])?.name || 'Unknown',
              Number(it.quantity || 0),
              Number(it.received_quantity || 0),
              it.uom || 'pcs',
              Number(it.unit_price || 0),
              Number(it.rate || it.unit_price || 0),
              Number(it.gst_rate || 0),
              it.discount_type || 'percent',
              Number(it.discount_value || 0),
              Number(it.taxable_value || 0),
              Number(it.tax_amount || 0),
              Number(it.line_total || 0),
              Number(it.line_total || 0),
            ]
          );
        });
      });
      tx();
    } else {
      dbRun(
        `UPDATE purchase_orders
         SET distributor_id=?, notes=?, expected_delivery=?, status=?, subtotal=?, tax_amount=?, total_amount=?, total=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [
          b.distributor_id ?? cur.distributor_id,
          b.notes ?? cur.notes,
          b.expected_delivery ?? cur.expected_delivery,
          b.status ?? cur.status,
          Number(b.subtotal ?? cur.subtotal ?? 0),
          Number(b.tax_amount ?? cur.tax_amount ?? 0),
          Number(b.total_amount ?? cur.total_amount ?? cur.total ?? 0),
          Number(b.total_amount ?? cur.total_amount ?? cur.total ?? 0),
          req.params.id
        ]
      );
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/purchase-orders/:id/status', (req, res) => {
  try {
    const status = req.body?.status;
    const billNumberRaw = req.body?.bill_number ?? req.body?.invoice_number;
    const billNumber = billNumberRaw === undefined || billNumberRaw === null ? null : String(billNumberRaw).trim();
    if (!status) return res.status(400).json({ error: 'status is required' });
    const order = dbGet(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Purchase order not found' });

    if (status === 'confirmed') {
      dbRun(
        `UPDATE purchase_orders
         SET status = ?,
             bill_number = COALESCE(?, bill_number),
             invoice_number = COALESCE(?, invoice_number),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [status, billNumber || null, billNumber || null, req.params.id]
      );
    } else {
      dbRun(`UPDATE purchase_orders SET status = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?`, [status, req.params.id]);
    }
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

app.post('/api/stock/verify', requireAdmin, (req, res) => {
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

app.get('/api/billing/customers/search', requireAdmin, (req, res) => {
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

app.get('/api/billing/products/search', requireAdmin, (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();
    let sql = `SELECT * FROM products WHERE COALESCE(is_active, 1) = 1`;
    const params = [];
    if (q) {
      sql += ` AND (name LIKE ? OR sku LIKE ? OR brand LIKE ? OR barcode LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    sql += ` ORDER BY name LIMIT 50`;
    return res.json(dbAll(sql, params).map(normalizeProductRecord));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/bills/create', requireAdmin, (req, res) => {
  try {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return res.status(400).json({ error: 'items are required' });
    const billTypeRaw = String(b.bill_type || 'sales').trim().toLowerCase();
    const billType = billTypeRaw === 'purchase' ? 'purchase' : 'sales';

    const customerId = Number(b.customer_id || 0);
    if (!customerId) return res.status(400).json({ error: 'customer_id is required' });
    const customer = dbGet(
      `SELECT id, name, email, phone, address FROM users WHERE id = ? AND role = 'customer'`,
      [customerId]
    );
    if (!customer) return res.status(400).json({ error: 'customer not found' });

    const customerName = String(customer.name || '').trim();
    const customerEmail = normalizeEmail(customer.email);
    const customerPhone = normalizePhone(customer.phone);
    const customerAddress = customer.address ? String(customer.address).trim() : null;
    const productCache = new Map();
    const itemErrors = [];
    const sanitizedItems = items.map((it, index) => {
      const rowNo = index + 1;
      const productId = Number(it.product_id || 0);
      if (!productId) {
        itemErrors.push(`Item ${rowNo}: product_id is required`);
        return null;
      }
      if (!productCache.has(productId)) {
        productCache.set(
          productId,
          dbGet(`SELECT id, name, stock, is_active FROM products WHERE id = ?`, [productId]) || null
        );
      }
      const product = productCache.get(productId);
      if (!product) {
        itemErrors.push(`Item ${rowNo}: Product ${productId} not found`);
        return null;
      }
      if (Number(product.is_active ?? 1) !== 1) {
        itemErrors.push(`Item ${rowNo}: Product ${productId} is inactive`);
        return null;
      }
      const qty = Math.max(0, Number(it.qty || 0));
      const mrp = Math.max(0, Number(it.mrp || 0));
      const lineSubtotal = mrp * qty;
      const discount = Math.min(lineSubtotal, Math.max(0, Number(it.discount || 0)));
      const amount = Math.max(0, lineSubtotal - discount);
      const productName =
        String(it.product_name || '').trim() ||
        product.name ||
        'Unknown';
      return {
        product_id: Number(product.id),
        product_name: productName,
        mrp,
        qty,
        unit: String(it.unit || 'pcs'),
        discount,
        amount,
      };
    }).filter((it) => it && it.qty > 0 && it.amount >= 0);

    if (itemErrors.length) {
      return res.status(400).json({ error: 'Invalid bill items', details: itemErrors });
    }

    if (!sanitizedItems.length) return res.status(400).json({ error: 'At least one valid item is required' });
    const salesQtyByProduct = new Map();
    if (billType === 'sales') {
      sanitizedItems.forEach((it) => {
        salesQtyByProduct.set(
          it.product_id,
          Number(salesQtyByProduct.get(it.product_id) || 0) + Number(it.qty || 0)
        );
      });
      const stockErrors = [];
      for (const [productId, neededQty] of salesQtyByProduct.entries()) {
        const product = productCache.get(productId);
        const currentStock = Number(product?.stock || 0);
        if (currentStock < neededQty) {
          stockErrors.push(`Product ${productId}: requested ${neededQty}, in stock ${currentStock}`);
        }
      }
      if (stockErrors.length) {
        return res.status(400).json({
          error: 'Insufficient stock for one or more items',
          details: stockErrors,
        });
      }
    }
    const subtotal = sanitizedItems.reduce((sum, it) => sum + Number(it.amount || 0), 0);
    const billDiscount = Math.min(subtotal, Math.max(0, Number(b.discount_amount || 0)));
    const totalAmount = Math.max(0, subtotal - billDiscount);
    const paidAmount = Math.max(0, Math.min(totalAmount, Number(b.paid_amount || 0)));
    const creditAmount = Math.max(0, totalAmount - paidAmount);
    const paymentStatus = creditAmount > 0 ? 'pending' : 'paid';
    const createdBy = Number(req.authUser?.id || 0) || null;
    const billNumber = generateBillNumber();
    const tx = db.transaction(() => {
      const header = dbRun(
        `INSERT INTO bills (bill_number, customer_id, customer_name, customer_email, customer_phone, customer_address, subtotal, discount_amount, total_amount, paid_amount, credit_amount, payment_method, payment_status, bill_type, created_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          billNumber,
          Number(customer.id),
          customerName,
          customerEmail,
          customerPhone,
          customerAddress,
          subtotal,
          billDiscount,
          totalAmount,
          paidAmount,
          creditAmount,
          normalizePaymentMethod(b.payment_method),
          paymentStatus,
          billType,
          createdBy,
          b.notes ? String(b.notes) : null,
        ]
      );
      const billId = header.lastInsertRowid;
      sanitizedItems.forEach((it) => {
        dbRun(
          `INSERT INTO bill_items (bill_id, product_id, product_name, mrp, qty, unit, discount, amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            billId,
            it.product_id,
            it.product_name,
            it.mrp,
            it.qty,
            it.unit,
            it.discount,
            it.amount,
          ]
        );
      });
      if (billType === 'sales') {
        for (const [productId, neededQty] of salesQtyByProduct.entries()) {
          const before = Number(dbGet(`SELECT stock FROM products WHERE id = ?`, [productId])?.stock || 0);
          if (before < neededQty) {
            const err = new Error(`Insufficient stock for product ${productId}`);
            err.status = 400;
            throw err;
          }
          dbRun(`UPDATE products SET stock = stock - ? WHERE id = ?`, [neededQty, productId]);
          const after = Number(dbGet(`SELECT stock FROM products WHERE id = ?`, [productId])?.stock || 0);
          logStockLedger({
            productId,
            transactionType: 'out',
            quantityChange: -Number(neededQty || 0),
            previousBalance: before,
            newBalance: after,
            referenceType: 'bill',
            referenceId: String(billId),
            userId: createdBy,
            userName: req.authUser?.name || null,
            notes: `Sales bill ${billNumber}`,
          });
        }
      }
      return billId;
    });
    const billId = tx();
    return res.status(201).json({ success: true, bill_id: billId, bill_number: billNumber });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/bills', requireAdmin, (_, res) => {
  try {
    return res.json(dbAll(`SELECT * FROM bills ORDER BY created_at DESC`));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills/:id', requireAdmin, (req, res) => {
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

app.put('/api/bills/:id/payment', requireAdmin, (req, res) => {
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

app.get('/api/bills/stats/summary', requireAdmin, (_, res) => {
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

