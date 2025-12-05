const { EventLog } = require('../models');

/**
 * Log API requests to EventLog (DB2)
 * @param {string} login - User login
 * @param {number} campusId - Campus ID
 * @param {string} eventType - Type of event (e.g., 'api_request', 'dashboard_view', 'student_list', etc.)
 * @param {object} eventData - Additional event data (query params, route, etc.)
 */
async function logEvent(login, campusId, eventType, eventData = {}) {
  try {
    await EventLog.create({
      login,
      campusId,
      eventType,
      eventData,
      timestamp: new Date()
    });
  } catch (error) {
    // Silent fail - don't break the main request if logging fails
    console.error('EventLog error:', error.message);
  }
}

module.exports = { logEvent };
