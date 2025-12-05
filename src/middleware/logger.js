const { EventLog } = require('../models');

/**
 * Log API requests to EventLog (DB2)
 * @param {object} req - Express request object
 * @param {string} login - User login
 * @param {number} campusId - Campus ID
 * @param {string} eventType - Type of event (e.g., 'api_request', 'dashboard_view', 'student_list', etc.)
 * @param {object} eventData - Additional event data (query params, route, etc.)
 */
async function logEvent(req, login, campusId, eventType, eventData = {}) {
  try {
    // Get client IP
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
                     || req.headers['x-real-ip'] 
                     || req.socket?.remoteAddress 
                     || req.connection?.remoteAddress
                     || 'unknown';

    // Get user agent
    const userAgent = req.headers['user-agent'] || 'unknown';

    await EventLog.create({
      login,
      campusId,
      eventType,
      eventData,
      ip: clientIp,
      userAgent,
      method: req.method,
      path: req.path || req.url,
      timestamp: new Date()
    });
  } catch (error) {
    // Silent fail - don't break the main request if logging fails
    console.error('EventLog error:', error.message);
  }
}

/**
 * Simplified logEvent for non-request contexts
 */
async function logEventSimple(login, campusId, eventType, eventData = {}) {
  try {
    await EventLog.create({
      login,
      campusId,
      eventType,
      eventData,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('EventLog error:', error.message);
  }
}

module.exports = { logEvent, logEventSimple };
