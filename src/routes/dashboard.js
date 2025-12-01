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
    
    // Fetch all students once for better performance
    let allStudentsCache = [];
    try {
      const result = await Student.find(campusFilter);
      allStudentsCache = result?.rows || [];
    } catch (dbError) {
      console.error('Error fetching students cache:', dbError.message);
      allStudentsCache = [];
    }
    
    // Create student lookup map
    const studentMap = {};
    allStudentsCache.forEach(s => {
      studentMap[s.login] = s;
    });
    
    // 1. Top Project Submitters (current month)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    console.log('Month start:', monthStart);
    
    let projectsThisMonth = [];
    try {
      const result = await Project.find({
        ...campusFilter,
        date: { $gte: monthStart }
      });
      console.log('Projects found:', result?.rows?.length || 0);
      // Ottoman returns {rows: [], meta: {}}
      const projects = result?.rows || [];
      // Filter by status (DB doesn't have validated? field)
      projectsThisMonth = projects.filter(p => p.status === 'finished');
      console.log('Finished projects:', projectsThisMonth.length);
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
      projectsByStudent[p.login].totalScore += p.score || 0; // DB uses 'score' not 'final_mark'
    });
    
    const topProjectSubmitters = Object.entries(projectsByStudent)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([login, data]) => {
        const student = studentMap[login];
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
      });
    
    // 2. Top Location Stats (last 3 months)
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    let locationsThisMonth = [];
    try {
      const result = await LocationStats.find({
        ...campusFilter,
        begin_at: { $gte: threeMonthsAgo }
      });
      locationsThisMonth = result?.rows || [];
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
    
    const topLocationStats = Object.entries(timeByStudent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3) // Only top 3 students
      .map(([login, totalTime]) => {
        const student = studentMap[login];
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
      });
    
    // 3. All Time Projects
    let allProjects = [];
    try {
      const result = await Project.find({ ...campusFilter });
      allProjects = result?.rows || [];
    } catch (dbError) {
      console.error('Error fetching all projects:', dbError.message);
      allProjects = [];
    }
    const allProjectsByStudent = {};
    allProjects.forEach(p => {
      allProjectsByStudent[p.login] = (allProjectsByStudent[p.login] || 0) + 1;
    });
    
    const allTimeProjects = Object.entries(allProjectsByStudent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([login, projectCount]) => {
        const student = studentMap[login];
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
      });
    
    // 4. All Time Wallet (use cached students)
    console.log('Students found for wallet:', allStudentsCache.length);
    const sorted = allStudentsCache.sort((a, b) => (b.wallet || 0) - (a.wallet || 0)).slice(0, 10);
    const allTimeWallet = sorted;
    console.log('Top wallet students:', allTimeWallet.length);
    
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
    
    // 5. All Time Correction Points (use cached students)
    const sortedPoints = [...allStudentsCache].sort((a, b) => (b.correction_point || 0) - (a.correction_point || 0)).slice(0, 10);
    const allTimePoints = sortedPoints;
    
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
    
    // 6. All Time Levels (use cached students)
    const sortedLevels = [...allStudentsCache].sort((a, b) => (b.level || 0) - (a.level || 0)).slice(0, 10);
    const allTimeLevels = sortedLevels;
    
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
    
    // 7. Grade Distribution (use cached students, only active ones)
    console.log('All students found:', allStudentsCache.length);
    const allStudents = allStudentsCache.filter(s => s['active?'] === true);
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
      recentLocations = result?.rows || [];
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
