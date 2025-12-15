const { Session, BannedUser } = require('../models');

/**
 * Middleware to verify session-based authentication
 * Checks the Authorization Bearer token against Session collection
 * Updates last_activity and tracks IPs
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

    const sessionToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Find session in database
    const session = await Session.findOne({ 
      sessionToken,
      expiresAt: { $gt: new Date() } // Check not expired
    });

    if (!session) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid or expired session' 
      });
    }

    // Check if user is banned
    const bannedRecord = await BannedUser.findOne({login: session.login, $or:[
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ] });

    if (bannedRecord) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `User is banned${bannedRecord.reason ? `: ${bannedRecord.reason}` : ''}`
      });
    }

    // Get client IP
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
                     || req.headers['x-real-ip'] 
                     || req.socket.remoteAddress 
                     || req.connection.remoteAddress;

    // Update last_activity and track IP
    const updates = {
      lastActivity: new Date()
    };

    // Add IP to usedIps if not already present
    if (clientIp && !session.usedIps.includes(clientIp)) {
      updates.$addToSet = { usedIps: clientIp };
    }

    await Session.updateOne(
      { sessionToken },
      updates
    );

    // Attach user data to request object for use in routes
    req.user = session.userData;
    req.session = {
      token: sessionToken,
      login: session.login,
      campusId: session.campusId
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Authentication service unavailable' 
    });
  }
}

module.exports = authenticate;
