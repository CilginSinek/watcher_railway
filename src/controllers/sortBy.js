const { Student, Project, LocationStats, Feedback } = require("../models");
const { Patronage } = require("../models");

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

  const baseQuery = {
    ...(campusId && { campusId }),
    ...(pool && { pool_month: pool.month, pool_year: pool.year }),
    $or: [
      { name: { $regex: search, $options: "i" } },
      { displayName: { $regex: search, $options: "i" } },
      { login: { $regex: search, $options: "i" } },
    ],
  };

  // Add status filter to base query instead of separate matches
  const statusQuery = {};
  switch (status) {
    case "active":
      statusQuery["active?"] = true;
      break;
    case "inactive":
      statusQuery["active?"] = false;
      break;
    case "test":
      statusQuery.is_test = true;
      break;
    case "alumni":
      statusQuery["alumni?"] = true;
      break;
    case "staff":
      statusQuery["staff?"] = true;
      break;
    case "blackholed":
      statusQuery.blackholed = true;
      break;
    case "transcender":
      statusQuery.grade = "transcender";
      break;
    case "cadet":
      statusQuery.grade = "cadet";
      break;
    case "piscine":
      statusQuery.grade = "piscine";
      statusQuery["active?"] = true;
      break;
    case "sinker":
      statusQuery.sinker = true;
      break;
    case "freeze":
      statusQuery.freeze = true;
      break;
  }

  const aggregatePipeline = [
    {
      $match: {
        ...baseQuery,
        ...statusQuery,
      },
    },
    // Use $expr with $in for better performance
    {
      $lookup: {
        from: "projects",
        let: { studentLogin: "$login" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$login", "$$studentLogin"] },
                  { $eq: ["$score", -42] },
                ],
              },
            },
          },
          { $limit: 1 },
        ],
        as: "has_cheats",
      },
    },
    {
      $addFields: {
        hasFailedProject: { $gt: [{ $size: "$has_cheats" }, 0] },
      },
    },
    { $sort: { [sorttype]: order == "asc" ? 1 : -1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  const [studentsResult, totalResult] = await Promise.all([
    Student.aggregate(aggregatePipeline),
    Student.aggregate([
      {
        $match: {
          ...baseQuery,
          ...statusQuery,
        },
      },
      { $count: "total" },
    ]),
  ]);

  const total = totalResult[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    students: studentsResult,
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
  const baseQuery = {
    ...(campusId && { campusId }),
    ...(pool && { pool_month: pool.month, pool_year: pool.year }),
    $or: [
      { name: { $regex: search, $options: "i" } },
      { displayName: { $regex: search, $options: "i" } },
      { login: { $regex: search, $options: "i" } },
    ],
  };
  const statusQuery = {};
  switch (status) {
    case "active":
      statusQuery["active?"] = true;
      break;
    case "inactive":
      statusQuery["active?"] = false;
      break;
    case "test":
      statusQuery.is_test = true;
      break;
    case "alumni":
      statusQuery["alumni?"] = true;
      break;
    case "staff":
      statusQuery["staff?"] = true;
      break;
    case "blackholed":
      statusQuery.blackholed = true;
      break;
    case "transcender":
      statusQuery.grade = "transcender";
      break;
    case "cadet":
      statusQuery.grade = "cadet";
      break;
    case "piscine":
      statusQuery.grade = "piscine";
      statusQuery["active?"] = true;
      break;
    case "sinker":
      statusQuery.sinker = true;
      break;
    case "freeze":
      statusQuery.freeze = true;
      break;
  }
  const aggregatePipeline = [
    {
      $match: {
        score: -42,
      },
    },
    {
      $group: {
        _id: "$login",
        cheat_count: { $sum: 1 },
        projects: { $push: "$$ROOT" },
      },
    },
    {
      $lookup: {
        from: "students",
        let: { projectLogin: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$login", "$$projectLogin"] },
              ...baseQuery,
              ...statusQuery,
            },
          },
        ],
        as: "student",
      },
    },
    {
      $unwind: "$student",
    },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: [
            "$student",
            { cheat_count: "$cheat_count", has_cheats: "$projects" },
          ],
        },
      },
    },
    { $sort: { cheat_count: order == "asc" ? 1 : -1 } },
    { $skip: skip },
    { $limit: limit },
  ];
  const [studentsResult, totalResult] = await Promise.all([
    Project.aggregate(aggregatePipeline),
    Project.aggregate([
      {
        $match: {
          score: -42,
        },
      },
      {
        $group: {
          _id: "$login",
        },
      },
      {
        $lookup: {
          from: "students",
          let: { projectLogin: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$login", "$$projectLogin"] },
                ...baseQuery,
                ...statusQuery,
              },
            },
          ],
          as: "student",
        },
      },
      {
        $match: {
          student: { $ne: [] },
        },
      },
      { $count: "total" },
    ]),
  ]);

  const total = totalResult[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    students: studentsResult,
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
  const baseQuery = {
    ...(campusId && { campusId }),
    ...(pool && { pool_month: pool.month, pool_year: pool.year }),
    $or: [
      { name: { $regex: search, $options: "i" } },
      { displayName: { $regex: search, $options: "i" } },
      { login: { $regex: search, $options: "i" } },
    ],
  };
  const statusQuery = {};
  switch (status) {
    case "active":
      statusQuery["active?"] = true;
      break;
    case "inactive":
      statusQuery["active?"] = false;
      break;
    case "test":
      statusQuery.is_test = true;
      break;
    case "alumni":
      statusQuery["alumni?"] = true;
      break;
    case "staff":
      statusQuery["staff?"] = true;
      break;
    case "blackholed":
      statusQuery.blackholed = true;
      break;
    case "transcender":
      statusQuery.grade = "transcender";
      break;
    case "cadet":
      statusQuery.grade = "cadet";
      break;
    case "piscine":
      statusQuery.grade = "piscine";
      statusQuery["active?"] = true;
      break;
    case "sinker":
      statusQuery.sinker = true;
      break;
    case "freeze":
      statusQuery.freeze = true;
      break;
  }
  const aggregatePipeline = [
    {
      $match: {
        status: "success",
      },
    },
    {
      $group: {
        _id: "$login",
        project_count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "students",
        let: { projectLogin: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$login", "$$projectLogin"] },
              ...baseQuery,
              ...statusQuery,
            },
          },
        ],
        as: "student",
      },
    },
    {
      $unwind: "$student",
    },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: ["$student", { project_count: "$project_count" }],
        },
      },
    },
    { $sort: { project_count: order == "asc" ? 1 : -1 } },
    { $skip: skip },
    { $limit: limit },
  ];
  const [studentsResult, totalResult] = await Promise.all([
    Project.aggregate(aggregatePipeline),
    Project.aggregate([
      {
        $match: {
          status: "success",
        },
      },
      {
        $group: {
          _id: "$login",
        },
      },
      {
        $lookup: {
          from: "students",
          let: { projectLogin: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$login", "$$projectLogin"] },
                ...baseQuery,
                ...statusQuery,
              },
            },
          ],
          as: "student",
        },
      },
      {
        $match: {
          student: { $ne: [] },
        },
      },
      { $count: "total" },
    ]),
  ]);

  const total = totalResult[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    students: studentsResult,
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
  const baseQuery = {
    ...(campusId && { campusId }),
    ...(pool && { pool_month: pool.month, pool_year: pool.year }),
    $or: [
      { name: { $regex: search, $options: "i" } },
      { displayName: { $regex: search, $options: "i" } },
      { login: { $regex: search, $options: "i" } },
    ],
  };
  const statusQuery = {};
  switch (status) {
    case "active":
      statusQuery["active?"] = true;
      break;
    case "inactive":
      statusQuery["active?"] = false;
      break;
    case "test":
      statusQuery.is_test = true;
      break;
    case "alumni":
      statusQuery["alumni?"] = true;
      break;
    case "staff":
      statusQuery["staff?"] = true;
      break;
    case "blackholed":
      statusQuery.blackholed = true;
      break;
    case "transcender":
      statusQuery.grade = "transcender";
      break;
    case "cadet":
      statusQuery.grade = "cadet";
      break;
    case "piscine":
      statusQuery.grade = "piscine";
      statusQuery["active?"] = true;
      break;
    case "sinker":
      statusQuery.sinker = true;
      break;
    case "freeze":
      statusQuery.freeze = true;
      break;
  }
  const aggregatePipeline = [
    {
      $match: {
        score: -42,
      },
    },
    {
      $sort: { updatedAt: order === "asc" ? 1 : -1 },
    },
    {
      $lookup: {
        from: "students",
        let: { projectLogin: "$login" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$login", "$$projectLogin"] },
              ...baseQuery,
              ...statusQuery,
            },
          },
        ],
        as: "student",
      },
    },
    {
      $unwind: "$student",
    },
    {
      $group: {
        _id: "$login",
        project: { $first: "$$ROOT" },
        student: { $first: "$student" },
      },
    },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: [
            "$student",
            { latest_cheat_project: "$project", has_cheats: 1 },
          ],
        },
      },
    },
    { $skip: skip },
    { $limit: limit },
  ];

  const [studentsResult, totalResult] = await Promise.all([
    Project.aggregate(aggregatePipeline).collation({ locale: "en" }),
    Project.aggregate([
      {
        $match: {
          score: -42,
        },
      },
      {
        $lookup: {
          from: "students",
          let: { projectLogin: "$login" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$login", "$$projectLogin"] },
                ...baseQuery,
                ...statusQuery,
              },
            },
          ],
          as: "student",
        },
      },
      {
        $match: {
          student: { $ne: [] },
        },
      },
      {
        $group: {
          _id: "$login",
        },
      },
      { $count: "total" },
    ]),
  ]);

  const total = totalResult[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    students: studentsResult,
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
    const baseQuery = {
        ...(campusId && { campusId }),
        ...(pool && { pool_month: pool.month, pool_year: pool.year }),
        $or: [
            { name: { $regex: search, $options: "i" } },
            { displayName: { $regex: search, $options: "i" } },
            { login: { $regex: search, $options: "i" } },
        ],
    };
    const statusQuery = {};
    switch (status) {
        case "active":
            statusQuery["active?"] = true;
            break;
        case "inactive":
            statusQuery["active?"] = false;
            break;
        case "test":
            statusQuery.is_test = true;
            break;
        case "alumni":
            statusQuery["alumni?"] = true;
            break;
        case "staff":
            statusQuery["staff?"] = true;
            break;
        case "blackholed":
            statusQuery.blackholed = true;
            break;
        case "transcender":
            statusQuery.grade = "transcender";
            break;
        case "cadet":
            statusQuery.grade = "cadet";
            break;
        case "piscine":
            statusQuery.grade = "piscine";
            statusQuery["active?"] = true;
            break;
        case "sinker":
            statusQuery.sinker = true;
            break;
        case "freeze":
            statusQuery.freeze = true;
            break;
    }

    const aggregatePipeline = [
        {
            $facet: {
                as_godfather: [
                    {
                        $group: {
                            _id: "$godfather",
                            children_count: { $sum: 1 },
                        },
                    },
                ],
                as_children: [
                    {
                        $group: {
                            _id: "$children",
                            godfather_count: { $sum: 1 },
                        },
                    },
                ],
            },
        },
        {
            $project: {
                combined: {
                    $concatArrays: [
                        {
                            $map: {
                                input: "$as_godfather",
                                as: "item",
                                in: {
                                    login: "$$item._id",
                                    children_count: "$$item.children_count",
                                    godfather_count: 0,
                                },
                            },
                        },
                        {
                            $map: {
                                input: "$as_children",
                                as: "item",
                                in: {
                                    login: "$$item._id",
                                    children_count: 0,
                                    godfather_count: "$$item.godfather_count",
                                },
                            },
                        },
                    ],
                },
            },
        },
        { $unwind: "$combined" },
        {
            $group: {
                _id: "$combined.login",
                children_count: { $sum: "$combined.children_count" },
                godfather_count: { $sum: "$combined.godfather_count" },
            },
        },
        {
            $lookup: {
                from: "students",
                let: { login: "$_id" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$login", "$$login"] },
                            ...baseQuery,
                            ...statusQuery,
                        },
                    },
                ],
                as: "student",
            },
        },
        { $unwind: "$student" },
        {
            $replaceRoot: {
                newRoot: {
                    $mergeObjects: [
                        "$student",
                        {
                            children_count: "$children_count",
                            godfather_count: "$godfather_count",
                        },
                    ],
                },
            },
        },
        { $sort: { [sorttype]: order === "asc" ? 1 : -1 } },
        { $skip: skip },
        { $limit: limit },
    ];

    const [studentsResult, totalResult] = await Promise.all([
        Patronage.aggregate(aggregatePipeline),
        Patronage.aggregate([
            {
                $facet: {
                    as_godfather: [
                        {
                            $group: {
                                _id: "$godfather",
                            },
                        },
                    ],
                    as_children: [
                        {
                            $group: {
                                _id: "$children",
                            },
                        },
                    ],
                },
            },
            {
                $project: {
                    combined: {
                        $concatArrays: [
                            { $map: { input: "$as_godfather", as: "item", in: "$$item._id" } },
                            { $map: { input: "$as_children", as: "item", in: "$$item._id" } },
                        ],
                    },
                },
            },
            { $unwind: "$combined" },
            {
                $group: {
                    _id: "$combined",
                },
            },
            {
                $lookup: {
                    from: "students",
                    let: { login: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ["$login", "$$login"] },
                                ...baseQuery,
                                ...statusQuery,
                            },
                        },
                    ],
                    as: "student",
                },
            },
            {
                $match: {
                    student: { $ne: [] },
                },
            },
            { $count: "total" },
        ]),
    ]);

    const total = totalResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);
    
    return {
        students: studentsResult,
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
  const baseQuery = {
    ...(campusId && { campusId }),
    ...(pool && { pool_month: pool.month, pool_year: pool.year }),
    $or: [
      { name: { $regex: search, $options: "i" } },
      { displayName: { $regex: search, $options: "i" } },
      { login: { $regex: search, $options: "i" } },
    ],
  };
  const statusQuery = {};
  switch (status) {
    case "active":
      statusQuery["active?"] = true;
      break;
    case "inactive":
      statusQuery["active?"] = false;
      break;
    case "test":
      statusQuery.is_test = true;
      break;
    case "alumni":
      statusQuery["alumni?"] = true;
      break;
    case "staff":
      statusQuery["staff?"] = true;
      break;
    case "blackholed":
      statusQuery.blackholed = true;
      break;
    case "transcender":
      statusQuery.grade = "transcender";
      break;
    case "cadet":
      statusQuery.grade = "cadet";
      break;
    case "piscine":
      statusQuery.grade = "piscine";
      statusQuery["active?"] = true;
      break;
    case "sinker":
      statusQuery.sinker = true;
      break;
    case "freeze":
      statusQuery.freeze = true;
      break;
  }

  const aggregatePipeline = [
    {
      $match: campusId ? { campusId } : {},
    },
    {
      $addFields: {
        totalLogTime: {
          $reduce: {
            input: { $objectToArray: "$months" },
            initialValue: 0,
            in: {
              $add: [
                "$$value",
                {
                  $let: {
                    vars: {
                      duration: "$$this.v.totalDuration",
                    },
                    in: {
                      $cond: {
                        if: { $ne: ["$$duration", null] },
                        then: {
                          $sum: [
                            {
                              $multiply: [
                                {
                                  $toInt: {
                                    $arrayElemAt: [
                                      { $split: ["$$duration", ":"] },
                                      0,
                                    ],
                                  },
                                },
                                3600,
                              ],
                            },
                            {
                              $multiply: [
                                {
                                  $toInt: {
                                    $arrayElemAt: [
                                      { $split: ["$$duration", ":"] },
                                      1,
                                    ],
                                  },
                                },
                                60,
                              ],
                            },
                            {
                              $toInt: {
                                $arrayElemAt: [
                                  { $split: ["$$duration", ":"] },
                                  2,
                                ],
                              },
                            },
                          ],
                        },
                        else: 0,
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
    {
      $lookup: {
        from: "students",
        let: { locationLogin: "$login" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$login", "$$locationLogin"] },
              ...baseQuery,
              ...statusQuery,
            },
          },
        ],
        as: "student",
      },
    },
    {
      $unwind: "$student",
    },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: ["$student", { log_time: "$totalLogTime" }],
        },
      },
    },
    { $sort: { log_time: order === "asc" ? 1 : -1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  const [studentsResult, totalResult] = await Promise.all([
    LocationStats.aggregate(aggregatePipeline),
    LocationStats.aggregate([
      {
        $match: campusId ? { campusId } : {},
      },
      {
        $lookup: {
          from: "students",
          let: { locationLogin: "$login" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$login", "$$locationLogin"] },
                ...baseQuery,
                ...statusQuery,
              },
            },
          ],
          as: "student",
        },
      },
      {
        $match: {
          student: { $ne: [] },
        },
      },
      { $count: "total" },
    ]),
  ]);

  const total = totalResult[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    students: studentsResult,
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
  const baseQuery = {
    ...(campusId && { campusId }),
    ...(pool && { pool_month: pool.month, pool_year: pool.year }),
    $or: [
      { name: { $regex: search, $options: "i" } },
      { displayName: { $regex: search, $options: "i" } },
      { login: { $regex: search, $options: "i" } },
    ],
  };
  const statusQuery = {};
  switch (status) {
    case "active":
      statusQuery["active?"] = true;
      break;
    case "inactive":
      statusQuery["active?"] = false;
      break;
    case "test":
      statusQuery.is_test = true;
      break;
    case "alumni":
      statusQuery["alumni?"] = true;
      break;
    case "staff":
      statusQuery["staff?"] = true;
      break;
    case "blackholed":
      statusQuery.blackholed = true;
      break;
    case "transcender":
      statusQuery.grade = "transcender";
      break;
    case "cadet":
      statusQuery.grade = "cadet";
      break;
    case "piscine":
      statusQuery.grade = "piscine";
      statusQuery["active?"] = true;
      break;
    case "sinker":
      statusQuery.sinker = true;
      break;
    case "freeze":
      statusQuery.freeze = true;
      break;
  }

  const aggregatePipeline = [
    {
      $match: campusId ? { campusId } : {},
    },
    {
      $group: {
        _id: "$login",
        feedback_count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "students",
        let: { feedbackLogin: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$login", "$$feedbackLogin"] },
              ...baseQuery,
              ...statusQuery,
            },
          },
        ],
        as: "student",
      },
    },
    {
      $unwind: "$student",
    },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: ["$student", { feedback_count: "$feedback_count" }],
        },
      },
    },
    { $sort: { feedback_count: order === "asc" ? 1 : -1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  const [studentsResult, totalResult] = await Promise.all([
    Feedback.aggregate(aggregatePipeline),
    Feedback.aggregate([
      {
        $match: campusId ? { campusId } : {},
      },
      {
        $group: {
          _id: "$login",
        },
      },
      {
        $lookup: {
          from: "students",
          let: { feedbackLogin: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$login", "$$feedbackLogin"] },
                ...baseQuery,
                ...statusQuery,
              },
            },
          ],
          as: "student",
        },
      },
      {
        $match: {
          student: { $ne: [] },
        },
      },
      { $count: "total" },
    ]),
  ]);

  const total = totalResult[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    students: studentsResult,
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
  const baseQuery = {
    ...(campusId && { campusId }),
    ...(pool && { pool_month: pool.month, pool_year: pool.year }),
    $or: [
      { name: { $regex: search, $options: "i" } },
      { displayName: { $regex: search, $options: "i" } },
      { login: { $regex: search, $options: "i" } },
    ],
  };
  const statusQuery = {};
  switch (status) {
    case "active":
      statusQuery["active?"] = true;
      break;
    case "inactive":
      statusQuery["active?"] = false;
      break;
    case "test":
      statusQuery.is_test = true;
      break;
    case "alumni":
      statusQuery["alumni?"] = true;
      break;
    case "staff":
      statusQuery["staff?"] = true;
      break;
    case "blackholed":
      statusQuery.blackholed = true;
      break;
    case "transcender":
      statusQuery.grade = "transcender";
      break;
    case "cadet":
      statusQuery.grade = "cadet";
      break;
    case "piscine":
      statusQuery.grade = "piscine";
      statusQuery["active?"] = true;
      break;
    case "sinker":
      statusQuery.sinker = true;
      break;
    case "freeze":
      statusQuery.freeze = true;
      break;
  }

  const aggregatePipeline = [
    {
      $match: {
        ...(campusId && { campusId }),
        rating: { $ne: null },
      },
    },
    {
      $group: {
        _id: "$login",
        avg_rating: { $avg: "$rating" },
      },
    },
    {
      $lookup: {
        from: "students",
        let: { feedbackLogin: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$login", "$$feedbackLogin"] },
              ...baseQuery,
              ...statusQuery,
            },
          },
        ],
        as: "student",
      },
    },
    {
      $unwind: "$student",
    },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: ["$student", { avg_rating: "$avg_rating" }],
        },
      },
    },
    { $sort: { avg_rating: order === "asc" ? 1 : -1 } },
    { $skip: skip },
    { $limit: limit },
  ];

  const [studentsResult, totalResult] = await Promise.all([
    Feedback.aggregate(aggregatePipeline),
    Feedback.aggregate([
      {
        $match: {
          ...(campusId && { campusId }),
          rating: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$login",
        },
      },
      {
        $lookup: {
          from: "students",
          let: { feedbackLogin: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$login", "$$feedbackLogin"] },
                ...baseQuery,
                ...statusQuery,
              },
            },
          ],
          as: "student",
        },
      },
      {
        $match: {
          student: { $ne: [] },
        },
      },
      { $count: "total" },
    ]),
  ]);

  const total = totalResult[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return {
    students: studentsResult,
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
