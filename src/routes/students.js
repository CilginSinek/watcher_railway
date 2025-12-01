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
      students = Array.isArray(result) ? result : [];
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
        const pool = `${s.pool_month}-${s.pool_year}`;
        poolCount[pool] = (poolCount[pool] || 0) + 1;
      }
    });
    
    const pools = Object.entries(poolCount).map(([pool, count]) => ({
      pool,
      count
    }));
    
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
      projects = Array.isArray(result) ? result : [];
    } catch (dbError) {
      console.error('Error fetching projects:', dbError.message);
      projects = [];
    }
    const projectsData = projects.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      login: p.login,
      final_mark: p.final_mark,
      status: p.status,
      "validated?": p["validated?"],
      date: p.date,
      campusId: p.campusId
    }));
    
    // Get location stats
    let locationStats = [];
    try {
      const result = await LocationStats.find({ login: validatedLogin });
      locationStats = Array.isArray(result) ? result : [];
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
    
    // Get feedbacks
    let feedbacks = [];
    try {
      const result = await Feedback.find({ login: validatedLogin });
      feedbacks = Array.isArray(result) ? result : [];
    } catch (dbError) {
      console.error('Error fetching feedbacks:', dbError.message);
      feedbacks = [];
    }
    const feedbacksData = feedbacks.map(f => ({
      id: f.id,
      login: f.login,
      rating: f.rating,
      comment: f.comment,
      final_mark: f.final_mark,
      created_at: f.created_at,
      campusId: f.campusId
    }));
    
    // Get patronage (as patron)
    let asPatron = [];
    let patroned = [];
    try {
      const result = await Patronage.find({ godfather_login: validatedLogin });
      asPatron = Array.isArray(result) ? result : [];
      patroned = await Promise.all(
        asPatron.map(async (p) => {
          try {
            const patronedStudent = await Student.findOne({ login: p.user_login });
            return patronedStudent ? {
              id: patronedStudent.id,
              login: patronedStudent.login,
              displayname: patronedStudent.displayname,
              image: patronedStudent.image
            } : null;
          } catch (err) {
            console.error(`Error fetching patroned student ${p.user_login}:`, err.message);
            return null;
          }
        })
      );
    } catch (dbError) {
      console.error('Error fetching patronage:', dbError.message);
      patroned = [];
    }
    
    // Get patronage (as patroned)
    let patron = null;
    try {
      const asPatroned = await Patronage.findOne({ user_login: validatedLogin });
      if (asPatroned) {
        const patronStudent = await Student.findOne({ login: asPatroned.godfather_login });
        if (patronStudent) {
          patron = {
            id: patronStudent.id,
            login: patronStudent.login,
            displayname: patronStudent.displayname,
            image: patronStudent.image
          };
        }
      }
    } catch (dbError) {
      console.error('Error fetching patron:', dbError.message);
      patron = null;
    }
    
    res.json({
      student: {
        id: student.id,
        login: student.login,
        email: student.email,
        first_name: student.first_name,
        last_name: student.last_name,
        displayname: student.displayname,
        usual_full_name: student.usual_full_name,
        pool_month: student.pool_month,
        pool_year: student.pool_year,
        wallet: student.wallet,
        correction_point: student.correction_point,
        level: student.level,
        "active?": student["active?"],
        grade: student.grade,
        campusId: student.campusId,
        image: student.image
      },
      projects: projectsData,
      locationStats: locationData,
      feedbacks: feedbacksData,
      patronage: {
        patron,
        patroned: patroned.filter(p => p !== null)
      }
    });
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
      allStudents = Array.isArray(result) ? result : [];
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
      
      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
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
    
    res.json({
      students,
      total,
      limit: validatedLimit,
      skip: validatedSkip
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
