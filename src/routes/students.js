const express = require('express');
const router = express.Router();
const { Student, Project, LocationStats, Feedback, Patronage } = require('../models');
const { getDefaultInstance } = require('ottoman');
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
  validateActive,
  validateStatus
} = require('../utils/validators');

/**
 * GET /api/students/pools?campusId={campusId}
 * Get students grouped by pools
 */
router.get('/pools', async (req, res) => {
  try {
    if (!Student) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Database models not initialized'
      });
    }

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
    const result = await Student.find(filter);
    const students = result?.rows || [];
    
    const poolCount = {};
    students.forEach(s => {
      if (s.pool_month && s.pool_year) {
        const key = `${s.pool_month}-${s.pool_year}`;
        poolCount[key] = (poolCount[key] || 0) + 1;
      }
    });
    
    const pools = Object.entries(poolCount).map(([key, count]) => {
      const [month, year] = key.split('-');
      return { month, year, count };
    });
    
    res.json({ pools });
  } catch (error) {
    console.error('Pools fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch pools data', message: error.message });
  }
});

/**
 * GET /api/students/:login
 * Get specific student by login with full details
 */
router.get('/:login', async (req, res) => {
  try {
    if (!Student || !Project || !LocationStats || !Feedback || !Patronage) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Database models not initialized'
      });
    }

    let validatedLogin;
    try {
      validatedLogin = validateLogin(req.params.login);
    } catch (validationError) {
      return res.status(400).json({
        error: 'Bad Request',
        message: validationError.message
      });
    }
    
    const student = await Student.findOne({ login: validatedLogin });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Get projects
    const projectsResult = await Project.find({ login: validatedLogin });
    const projects = projectsResult?.rows || [];
    const projectsData = projects.map(p => ({
      project: p.project,
      login: p.login,
      score: p.score,
      status: p.status,
      date: p.date,
      campusId: p.campusId
    }));
    
    // Get location stats
    const locationResult = await LocationStats.find({ login: validatedLogin });
    const locationStats = locationResult?.rows || [];
    const locationData = locationStats.length > 0 ? locationStats[0] : null;
    
    // Parse logTimes and attendanceDays
    let logTimes = [];
    const dayAttendance = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: [] };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    if (locationData?.months) {
      Object.entries(locationData.months).forEach(([monthKey, monthData]) => {
        if (monthData.days) {
          Object.entries(monthData.days).forEach(([day, durationStr]) => {
            if (durationStr && durationStr !== "00:00:00") {
              const parts = durationStr.split(':');
              const hours = parseInt(parts[0]) || 0;
              const minutes = parseInt(parts[1]) || 0;
              const seconds = parseInt(parts[2]) || 0;
              const totalMinutes = hours * 60 + minutes + Math.floor(seconds / 60);
              
              const date = `${monthKey}-${day.padStart(2, '0')}`;
              logTimes.push({ date, duration: totalMinutes });
              
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
    
    // Get feedbacks
    const feedbacksResult = await Feedback.find({ login: validatedLogin });
    const feedbacks = feedbacksResult?.rows || [];
    const feedbackCount = feedbacks.length;
    const avgRating = feedbackCount > 0 
      ? feedbacks.reduce((sum, f) => sum + (f.rating || 0), 0) / feedbackCount 
      : 0;
    
    const attendanceDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
      day,
      avgHours: dayAttendance[day].length > 0 
        ? dayAttendance[day].reduce((sum, h) => sum + h, 0) / dayAttendance[day].length 
        : 0
    }));
    
    // Get patronage
    const patronageResult = await Patronage.find({ login: validatedLogin });
    const patronageData = patronageResult?.rows || [];
    const children = patronageData.length > 0 ? patronageData[0].children || [] : [];
    const godfathers = patronageData.length > 0 ? patronageData[0].godfathers || [] : [];
    
    res.json({
      student: {
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
        patronage: { godfathers, children },
        feedbackCount,
        avgRating: Math.round(avgRating * 100) / 100,
        logTimes,
        attendanceDays
      }
    });
  } catch (error) {
    console.error('Student fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch student', message: error.message });
  }
});

/**
 * GET /api/students
 * Get list of all students with filters and pagination
 */
router.get('/', async (req, res) => {
  try {
    if (!Student) {
      return res.status(503).json({ error: 'Service Unavailable', message: 'Database models not initialized' });
    }

    // Validate inputs
    let validatedCampusId, validatedSearch, validatedPool, validatedGrade, validatedStatus;
    let validatedSort, validatedOrder, validatedLimit, validatedSkip;
    
    try {
      validatedCampusId = validateCampusId(req.query.campusId);
      validatedSearch = validateSearch(req.query.search);
      validatedPool = validatePool(req.query.pool);
      validatedGrade = validateGrade(req.query.grade);
      validatedStatus = validateStatus(req.query.status);
      validatedSort = validateSort(req.query.sort);
      validatedOrder = validateOrder(req.query.order);
      validatedLimit = Math.min(validateLimit(req.query.limit), 50); // Max 50 per page
      validatedSkip = validateSkip(req.query.skip);
    } catch (validationError) {
      return res.status(400).json({ error: 'Bad Request', message: validationError.message });
    }
    
    // Build filter
    const filter = {};
    if (validatedCampusId !== null) filter.campusId = validatedCampusId;
    if (validatedPool) {
      filter.pool_month = validatedPool.month;
      filter.pool_year = validatedPool.year;
    }
    if (validatedGrade) filter.grade = validatedGrade;
    
    // Status filters
    if (validatedStatus) {
      switch (validatedStatus) {
        case 'active':
          filter['active?'] = true;
          filter['alumni?'] = false;
          filter['staff?'] = false;
          break;
        case 'alumni':
          filter['alumni?'] = true;
          break;
        case 'staff':
          filter['staff?'] = true;
          break;
        case 'blackholed':
          filter.blackholed = true;
          break;
        case 'sinker':
          filter.sinker = true;
          break;
        case 'freeze':
          filter.freeze = true;
          break;
        case 'test':
          filter.is_test = true;
          break;
        case 'inactive':
          filter['active?'] = false;
          break;
        case 'transcender':
          filter.grade = 'Learner';
          filter['active?'] = true;
          break;
        case 'cadet':
          filter.grade = 'Member';
          filter['active?'] = true;
          break;
        case 'piscine':
          filter.is_piscine = true;
          break;
      }
    }
    
    // Get students
    const result = await Student.find(filter);
    let allStudents = result?.rows || [];
    
    // Search filter
    if (validatedSearch) {
      const searchLower = validatedSearch.toLowerCase();
      allStudents = allStudents.filter(s => 
        s.login?.toLowerCase().includes(searchLower) ||
        s.first_name?.toLowerCase().includes(searchLower) ||
        s.last_name?.toLowerCase().includes(searchLower)
      );
    }
    
    const total = allStudents.length;
    
    // Check if sorting by calculated field
    const isCalculatedField = [
      'project_count', 'cheat_count', 'godfather_count', 
      'children_count', 'log_time', 'evo_performance', 
      'feedback_count', 'avg_rating'
    ].includes(validatedSort);
    
    // Use N1QL for calculated fields
    if (isCalculatedField) {
      try {
        const ottoman = getDefaultInstance();
        const cluster = ottoman.cluster;
        
        // Get only logins for current page (max 50)
        const pageStart = validatedSkip;
        const pageEnd = Math.min(validatedSkip + validatedLimit, total);
        const pageLogins = allStudents.slice(pageStart, pageEnd).map(s => s.login);
        
        if (pageLogins.length === 0) {
          return res.json({
            students: [],
            pagination: { total: 0, page: 1, limit: validatedLimit, totalPages: 0 }
          });
        }
        
        const loginList = pageLogins.map(l => `"${l}"`).join(',');
        const campusFilter = validatedCampusId !== null ? `AND campusId = ${validatedCampusId}` : '';
        
        // N1QL query with subqueries
        const n1qlQuery = `
          SELECT s.*,
            (SELECT COUNT(*) FROM product._default.projects p WHERE p.login = s.login ${campusFilter} AND p.type = 'Project')[0] as project_count,
            (SELECT COUNT(*) FROM product._default.projects p WHERE p.login = s.login AND p.score = -42 ${campusFilter} AND p.type = 'Project')[0] as cheat_count,
            (SELECT COUNT(*) FROM product._default.feedbacks f WHERE f.login = s.login ${campusFilter} AND f.type = 'Feedback')[0] as feedback_count,
            (SELECT AVG(f.rating) FROM product._default.feedbacks f WHERE f.login = s.login ${campusFilter} AND f.type = 'Feedback')[0] as avg_rating,
            (SELECT VALUE LENGTH(pt.godfathers) FROM product._default.patronages pt WHERE pt.login = s.login ${campusFilter} AND pt.type = 'Patronage' LIMIT 1)[0] as godfather_count,
            (SELECT VALUE LENGTH(pt.children) FROM product._default.patronages pt WHERE pt.login = s.login ${campusFilter} AND pt.type = 'Patronage' LIMIT 1)[0] as children_count
          FROM product._default.students s
          WHERE s.type = 'Student' AND s.login IN [${loginList}] ${campusFilter}
        `;
        
        const queryResult = await cluster.query(n1qlQuery);
        let students = (queryResult.rows || []).map(s => ({
          ...s,
          project_count: s.project_count || 0,
          cheat_count: s.cheat_count || 0,
          feedback_count: s.feedback_count || 0,
          avg_rating: s.avg_rating || 0,
          godfather_count: s.godfather_count || 0,
          children_count: s.children_count || 0,
          log_time: 0,
          evo_performance: ((s.project_count || 0) * 10) + ((s.avg_rating || 0) * 5) - ((s.cheat_count || 0) * 20)
        }));
        
        // Sort
        students.sort((a, b) => {
          const aVal = a[validatedSort] || 0;
          const bVal = b[validatedSort] || 0;
          return validatedOrder === 'asc' ? aVal - bVal : bVal - aVal;
        });
        
        // Map response
        students = students.map(s => ({
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
          image: s.image,
          ...(s.project_count > 0 && { project_count: s.project_count }),
          ...(s.cheat_count > 0 && { cheat_count: s.cheat_count }),
          ...(s.feedback_count > 0 && { feedback_count: s.feedback_count }),
          ...(s.avg_rating > 0 && { avg_rating: Math.round(s.avg_rating * 100) / 100 }),
          ...(s.godfather_count > 0 && { godfather_count: s.godfather_count }),
          ...(s.children_count > 0 && { children_count: s.children_count }),
          ...(s.log_time > 0 && { log_time: s.log_time }),
          ...(s.evo_performance !== 0 && { evo_performance: Math.round(s.evo_performance * 100) / 100 })
        }));
        
        return res.json({
          students,
          pagination: {
            total,
            page: Math.floor(validatedSkip / validatedLimit) + 1,
            limit: validatedLimit,
            totalPages: Math.ceil(total / validatedLimit)
          }
        });
      } catch (n1qlError) {
        console.error('N1QL error:', n1qlError);
        return res.status(500).json({ error: 'Database query failed', message: n1qlError.message });
      }
    }
    
    // For normal fields, sort and paginate
    allStudents.sort((a, b) => {
      let aVal = a[validatedSort];
      let bVal = b[validatedSort];
      
      if (aVal === null || aVal === undefined) aVal = typeof bVal === 'number' ? -Infinity : '';
      if (bVal === null || bVal === undefined) bVal = typeof aVal === 'number' ? -Infinity : '';
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toString().toLowerCase();
      }
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return validatedOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      return validatedOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
    
    const paginatedStudents = allStudents.slice(validatedSkip, validatedSkip + validatedLimit);
    
    const students = paginatedStudents.map(s => ({
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
      pagination: {
        total,
        page: Math.floor(validatedSkip / validatedLimit) + 1,
        limit: validatedLimit,
        totalPages: Math.ceil(total / validatedLimit)
      }
    });
  } catch (error) {
    console.error('Students list error:', error);
    res.status(500).json({ error: 'Failed to fetch students', message: error.message });
  }
});

module.exports = router;
