const express = require('express');
const router = express.Router();
const { Student, Project, LocationStats, Feedback, Patronage } = require('../models');
const {
  validateCampusId,
  validateLogin,
  validateSearch,
  validatePool,
  validateGrade,
  validateSort,
  validateOrder,
  validateLimit,
  validateSkip,
  validateActive
} = require('../utils/validators');

/**
 * GET /api/students/pools?campusId={campusId}
 * Get students grouped by pools
 */
router.get('/pools', async (req, res) => {
  try {
    // Check if models are loaded
    if (!Student) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Database models not initialized'
      });
    }

    // Validate and sanitize inputs
    let validatedCampusId = null;
    try {
      validatedCampusId = validateCampusId(req.query.campusId);
    } catch (validationError) {
      return res.status(400).json({
        error: 'Bad Request',
        message: validationError.message
      });
    }
    
    const filter = validatedCampusId !== null ? { campusId: validatedCampusId } : {};
    
    let students = [];
    try {
      const result = await Student.find(filter);
      students = result?.rows || [];
    } catch (dbError) {
      console.error('Error fetching students for pools:', dbError.message);
      return res.status(500).json({ 
        error: 'Failed to fetch pools data',
        message: 'Database query failed'
      });
    }
    
    const poolCount = {};
    students.forEach(s => {
      if (s.pool_month && s.pool_year) {
        const key = `${s.pool_month}-${s.pool_year}`;
        poolCount[key] = (poolCount[key] || 0) + 1;
      }
    });
    
    const pools = Object.entries(poolCount).map(([key, count]) => {
      const [month, year] = key.split('-');
      return {
        month,
        year,
        count
      };
    });
    
    res.json({ pools });
  } catch (error) {
    console.error('Pools fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch pools data',
      message: error.message
    });
  }
});

/**
 * GET /api/students/:login
 * Get specific student by login with full details
 */
router.get('/:login', async (req, res) => {
  try {
    // Check if models are loaded
    if (!Student || !Project || !LocationStats || !Feedback || !Patronage) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Database models not initialized'
      });
    }

    // Validate and sanitize login
    let validatedLogin;
    try {
      validatedLogin = validateLogin(req.params.login);
    } catch (validationError) {
      return res.status(400).json({
        error: 'Bad Request',
        message: validationError.message
      });
    }
    
    // Get student
    const student = await Student.findOne({ login: validatedLogin });
    
    if (!student) {
      return res.status(404).json({ 
        error: 'Student not found' 
      });
    }
    
    // Get projects
    let projects = [];
    try {
      const result = await Project.find({ login: validatedLogin });
      projects = result?.rows || [];
    } catch (dbError) {
      console.error('Error fetching projects:', dbError.message);
      projects = [];
    }
    const projectsData = projects.map(p => ({
      project: p.project, // DB uses 'project' field
      login: p.login,
      score: p.score, // DB uses 'score' not 'final_mark'
      status: p.status,
      date: p.date,
      campusId: p.campusId
    }));
    
    // Get location stats
    let locationStats = [];
    try {
      const result = await LocationStats.find({ login: validatedLogin });
      locationStats = result?.rows || [];
      console.log(`LocationStats for ${validatedLogin}:`, locationStats.length, 'found');
      if (locationStats.length > 0) {
        console.log('First location sample:', JSON.stringify(locationStats[0]));
      }
    } catch (dbError) {
      console.error('Error fetching location stats:', dbError.message);
      locationStats = [];
    }
    const locationData = locationStats.map(l => ({
      id: l.id,
      login: l.login,
      begin_at: l.begin_at,
      end_at: l.end_at,
      campusId: l.campusId,
      host: l.host
    }));
    
    // Get feedbacks and calculate averages
    let feedbacks = [];
    try {
      const result = await Feedback.find({ login: validatedLogin });
      feedbacks = result?.rows || [];
    } catch (dbError) {
      console.error('Error fetching feedbacks:', dbError.message);
      feedbacks = [];
    }
    
    // Calculate feedback averages
    const feedbackCount = feedbacks.length;
    const avgRating = feedbackCount > 0 
      ? feedbacks.reduce((sum, f) => sum + (f.rating || 0), 0) / feedbackCount 
      : 0;
    
    // Calculate logTimes (location history with duration)
    const logTimes = locationStats.map(l => {
      if (!l.begin_at) return { date: null, duration: 0 };
      
      const beginAt = new Date(l.begin_at);
      const endAt = l.end_at ? new Date(l.end_at) : new Date();
      
      // Check for valid dates
      if (isNaN(beginAt.getTime()) || isNaN(endAt.getTime())) {
        return { date: l.begin_at, duration: 0 };
      }
      
      const duration = Math.floor((endAt - beginAt) / 60000); // minutes
      return {
        date: l.begin_at,
        duration: duration > 0 ? duration : 0
      };
    });
    
    // Calculate attendanceDays (average hours per day of week)
    const dayAttendance = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    locationStats.forEach(l => {
      const beginAt = new Date(l.begin_at);
      const endAt = l.end_at ? new Date(l.end_at) : new Date();
      const hours = (endAt - beginAt) / (1000 * 60 * 60);
      const day = dayNames[beginAt.getDay()];
      
      // Ensure day exists in dayAttendance
      if (dayAttendance[day]) {
        dayAttendance[day].push(hours);
      }
    });
    
    const attendanceDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
      day,
      avgHours: dayAttendance[day].length > 0 
        ? dayAttendance[day].reduce((sum, h) => sum + h, 0) / dayAttendance[day].length 
        : 0
    }));
    
    // Get patronage (as patron - children)
    let children = [];
    try {
      const result = await Patronage.find({ godfather_login: validatedLogin });
      const asPatron = result?.rows || [];
      console.log(`Patronage children for ${validatedLogin}:`, asPatron.length, 'found');
      if (asPatron.length > 0) {
        console.log('First patronage sample:', JSON.stringify(asPatron[0]));
      }
      children = asPatron.map(p => ({ login: p.user_login }));
    } catch (dbError) {
      console.error('Error fetching patronage children:', dbError.message);
      children = [];
    }
    
    // Get patronage (as patroned - godfathers)
    let godfathers = [];
    try {
      const result = await Patronage.find({ user_login: validatedLogin });
      const asPatroned = result?.rows || [];
      console.log(`Patronage godfathers for ${validatedLogin}:`, asPatroned.length, 'found');
      if (asPatroned.length > 0) {
        console.log('First godfather sample:', JSON.stringify(asPatroned[0]));
      }
      godfathers = asPatroned.map(p => ({ login: p.godfather_login }));
    } catch (dbError) {
      console.error('Error fetching patronage godfathers:', dbError.message);
      godfathers = [];
    }
    
    res.json({student: {
      id: student.id,
      login: student.login,
      displayname: student.displayname,
      email: student.email,
      image: student.image,
      correction_point: student.correction_point,
      wallet: student.wallet,
      location: student.location,
      'active?': student['active?'],
      'alumni?': student['alumni?'],
      is_piscine: student.is_piscine,
      is_trans: student.is_trans,
      grade: student.grade,
      project_count: projects.length,
      projects: projectsData,
      patronage: {
        godfathers,
        children
      },
      feedbackCount,
      avgRating: Math.round(avgRating * 100) / 100,
      logTimes,
      attendanceDays
    }});
  } catch (error) {
    console.error('Student fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch student',
      message: error.message
    });
  }
});

/**
 * GET /api/students
 * Get list of all students with filters and pagination
 */
router.get('/', async (req, res) => {
  try {
    // Check if models are loaded
    if (!Student) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Database models not initialized'
      });
    }

    // Validate and sanitize all inputs
    let validatedCampusId, validatedSearch, validatedPool, validatedGrade, validatedActive;
    let validatedSort, validatedOrder, validatedLimit, validatedSkip;
    
    try {
      validatedCampusId = validateCampusId(req.query.campusId);
      validatedSearch = validateSearch(req.query.search);
      validatedPool = validatePool(req.query.pool);
      validatedGrade = validateGrade(req.query.grade);
      validatedActive = validateActive(req.query.active);
      validatedSort = validateSort(req.query.sort);
      validatedOrder = validateOrder(req.query.order);
      validatedLimit = validateLimit(req.query.limit);
      validatedSkip = validateSkip(req.query.skip);
    } catch (validationError) {
      return res.status(400).json({
        error: 'Bad Request',
        message: validationError.message
      });
    }
    
    // Build filter
    const filter = {};
    
    if (validatedCampusId !== null) {
      filter.campusId = validatedCampusId;
    }
    
    if (validatedPool) {
      filter.pool_month = validatedPool.month;
      filter.pool_year = validatedPool.year;
    }
    
    if (validatedGrade) {
      filter.grade = validatedGrade;
    }
    
    if (validatedActive !== null) {
      filter["active?"] = validatedActive;
    }
    
    // Get total count
    let allStudents = [];
    try {
      const result = await Student.find(filter);
      allStudents = result?.rows || [];
    } catch (dbError) {
      console.error('Error fetching students:', dbError.message);
      return res.status(500).json({ 
        error: 'Failed to fetch students',
        message: 'Database query failed'
      });
    }
    
    // Apply search filter if needed (already sanitized)
    let filteredStudents = allStudents;
    if (validatedSearch) {
      const searchLower = validatedSearch.toLowerCase();
      filteredStudents = allStudents.filter(s => 
        s.login?.toLowerCase().includes(searchLower) ||
        s.first_name?.toLowerCase().includes(searchLower) ||
        s.last_name?.toLowerCase().includes(searchLower)
      );
    }
    
    const total = filteredStudents.length;
    
    // Sort (validated sort field and order)
    filteredStudents.sort((a, b) => {
      let aVal = a[validatedSort];
      let bVal = b[validatedSort];
      
      // Handle null/undefined
      if (aVal === null || aVal === undefined) aVal = typeof bVal === 'number' ? -Infinity : '';
      if (bVal === null || bVal === undefined) bVal = typeof aVal === 'number' ? -Infinity : '';
      
      // String comparison (case-insensitive)
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toString().toLowerCase();
      }
      
      // Number comparison
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return validatedOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      // Default comparison
      if (validatedOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    // Paginate (validated limit and skip)
    const students = filteredStudents
      .slice(validatedSkip, validatedSkip + validatedLimit)
      .map(s => ({
        id: s.id,
        login: s.login,
        email: s.email,
        first_name: s.first_name,
        last_name: s.last_name,
        displayname: s.displayname,
        usual_full_name: s.usual_full_name,
        pool_month: s.pool_month,
        pool_year: s.pool_year,
        wallet: s.wallet,
        correction_point: s.correction_point,
        level: s.level,
        "active?": s["active?"],
        grade: s.grade,
        campusId: s.campusId,
        image: s.image
      }));
    
    const totalPages = Math.ceil(total / validatedLimit);
    const currentPage = Math.floor(validatedSkip / validatedLimit) + 1;
    
    res.json({
      students,
      pagination: {
        total,
        page: currentPage,
        limit: validatedLimit,
        totalPages
      }
    });
  } catch (error) {
    console.error('Students list error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch students',
      message: error.message
    });
  }
});

module.exports = router;
