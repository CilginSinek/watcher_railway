const express = require('express');
const router = express.Router();
const { logEvent } = require('../middleware/logger');

/**
 * GET /api/user/me
 * Get current authenticated user information from 42 Intra
 */
router.get('/me', async (req, res) => {
  try {
    // req.user is populated by the auth middleware from 42 API
    
    // Log the event
    logEvent(
      req,
      req.user?.login || 'unknown',
      req.user?.campus_users?.[0]?.campus_id || 0,
      'user_info_view',
      { userId: req.user?.id }
    );
    
    res.json(req.user);
  } catch (error) {
    console.error('User fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user data',
      message: error.message
    });
  }
});

module.exports = router;
