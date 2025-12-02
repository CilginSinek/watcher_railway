/**
 * Input validation and sanitization utilities
 */

/**
 * Validate and sanitize campusId
 * @param {string} campusId - Campus ID from query
 * @returns {number|null} - Validated campus ID or null
 */
function validateCampusId(campusId) {
  if (!campusId || campusId === 'all') {
    return null;
  }
  
  const parsed = parseInt(campusId, 10);
  
  // Check if it's a valid positive integer
  if (isNaN(parsed) || parsed < 0 || parsed > 999999) {
    throw new Error('Invalid campusId: must be a positive integer');
  }
  
  return parsed;
}

/**
 * Validate and sanitize login parameter
 * @param {string} login - Login from params
 * @returns {string} - Validated login
 */
function validateLogin(login) {
  if (!login || typeof login !== 'string') {
    throw new Error('Invalid login: must be a non-empty string');
  }
  
  // Login should only contain alphanumeric characters, hyphens, and underscores
  // Typical 42 login format
  const loginRegex = /^[a-zA-Z0-9_-]{1,50}$/;
  
  if (!loginRegex.test(login)) {
    throw new Error('Invalid login format: only alphanumeric, hyphens, and underscores allowed');
  }
  
  return login.trim();
}

/**
 * Validate and sanitize search query
 * @param {string} search - Search query
 * @returns {string} - Sanitized search query
 */
function validateSearch(search) {
  if (!search || typeof search !== 'string') {
    return '';
  }
  
  // Remove special characters that could be used for injection
  // Allow only alphanumeric, spaces, hyphens, underscores, and dots
  const sanitized = search.replace(/[^a-zA-Z0-9\s._-]/g, '');
  
  // Limit length
  return sanitized.trim().substring(0, 100);
}

/**
 * Validate pool format
 * @param {string} pool - Pool in format "month-year"
 * @returns {object|null} - {month, year} or null
 */
function validatePool(year, month) {
  // Allow empty/null values - return null if both are empty
  if ((!month || month === '') && (!year || year === '')) {
    return null;
  }
  
  if (!month || typeof month !== 'string') {
    throw new Error('Invalid pool month: must be a non-empty string');
  }
  
  if (!year || typeof year !== 'string') {
    throw new Error('Invalid pool year: must be a non-empty string');
  }
  
  // Validate month (lowercase month name or number)
  const validMonths = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  
  const monthLower = month.toLowerCase();
  if (!validMonths.includes(monthLower) && !/^\d{1,2}$/.test(month)) {
    throw new Error('Invalid pool month');
  }
  
  // Validate year (4 digits, reasonable range)
  const yearNum = parseInt(year, 10);
  if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
    throw new Error('Invalid pool year: must be between 2000-2100');
  }
  
  return { month: monthLower, year: year };
}

/**
 * Validate grade
 * @param {string} grade - Grade value
 * @returns {string} - Validated grade
 */
function validateGrade(grade) {
  if (!grade || typeof grade !== 'string') {
    return null;
  }
  
  // Common 42 grades - adjust based on your actual grades
  const validGrades = [
    'Learner', 'Member', 'Basic Member', 'Cadet Member',
    'Hero Member', 'Ally', 'Unknown'
  ];
  
  // Allow any grade but sanitize
  const sanitized = grade.replace(/[^a-zA-Z\s]/g, '').trim();
  
  if (sanitized.length > 50) {
    throw new Error('Invalid grade: too long');
  }
  
  return sanitized;
}

/**
 * Validate sort field
 * @param {string} sort - Sort field
 * @returns {string} - Validated sort field
 */
function validateSort(sort) {
  const allowedFields = [
    'login', 'level', 'wallet', 'correction_point',
    'first_name', 'last_name', 'displayname', 'pool_month', 'pool_year',
    'project_count', 'cheat_count', 'godfather_count', 'children_count',
    'log_time', 'evo_performance', 'feedback_count', 'avg_rating'
  ];
  
  if (!sort || !allowedFields.includes(sort)) {
    return 'login'; // default
  }
  
  return sort;
}

/**
 * Validate sort order
 * @param {string} order - Sort order
 * @returns {string} - Validated order ('asc' or 'desc')
 */
function validateOrder(order) {
  if (order !== 'asc' && order !== 'desc') {
    return 'asc'; // default
  }
  
  return order;
}

/**
 * Validate pagination limit
 * @param {string|number} limit - Limit value
 * @returns {number} - Validated limit
 */
function validateLimit(limit) {
  const parsed = parseInt(limit, 10);
  
  if (isNaN(parsed) || parsed < 1) {
    return 50; // default
  }
  
  // Max limit to prevent resource exhaustion
  if (parsed > 500) {
    return 500;
  }
  
  return parsed;
}

/**
 * Validate pagination skip/offset
 * @param {string|number} skip - Skip value
 * @returns {number} - Validated skip
 */
function validateSkip(skip) {
  const parsed = parseInt(skip, 10);
  
  if (isNaN(parsed) || parsed < 0) {
    return 0; // default
  }
  
  // Max skip to prevent resource exhaustion
  if (parsed > 100000) {
    throw new Error('Invalid skip: maximum offset exceeded');
  }
  
  return parsed;
}

/**
 * Validate status filter
 * @param {string} status - Status value
 * @returns {string|null} - Validated status
 */
function validateStatus(status) {
  if (!status || status === 'all') {
    return null;
  }
  
  const validStatuses = [
    'active', 'alumni', 'staff', 'blackholed', 'transcender',
    'cadet', 'piscine', 'sinker', 'freeze', 'inactive', 'test'
  ];
  
  if (!validStatuses.includes(status)) {
    throw new Error('Invalid status filter');
  }
  
  return status;
}

/**
 * Validate active status
 * @param {string} active - Active status
 * @returns {boolean|null} - Validated boolean or null
 */
function validateActive(active) {
  if (!active) {
    return null;
  }
  
  if (active === 'true') {
    return true;
  }
  
  if (active === 'false') {
    return false;
  }
  
  throw new Error('Invalid active status: must be "true" or "false"');
}

module.exports = {
  validateCampusId,
  validateLogin,
  validateSearch,
  validatePool,
  validateGrade,
  validateSort,
  validateOrder,
  validateLimit,
  validateSkip,
  validateActive,
  validateStatus
};
