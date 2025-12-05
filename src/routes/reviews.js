const express = require("express");
const router = express.Router();
const { ProjectReview, Student } = require("../models");
const { validateCampusId } = require("../utils/validators");

/**
 * Validate and sanitize login string
 */
function validateLoginString(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }
  // Only alphanumeric, hyphens, underscores
  const sanitized = input.replace(/[^a-zA-Z0-9_-]/g, '');
  return sanitized.substring(0, 50);
}

/**
 * Validate and sanitize search string
 */
function validateSearchString(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }
  // Remove special regex characters and potential injection
  const sanitized = input.replace(/[^a-zA-Z0-9\s._-]/g, '');
  return sanitized.trim().substring(0, 200);
}

/**
 * Validate date string (YYYY-MM-DD format)
 */
function validateDateString(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }
  // Check YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(input)) {
    return null;
  }
  return input;
}

/**
 * GET /api/reviews/projectNames
 * Get distinct project names from reviews
 */
router.get("/projectNames", async (req, res) => {
  try {
    const projectNames = await ProjectReview.distinct("project");
    res.json({ projectNames: projectNames.sort() });
  } catch (error) {
    console.error("Project names fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch project names",
      message: error.message,
    });
  }
});

/**
 * GET /api/reviews/statuses
 * Get distinct statuses from reviews
 */
router.get("/statuses", async (req, res) => {
  try {
    const statuses = await ProjectReview.distinct("status");
    // Filter out null values
    const validStatuses = statuses.filter(s => s !== null && s !== undefined);
    res.json({ statuses: validStatuses.sort() });
  } catch (error) {
    console.error("Statuses fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch statuses",
      message: error.message,
    });
  }
});

/**
 * GET /api/reviews
 * Get project reviews with filters and pagination
 * 
 * Query Parameters:
 * - page, limit (pagination)
 * - search (comment search)
 * - projectName
 * - evaluatorLogin
 * - evaluatedLogin
 * - score
 * - status
 * - dateFilter (after/before/between)
 * - dateFrom
 * - dateTo
 */
router.get("/", async (req, res) => {
  try {
    // Validate campusId
    let validatedCampusId = null;
    try {
      validatedCampusId = validateCampusId(req.query.campusId);
    } catch (validationError) {
      return res.status(400).json({
        error: "Bad Request",
        message: validationError.message,
      });
    }

    // Parse and validate pagination
    const page = parseInt(req.query.page, 10);
    const limit = parseInt(req.query.limit, 10);
    
    const validatedPage = (!isNaN(page) && page > 0) ? page : 1;
    const validatedLimit = (!isNaN(limit) && limit > 0 && limit <= 100) ? limit : 50;
    const skip = (validatedPage - 1) * validatedLimit;

    // Build filter with validation
    const filter = {};

    // Campus filter
    if (validatedCampusId !== null) {
      filter.campusId = validatedCampusId;
    }

    // Project name filter - sanitize
    if (req.query.projectName && typeof req.query.projectName === 'string') {
      const sanitizedProject = req.query.projectName.replace(/[^a-zA-Z0-9\s._-]/g, '').substring(0, 100);
      if (sanitizedProject) {
        filter.project = sanitizedProject;
      }
    }

    // Evaluator filter - sanitize
    const sanitizedEvaluator = validateLoginString(req.query.evaluatorLogin);
    if (sanitizedEvaluator) {
      filter.evaluator = new RegExp(sanitizedEvaluator, 'i');
    }

    // Evaluated filter - sanitize
    const sanitizedEvaluated = validateLoginString(req.query.evaluatedLogin);
    if (sanitizedEvaluated) {
      filter.evaluated = new RegExp(sanitizedEvaluated, 'i');
    }

    // Status filter - sanitize
    if (req.query.status && typeof req.query.status === 'string') {
      const sanitizedStatus = req.query.status.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
      if (sanitizedStatus) {
        filter.status = sanitizedStatus;
      }
    }

    // Score filter - validate as number
    if (req.query.score) {
      const score = parseInt(req.query.score, 10);
      if (!isNaN(score) && score >= -42 && score <= 125) {
        filter.score = score;
      }
    }

    // Search in comments - sanitize
    const sanitizedSearch = validateSearchString(req.query.search);
    if (sanitizedSearch) {
      filter.evaluatorComment = new RegExp(sanitizedSearch, 'i');
    }

    // Date filters - validate
    if (req.query.dateFilter && typeof req.query.dateFilter === 'string') {
      const validatedDateFrom = validateDateString(req.query.dateFrom);
      
      if (validatedDateFrom) {
        switch (req.query.dateFilter) {
          case 'after':
            filter.date = { $gte: validatedDateFrom };
            break;
          case 'before':
            filter.date = { $lte: validatedDateFrom };
            break;
          case 'between':
            const validatedDateTo = validateDateString(req.query.dateTo);
            if (validatedDateTo) {
              filter.date = {
                $gte: validatedDateFrom,
                $lte: validatedDateTo
              };
            }
            break;
        }
      }
    }

    // Execute query with pagination
    const [reviews, total] = await Promise.all([
      ProjectReview.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(validatedLimit)
        .lean(),
      ProjectReview.countDocuments(filter)
    ]);

    // Enrich reviews with student data
    const enrichedReviews = await Promise.all(
      reviews.map(async (review) => {
        const [evaluatorData, evaluatedData] = await Promise.all([
          Student.findOne({ login: review.evaluator })
            .select('id login displayname image')
            .lean(),
          Student.findOne({ login: review.evaluated })
            .select('id login displayname image')
            .lean()
        ]);

        return {
          ...review,
          evaluatorData: evaluatorData ? {
            id: evaluatorData.id,
            login: evaluatorData.login,
            displayname: evaluatorData.displayname,
            image: evaluatorData.image
          } : null,
          evaluatedData: evaluatedData ? {
            id: evaluatedData.id,
            login: evaluatedData.login,
            displayname: evaluatedData.displayname,
            image: evaluatedData.image
          } : null
        };
      })
    );

    const totalPages = Math.ceil(total / validatedLimit);

    res.json({
      reviews: enrichedReviews,
      pagination: {
        total,
        page: validatedPage,
        limit: validatedLimit,
        totalPages
      }
    });
  } catch (error) {
    console.error("Reviews fetch error:", error);
    res.status(500).json({
      error: "Failed to fetch reviews",
      message: error.message,
    });
  }
});

module.exports = router;
