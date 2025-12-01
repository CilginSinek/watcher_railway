require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/database');
const authenticate = require('./middleware/auth');

// Import models
require('./models');

// Import routes
const dashboardRoutes = require('./routes/dashboard');
const studentsRoutes = require('./routes/students');
const userRoutes = require('./routes/user');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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

// Apply authentication middleware to /api routes (skip OPTIONS)
app.use('/api', (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  authenticate(req, res, next);
});

// API Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/students', studentsRoutes);
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
    // Connect to Couchbase with Ottoman
    await db.connect();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await db.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await db.disconnect();
  process.exit(0);
});

start();
