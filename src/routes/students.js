const express = require("express");
const router = express.Router();
const {
  Student,
  Project,
  LocationStats,
  Feedback,
  Patronage,
} = require("../models");
const { getDefaultInstance } = require("ottoman");
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
const {
  loginbasesort,
  projectcheatsort,
  projectcountsort,
  projectnewcheatsort,
  familybasesort,
  logtimesort,
  feedbackcountsort,
  averageratesort,
} = require("../controllers/sortBy");

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

    const filter =
      validatedCampusId !== null ? { campusId: validatedCampusId } : {};
    const result = await Student.find(filter);
    const students = result?.rows || [];

    const poolCount = {};
    students.forEach((s) => {
      if (s.pool_month && s.pool_year) {
        const key = `${s.pool_month}-${s.pool_year}`;
        poolCount[key] = (poolCount[key] || 0) + 1;
      }
    });

    const pools = Object.entries(poolCount).map(([key, count]) => {
      const [month, year] = key.split("-");
      return { month, year, count };
    });

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

    const student = await Student.findOne({ login: validatedLogin });
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Get projects
    const projectsResult = await Project.find({ login: validatedLogin });
    const projects = projectsResult?.rows || [];
    const projectsData = projects.map((p) => ({
      project: p.project,
      login: p.login,
      score: p.score,
      status: p.status,
      date: p.date,
      campusId: p.campusId,
    }));

    // Get location stats
    const locationResult = await LocationStats.find({ login: validatedLogin });
    const locationStats = locationResult?.rows || [];
    const locationData = locationStats.length > 0 ? locationStats[0] : null;

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
      Object.entries(locationData.months).forEach(([monthKey, monthData]) => {
        if (monthData.days) {
          Object.entries(monthData.days).forEach(([day, durationStr]) => {
            if (durationStr && durationStr !== "00:00:00") {
              const parts = durationStr.split(":");
              const hours = parseInt(parts[0]) || 0;
              const minutes = parseInt(parts[1]) || 0;
              const seconds = parseInt(parts[2]) || 0;
              const totalMinutes =
                hours * 60 + minutes + Math.floor(seconds / 60);

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
          });
        }
      });
    }

    // Get feedbacks
    const feedbacksResult = await Feedback.find({ login: validatedLogin });
    const feedbacks = feedbacksResult?.rows || [];
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
    const patronageResult = await Patronage.find({ login: validatedLogin });
    const patronageData = patronageResult?.rows || [];
    const children =
      patronageData.length > 0 ? patronageData[0].children || [] : [];
    const godfathers =
      patronageData.length > 0 ? patronageData[0].godfathers || [] : [];

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
    if (!Student) {
      return res
        .status(503)
        .json({
          error: "Service Unavailable",
          message: "Database models not initialized",
        });
    }

    // Validate inputs
    let validatedCampusId, validatedSearch, validatedPool, validatedStatus;
    let validatedSort, validatedOrder, validatedLimit, validatedPage;

    try {
      validatedCampusId = validateCampusId(req.query.campusId);
      validatedSearch = validateSearch(req.query.search);
      validatedPool = validatePool(req.query.pool);
      validatedStatus = validateStatus(req.query.status);
      validatedSort = validateSort(req.query.sort);
      validatedOrder = validateOrder(req.query.order);
      validatedPage = parseInt(req.query.page, 10) || 1;
      validatedLimit = Math.min(validateLimit(req.query.limit), 50);
    } catch (validationError) {
      return res
        .status(400)
        .json({ error: "Bad Request", message: validationError.message });
    }
    let students;
    if (
      validatedSort == "login" ||
      validatedSort == "level" ||
      validatedSort == "wallet" ||
      validatedSort == "correction_point"
    ) {
      students = await loginbasesort(
        validatedCampusId,
        validatedStatus,
        validatedPool,
        validatedSearch,
        validatedOrder,
        validatedLimit,
        validatedPage,
        validatedSort
      );
    } else if (validatedSort == "project_count") {
      students = await projectcountsort(
        validatedCampusId,
        validatedStatus,
        validatedPool,
        validatedSearch,
        validatedOrder,
        validatedLimit,
        validatedPage
      );
    } else if (validatedSort == "cheat_count") {
      students = await projectcheatsort(
        validatedCampusId,
        validatedStatus,
        validatedPool,
        validatedSearch,
        validatedOrder,
        validatedLimit,
        validatedPage
      );
    } else if (validatedSort == "new_cheat") {
      students = await projectnewcheatsort(
        validatedCampusId,
        validatedStatus,
        validatedPool,
        validatedSearch,
        validatedOrder,
        validatedLimit,
        validatedPage
      );
    } else if (
      validatedSort == "godfather_count" ||
      validatedSort == "children_count"
    ) {
      students = await familybasesort(
        validatedCampusId,
        validatedStatus,
        validatedPool,
        validatedSearch,
        validatedOrder,
        validatedLimit,
        validatedPage,
        validatedSort
      );
    } else if (validatedSort == "log_time") {
      students = await logtimesort(
        validatedCampusId,
        validatedStatus,
        validatedPool,
        validatedSearch,
        validatedOrder,
        validatedLimit,
        validatedPage
      );
    } else if (validatedSort == "feedback_count") {
      students = await feedbackcountsort(
        validatedCampusId,
        validatedStatus,
        validatedPool,
        validatedSearch,
        validatedOrder,
        validatedLimit,
        validatedPage
      );
    } else if (validatedSort == "avg_rating") {
      students = await averageratesort(
        validatedCampusId,
        validatedStatus,
        validatedPool,
        validatedSearch,
        validatedOrder,
        validatedLimit,
        validatedPage
      );
    } else {
      res
        .status(400)
        .json({ error: "Bad Request", message: "Invalid sort field" });
      return;
    }
    res.json(students);
  } catch (error) {
    console.error("Students list error:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch students", message: error.message });
  }
});

module.exports = router;
