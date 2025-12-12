const express = require('express');
const router = express.Router();
const { Student, Project, LocationStats } = require('../models');
const { validateCampusId } = require('../utils/validators');
const { logEvent } = require('../middleware/logger');

/**
 * GET /api/dashboard?campusId={campusId}
 * Get dashboard statistics with MongoDB aggregation
 */
router.get('/', async (req, res) => {
  try {
    // Validate campus ID
    let validatedCampusId = null;
    try {
      validatedCampusId = validateCampusId(req.query.campusId);
    } catch (validationError) {
      return res.status(400).json({
        error: 'Bad Request',
        message: validationError.message
      });
    }
    
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const campusMatch = validatedCampusId !== null ? { campusId: validatedCampusId } : {};
    
    // 1. Top Project Submitters (current month) - Most submitted projects
    const topProjectSubmitters = await Project.aggregate([
      {
        $match: {
          ...campusMatch,
          status: 'success',
          date: { $gte: currentMonth }
        }
      },
      {
        $group: {
          _id: '$login',
          projectCount: { $sum: 1 },
          totalScore: { $sum: '$score' }
        }
      },
      {
        $lookup: {
          from: 'students',
          localField: '_id',
          foreignField: 'login',
          as: 'student'
        }
      },
      { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'projects',
          let: { studentLogin: '$student.login' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$login', '$$studentLogin'] },
                    { $eq: ['$status', 'success'] }
                  ]
                }
              }
            },
            { $count: 'total' }
          ],
          as: 'totalProjects'
        }
      },
      {
        $project: {
          login: '$_id',
          projectCount: 1,
          totalScore: 1,
          student: {
            id: '$student.id',
            login: '$student.login',
            displayname: '$student.displayname',
            image: '$student.image',
            correction_point: '$student.correction_point',
            wallet: '$student.wallet',
            projectCount: { $ifNull: [{ $arrayElemAt: ['$totalProjects.total', 0] }, 0] }
          }
        }
      },
      { $sort: { projectCount: -1 } },
      { $limit: 10 }
    ]);
    
    // 2. All Time Projects
    const allTimeProjects = await Project.aggregate([
      { 
        $match: {
          ...campusMatch,
          status: 'success'
        }
      },
      {
        $group: {
          _id: '$login',
          projectCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'students',
          localField: '_id',
          foreignField: 'login',
          as: 'student'
        }
      },
      { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          login: '$_id',
          projectCount: 1,
          student: {
            id: '$student.id',
            login: '$student.login',
            displayname: '$student.displayname',
            image: '$student.image',
            correction_point: '$student.correction_point',
            wallet: '$student.wallet'
          }
        }
      },
      { $sort: { projectCount: -1 } },
      { $limit: 10 }
    ]);
    
    // 3. All Time Wallet
    const walletStudents = await Student.find(campusMatch)
      .select('id login displayname image correction_point wallet')
      .sort({ wallet: -1 })
      .limit(10)
      .lean();
    
    const walletData = await Promise.all(
      walletStudents.map(async (s) => {
        const projectCount = await Project.countDocuments({
          login: s.login,
          status: 'success'
        });
        return {
          login: s.login,
          wallet: s.wallet || 0,
          student: {
            id: s.id,
            login: s.login,
            displayname: s.displayname,
            image: s.image,
            correction_point: s.correction_point,
            wallet: s.wallet,
            projectCount
          }
        };
      })
    );
    
    // 4. All Time Correction Points
    const pointsStudents = await Student.find(campusMatch)
      .select('id login displayname image correction_point wallet')
      .sort({ correction_point: -1 })
      .limit(10)
      .lean();
    
    const pointsData = await Promise.all(
      pointsStudents.map(async (s) => {
        const projectCount = await Project.countDocuments({
          login: s.login,
          status: 'success'
        });
        return {
          login: s.login,
          correctionPoint: s.correction_point || 0,
          student: {
            id: s.id,
            login: s.login,
            displayname: s.displayname,
            image: s.image,
            correction_point: s.correction_point,
            wallet: s.wallet,
            projectCount
          }
        };
      })
    );
    
    // 5. All Time Levels
    const levelsStudents = await Student.find(campusMatch)
      .select('id login displayname image correction_point wallet level')
      .sort({ level: -1 })
      .limit(10)
      .lean();
    
    const levelsData = await Promise.all(
      levelsStudents.map(async (s) => {
        const projectCount = await Project.countDocuments({
          login: s.login,
          status: 'success'
        });
        return {
          login: s.login,
          level: s.level || 0,
          student: {
            id: s.id,
            login: s.login,
            displayname: s.displayname,
            image: s.image,
            correction_point: s.correction_point,
            wallet: s.wallet,
            projectCount
          }
        };
      })
    );
    
    // 6. Grade Distribution
    const gradeDistribution = await Student.aggregate([
      {
        $match: {
          ...campusMatch,
          'active?': true,
          'staff?': { $ne: true },
          grade: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$grade',
          value: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          name: '$_id',
          value: 1
        }
      }
    ]);
    
    // 7. Top Location Stats (last 3 months)
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const allLocationStats = await LocationStats.find(campusMatch).lean();
    
    const timeByStudent = {};
    allLocationStats.forEach(locDoc => {
      if (!locDoc.months || !locDoc.login) return;
      
      let totalMinutes = 0;
      for (const [monthKey, monthData] of Object.entries(locDoc.months)) {
        const monthDate = new Date(monthKey + '-01');
        if (monthDate < threeMonthsAgo) continue;
        
        if (monthData.days) {
          for (const durationStr of Object.values(monthData.days)) {
            if (!durationStr || durationStr === "00:00:00") continue;
            
            const parts = durationStr.split(':');
            const hours = parseInt(parts[0]) || 0;
            const minutes = parseInt(parts[1]) || 0;
            totalMinutes += hours * 60 + minutes;
          }
        }
      }
      
      if (totalMinutes > 0) {
        timeByStudent[locDoc.login] = (timeByStudent[locDoc.login] || 0) + totalMinutes;
      }
    });
    
    const topLogins = Object.entries(timeByStudent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([login]) => login);
    
    const topStudents = await Student.find({ login: { $in: topLogins } })
      .select('login displayname image correction_point wallet')
      .lean();
    
    const studentMap = {};
    topStudents.forEach(s => {
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
    
    // 8. Hourly and Weekly Occupancy
    const threeMonthsAgoDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const hourlyActivity = Array(24).fill(0).map(() => ({ totalMinutes: 0, uniqueStudents: new Set() }));
    const dailyActivity = { Mon: new Set(), Tue: new Set(), Wed: new Set(), Thu: new Set(), Fri: new Set(), Sat: new Set(), Sun: new Set() };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    allLocationStats.forEach(locDoc => {
      if (!locDoc.months) return;
      
      for (const [monthKey, monthData] of Object.entries(locDoc.months)) {
        const monthDate = new Date(monthKey + '-01');
        if (monthDate < threeMonthsAgoDate) continue;
        
        if (monthData.days) {
          for (const [day, durationStr] of Object.entries(monthData.days)) {
            if (!durationStr || durationStr === "00:00:00") continue;
            
            const parts = durationStr.split(':');
            const hours = parseInt(parts[0]) || 0;
            const minutes = parseInt(parts[1]) || 0;
            
            if (hours === 0 && minutes === 0) continue;
            
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
          }
        }
      }
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
    
    // Log the event
    logEvent(
      req,
      req.user?.login || 'unknown',
      validatedCampusId || 0,
      'dashboard_view',
      { campusId: validatedCampusId, currentMonth }
    );
    
    res.json({
      currentMonth,
      topProjectSubmitters,
      topLocationStats,
      allTimeProjects,
      allTimeWallet: walletData,
      allTimePoints: pointsData,
      allTimeLevels: levelsData,
      gradeDistribution,
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
