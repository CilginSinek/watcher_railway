const express = require('express');
const router = express.Router();
const { Student, Project, LocationStats, Feedback } = require('../models');
const { validateCampusId } = require('../utils/validators');
const { getDefaultInstance } = require('ottoman');

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
    
    const cluster = getDefaultInstance().cluster;
    const campusWhere = validatedCampusId !== null ? `AND s.campusId = ${validatedCampusId}` : '';
    const campusWhereP = validatedCampusId !== null ? `AND p.campusId = ${validatedCampusId}` : '';
    
    // 1. Top Project Submitters (current month) - Optimized with subquery
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const topProjectSubmittersQuery = `
      SELECT login, projectCount, totalScore, id, displayname, image
      FROM (
        SELECT p.login, 
          COUNT(*) as projectCount,
          SUM(p.score) as totalScore
        FROM product._default.projects p
        WHERE p.type = 'Project' 
          AND p.status = 'finished'
          AND p.date >= '${monthStart}'
          ${campusWhereP}
        GROUP BY p.login
      ) AS agg
      LET id = (SELECT RAW s.id FROM product._default.students s WHERE s.login = agg.login AND s.type = 'Student' LIMIT 1)[0],
          displayname = (SELECT RAW s.displayname FROM product._default.students s WHERE s.login = agg.login AND s.type = 'Student' LIMIT 1)[0],
          image = (SELECT RAW s.image FROM product._default.students s WHERE s.login = agg.login AND s.type = 'Student' LIMIT 1)[0]
      ORDER BY projectCount DESC
      LIMIT 10
    `;
    
    // 2. All Time Projects - Optimized with subquery
    const allTimeProjectsQuery = `
      SELECT login, projectCount, id, displayname, image, correction_point, wallet
      FROM (
        SELECT p.login, COUNT(*) as projectCount
        FROM product._default.projects p
        WHERE p.type = 'Project' ${campusWhereP}
        GROUP BY p.login
      ) AS agg
      LET id = (SELECT RAW s.id FROM product._default.students s WHERE s.login = agg.login AND s.type = 'Student' LIMIT 1)[0],
          displayname = (SELECT RAW s.displayname FROM product._default.students s WHERE s.login = agg.login AND s.type = 'Student' LIMIT 1)[0],
          image = (SELECT RAW s.image FROM product._default.students s WHERE s.login = agg.login AND s.type = 'Student' LIMIT 1)[0],
          correction_point = (SELECT RAW s.correction_point FROM product._default.students s WHERE s.login = agg.login AND s.type = 'Student' LIMIT 1)[0],
          wallet = (SELECT RAW s.wallet FROM product._default.students s WHERE s.login = agg.login AND s.type = 'Student' LIMIT 1)[0]
      ORDER BY projectCount DESC
      LIMIT 10
    `;
    
    // 3. All Time Wallet - Direct student query sorted
    const allTimeWalletQuery = `
      SELECT s.id, s.login, s.displayname, s.image, s.correction_point, s.wallet
      FROM product._default.students s
      USE INDEX (idx_students_wallet USING GSI)
      WHERE s.type = 'Student' ${campusWhere}
      ORDER BY s.wallet DESC
      LIMIT 10
    `;
    
    // 4. All Time Correction Points
    const allTimePointsQuery = `
      SELECT s.id, s.login, s.displayname, s.image, s.correction_point, s.wallet
      FROM product._default.students s
      USE INDEX (idx_students_correction USING GSI)
      WHERE s.type = 'Student' ${campusWhere}
      ORDER BY s.correction_point DESC
      LIMIT 10
    `;
    
    // 5. All Time Levels
    const allTimeLevelsQuery = `
      SELECT s.id, s.login, s.displayname, s.image, s.correction_point, s.wallet, s.\`level\`
      FROM product._default.students s
      USE INDEX (idx_students_level USING GSI)
      WHERE s.type = 'Student' ${campusWhere}
      ORDER BY s.\`level\` DESC
      LIMIT 10
    `;
    
    // 6. Grade Distribution
    const gradeDistributionQuery = `
      SELECT s.grade as name, COUNT(*) as \`value\`
      FROM product._default.students s
      USE INDEX (idx_students_grade USING GSI)
      WHERE s.type = 'Student' 
        AND s.\`active?\` = true 
        AND s.\`staff?\` != true
        AND s.grade IS NOT NULL
        ${campusWhere}
      GROUP BY s.grade
    `;
    
    // Execute all queries in parallel
    const [
      topProjectSubmittersResult,
      allTimeProjectsResult,
      allTimeWalletResult,
      allTimePointsResult,
      allTimeLevelsResult,
      gradeDistributionResult
    ] = await Promise.all([
      cluster.query(topProjectSubmittersQuery),
      cluster.query(allTimeProjectsQuery),
      cluster.query(allTimeWalletQuery),
      cluster.query(allTimePointsQuery),
      cluster.query(allTimeLevelsQuery),
      cluster.query(gradeDistributionQuery)
    ]);
    
    // Format results
    const topProjectSubmitters = topProjectSubmittersResult.rows.map(row => ({
      login: row.login,
      projectCount: row.projectCount,
      totalScore: row.totalScore || 0,
      student: {
        id: row.id,
        login: row.login,
        displayname: row.displayname,
        image: row.image
      }
    }));
    
    const allTimeProjects = allTimeProjectsResult.rows.map(row => ({
      login: row.login,
      projectCount: row.projectCount,
      student: {
        id: row.id,
        login: row.login,
        displayname: row.displayname,
        image: row.image,
        correction_point: row.correction_point,
        wallet: row.wallet
      }
    }));
    
    const walletData = allTimeWalletResult.rows.map(s => ({
      login: s.login,
      wallet: s.wallet || 0,
      student: {
        id: s.id,
        login: s.login,
        displayname: s.displayname,
        image: s.image,
        correction_point: s.correction_point,
        wallet: s.wallet
      }
    }));
    
    const pointsData = allTimePointsResult.rows.map(s => ({
      login: s.login,
      correctionPoint: s.correction_point || 0,
      student: {
        id: s.id,
        login: s.login,
        displayname: s.displayname,
        image: s.image,
        correction_point: s.correction_point,
        wallet: s.wallet
      }
    }));
    
    const levelsData = allTimeLevelsResult.rows.map(s => ({
      login: s.login,
      level: s.level || 0,
      student: {
        id: s.id,
        login: s.login,
        displayname: s.displayname,
        image: s.image,
        correction_point: s.correction_point,
        wallet: s.wallet
      }
    }));
    
    const gradeDistribution = gradeDistributionResult.rows;
    
    // Top Location Stats - needs location data (keep JavaScript calculation for complex month/day logic)
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const campusFilter = validatedCampusId !== null ? { campusId: validatedCampusId } : {};
    
    let allLocationStats = [];
    try {
      const result = await LocationStats.find(campusFilter);
      allLocationStats = result?.rows || [];
    } catch (dbError) {
      console.error('Error fetching locations:', dbError.message);
      allLocationStats = [];
    }
    
    // Calculate total time per student from months structure
    const timeByStudent = {};
    allLocationStats.forEach(locDoc => {
      if (!locDoc.months || !locDoc.login) return;
      
      let totalMinutes = 0;
      Object.entries(locDoc.months).forEach(([monthKey, monthData]) => {
        const monthDate = new Date(monthKey + '-01');
        if (monthDate < threeMonthsAgo) return;
        
        if (monthData.days) {
          Object.values(monthData.days).forEach(durationStr => {
            if (!durationStr || durationStr === "00:00:00") return;
            
            const parts = durationStr.split(':');
            const hours = parseInt(parts[0]) || 0;
            const minutes = parseInt(parts[1]) || 0;
            totalMinutes += hours * 60 + minutes;
          });
        }
      });
      
      if (totalMinutes > 0) {
        timeByStudent[locDoc.login] = (timeByStudent[locDoc.login] || 0) + totalMinutes;
      }
    });
    
    // Get student data for top 3
    const topLogins = Object.entries(timeByStudent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([login]) => login);
    
    const topStudentsQuery = `
      SELECT s.login, s.displayname, s.image, s.correction_point, s.wallet
      FROM product._default.students s
      WHERE s.type = 'Student' AND s.login IN [${topLogins.map(l => `"${l}"`).join(',')}]
    `;
    
    let topStudentsResult = { rows: [] };
    if (topLogins.length > 0) {
      topStudentsResult = await cluster.query(topStudentsQuery);
    }
    
    const studentMap = {};
    topStudentsResult.rows.forEach(s => {
      studentMap[s.login] = s;
    });
    
    const topLocationStats = Object.entries(timeByStudent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([login, totalMinutes]) => {
        const student = studentMap[login];
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        return {
          login,
          totalDuration: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`,
          student: student ? {
            login: student.login,
            displayname: student.displayname,
            image: student.image,
            correction_point: student.correction_point,
            wallet: student.wallet
          } : null
        };
      });
    
    // Hourly and Weekly Occupancy (keep JavaScript for complex date logic)
    const threeMonthsAgoDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const hourlyActivity = Array(24).fill(0).map(() => ({ totalMinutes: 0, uniqueStudents: new Set() }));
    const dailyActivity = { Mon: new Set(), Tue: new Set(), Wed: new Set(), Thu: new Set(), Fri: new Set(), Sat: new Set(), Sun: new Set() };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    allLocationStats.forEach(locDoc => {
      if (!locDoc.months) return;
      
      Object.entries(locDoc.months).forEach(([monthKey, monthData]) => {
        const monthDate = new Date(monthKey + '-01');
        if (monthDate < threeMonthsAgoDate) return;
        
        if (monthData.days) {
          Object.entries(monthData.days).forEach(([day, durationStr]) => {
            if (!durationStr || durationStr === "00:00:00") return;
            
            const parts = durationStr.split(':');
            const hours = parseInt(parts[0]) || 0;
            const minutes = parseInt(parts[1]) || 0;
            
            if (hours === 0 && minutes === 0) return;
            
            const totalMinutes = hours * 60 + minutes;
            
            // Distribute across working hours
            const activeHours = Math.min(hours, 9);
            for (let h = 9; h < 9 + activeHours && h < 24; h++) {
              hourlyActivity[h].totalMinutes += Math.floor(totalMinutes / activeHours);
              hourlyActivity[h].uniqueStudents.add(locDoc.login);
            }
            
            // Add to daily activity
            const fullDate = new Date(`${monthKey}-${day.padStart(2, '0')}`);
            if (!isNaN(fullDate.getTime())) {
              const dayOfWeek = dayNames[fullDate.getDay()];
              if (dailyActivity[dayOfWeek]) {
                dailyActivity[dayOfWeek].add(locDoc.login);
              }
            }
          });
        }
      });
    });
    
    const hourlyCount = hourlyActivity.map(h => h.uniqueStudents.size);
    const maxOccupancy = Math.max(...hourlyCount, 1);
    const hourlyOccupancy = hourlyCount.map((count, hour) => ({
      hour: `${String(hour).padStart(2, '0')}:00`,
      count,
      occupancy: Math.round((count / maxOccupancy) * 100)
    }));
    
    const dailyCount = {
      Mon: dailyActivity.Mon.size,
      Tue: dailyActivity.Tue.size,
      Wed: dailyActivity.Wed.size,
      Thu: dailyActivity.Thu.size,
      Fri: dailyActivity.Fri.size,
      Sat: dailyActivity.Sat.size,
      Sun: dailyActivity.Sun.size
    };
    
    const maxWeekly = Math.max(...Object.values(dailyCount), 1);
    const weeklyOccupancy = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
      day,
      count: dailyCount[day],
      occupancy: Math.round((dailyCount[day] / maxWeekly) * 100)
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
