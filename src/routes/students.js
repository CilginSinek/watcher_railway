const express = require("express");
const router = express.Router();
const {
  Student,
  Project,
  LocationStats,
  Feedback,
  Patronage,
} = require("../models");
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
  validateStatus,
} = require("../utils/validators");
const { logEvent } = require("../middleware/logger");

/**
 * GET /api/students/pools?campusId={campusId}
 * Get students grouped by pools
 */
router.get("/pools", async (req, res) => {
  try {
    if (!Student) {
      return res.status(503).json({
        error: "Service Unavailable",
        message: "Database models not initialized",
      });
    }

    let validatedCampusId = null;
    try {
      validatedCampusId = validateCampusId(req.query.campusId);
    } catch (validationError) {
      return res.status(400).json({
        error: "Bad Request",
        message: validationError.message,
      });
    }

    const filter = validatedCampusId !== null ? { campusId: validatedCampusId } : {};
    
    // Use MongoDB aggregation for better performance
    const pools = await Student.aggregate([
      { $match: filter },
      {
        $match: {
          pool_month: { $exists: true, $ne: null },
          pool_year: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: {
            month: '$pool_month',
            year: '$pool_year'
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          month: '$_id.month',
          year: '$_id.year',
          count: 1
        }
      }
    ]);

    // Log the event
    logEvent(
      req,
      req.user?.login || 'unknown',
      validatedCampusId || 0,
      'student_pools_view',
      { campusId: validatedCampusId, poolCount: pools.length }
    );

    res.json({ pools });
  } catch (error) {
    console.error("Pools fetch error:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch pools data", message: error.message });
  }
});

/**
 * GET /api/students/:login
 * Get specific student by login with full details
 */
router.get("/:login", async (req, res) => {
  try {
    if (!Student || !Project || !LocationStats || !Feedback || !Patronage) {
      return res.status(503).json({
        error: "Service Unavailable",
        message: "Database models not initialized",
      });
    }

    let validatedLogin;
    try {
      validatedLogin = validateLogin(req.params.login);
    } catch (validationError) {
      return res.status(400).json({
        error: "Bad Request",
        message: validationError.message,
      });
    }

    const student = await Student.findOne({ login: validatedLogin }).lean();
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Get projects
    const projects = await Project.find({ login: validatedLogin }).lean();
    const projectsData = projects.map((p) => ({
      project: p.project,
      login: p.login,
      score: p.score,
      status: p.status,
      date: p.date,
      campusId: p.campusId,
      penaltyDate: p.penaltyDate,
    }));

    // Get location stats
    const locationData = await LocationStats.findOne({ login: validatedLogin }).lean();

    // Parse logTimes and attendanceDays
    let logTimes = [];
    const dayAttendance = {
      Mon: [],
      Tue: [],
      Wed: [],
      Thu: [],
      Fri: [],
      Sat: [],
      Sun: [],
    };
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    if (locationData?.months) {
      for (const [monthKey, monthData] of Object.entries(locationData.months)) {
        if (monthData.days) {
          for (const [day, durationStr] of Object.entries(monthData.days)) {
            if (durationStr && durationStr !== "00:00:00") {
              const parts = durationStr.split(":");
              const hours = parseInt(parts[0]) || 0;
              const minutes = parseInt(parts[1]) || 0;
              const seconds = parseInt(parts[2]) || 0;
              const totalMinutes = hours * 60 + minutes + Math.floor(seconds / 60);

              const date = `${monthKey}-${day.padStart(2, "0")}`;
              logTimes.push({ date, duration: totalMinutes });

              const fullDate = new Date(`${monthKey}-${day.padStart(2, "0")}`);
              if (!isNaN(fullDate.getTime())) {
                const dayOfWeek = dayNames[fullDate.getDay()];
                if (dayAttendance[dayOfWeek]) {
                  dayAttendance[dayOfWeek].push(hours + minutes / 60);
                }
              }
            }
          }
        }
      }
    }

    // Get feedbacks
    const feedbacks = await Feedback.find({ evaluated: validatedLogin }).lean();
    const feedbackCount = feedbacks.length;
    const avgRating =
      feedbackCount > 0
        ? feedbacks.reduce((sum, f) => sum + (f.rating || 0), 0) / feedbackCount
        : 0;

    const attendanceDays = [
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ].map((day) => ({
      day,
      avgHours:
        dayAttendance[day].length > 0
          ? dayAttendance[day].reduce((sum, h) => sum + h, 0) /
            dayAttendance[day].length
          : 0,
    }));

    // Get patronage
    const patronageData = await Patronage.findOne({ login: validatedLogin }).lean();
    const children = patronageData?.children || [];
    const godfathers = patronageData?.godfathers || [];

    // Log the event
    logEvent(
      req,
      req.user?.login || 'unknown',
      student?.campusId || 0,
      'student_detail_view',
      { viewedLogin: validatedLogin, hasProjects: projects.length > 0 }
    );

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
        "active?": student["active?"],
        "alumni?": student["alumni?"],
        is_piscine: student.is_piscine,
        is_trans: student.is_trans,
        grade: student.grade,
        project_count: projects.length,
        projects: projectsData,
        patronage: { godfathers, children },
        feedbackCount,
        avgRating: Math.round(avgRating * 100) / 100,
        logTimes,
        attendanceDays,
      },
    });
  } catch (error) {
    console.error("Student fetch error:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch student", message: error.message });
  }
});

/**
 * GET /api/students
 * Get list of all students with filters and pagination
 */
router.get("/", async (req, res) => {
  try {
    // Validate inputs
    let validatedCampusId, validatedSearch, validatedPool, validatedStatus;
    let validatedSort, validatedOrder, validatedLimit, validatedPage;

    try {
      validatedCampusId = validateCampusId(req.query.campusId);
      validatedSearch = validateSearch(req.query.search);
      validatedPool = validatePool(req.query.poolYear, req.query.poolMonth);
      validatedStatus = validateStatus(req.query.status);
      validatedSort = validateSort(req.query.sortBy);
      validatedOrder = validateOrder(req.query.order);
      validatedPage = parseInt(req.query.page, 10) || 1;
      validatedLimit = Math.min(validateLimit(req.query.limit), 50);
    } catch (validationError) {
      return res
        .status(400)
        .json({ error: "Bad Request", message: validationError.message });
    }

    const skip = (validatedPage - 1) * validatedLimit;
    const sortOrder = validatedOrder === 'asc' ? 1 : -1;

    // Build match filters
    const matchStage = {};
    
    if (validatedCampusId !== null) {
      matchStage.campusId = validatedCampusId;
    }
    
    if (validatedPool) {
      matchStage.pool_month = validatedPool.month;
      matchStage.pool_year = validatedPool.year;
    }
    
    if (validatedSearch) {
      const searchRegex = new RegExp(validatedSearch, 'i');
      matchStage.$or = [
        { login: searchRegex },
        { displayname: searchRegex },
        { email: searchRegex }
      ];
    }
    
    // Status filters
    switch (validatedStatus) {
      case "active":
        matchStage["active?"] = true;
        break;
      case "inactive":
        matchStage["active?"] = false;
        break;
      case "test":
        matchStage.is_test = true;
        break;
      case "alumni":
        matchStage["alumni?"] = true;
        break;
      case "staff":
        matchStage["staff?"] = true;
        break;
      case "blackholed":
        matchStage.blackholed = true;
        break;
      case "transcender":
        matchStage.grade = 'Transcender';
        break;
      case "cadet":
        matchStage["active?"] = true;
        matchStage.grade = 'Cadet';
        break;
      case "piscine":
        matchStage.is_piscine = true;
        break;
      case "sinker":
        matchStage.sinker = true;
        break;
      case "freeze":
        matchStage.freeze = true;
        break;
    }

    let pipeline = [];
    let countPipeline = [];

    // Build aggregation pipeline based on sort type
    switch (validatedSort) {
      case "login":
      case "level":
      case "wallet":
      case "correction_point":
        // Simple field sort
        pipeline = [
          { $match: matchStage },
          {
            $lookup: {
              from: 'projects',
              let: { studentLogin: '$login' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$login', '$$studentLogin'] },
                        { $eq: ['$score', -42] }
                      ]
                    }
                  }
                },
                { $limit: 1 }
              ],
              as: 'cheatProjects'
            }
          },
          {
            $addFields: {
              has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] }
            }
          },
          { $project: { cheatProjects: 0 } },
          { $sort: { [validatedSort]: sortOrder } },
          { $skip: skip },
          { $limit: validatedLimit }
        ];
        countPipeline = [{ $match: matchStage }, { $count: 'total' }];
        break;

      case "project_count":
        // Count projects per student
        pipeline = [
          { $match: matchStage },
          {
            $lookup: {
              from: 'projects',
              localField: 'login',
              foreignField: 'login',
              as: 'projects'
            }
          },
          {
            $lookup: {
              from: 'projects',
              let: { studentLogin: '$login' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$login', '$$studentLogin'] },
                        { $eq: ['$score', -42] }
                      ]
                    }
                  }
                },
                { $limit: 1 }
              ],
              as: 'cheatProjects'
            }
          },
          {
            $addFields: {
              project_count: { $size: '$projects' },
              has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] }
            }
          },
          { $project: { projects: 0, cheatProjects: 0 } },
          { $sort: { project_count: sortOrder } },
          { $skip: skip },
          { $limit: validatedLimit }
        ];
        countPipeline = [{ $match: matchStage }, { $count: 'total' }];
        break;

      case "cheat_count":
        // Count cheat projects (score = -42)
        pipeline = [
          {
            $lookup: {
              from: 'projects',
              let: { studentLogin: '$login' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$login', '$$studentLogin'] },
                        { $eq: ['$score', -42] }
                      ]
                    }
                  }
                }
              ],
              as: 'cheatProjects'
            }
          },
          {
            $addFields: {
              cheat_count: { $size: '$cheatProjects' }
            }
          },
          { $match: { ...matchStage, cheat_count: { $gt: 0 } } },
          {
            $addFields: {
              has_cheats: true
            }
          },
          { $project: { cheatProjects: 0 } },
          { $sort: { cheat_count: sortOrder } },
          { $skip: skip },
          { $limit: validatedLimit }
        ];
        countPipeline = [
          {
            $lookup: {
              from: 'projects',
              let: { studentLogin: '$login' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$login', '$$studentLogin'] },
                        { $eq: ['$score', -42] }
                      ]
                    }
                  }
                }
              ],
              as: 'cheatProjects'
            }
          },
          {
            $addFields: {
              cheat_count: { $size: '$cheatProjects' }
            }
          },
          { $match: { ...matchStage, cheat_count: { $gt: 0 } } },
          { $count: 'total' }
        ];
        break;

      case "godfather_count":
      case "children_count":
        // Patronage counts
        pipeline = [
          { $match: matchStage },
          {
            $lookup: {
              from: 'patronages',
              localField: 'login',
              foreignField: 'login',
              as: 'patronage'
            }
          },
          {
            $lookup: {
              from: 'projects',
              let: { studentLogin: '$login' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$login', '$$studentLogin'] },
                        { $eq: ['$score', -42] }
                      ]
                    }
                  }
                },
                { $limit: 1 }
              ],
              as: 'cheatProjects'
            }
          },
          {
            $addFields: {
              godfather_count: {
                $size: {
                  $ifNull: [{ $arrayElemAt: ['$patronage.godfathers', 0] }, []]
                }
              },
              children_count: {
                $size: {
                  $ifNull: [{ $arrayElemAt: ['$patronage.children', 0] }, []]
                }
              },
              has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] }
            }
          },
          { $project: { patronage: 0, cheatProjects: 0 } },
          { $sort: { [validatedSort]: sortOrder } },
          { $skip: skip },
          { $limit: validatedLimit }
        ];
        countPipeline = [{ $match: matchStage }, { $count: 'total' }];
        break;

      case "log_time":
        // Calculate total log time from LocationStats
        pipeline = [
          { $match: matchStage },
          {
            $lookup: {
              from: 'locationstats',
              localField: 'login',
              foreignField: 'login',
              as: 'locationData'
            }
          },
          {
            $lookup: {
              from: 'projects',
              let: { studentLogin: '$login' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$login', '$$studentLogin'] },
                        { $eq: ['$score', -42] }
                      ]
                    }
                  }
                },
                { $limit: 1 }
              ],
              as: 'cheatProjects'
            }
          },
          {
            $addFields: {
              log_time: {
                $reduce: {
                  input: { $objectToArray: { $ifNull: [{ $arrayElemAt: ['$locationData.months', 0] }, {}] } },
                  initialValue: 0,
                  in: {
                    $add: [
                      '$$value',
                      {
                        $reduce: {
                          input: { $objectToArray: { $ifNull: ['$$this.v.days', {}] } },
                          initialValue: 0,
                          in: {
                            $let: {
                              vars: {
                                parts: { $split: ['$$this.v', ':'] },
                                hours: { $toInt: { $arrayElemAt: [{ $split: ['$$this.v', ':'] }, 0] } },
                                minutes: { $toInt: { $arrayElemAt: [{ $split: ['$$this.v', ':'] }, 1] } },
                                seconds: { $toInt: { $arrayElemAt: [{ $split: ['$$this.v', ':'] }, 2] } }
                              },
                              in: {
                                $add: [
                                  '$$value',
                                  { $multiply: ['$$hours', 3600] },
                                  { $multiply: ['$$minutes', 60] },
                                  '$$seconds'
                                ]
                              }
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              },
              has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] }
            }
          },
          { $project: { locationData: 0, cheatProjects: 0 } },
          { $sort: { log_time: sortOrder } },
          { $skip: skip },
          { $limit: validatedLimit }
        ];
        countPipeline = [{ $match: matchStage }, { $count: 'total' }];
        break;

      case "feedback_count":
        // Count feedbacks where student was evaluated
        pipeline = [
          { $match: matchStage },
          {
            $lookup: {
              from: 'feedbacks',
              localField: 'login',
              foreignField: 'evaluated',
              as: 'feedbacks'
            }
          },
          {
            $lookup: {
              from: 'projects',
              let: { studentLogin: '$login' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$login', '$$studentLogin'] },
                        { $eq: ['$score', -42] }
                      ]
                    }
                  }
                },
                { $limit: 1 }
              ],
              as: 'cheatProjects'
            }
          },
          {
            $addFields: {
              feedback_count: { $size: '$feedbacks' },
              has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] }
            }
          },
          { $project: { feedbacks: 0, cheatProjects: 0 } },
          { $sort: { feedback_count: sortOrder } },
          { $skip: skip },
          { $limit: validatedLimit }
        ];
        countPipeline = [{ $match: matchStage }, { $count: 'total' }];
        break;

      case "avg_rating":
        // Average feedback rating
        pipeline = [
          { $match: matchStage },
          {
            $lookup: {
              from: 'feedbacks',
              let: { studentLogin: '$login' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$evaluated', '$$studentLogin'] },
                        { $ne: ['$rating', null] }
                      ]
                    }
                  }
                }
              ],
              as: 'feedbacks'
            }
          },
          {
            $lookup: {
              from: 'projects',
              let: { studentLogin: '$login' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$login', '$$studentLogin'] },
                        { $eq: ['$score', -42] }
                      ]
                    }
                  }
                },
                { $limit: 1 }
              ],
              as: 'cheatProjects'
            }
          },
          {
            $addFields: {
              avg_rating: { $avg: '$feedbacks.rating' },
              has_cheats: { $gt: [{ $size: '$cheatProjects' }, 0] }
            }
          },
          { $project: { feedbacks: 0, cheatProjects: 0 } },
          { $sort: { avg_rating: sortOrder } },
          { $skip: skip },
          { $limit: validatedLimit }
        ];
        countPipeline = [{ $match: matchStage }, { $count: 'total' }];
        break;

      default:
        return res.status(400).json({ 
          error: "Bad Request", 
          message: "Invalid sort field" 
        });
    }

    // Execute aggregation and count in parallel
    const [students, countResult] = await Promise.all([
      Student.aggregate(pipeline),
      Student.aggregate(countPipeline)
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / validatedLimit);

    // Log the event
    logEvent(
      req.user?.login || 'unknown',
      validatedCampusId || 0,
      'student_list_view',
      {
        campusId: validatedCampusId,
        sortBy: validatedSort,
        order: validatedOrder,
        pool: validatedPool,
        status: validatedStatus,
        search: validatedSearch,
        page: validatedPage,
        limit: validatedLimit,
        totalResults: total
      }
    );

    res.json({
      students,
      pagination: {
        total,
        page: validatedPage,
        limit: validatedLimit,
        totalPages
      }
    });

  } catch (error) {
    console.error("Students list error:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch students", message: error.message });
  }
});

module.exports = router;
