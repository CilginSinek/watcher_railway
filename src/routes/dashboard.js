const express = require('express');
const router = express.Router();
const { Student, Project, LocationStats, Feedback } = require('../models');
const { validateCampusId } = require('../utils/validators');

/**
 * GET /api/dashboard?campusId={campusId}
 * Get dashboard statistics and overview data
 */
router.get('/', async (req, res) => {
  try {
    // Check if models are loaded
    if (!Student || !Project || !LocationStats || !Feedback) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Database models not initialized. Please try again later.'
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
    
    // Get current month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Build campus filter
    const campusFilter = validatedCampusId !== null ? { campusId: validatedCampusId } : {};
    
    console.log('Dashboard query - campusFilter:', campusFilter);
    
    // 1. Top Project Submitters (current month)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    console.log('Month start:', monthStart);
    
    let projectsThisMonth = [];
    try {
      const result = await Project.find({
        ...campusFilter,
        date: { $gte: monthStart }
      });
      console.log('Projects found:', Array.isArray(result) ? result.length : 'not array', typeof result);
      // Filter validated projects in memory (Ottoman has issues with ? in field names)
      projectsThisMonth = Array.isArray(result) ? result.filter(p => p['validated?'] === true) : [];
      console.log('Validated projects:', projectsThisMonth.length);
    } catch (dbError) {
      console.error('Error fetching projects:', dbError.message);
      projectsThisMonth = [];
    }
    
    const projectsByStudent = {};
    projectsThisMonth.forEach(p => {
      if (!projectsByStudent[p.login]) {
        projectsByStudent[p.login] = { count: 0, totalScore: 0 };
      }
      projectsByStudent[p.login].count++;
      projectsByStudent[p.login].totalScore += p.final_mark || 0;
    });
    
    const topProjectSubmitters = await Promise.all(
      Object.entries(projectsByStudent)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(async ([login, data]) => {
          try {
            const student = await Student.findOne({ login });
            return {
              login,
              projectCount: data.count,
              totalScore: data.totalScore,
              student: student ? {
                id: student.id,
                login: student.login,
                displayname: student.displayname,
                image: student.image
              } : null
            };
          } catch (err) {
            console.error(`Error fetching student ${login}:`, err);
            return {
              login,
              projectCount: data.count,
              totalScore: data.totalScore,
              student: null
            };
          }
        })
    );
    
    // 2. Top Location Stats (current month)
    let locationsThisMonth = [];
    try {
      const result = await LocationStats.find({
        ...campusFilter,
        begin_at: { $gte: monthStart }
      });
      locationsThisMonth = Array.isArray(result) ? result : [];
    } catch (dbError) {
      console.error('Error fetching locations:', dbError.message);
      locationsThisMonth = [];
    }
    
    const timeByStudent = {};
    locationsThisMonth.forEach(loc => {
      const beginAt = new Date(loc.begin_at);
      const endAt = loc.end_at ? new Date(loc.end_at) : new Date();
      const minutes = Math.floor((endAt - beginAt) / 60000);
      
      if (!timeByStudent[loc.login]) {
        timeByStudent[loc.login] = 0;
      }
      timeByStudent[loc.login] += minutes;
    });
    
    const topLocationStats = await Promise.all(
      Object.entries(timeByStudent)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(async ([login, totalTime]) => {
          try {
            const student = await Student.findOne({ login });
            return {
              login,
              totalTime,
              student: student ? {
                id: student.id,
                login: student.login,
                displayname: student.displayname,
                image: student.image
              } : null
            };
          } catch (err) {
            console.error(`Error fetching student ${login}:`, err);
            return { login, totalTime, student: null };
          }
        })
    );
    
    // 3. All Time Projects
    let allProjects = [];
    try {
      const result = await Project.find({ ...campusFilter });
      allProjects = Array.isArray(result) ? result : [];
    } catch (dbError) {
      console.error('Error fetching all projects:', dbError.message);
      allProjects = [];
    }
    const allProjectsByStudent = {};
    allProjects.forEach(p => {
      allProjectsByStudent[p.login] = (allProjectsByStudent[p.login] || 0) + 1;
    });
    
    const allTimeProjects = await Promise.all(
      Object.entries(allProjectsByStudent)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(async ([login, projectCount]) => {
          try {
            const student = await Student.findOne({ login });
            return {
              login,
              projectCount,
              student: student ? {
                id: student.id,
                login: student.login,
                displayname: student.displayname,
                image: student.image
              } : null
            };
          } catch (err) {
            console.error(`Error fetching student ${login}:`, err);
            return { login, projectCount, student: null };
          }
        })
    );
    
    // 4. All Time Wallet
    let allTimeWallet = [];
    try {
      const result = await Student.find(campusFilter);
      console.log('Students found for wallet:', Array.isArray(result) ? result.length : 'not array');
      const sorted = Array.isArray(result) ? result.sort((a, b) => (b.wallet || 0) - (a.wallet || 0)).slice(0, 10) : [];
      allTimeWallet = sorted;
      console.log('Top wallet students:', allTimeWallet.length);
    } catch (dbError) {
      console.error('Error fetching wallet stats:', dbError.message);
      allTimeWallet = [];
    }
    
    const walletData = allTimeWallet.map(s => ({
      login: s.login,
      wallet: s.wallet || 0,
      student: {
        id: s.id,
        login: s.login,
        displayname: s.displayname,
        image: s.image
      }
    }));
    
    // 5. All Time Correction Points
    let allTimePoints = [];
    try {
      const result = await Student.find(campusFilter);
      const sorted = Array.isArray(result) ? result.sort((a, b) => (b.correction_point || 0) - (a.correction_point || 0)).slice(0, 10) : [];
      allTimePoints = sorted;
    } catch (dbError) {
      console.error('Error fetching correction points:', dbError.message);
      allTimePoints = [];
    }
    
    const pointsData = allTimePoints.map(s => ({
      login: s.login,
      correctionPoint: s.correction_point || 0,
      student: {
        id: s.id,
        login: s.login,
        displayname: s.displayname,
        image: s.image
      }
    }));
    
    // 6. All Time Levels
    let allTimeLevels = [];
    try {
      const result = await Student.find(campusFilter);
      const sorted = Array.isArray(result) ? result.sort((a, b) => (b.level || 0) - (a.level || 0)).slice(0, 10) : [];
      allTimeLevels = sorted;
    } catch (dbError) {
      console.error('Error fetching levels:', dbError.message);
      allTimeLevels = [];
    }
    
    const levelsData = allTimeLevels.map(s => ({
      login: s.login,
      level: s.level || 0,
      student: {
        id: s.id,
        login: s.login,
        displayname: s.displayname,
        image: s.image
      }
    }));
    
    // 7. Grade Distribution
    let allStudents = [];
    try {
      const result = await Student.find(campusFilter);
      console.log('All students found:', Array.isArray(result) ? result.length : 'not array', typeof result);
      if (result && !Array.isArray(result)) {
        console.log('Result keys:', Object.keys(result));
        console.log('Result sample:', JSON.stringify(result).substring(0, 200));
      }
      allStudents = Array.isArray(result) ? result : [];
    } catch (dbError) {
      console.error('Error fetching students for grade distribution:', dbError.message);
      allStudents = [];
    }
    const gradeCount = {};
    allStudents.forEach(s => {
      const grade = s.grade || 'Unknown';
      gradeCount[grade] = (gradeCount[grade] || 0) + 1;
    });
    
    const gradeDistribution = Object.entries(gradeCount).map(([name, value]) => ({
      name,
      value
    }));
    
    // 8. Hourly Occupancy (last 7 days average)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let recentLocations = [];
    try {
      const result = await LocationStats.find({
        ...campusFilter,
        begin_at: { $gte: sevenDaysAgo }
      });
      recentLocations = Array.isArray(result) ? result : [];
    } catch (dbError) {
      console.error('Error fetching recent locations:', dbError.message);
      recentLocations = [];
    }
    
    const hourlyCount = Array(24).fill(0);
    const hourlyTotal = Array(24).fill(0);
    
    recentLocations.forEach(loc => {
      const beginAt = new Date(loc.begin_at);
      const endAt = loc.end_at ? new Date(loc.end_at) : new Date();
      
      for (let h = beginAt.getHours(); h <= endAt.getHours(); h++) {
        if (h < 24) {
          hourlyCount[h]++;
        }
      }
    });
    
    const maxOccupancy = Math.max(...hourlyCount, 1);
    const hourlyOccupancy = hourlyCount.map((count, hour) => ({
      hour: `${String(hour).padStart(2, '0')}:00`,
      occupancy: Math.round((count / maxOccupancy) * 100)
    }));
    
    // 9. Weekly Occupancy
    const weeklyCount = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    recentLocations.forEach(loc => {
      const day = new Date(loc.begin_at).getDay();
      weeklyCount[dayNames[day]]++;
    });
    
    const maxWeekly = Math.max(...Object.values(weeklyCount), 1);
    const weeklyOccupancy = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
      day,
      occupancy: Math.round((weeklyCount[day] / maxWeekly) * 100)
    }));
    
    res.json({
      currentMonth,
      topProjectSubmitters,
      topLocationStats,
      allTimeProjects,
      allTimeWallet: walletData,
      allTimePoints: pointsData,
      allTimeLevels: levelsData,
      gradeDistribution,
      hourlyOccupancy,
      weeklyOccupancy
    });
    
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch dashboard data',
      message: error.message
    });
  }
});

module.exports = router;
