const { Student, Project, LocationStats, Feedback, Patronage } = require("../models");
const { getDefaultInstance } = require("ottoman");

/**
 * @param {number|null} campusId - Campus ID or null
 * @param {string|null} status - Status filter or null
 * @param {Object|null} pool - Pool object containing month and year or null
 * @param {number} pool.month - Month
 * @param {number} pool.year - Year
 * @param {string|null} search - Search query or null
 * @param {Object | null} order - Sort order object
 * @param {number | null} limit - Number of results per page
 * @param {number | null} page - Page number
 * @param {string|null} sorttype - Only login, level, wallet, correction_point are allowed
 * @returns {Promise<Array>} Array of students
 */
async function loginbasesort(
  campusId,
  status,
  pool,
  search,
  order,
  limit,
  page,
  sorttype
) {
  const skip = (page - 1) * limit;
  const cluster = getDefaultInstance().cluster;

  // Build WHERE conditions
  let whereConditions = ["s.type = 'Student'"];
  
  if (campusId) {
    whereConditions.push(`s.campusId = ${campusId}`);
  }
  
  if (pool) {
    whereConditions.push(`s.pool_month = '${pool.month}'`);
    whereConditions.push(`s.pool_year = '${pool.year}'`);
  }
  
  if (search) {
    const searchPattern = search.toLowerCase();
    whereConditions.push(`(LOWER(s.name) LIKE '%${searchPattern}%' OR LOWER(s.displayName) LIKE '%${searchPattern}%' OR LOWER(s.login) LIKE '%${searchPattern}%')`);
  }
  
  // Add status filter
  switch (status) {
    case "active":
      whereConditions.push("s.`active?` = true");
      break;
    case "inactive":
      whereConditions.push("s.`active?` = false");
      break;
    case "test":
      whereConditions.push("s.is_test = true");
      break;
    case "alumni":
      whereConditions.push("s.`alumni?` = true");
      break;
    case "staff":
      whereConditions.push("s.`staff?` = true");
      break;
    case "blackholed":
      whereConditions.push("s.blackholed = true");
      break;
    case "transcender":
      whereConditions.push("s.grade = 'transcender'");
      break;
    case "cadet":
      whereConditions.push("s.grade = 'cadet'");
      break;
    case "piscine":
      whereConditions.push("s.grade = 'piscine' AND s.`active?` = true");
      break;
    case "sinker":
      whereConditions.push("s.sinker = true");
      break;
    case "freeze":
      whereConditions.push("s.freeze = true");
      break;
  }
  
  const whereClause = whereConditions.join(" AND ");
  
  // Simple query - no subqueries needed for basic fields
  const n1qlQuery = `
    SELECT s.*
    FROM product._default.students s
    WHERE ${whereClause}
    ORDER BY s.${sorttype} ${order === "asc" ? "ASC" : "DESC"}
    LIMIT ${limit} OFFSET ${skip}
  `;
  
  // Count query
  const countQuery = `
    SELECT COUNT(*) as total
    FROM product._default.students s
    WHERE ${whereClause}
  `;
  
  const [queryResult, countResult] = await Promise.all([
    cluster.query(n1qlQuery),
    cluster.query(countQuery)
  ]);
  
  const students = queryResult.rows;
  const total = countResult.rows[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    students,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}

async function projectcheatsort(
  campusId,
  status,
  pool,
  search,
  order,
  limit,
  page
) {
  const skip = (page - 1) * limit;
  const cluster = getDefaultInstance().cluster;

  // Build student filter
  let studentFilters = [];
  if (campusId) studentFilters.push(`s.campusId = ${campusId}`);
  if (pool) {
    studentFilters.push(`s.pool_month = '${pool.month}'`);
    studentFilters.push(`s.pool_year = '${pool.year}'`);
  }
  if (search) {
    const searchPattern = search.toLowerCase();
    studentFilters.push(`(LOWER(s.name) LIKE '%${searchPattern}%' OR LOWER(s.displayName) LIKE '%${searchPattern}%' OR LOWER(s.login) LIKE '%${searchPattern}%')`);
  }
  
  switch (status) {
    case "active":
      studentFilters.push("s.`active?` = true");
      break;
    case "inactive":
      studentFilters.push("s.`active?` = false");
      break;
    case "test":
      studentFilters.push("s.is_test = true");
      break;
    case "alumni":
      studentFilters.push("s.`alumni?` = true");
      break;
    case "staff":
      studentFilters.push("s.`staff?` = true");
      break;
    case "blackholed":
      studentFilters.push("s.blackholed = true");
      break;
    case "transcender":
      studentFilters.push("s.grade = 'transcender'");
      break;
    case "cadet":
      studentFilters.push("s.grade = 'cadet'");
      break;
    case "piscine":
      studentFilters.push("s.grade = 'piscine' AND s.`active?` = true");
      break;
    case "sinker":
      studentFilters.push("s.sinker = true");
      break;
    case "freeze":
      studentFilters.push("s.freeze = true");
      break;
  }
  
  const studentWhere = studentFilters.length > 0 ? "AND " + studentFilters.join(" AND ") : "";
  
  // Start from projects (indexed), then join to students
  const n1qlQuery = `
    SELECT s.id, s.campusId, s.email, s.login, s.first_name, s.last_name, s.usual_full_name, 
      s.usual_first_name, s.url, s.phone, s.displayname, s.kind, s.image, s.\`staff?\`, 
      s.correction_point, s.pool_month, s.pool_year, s.wallet, s.anonymize_date, 
      s.data_erasure_date, s.alumnized_at, s.\`alumni?\`, s.\`active?\`, s.created_at, 
      s.blackholed, s.next_milestone, s.freeze, s.sinker, s.grade, s.is_piscine, 
      s.is_trans, s.is_test, s.\`level\`, s.type, s.createdAt, s.updatedAt,
      COUNT(p.login) as cheat_count
    FROM product._default.projects p
    INNER JOIN product._default.students s ON s.login = p.login AND s.type = 'Student'
    WHERE p.type = 'Project' AND p.score = -42 ${studentWhere}
    GROUP BY s.id, s.campusId, s.email, s.login, s.first_name, s.last_name, s.usual_full_name, 
      s.usual_first_name, s.url, s.phone, s.displayname, s.kind, s.image, s.\`staff?\`, 
      s.correction_point, s.pool_month, s.pool_year, s.wallet, s.anonymize_date, 
      s.data_erasure_date, s.alumnized_at, s.\`alumni?\`, s.\`active?\`, s.created_at, 
      s.blackholed, s.next_milestone, s.freeze, s.sinker, s.grade, s.is_piscine, 
      s.is_trans, s.is_test, s.\`level\`, s.type, s.createdAt, s.updatedAt
    ORDER BY cheat_count ${order === "asc" ? "ASC" : "DESC"}
    LIMIT ${limit} OFFSET ${skip}
  `;
  
  console.log('[projectcheatsort] N1QL Query:', n1qlQuery);
  
  // Count unique students with cheat projects
  const countQuery = `
    SELECT COUNT(DISTINCT p.login) as total
    FROM product._default.projects p
    INNER JOIN product._default.students s ON s.login = p.login AND s.type = 'Student'
    WHERE p.type = 'Project' AND p.score = -42 ${studentWhere}
  `;
  
  const [queryResult, countResult] = await Promise.all([
    cluster.query(n1qlQuery),
    cluster.query(countQuery)
  ]);
  
  console.log('[projectcheatsort] Result sample:', JSON.stringify(queryResult.rows[0], null, 2));
  console.log('[projectcheatsort] First student cheat_count:', queryResult.rows[0]?.cheat_count);
  
  const students = queryResult.rows;
  const total = countResult.rows[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    students,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}

async function projectcountsort(
  campusId,
  status,
  pool,
  search,
  order,
  limit,
  page
) {
  const skip = (page - 1) * limit;
  const cluster = getDefaultInstance().cluster;

  let studentFilters = [];
  if (campusId) studentFilters.push(`s.campusId = ${campusId}`);
  if (pool) {
    studentFilters.push(`s.pool_month = '${pool.month}'`);
    studentFilters.push(`s.pool_year = '${pool.year}'`);
  }
  if (search) {
    const searchPattern = search.toLowerCase();
    studentFilters.push(`(LOWER(s.name) LIKE '%${searchPattern}%' OR LOWER(s.displayName) LIKE '%${searchPattern}%' OR LOWER(s.login) LIKE '%${searchPattern}%')`);
  }
  
  switch (status) {
    case "active":
      studentFilters.push("s.`active?` = true");
      break;
    case "inactive":
      studentFilters.push("s.`active?` = false");
      break;
    case "test":
      studentFilters.push("s.is_test = true");
      break;
    case "alumni":
      studentFilters.push("s.`alumni?` = true");
      break;
    case "staff":
      studentFilters.push("s.`staff?` = true");
      break;
    case "blackholed":
      studentFilters.push("s.blackholed = true");
      break;
    case "transcender":
      studentFilters.push("s.grade = 'transcender'");
      break;
    case "cadet":
      studentFilters.push("s.grade = 'cadet'");
      break;
    case "piscine":
      studentFilters.push("s.grade = 'piscine' AND s.`active?` = true");
      break;
    case "sinker":
      studentFilters.push("s.sinker = true");
      break;
    case "freeze":
      studentFilters.push("s.freeze = true");
      break;
  }
  
  const studentWhere = studentFilters.length > 0 ? "AND " + studentFilters.join(" AND ") : "";
  
  const n1qlQuery = `
    SELECT s.*,
      IFMISSING((SELECT VALUE COUNT(1) FROM product._default.projects p WHERE p.login = s.login AND p.status = 'success' AND p.type = 'Project')[0], 0) as project_count
    FROM product._default.students s
    WHERE s.type = 'Student' ${studentWhere}
    ORDER BY project_count ${order === "asc" ? "ASC" : "DESC"}
    LIMIT ${limit} OFFSET ${skip}
  `;
  
  const countQuery = `
    SELECT COUNT(*) as total
    FROM product._default.students s
    WHERE s.type = 'Student' ${studentWhere}
  `;
  
  const [queryResult, countResult] = await Promise.all([
    cluster.query(n1qlQuery),
    cluster.query(countQuery)
  ]);
  
  const students = queryResult.rows;
  const total = countResult.rows[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    students,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}

async function projectnewcheatsort(
  campusId,
  status,
  pool,
  search,
  order,
  limit,
  page
) {
  const skip = (page - 1) * limit;
  const cluster = getDefaultInstance().cluster;

  let studentFilters = [];
  if (campusId) studentFilters.push(`s.campusId = ${campusId}`);
  if (pool) {
    studentFilters.push(`s.pool_month = '${pool.month}'`);
    studentFilters.push(`s.pool_year = '${pool.year}'`);
  }
  if (search) {
    const searchPattern = search.toLowerCase();
    studentFilters.push(`(LOWER(s.name) LIKE '%${searchPattern}%' OR LOWER(s.displayName) LIKE '%${searchPattern}%' OR LOWER(s.login) LIKE '%${searchPattern}%')`);
  }
  
  switch (status) {
    case "active":
      studentFilters.push("s.`active?` = true");
      break;
    case "inactive":
      studentFilters.push("s.`active?` = false");
      break;
    case "test":
      studentFilters.push("s.is_test = true");
      break;
    case "alumni":
      studentFilters.push("s.`alumni?` = true");
      break;
    case "staff":
      studentFilters.push("s.`staff?` = true");
      break;
    case "blackholed":
      studentFilters.push("s.blackholed = true");
      break;
    case "transcender":
      studentFilters.push("s.grade = 'transcender'");
      break;
    case "cadet":
      studentFilters.push("s.grade = 'cadet'");
      break;
    case "piscine":
      studentFilters.push("s.grade = 'piscine' AND s.`active?` = true");
      break;
    case "sinker":
      studentFilters.push("s.sinker = true");
      break;
    case "freeze":
      studentFilters.push("s.freeze = true");
      break;
  }
  
  const studentWhere = studentFilters.length > 0 ? "AND " + studentFilters.join(" AND ") : "";
  
  const n1qlQuery = `
    SELECT s.*,
      (SELECT p FROM product._default.projects p WHERE p.login = s.login AND p.score = -42 AND p.type = 'Project' ORDER BY p.updatedAt ${order === "asc" ? "ASC" : "DESC"} LIMIT 1)[0] as latest_cheat_project,
      1 as has_cheats
    FROM product._default.students s
    WHERE s.type = 'Student' ${studentWhere}
      AND EXISTS (SELECT 1 FROM product._default.projects p WHERE p.login = s.login AND p.score = -42 AND p.type = 'Project')
    LIMIT ${limit} OFFSET ${skip}
  `;
  
  const countQuery = `
    SELECT COUNT(*) as total
    FROM product._default.students s
    WHERE s.type = 'Student' ${studentWhere}
      AND EXISTS (SELECT 1 FROM product._default.projects p WHERE p.login = s.login AND p.score = -42 AND p.type = 'Project')
  `;
  
  const [queryResult, countResult] = await Promise.all([
    cluster.query(n1qlQuery),
    cluster.query(countQuery)
  ]);
  
  const students = queryResult.rows;
  const total = countResult.rows[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    students,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}

async function familybasesort(
    campusId,
    status,
    pool,
    search,
    order,
    limit,
    page,
    sorttype
) {
    const skip = (page - 1) * limit;
    const cluster = getDefaultInstance().cluster;

    let studentFilters = [];
    if (campusId) studentFilters.push(`s.campusId = ${campusId}`);
    if (pool) {
        studentFilters.push(`s.pool_month = '${pool.month}'`);
        studentFilters.push(`s.pool_year = '${pool.year}'`);
    }
    if (search) {
        const searchPattern = search.toLowerCase();
        studentFilters.push(`(LOWER(s.name) LIKE '%${searchPattern}%' OR LOWER(s.displayName) LIKE '%${searchPattern}%' OR LOWER(s.login) LIKE '%${searchPattern}%')`);
    }
    
    switch (status) {
        case "active":
            studentFilters.push("s.`active?` = true");
            break;
        case "inactive":
            studentFilters.push("s.`active?` = false");
            break;
        case "test":
            studentFilters.push("s.is_test = true");
            break;
        case "alumni":
            studentFilters.push("s.`alumni?` = true");
            break;
        case "staff":
            studentFilters.push("s.`staff?` = true");
            break;
        case "blackholed":
            studentFilters.push("s.blackholed = true");
            break;
        case "transcender":
            studentFilters.push("s.grade = 'transcender'");
            break;
        case "cadet":
            studentFilters.push("s.grade = 'cadet'");
            break;
        case "piscine":
            studentFilters.push("s.grade = 'piscine' AND s.`active?` = true");
            break;
        case "sinker":
            studentFilters.push("s.sinker = true");
            break;
        case "freeze":
            studentFilters.push("s.freeze = true");
            break;
    }
    
    const studentWhere = studentFilters.length > 0 ? "AND " + studentFilters.join(" AND ") : "";
    
    const n1qlQuery = `
        SELECT s.*,
            IFMISSING((SELECT VALUE COUNT(1) FROM product._default.patronages p UNNEST p.children c WHERE c.login = s.login AND p.type = 'Patronage')[0], 0) as godfather_count,
            IFMISSING((SELECT VALUE COUNT(1) FROM product._default.patronages p UNNEST p.godfathers g WHERE g.login = s.login AND p.type = 'Patronage')[0], 0) as children_count
        FROM product._default.students s
        WHERE s.type = 'Student' ${studentWhere}
        ORDER BY ${sorttype} ${order === "asc" ? "ASC" : "DESC"}
        LIMIT ${limit} OFFSET ${skip}
    `;
    
    const countQuery = `
        SELECT COUNT(*) as total
        FROM product._default.students s
        WHERE s.type = 'Student' ${studentWhere}
    `;
    
    const [queryResult, countResult] = await Promise.all([
        cluster.query(n1qlQuery),
        cluster.query(countQuery)
    ]);
    
    const students = queryResult.rows;
    const total = countResult.rows[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);
    
    return {
        students,
        pagination: {
            total,
            page,
            limit,
            totalPages,
        },
    };
}

async function logtimesort(
  campusId,
  status,
  pool,
  search,
  order,
  limit,
  page
) {
  const skip = (page - 1) * limit;
  const cluster = getDefaultInstance().cluster;

  let studentFilters = [];
  if (campusId) studentFilters.push(`s.campusId = ${campusId}`);
  if (pool) {
    studentFilters.push(`s.pool_month = '${pool.month}'`);
    studentFilters.push(`s.pool_year = '${pool.year}'`);
  }
  if (search) {
    const searchPattern = search.toLowerCase();
    studentFilters.push(`(LOWER(s.name) LIKE '%${searchPattern}%' OR LOWER(s.displayName) LIKE '%${searchPattern}%' OR LOWER(s.login) LIKE '%${searchPattern}%')`);
  }
  
  switch (status) {
    case "active":
      studentFilters.push("s.`active?` = true");
      break;
    case "inactive":
      studentFilters.push("s.`active?` = false");
      break;
    case "test":
      studentFilters.push("s.is_test = true");
      break;
    case "alumni":
      studentFilters.push("s.`alumni?` = true");
      break;
    case "staff":
      studentFilters.push("s.`staff?` = true");
      break;
    case "blackholed":
      studentFilters.push("s.blackholed = true");
      break;
    case "transcender":
      studentFilters.push("s.grade = 'transcender'");
      break;
    case "cadet":
      studentFilters.push("s.grade = 'cadet'");
      break;
    case "piscine":
      studentFilters.push("s.grade = 'piscine' AND s.`active?` = true");
      break;
    case "sinker":
      studentFilters.push("s.sinker = true");
      break;
    case "freeze":
      studentFilters.push("s.freeze = true");
      break;
  }
  
  const studentWhere = studentFilters.length > 0 ? "AND " + studentFilters.join(" AND ") : "";
  const campusFilter = campusId ? `l.campusId = ${campusId} AND` : "";
  
  const n1qlQuery = `
    SELECT s.*,
      (SELECT SUM(
        TONUMBER(SPLIT(m.totalDuration, ":")[0]) * 3600 +
        TONUMBER(SPLIT(m.totalDuration, ":")[1]) * 60 +
        TONUMBER(SPLIT(m.totalDuration, ":")[2])
      )
      FROM product._default.locationstats l
      UNNEST OBJECT_NAMES(l.months) mn
      LET m = l.months[mn]
      WHERE ${campusFilter} l.login = s.login AND l.type = 'LocationStats')[0] as log_time
    FROM product._default.students s
    WHERE s.type = 'Student' ${studentWhere}
    ORDER BY log_time ${order === "asc" ? "ASC" : "DESC"}
    LIMIT ${limit} OFFSET ${skip}
  `;
  
  const countQuery = `
    SELECT COUNT(*) as total
    FROM product._default.students s
    WHERE s.type = 'Student' ${studentWhere}
  `;
  
  const [queryResult, countResult] = await Promise.all([
    cluster.query(n1qlQuery),
    cluster.query(countQuery)
  ]);
  
  const students = queryResult.rows;
  const total = countResult.rows[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    students,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}

async function feedbackcountsort(
  campusId,
  status,
  pool,
  search,
  order,
  limit,
  page
) {
  const skip = (page - 1) * limit;
  const cluster = getDefaultInstance().cluster;

  let studentFilters = [];
  if (campusId) studentFilters.push(`s.campusId = ${campusId}`);
  if (pool) {
    studentFilters.push(`s.pool_month = '${pool.month}'`);
    studentFilters.push(`s.pool_year = '${pool.year}'`);
  }
  if (search) {
    const searchPattern = search.toLowerCase();
    studentFilters.push(`(LOWER(s.name) LIKE '%${searchPattern}%' OR LOWER(s.displayName) LIKE '%${searchPattern}%' OR LOWER(s.login) LIKE '%${searchPattern}%')`);
  }
  
  switch (status) {
    case "active":
      studentFilters.push("s.`active?` = true");
      break;
    case "inactive":
      studentFilters.push("s.`active?` = false");
      break;
    case "test":
      studentFilters.push("s.is_test = true");
      break;
    case "alumni":
      studentFilters.push("s.`alumni?` = true");
      break;
    case "staff":
      studentFilters.push("s.`staff?` = true");
      break;
    case "blackholed":
      studentFilters.push("s.blackholed = true");
      break;
    case "transcender":
      studentFilters.push("s.grade = 'transcender'");
      break;
    case "cadet":
      studentFilters.push("s.grade = 'cadet'");
      break;
    case "piscine":
      studentFilters.push("s.grade = 'piscine' AND s.`active?` = true");
      break;
    case "sinker":
      studentFilters.push("s.sinker = true");
      break;
    case "freeze":
      studentFilters.push("s.freeze = true");
      break;
  }
  
  const studentWhere = studentFilters.length > 0 ? "AND " + studentFilters.join(" AND ") : "";
  const campusFilter = campusId ? `f.campusId = ${campusId} AND` : "";
  
  const n1qlQuery = `
    SELECT s.*,
      IFMISSING((SELECT VALUE COUNT(1) FROM product._default.feedbacks f WHERE ${campusFilter} f.login = s.login AND f.type = 'Feedback')[0], 0) as feedback_count
    FROM product._default.students s
    WHERE s.type = 'Student' ${studentWhere}
    ORDER BY feedback_count ${order === "asc" ? "ASC" : "DESC"}
    LIMIT ${limit} OFFSET ${skip}
  `;
  
  const countQuery = `
    SELECT COUNT(*) as total
    FROM product._default.students s
    WHERE s.type = 'Student' ${studentWhere}
  `;
  
  const [queryResult, countResult] = await Promise.all([
    cluster.query(n1qlQuery),
    cluster.query(countQuery)
  ]);
  
  const students = queryResult.rows;
  const total = countResult.rows[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    students,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}

async function averageratesort(
  campusId,
  status,
  pool,
  search,
  order,
  limit,
  page
) {
  const skip = (page - 1) * limit;
  const cluster = getDefaultInstance().cluster;

  let studentFilters = [];
  if (campusId) studentFilters.push(`s.campusId = ${campusId}`);
  if (pool) {
    studentFilters.push(`s.pool_month = '${pool.month}'`);
    studentFilters.push(`s.pool_year = '${pool.year}'`);
  }
  if (search) {
    const searchPattern = search.toLowerCase();
    studentFilters.push(`(LOWER(s.name) LIKE '%${searchPattern}%' OR LOWER(s.displayName) LIKE '%${searchPattern}%' OR LOWER(s.login) LIKE '%${searchPattern}%')`);
  }
  
  switch (status) {
    case "active":
      studentFilters.push("s.`active?` = true");
      break;
    case "inactive":
      studentFilters.push("s.`active?` = false");
      break;
    case "test":
      studentFilters.push("s.is_test = true");
      break;
    case "alumni":
      studentFilters.push("s.`alumni?` = true");
      break;
    case "staff":
      studentFilters.push("s.`staff?` = true");
      break;
    case "blackholed":
      studentFilters.push("s.blackholed = true");
      break;
    case "transcender":
      studentFilters.push("s.grade = 'transcender'");
      break;
    case "cadet":
      studentFilters.push("s.grade = 'cadet'");
      break;
    case "piscine":
      studentFilters.push("s.grade = 'piscine' AND s.`active?` = true");
      break;
    case "sinker":
      studentFilters.push("s.sinker = true");
      break;
    case "freeze":
      studentFilters.push("s.freeze = true");
      break;
  }
  
  const studentWhere = studentFilters.length > 0 ? "AND " + studentFilters.join(" AND ") : "";
  const campusFilter = campusId ? `f.campusId = ${campusId} AND` : "";
  
  const n1qlQuery = `
    SELECT s.*,
      (SELECT AVG(f.rating) FROM product._default.feedbacks f WHERE ${campusFilter} f.login = s.login AND f.rating IS NOT NULL AND f.type = 'Feedback')[0] as avg_rating
    FROM product._default.students s
    WHERE s.type = 'Student' ${studentWhere}
    ORDER BY avg_rating ${order === "asc" ? "ASC" : "DESC"}
    LIMIT ${limit} OFFSET ${skip}
  `;
  
  const countQuery = `
    SELECT COUNT(*) as total
    FROM product._default.students s
    WHERE s.type = 'Student' ${studentWhere}
  `;
  
  const [queryResult, countResult] = await Promise.all([
    cluster.query(n1qlQuery),
    cluster.query(countQuery)
  ]);
  
  const students = queryResult.rows;
  const total = countResult.rows[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    students,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  };
}

module.exports = {
  loginbasesort,
  projectcheatsort,
  projectcountsort,
  projectnewcheatsort,
  familybasesort,
  logtimesort,
  feedbackcountsort,
  averageratesort,
};
