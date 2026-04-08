const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,        // ← prevents idle disconnection
  keepAliveInitialDelay: 10000, // ← ping every 10 seconds
  ssl: {
    rejectUnauthorized: false
  }
});

// Test pool connection on startup
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    return;
  }
  console.log('✅ Connected to MySQL database');
  connection.release();
});

// Handle pool-level errors (prevents server crash on lost connection)
pool.on('connection', (connection) => {
  connection.on('error', (err) => {
    console.error('❌ DB Connection error:', err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
      console.log('🔄 Reconnecting to database...');
    }
  });
});

// Keep-alive ping every 5 minutes to prevent Railway from killing idle connections
setInterval(() => {
  pool.query('SELECT 1', (err) => {
    if (err) {
      console.error('❌ Keep-alive ping failed:', err.message);
    } else {
      console.log('🏓 DB keep-alive ping successful');
    }
  });
}, 5 * 60 * 1000); // every 5 minutes

// Export promise pool
module.exports = pool.promise();