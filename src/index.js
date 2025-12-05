require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authenticate = require('./middleware/auth');

// Import MongoDB connections
const { db1, db2 } = require('./models/db');

// Import models
require('./models');

// Import routes
const dashboardRoutes = require('./routes/dashboard');
const studentsRoutes = require('./routes/students');
const reviewsRoutes = require('./routes/reviews');
const userRoutes = require('./routes/user');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Handle OPTIONS requests for CORS preflight (no auth required)
app.options('*', (req, res) => {
  res.sendStatus(200);
});

// Apply authentication middleware to /api routes (skip OPTIONS and public review endpoints)
app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  // Skip auth for public review endpoints
  if (req.path === '/reviews/projectNames' || req.path === '/reviews/statuses') {
    return next();
  }
  authenticate(req, res, next);
});

// API Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/user', userRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found' 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
async function start() {
  try {
    // Start Express server
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
    
    // MongoDB connections are already established via require('./models/db')
    // Just wait for them to connect
    console.log('⏳ Waiting for MongoDB connections...');
    
    // Wait for both connections with timeout
    const connectionPromises = [
      new Promise((resolve, reject) => {
        if (db1.readyState === 1) return resolve();
        db1.once('connected', resolve);
        db1.once('error', reject);
      }),
      new Promise((resolve, reject) => {
        if (db2.readyState === 1) return resolve();
        db2.once('connected', resolve);
        db2.once('error', reject);
      })
    ];
    
    await Promise.all(connectionPromises).catch(err => {
      console.error('⚠️  Some MongoDB connections failed:', err.message);
      console.log('Server continues running with available connections');
    });
    
    console.log('✅ All database connections ready');
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await db1.close();
  await db2.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await db1.close();
  await db2.close();
  process.exit(0);
});

start();
