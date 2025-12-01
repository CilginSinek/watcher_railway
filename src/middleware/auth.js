const axios = require('axios');

/**
 * Middleware to verify 42 Intra authentication
 * Checks the Authorization Bearer token against https://api.intra.42.fr/v2/me
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'No Bearer token provided' 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with 42 Intra API
    const response = await axios.get('https://api.intra.42.fr/v2/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    // Attach user data to request object for use in routes
    req.user = response.data;
    next();
  } catch (error) {
    if (error.response) {
      // 42 API returned an error (invalid token, etc.)
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid or expired token' 
      });
    }
    
    // Network or other error
    console.error('Authentication error:', error.message);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Authentication service unavailable' 
    });
  }
}

module.exports = authenticate;
