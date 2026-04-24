const mysql = require('mysql2');
require('dotenv').config();

let pool = createPool();

function createPool() {
  const newPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    ssl: { rejectUnauthorized: false }
  });

  // Handle pool-level errors
  newPool.on('connection', (connection) => {
    connection.on('error', (err) => {
      console.error('❌ DB Connection error:', err.message);
      if (
        err.code === 'PROTOCOL_CONNECTION_LOST' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT'                  // ← THIS was missing
      ) {
        console.log('🔄 Recreating pool...');
        pool = createPool();                       // ← recreate instead of just logging
      }
    });
  });

  // Test connection on startup
  newPool.getConnection((err, connection) => {
    if (err) {
      console.error('❌ Database connection failed:', err.message);
      setTimeout(() => { pool = createPool(); }, 5000); // retry after 5s
      return;
    }
    console.log('✅ Connected to MySQL database');
    connection.release();
  });

  return newPool;
}

// Keep-alive ping every 5 minutes
setInterval(() => {
  pool.query('SELECT 1', (err) => {
    if (err) {
      console.error('❌ Keep-alive ping failed:', err.message);
      console.log('🔄 Recreating pool after failed ping...');
      pool = createPool();                         // ← recreate on ping failure too
    } else {
      console.log('🏓 DB keep-alive ping successful');
    }
  });s
}, 5 * 60 * 1000);

// Export a promise pool getter so it always uses the latest pool
module.exports = {
  query: (...args) => pool.promise().query(...args),
  execute: (...args) => pool.promise().execute(...args),
  getConnection: () => pool.promise().getConnection(),
};