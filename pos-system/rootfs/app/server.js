const express = require('express');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8099;
const INGRESS_PATH = process.env.INGRESS_PATH || '';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'core-mariadb',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'code9',
  password: process.env.DB_PASSWORD || 'cdma1987',
  database: process.env.DB_NAME || 'pos_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

console.log('[POS] Database Configuration:');
console.log(`  Host: ${process.env.DB_HOST || 'core-mariadb'}`);
console.log(`  Port: ${process.env.DB_PORT || 3306}`);
console.log(`  Database: ${process.env.DB_NAME || 'pos_db'}`);
console.log(`  Ingress Path: ${INGRESS_PATH}`);

// Ensure admin user exists on startup
async function ensureAdminUser() {
  try {
    const fs = require('fs');

    function readOption(key, fallback) {
      if (process.env[key.toUpperCase()]) return process.env[key.toUpperCase()];
      try {
        const raw = fs.readFileSync('/data/options.json', 'utf8');
        const opts = JSON.parse(raw || '{}');
        if (opts && typeof opts[key] !== 'undefined') return opts[key];
      } catch (e) {
        // ignore
      }
      return fallback;
    }

    const adminUser = readOption('admin_user', 'admin');
    const adminPass = readOption('admin_password', 'admin123');

    const connection = await pool.getConnection();
    const [rows] = await connection.query('SELECT * FROM users WHERE username = ?', [adminUser]);

    if (rows.length === 0) {
      const password_hash = hashPassword(adminPass);
      await connection.query(
        `INSERT INTO users (username, password_hash, display_name, role, is_active, created_at)
         VALUES (?, ?, ?, 'admin', 1, NOW())`,
        [adminUser, password_hash, 'Administrator']
      );
      console.log('[POS] Created admin user from add-on configuration');
    } else {
      // If exists, optionally update password if different
      const user = rows[0];
      const currentHash = user.password_hash || '';
      const newHash = hashPassword(adminPass);
      if (currentHash !== newHash) {
        await connection.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, user.id]);
        console.log('[POS] Admin password updated from add-on configuration');
      }
    }
    connection.release();
  } catch (err) {
    console.error('[POS] ensureAdminUser error:', err);
  }
}

// Session Store
const sessions = new Map();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function requireAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
  req.user = sessions.get(token);
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ status: 'error', message: 'Admin access required' });
  }
  next();
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ================== AUTH ENDPOINTS ==================

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ status: 'error', message: 'Username and password required' });
    }

    const connection = await pool.getConnection();
    const [users] = await connection.query(
      'SELECT * FROM users WHERE username = ? AND is_active = 1', [username]
    );
    connection.release();

    if (users.length === 0) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    const user = users[0];
    if (user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    const token = generateToken();
    sessions.set(token, {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role
    });

    res.json({
      status: 'success',
      data: {
        token,
        user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role }
      }
    });
  } catch (error) {
    console.error('[POS] Login error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

app.post('/api/logout', requireAuth, (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  sessions.delete(token);
  res.json({ status: 'success', message: 'Logged out' });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ status: 'success', data: req.user });
});

// ================== PRODUCT ENDPOINTS ==================

app.get('/api/products', requireAuth, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [products] = await connection.query('SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC');
    connection.release();
    res.json({ status: 'success', data: products });
  } catch (error) {
    console.error('[POS] Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

app.get('/api/products/barcode/:barcode', requireAuth, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [products] = await connection.query(
      'SELECT * FROM products WHERE barcode = ? AND is_active = 1', [req.params.barcode]
    );
    connection.release();

    if (products.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Product not found' });
    }
    res.json({ status: 'success', data: products[0] });
  } catch (error) {
    console.error('[POS] Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

app.post('/api/products', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { sku, barcode, name, description, price, cost_price, quantity, min_quantity, category } = req.body;
    if (!sku || !name || !price) {
      return res.status(400).json({ status: 'error', message: 'SKU, name, and price required' });
    }

    const profit_margin = cost_price ? ((price - cost_price) / cost_price * 100).toFixed(2) : 0;
    const connection = await pool.getConnection();
    const [result] = await connection.query(
      `INSERT INTO products (sku, barcode, name, description, price, cost_price, profit_margin, quantity, min_quantity, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sku, barcode, name, description, price, cost_price || 0, profit_margin, quantity || 0, min_quantity || 10, category]
    );
    connection.release();

    res.json({ status: 'success', data: { id: result.insertId }, message: 'Product created' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ status: 'error', message: 'SKU or barcode already exists' });
    }
    console.error('[POS] Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

app.put('/api/products/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { sku, barcode, name, description, price, cost_price, quantity, min_quantity, category } = req.body;
    const profit_margin = cost_price ? ((price - cost_price) / cost_price * 100).toFixed(2) : 0;

    const connection = await pool.getConnection();
    await connection.query(
      `UPDATE products SET sku=?, barcode=?, name=?, description=?, price=?, cost_price=?, profit_margin=?,
       quantity=?, min_quantity=?, category=? WHERE id=?`,
      [sku, barcode, name, description, price, cost_price || 0, profit_margin, quantity, min_quantity, category, req.params.id]
    );
    connection.release();

    res.json({ status: 'success', message: 'Product updated' });
  } catch (error) {
    console.error('[POS] Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

app.delete('/api/products/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    await connection.query('UPDATE products SET is_active = 0 WHERE id = ?', [req.params.id]);
    connection.release();
    res.json({ status: 'success', message: 'Product deleted' });
  } catch (error) {
    console.error('[POS] Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

// ================== SALES ENDPOINTS ==================

app.post('/api/sales', requireAuth, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { items, payment_method } = req.body;

    if (!items || items.length === 0) {
      throw new Error('No items in sale');
    }

    let total_amount = 0;
    for (const item of items) {
      const [products] = await connection.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [item.product_id]);
      if (products.length === 0) throw new Error(`Product ${item.product_id} not found`);
      const product = products[0];
      if (product.quantity < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);
      total_amount += parseFloat(product.price) * item.quantity;
    }

    const [saleResult] = await connection.query(
      `INSERT INTO sales (user_id, total_amount, payment_method, status) VALUES (?, ?, ?, 'completed')`,
      [req.user.id, total_amount, payment_method || 'cash']
    );
    const sale_id = saleResult.insertId;

    for (const item of items) {
      const [products] = await connection.query('SELECT * FROM products WHERE id = ?', [item.product_id]);
      const product = products[0];

      await connection.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)`,
        [sale_id, item.product_id, item.quantity, product.price, parseFloat(product.price) * item.quantity]
      );

      await connection.query('UPDATE products SET quantity = quantity - ? WHERE id = ?', [item.quantity, item.product_id]);

      await connection.query(
        `INSERT INTO inventory_history (product_id, change_type, quantity_change, reason, user_id) VALUES (?, 'sale', ?, 'Sale', ?)`,
        [item.product_id, -item.quantity, req.user.id]
      );
    }

    await connection.commit();
    res.json({ status: 'success', data: { sale_id, total_amount }, message: 'Sale completed' });
  } catch (error) {
    await connection.rollback();
    console.error('[POS] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  } finally {
    connection.release();
  }
});

app.get('/api/sales', requireAuth, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [sales] = await connection.query(
      `SELECT s.*, u.username as cashier_name FROM sales s LEFT JOIN users u ON s.user_id = u.id ORDER BY s.created_at DESC LIMIT 100`
    );
    connection.release();
    res.json({ status: 'success', data: sales });
  } catch (error) {
    console.error('[POS] Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

// ================== DASHBOARD ==================

app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [todaySales] = await connection.query(
      `SELECT COUNT(*) as transactions, COALESCE(SUM(total_amount), 0) as total FROM sales WHERE DATE(created_at) = CURDATE()`
    );
    const [productCount] = await connection.query('SELECT COUNT(*) as count FROM products WHERE is_active = 1');
    const [lowStock] = await connection.query('SELECT COUNT(*) as count FROM products WHERE quantity <= min_quantity AND is_active = 1');
    connection.release();

    res.json({
      status: 'success',
      data: {
        todays_transactions: todaySales[0].transactions,
        todays_sales: parseFloat(todaySales[0].total),
        total_products: productCount[0].count,
        low_stock_count: lowStock[0].count
      }
    });
  } catch (error) {
    console.error('[POS] Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pos-system', timestamp: new Date().toISOString() });
});

// Catch-all for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function init() {
  await ensureAdminUser();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[POS] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[POS] Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

init();
