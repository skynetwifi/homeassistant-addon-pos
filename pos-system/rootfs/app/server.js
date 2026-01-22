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
  user: process.env.DB_USER || 'pos_user',
  password: process.env.DB_PASSWORD || 'password',
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

// Ensure database tables exist
async function ensureTables() {
  try {
    const connection = await pool.getConnection();

    // Users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(100),
        role VARCHAR(20) DEFAULT 'cashier',
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Products table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sku VARCHAR(50),
        barcode VARCHAR(50),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        cost_price DECIMAL(10,2) DEFAULT 0,
        profit_margin DECIMAL(10,2) DEFAULT 0,
        quantity INT DEFAULT 0,
        min_quantity INT DEFAULT 10,
        category VARCHAR(100) DEFAULT 'General',
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_barcode (barcode),
        INDEX idx_name (name)
      )
    `);

    // Sales table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        total_amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50) DEFAULT 'cash',
        status VARCHAR(20) DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_created_at (created_at)
      )
    `);

    // Sale Items table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        INDEX idx_sale_id (sale_id)
      )
    `);

    // Inventory History table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS inventory_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        change_type VARCHAR(50) NOT NULL,
        quantity_change INT NOT NULL,
        reason VARCHAR(255),
        user_id INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_product_id (product_id)
      )
    `);
    
    // Sessions table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token VARCHAR(128) PRIMARY KEY,
        user_id INT NOT NULL,
        data JSON,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_expires (expires_at)
      )
    `);

    // Migrations: Add user_id to sales if missing
    try {
      await connection.query('SELECT user_id FROM sales LIMIT 1');
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        console.log('[POS] Migrating sales table: adding user_id');
        await connection.query('ALTER TABLE sales ADD COLUMN user_id INT AFTER id');
        // Update old sales to likely default to admin (id 1) or NULL
        await connection.query('UPDATE sales SET user_id = 1 WHERE user_id IS NULL');
      }
    }

    // Migrations: Add status to sales if missing
    try {
      await connection.query('SELECT status FROM sales LIMIT 1');
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        console.log('[POS] Migrating sales table: adding status');
        await connection.query("ALTER TABLE sales ADD COLUMN status VARCHAR(20) DEFAULT 'completed' AFTER payment_method");
        await connection.query("UPDATE sales SET status = 'completed' WHERE status IS NULL");
      }
    }

    // Migrations: Add user_id to inventory_history if missing
    try {
      await connection.query('SELECT user_id FROM inventory_history LIMIT 1');
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        console.log('[POS] Migrating inventory_history table: adding user_id');
        await connection.query('ALTER TABLE inventory_history ADD COLUMN user_id INT AFTER reason');
      }
    }

    // Migrations: Add subtotal to sale_items if missing
    try {
      await connection.query('SELECT subtotal FROM sale_items LIMIT 1');
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        console.log('[POS] Migrating sale_items table: adding subtotal');
        await connection.query('ALTER TABLE sale_items ADD COLUMN subtotal DECIMAL(10,2) NOT NULL DEFAULT 0');
        await connection.query('UPDATE sale_items SET subtotal = quantity * unit_price WHERE subtotal = 0');
      }
    }

    // Migrations: Cleanup total_price from sale_items (legacy column causing errors)
    try {
      await connection.query('SELECT total_price FROM sale_items LIMIT 1');
      console.log('[POS] Migrating sale_items table: dropping legacy total_price');
      await connection.query('ALTER TABLE sale_items DROP COLUMN total_price');
    } catch (e) {
      // Ignore if column doesn't exist
    }

    // Migrations: Cleanup total_price from sales (legacy column causing errors)
    try {
      await connection.query('SELECT total_price FROM sales LIMIT 1');
      console.log('[POS] Migrating sales table: dropping legacy total_price');
      await connection.query('ALTER TABLE sales DROP COLUMN total_price');
    } catch (e) {
      // Ignore if column doesn't exist
    }


    // Migrations: Add user_id to inventory_history if missing
    try {
      await connection.query('SELECT user_id FROM inventory_history LIMIT 1');
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        console.log('[POS] Migrating inventory_history table: adding user_id');
        await connection.query('ALTER TABLE inventory_history ADD COLUMN user_id INT AFTER reason');
      }
    }
    
    // Migrations: Add change_type to inventory_history if missing
    try {
      await connection.query('SELECT change_type FROM inventory_history LIMIT 1');
    } catch (e) {
      if (e.code === 'ER_BAD_FIELD_ERROR') {
        console.log('[POS] Migrating inventory_history table: adding change_type');
        await connection.query("ALTER TABLE inventory_history ADD COLUMN change_type VARCHAR(50) NOT NULL DEFAULT 'manual' AFTER product_id");
      }
    }

    // Migrations: Ensure products table has all columns
    const productColumns = ['cost_price', 'profit_margin', 'min_quantity', 'category'];
    for (const col of productColumns) {
      try {
        await connection.query(`SELECT ${col} FROM products LIMIT 1`);
      } catch (e) {
        if (e.code === 'ER_BAD_FIELD_ERROR') {
          console.log(`[POS] Migrating products table: adding ${col}`);
          let type = 'DECIMAL(10,2) DEFAULT 0';
          if (col === 'min_quantity') type = 'INT DEFAULT 10';
          if (col === 'category') type = "VARCHAR(100) DEFAULT 'General'";
          await connection.query(`ALTER TABLE products ADD COLUMN ${col} ${type}`);
        }
      }
    }
    
    console.log('[POS] Database tables verified');
    connection.release();
  } catch (err) {
    console.error('[POS] ensureTables error:', err);
  }
}

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
      // If exists, ensure role is admin and update password if needed
      const user = rows[0];
      const currentHash = user.password_hash || '';
      const newHash = hashPassword(adminPass);

      // Always ensure role is admin for the main admin user
      if (user.role !== 'admin') {
        await connection.query("UPDATE users SET role = 'admin' WHERE id = ?", [user.id]);
        console.log('[POS] Admin role fixed for user');
      }

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

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function requireAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
  
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query(
      'SELECT * FROM sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())',
      [token]
    );
    connection.release();
    
    if (rows.length === 0) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized / Session Expired' });
    }
    
    req.user = rows[0].data;
    next();
  } catch (err) {
    console.error('Auth Error:', e
      status: 'error', 
      message: `Admin access required (Current role: ${req.user.role})` 
   
    return res.status(500).json({ status: 'error', message: 'Server error check auth' });
  }
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
    const userData = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role
    };

    const db = await pool.getConnection();
    await db.query(
      'INSERT INTO sessions (token, user_id, data, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
      [token, user.id, JSON.stringify(userData)]
    );
    db.release();

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

app.post('/api/logout', requireAuth, async (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  try {
    const connection = await pool.getConnection();
    await connection.query('DELETE FROM sessions WHERE token = ?', [token]);
    connection.release();
    res.json({ status: 'success', message: 'Logged out' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ status: 'success', data: req.user });
});

// ================== USER MANAGEMENT ENDPOINTS ==================

app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [users] = await connection.query('SELECT id, username, display_name, role, is_active, created_at FROM users ORDER BY created_at DESC');
    connection.release();
    res.json({ status: 'success', data: users });
  } catch (error) {
    console.error('[POS] Get Users Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, display_name, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ status: 'error', message: 'Username, password and role are required' });
    }

    const connection = await pool.getConnection();
    const [existing] = await connection.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      connection.release();
      return res.status(400).json({ status: 'error', message: 'Username already exists' });
    }

    const password_hash = hashPassword(password);
    await connection.query(
      'INSERT INTO users (username, password_hash, display_name, role, is_active, created_at) VALUES (?, ?, ?, ?, 1, NOW())',
      [username, password_hash, display_name || username, role]
    );
    connection.release();
    res.json({ status: 'success', message: 'User created successfully' });
  } catch (error) {
    console.error('[POS] Create User Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { password, display_name, role, is_active } = req.body;
    const userId = req.params.id;

    // Prevent deactivating own account
    if (is_active !== undefined && parseInt(userId) === req.user.id && (is_active === 0 || is_active === false || is_active === '0')) {
         return res.status(400).json({ status: 'error', message: 'Cannot deactivate your own account' });
    }

    const connection = await pool.getConnection();
    let query = 'UPDATE users SET display_name = ?, role = ?, is_active = ?';
    let params = [display_name, role, is_active ? 1 : 0];

    if (password) {
      query += ', password_hash = ?';
      params.push(hashPassword(password));
    }

    query += ' WHERE id = ?';
    params.push(userId);

    await connection.query(query, params);
    connection.release();
    res.json({ status: 'success', message: 'User updated successfully' });
  } catch (error) {
    console.error('[POS] Update User Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
   try {
    const userId = req.params.id;
    if (parseInt(userId) === req.user.id) {
        return res.status(400).json({ status: 'error', message: 'Cannot delete your own account' });
    }
    const connection = await pool.getConnection();
    await connection.query('DELETE FROM users WHERE id = ?', [userId]);
    connection.release();
    res.json({ status: 'success', message: 'User deleted permanently' });
   } catch (error) {
    console.error('[POS] Delete User Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error' });
   }
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
    
    // Auto-generate SKU if missing (using barcode or timestamp)
    const finalSku = sku || barcode || `SKU-${Date.now()}`;

    if (!name || !price) {
      return res.status(400).json({ status: 'error', message: 'Name and price required' });
    }

    const profit_margin = cost_price ? ((price - cost_price) / cost_price * 100).toFixed(2) : 0;
    const connection = await pool.getConnection();
    const [result] = await connection.query(
      `INSERT INTO products (sku, barcode, name, description, price, cost_price, profit_margin, quantity, min_quantity, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [finalSku, barcode || '', name, description || '', price, cost_price || 0, profit_margin, quantity || 0, min_quantity || 10, category || 'General']
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
    
    // Fetch existing product to merge data
    const connection = await pool.getConnection();
    const [rows] = await connection.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    
    if (rows.length === 0) {
      connection.release();
      return res.status(404).json({ status: 'error', message: 'Product not found' });
    }
    
    const current = rows[0];
    const newSku = sku !== undefined ? sku : current.sku;
    const newBarcode = barcode !== undefined ? barcode : current.barcode;
    const newName = name !== undefined ? name : current.name;
    const newDesc = description !== undefined ? description : current.description;
    const newPrice = price !== undefined ? price : current.price;
    const newCost = cost_price !== undefined ? cost_price : current.cost_price;
    const newQty = quantity !== undefined ? quantity : current.quantity;
    const newMinQty = min_quantity !== undefined ? min_quantity : current.min_quantity;
    const newCat = category !== undefined ? category : current.category;

    const profit_margin = newCost ? ((newPrice - newCost) / newCost * 100).toFixed(2) : 0;

    await connection.query(
      `UPDATE products SET sku=?, barcode=?, name=?, description=?, price=?, cost_price=?, profit_margin=?,
       quantity=?, min_quantity=?, category=? WHERE id=?`,
      [newSku, newBarcode, newName, newDesc, newPrice, newCost, profit_margin, newQty, newMinQty, newCat, req.params.id]
    );
    connection.release();

    res.json({ status: 'success', message: 'Product updated' });
  } catch (error) {
    console.error('[POS] Error:', error);
    res.status(500).json({ status: 'error', message: 'Server error: ' + error.message });
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

const https = require('https');
const http = require('http');
const fs = require('fs');

async function init() {
  await ensureTables();
  await ensureAdminUser();
  
  if (process.env.INGRESS_PORT || process.env.HASSIO_TOKEN) {
    // Ingress always needs HTTP on standard port (8099)
    // Sometimes INGRESS_PORT might not be set in dev, but if we are in HA, we should listen on PORT (8099) as HTTP
    http.createServer(app).listen(PORT, '0.0.0.0', () => {
      console.log(`[POS] Ingress/HTTP Server running on http://0.0.0.0:${PORT}`);
    });
  }

  // Try to find SSL certs in standard HA location for SECONDARY secure port (8100)
  try {
    if (fs.existsSync('/ssl/fullchain.pem') && fs.existsSync('/ssl/privkey.pem')) {
      const sslOptions = {
        cert: fs.readFileSync('/ssl/fullchain.pem'),
        key: fs.readFileSync('/ssl/privkey.pem')
      };
      
      const SECURE_PORT = 8100;
      https.createServer(sslOptions, app).listen(SECURE_PORT, '0.0.0.0', () => {
        console.log(`[POS] Secure Server running on https://0.0.0.0:${SECURE_PORT}`);
      });
    }
  } catch (e) {
    console.log('[POS] Could not load SSL certs, secure port not started', e);
  }

  if (!process.env.INGRESS_PORT && !process.env.HASSIO_TOKEN) {
     // Standalone development fallback
     app.listen(PORT, '0.0.0.0', () => {
      console.log(`[POS] Standalone Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

init();
