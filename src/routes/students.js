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
    let locationData = null;
    try {
      const result = await LocationStats.find({ login: validatedLogin });
      const locationStats = result?.rows || [];
      console.log(`LocationStats for ${validatedLogin}:`, locationStats.length, 'found');
      
      if (locationStats.length > 0) {
        locationData = locationStats[0];
        console.log('Location data found with', Object.keys(locationData.months || {}).length, 'months');
      }
    } catch (dbError) {
      console.error('Error fetching location stats:', dbError.message);
      locationData = null;
    }
    
    // Parse logTimes and attendanceDays from locationData
    let logTimes = [];
    const dayAttendance = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    if (locationData && locationData.months) {
      Object.entries(locationData.months).forEach(([monthKey, monthData]) => {
        if (monthData.days) {
          Object.entries(monthData.days).forEach(([day, durationStr]) => {
            if (durationStr && durationStr !== "00:00:00") {
              // Parse duration string "HH:MM:SS" to minutes
              const parts = durationStr.split(':');
              const hours = parseInt(parts[0]) || 0;
              const minutes = parseInt(parts[1]) || 0;
              const seconds = parseInt(parts[2]) || 0;
              const totalMinutes = hours * 60 + minutes + Math.floor(seconds / 60);
              
              // Create date from month-day
              const date = `${monthKey}-${day.padStart(2, '0')}`;
              logTimes.push({ date, duration: totalMinutes });
              
              // Calculate day of week for attendance
              const fullDate = new Date(`${monthKey}-${day.padStart(2, '0')}`);
              if (!isNaN(fullDate.getTime())) {
                const dayOfWeek = dayNames[fullDate.getDay()];
                if (dayAttendance[dayOfWeek]) {
                  dayAttendance[dayOfWeek].push(hours + minutes / 60);
                }
              }
            }
          });
        }
      });
    }
    
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
    
    // Calculate attendanceDays from parsed data
    const attendanceDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
      day,
      avgHours: dayAttendance[day].length > 0 
        ? dayAttendance[day].reduce((sum, h) => sum + h, 0) / dayAttendance[day].length 
        : 0
    }));
    
    // Get patronage (single document with login)
    let children = [];
    let godfathers = [];
    try {
      const result = await Patronage.find({ login: validatedLogin });
      const patronageData = result?.rows || [];
      console.log(`Patronage for ${validatedLogin}:`, patronageData.length, 'found');
      if (patronageData.length > 0) {
        console.log('Patronage data:', JSON.stringify(patronageData[0]));
        // DB structure has godfathers and children arrays directly
        children = patronageData[0].children || [];
        godfathers = patronageData[0].godfathers || [];
      }
    } catch (dbError) {
      console.error('Error fetching patronage:', dbError.message);
      children = [];
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
