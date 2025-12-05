const mongoose = require('mongoose');

// Primary database connection (students, projects, location stats, etc.)
const db1 = mongoose.createConnection(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Secondary database connection (API logs, project reviews)
const db2 = mongoose.createConnection(process.env.MONGODB_URL2, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Connection event handlers for db1
db1.on('connected', () => {
  console.log('✅ MongoDB Primary (DB1) connected successfully');
});

db1.on('error', (err) => {
  console.error('❌ MongoDB Primary (DB1) connection error:', err);
});

db1.on('disconnected', () => {
  console.log('⚠️  MongoDB Primary (DB1) disconnected');
});

// Connection event handlers for db2
db2.on('connected', () => {
  console.log('✅ MongoDB Secondary (DB2) connected successfully');
});

db2.on('error', (err) => {
  console.error('❌ MongoDB Secondary (DB2) connection error:', err);
});

db2.on('disconnected', () => {
  console.log('⚠️  MongoDB Secondary (DB2) disconnected');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await db1.close();
  await db2.close();
  console.log('MongoDB connections closed through app termination');
  process.exit(0);
});

module.exports = { db1, db2 };
