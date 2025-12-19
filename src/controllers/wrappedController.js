/**
 * Generate 2025 wrapped summary for a user
 * @param {Object} data - User data from various collections
 * @returns {Object} - Wrapped summary in JSON format
 */
function generateWrappedSummary(data) {
  const {
    student,
    projects = [],
    projectReviews = [],
    feedbacks = [],
    patronage = null,
  } = data;

  const summary = {};
  const highlights = {};
  const stats = {};
  const labels = [];
  const fallbackNotes = [];

  // Helper: Extract words from text
  const extractWords = (texts) => {
    const wordMap = {};
    texts.forEach(text => {
      if (!text) return;
      const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3);
      words.forEach(word => {
        wordMap[word] = (wordMap[word] || 0) + 1;
      });
    });
    return wordMap;
  };

  // Helper: Parse project name and retry count
  const parseProjectName = (projectName) => {
    if (!projectName) return { name: '', retryCount: 0 };
    const match = projectName.match(/^(.+?)#(\d+)$/);
    if (match) {
      return { name: match[1], retryCount: parseInt(match[2], 10) };
    }
    return { name: projectName, retryCount: 0 };
  };

  // Analyze projects
  const projectAttempts = {};
  const projectsByMonth = {};
  let maxRetryCount = 0;
  let maxRetryProject = null;

  projects.forEach(p => {
    const { name, retryCount } = parseProjectName(p.project);
    
    projectAttempts[name] = (projectAttempts[name] || 0) + 1;
    
    if (retryCount > maxRetryCount) {
      maxRetryCount = retryCount;
      maxRetryProject = name;
    }
    
    const month = p.date ? new Date(p.date).getMonth() : null;
    if (month !== null) {
      projectsByMonth[month] = (projectsByMonth[month] || 0) + 1;
    }
  });

  const mostAttemptedProject = Object.entries(projectAttempts)
    .sort((a, b) => b[1] - a[1])[0];

  if (mostAttemptedProject && mostAttemptedProject[1] > 1) {
    highlights.mostAttemptedProject = {
      name: mostAttemptedProject[0],
      attempts: mostAttemptedProject[1]
    };
  }

  // Add retry count highlight if exists
  if (maxRetryCount > 0 && maxRetryProject) {
    highlights.highestRetryCount = {
      project: maxRetryProject,
      retries: maxRetryCount
    };
  }

  // Analyze project reviews (as reviewer)
  const reviewedProjects = {};
  const reviewedUsers = {};
  projectReviews.forEach(pr => {
    if (pr.project) {
      reviewedProjects[pr.project] = (reviewedProjects[pr.project] || 0) + 1;
    }
    if (pr.evaluated) {
      reviewedUsers[pr.evaluated] = (reviewedUsers[pr.evaluated] || 0) + 1;
    }
  });

  const mostReviewedProject = Object.entries(reviewedProjects)
    .sort((a, b) => b[1] - a[1])[0];
  const mostReviewedUser = Object.entries(reviewedUsers)
    .sort((a, b) => b[1] - a[1])[0];

  if (mostReviewedProject) {
    highlights.mostReviewedProject = {
      name: mostReviewedProject[0],
      count: mostReviewedProject[1]
    };
  }

  if (mostReviewedUser) {
    highlights.mostReviewedUser = {
      login: mostReviewedUser[0],
      count: mostReviewedUser[1]
    };
  }

  // Analyze feedbacks (as evaluator)
  const feedbackUsers = {};
  feedbacks.forEach(fb => {
    if (fb.evaluated) {
      feedbackUsers[fb.evaluated] = (feedbackUsers[fb.evaluated] || 0) + 1;
    }
  });

  const mostFeedbackUser = Object.entries(feedbackUsers)
    .sort((a, b) => b[1] - a[1])[0];

  if (mostFeedbackUser) {
    highlights.mostFeedbackGiven = {
      login: mostFeedbackUser[0],
      count: mostFeedbackUser[1]
    };
  }

  // Most used words (from reviews and feedbacks)
  const allTexts = [
    ...projectReviews.map(pr => pr.comment).filter(Boolean),
    ...feedbacks.map(fb => fb.comment).filter(Boolean)
  ];

  const wordFrequency = extractWords(allTexts);
  const topWords = Object.entries(wordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topWords.length > 0) {
    highlights.mostUsedWords = topWords.map(([word, count]) => ({ word, count }));
  }

  // Activity analysis
  const allActivityDates = [
    ...projects.map(p => p.date).filter(Boolean),
    ...projectReviews.map(pr => pr.createdAt || pr.date).filter(Boolean),
    ...feedbacks.map(fb => fb.createdAt || fb.date).filter(Boolean)
  ].map(d => new Date(d));

  // Find most active week
  const weekActivity = {};
  allActivityDates.forEach(date => {
    if (isNaN(date.getTime())) return;
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];
    weekActivity[weekKey] = (weekActivity[weekKey] || 0) + 1;
  });

  const mostActiveWeek = Object.entries(weekActivity)
    .sort((a, b) => b[1] - a[1])[0];

  if (mostActiveWeek) {
    highlights.mostActiveWeek = {
      week: mostActiveWeek[0],
      activities: mostActiveWeek[1]
    };
  }

  // Find quietest period (30-day windows with no activity)
  if (allActivityDates.length > 1) {
    const sortedDates = allActivityDates.sort((a, b) => a - b);
    let longestGap = 0;
    let gapStart = null;
    
    for (let i = 1; i < sortedDates.length; i++) {
      const gap = (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
      if (gap > longestGap) {
        longestGap = gap;
        gapStart = sortedDates[i - 1];
      }
    }

    if (longestGap > 7) {
      highlights.quietestPeriod = {
        days: Math.floor(longestGap),
        startDate: gapStart?.toISOString().split('T')[0]
      };
    }
  }

  // Stats summary
  stats.totalProjects = projects.length;
  stats.totalReviews = projectReviews.length;
  stats.totalFeedbacks = feedbacks.length;
  stats.passedProjects = projects.filter(p => p.status === 'finished' && p.score >= 0).length;
  stats.avgProjectScore = projects.length > 0
    ? Math.round(projects.reduce((sum, p) => sum + (p.score || 0), 0) / projects.length)
    : 0;

  // Patronage stats
  if (patronage) {
    stats.godfathers = patronage.godfathers?.length || 0;
    stats.children = patronage.children?.length || 0;
  }

  // Generate labels based on behavior
  const hasLowActivity = stats.totalProjects < 5;
  const hasRepeatedAttempts = mostAttemptedProject && mostAttemptedProject[1] >= 5;
  const hasMoreFeedbackThanProjects = stats.totalFeedbacks > stats.totalProjects && stats.totalProjects < 10;
  const hasMentorRole = (stats.children || 0) > 2;
  const hasQuietPeriod = highlights.quietestPeriod && highlights.quietestPeriod.days > 14;

  if (hasRepeatedAttempts) {
    labels.push("Vazgeçmeyen");
  }

  if (hasMoreFeedbackThanProjects) {
    labels.push("Sessiz ama derin");
  }

  if (hasMentorRole) {
    labels.push("Mentor ruhlu");
  }

  if (hasQuietPeriod && !hasLowActivity) {
    labels.push("Geri dönen");
  }

  if (hasLowActivity) {
    labels.push("Yeni başlayan");
    fallbackNotes.push("Bu sene temeller atıldı");
    fallbackNotes.push("Yolun başı ama yön belli");
  }

  if (stats.totalReviews > 200) {
    labels.push("Topluluk destekçisi");
  }

  if (labels.length === 0) {
    labels.push("Keşif aşamasında");
  }

  // Limit to 4 labels
  labels.splice(4);

  // Generate summary
  const totalActivity = stats.totalProjects + stats.totalReviews + stats.totalFeedbacks;
  
  if (totalActivity > 50) {
    summary.headline = "Yoğun bir yıl geçirdin!";
    summary.shortDescription = `${stats.totalProjects} proje, ${stats.totalReviews} review ve ${stats.totalFeedbacks} feedback ile dolu bir 2025.`;
  } else if (totalActivity > 20) {
    summary.headline = "Güzel bir ilerleme kaydedildi";
    summary.shortDescription = `2025'te ${stats.totalProjects} projeye giriş yapıldı ve toplulukla ${stats.totalReviews + stats.totalFeedbacks} etkileşim gerçekleştirildi.`;
  } else if (totalActivity > 5) {
    summary.headline = "Başlangıçlar yapıldı";
    summary.shortDescription = `İlk adımlar atıldı. ${stats.totalProjects} proje deneyimi ve ${stats.totalReviews + stats.totalFeedbacks} topluluk etkileşimi.`;
  } else {
    summary.headline = "Keşif yılı";
    summary.shortDescription = "2025 yolculuğun başlangıcı oldu. Her büyük hikaye bir adımla başlar.";
    if (fallbackNotes.length === 0) {
      fallbackNotes.push("Yeni başlangıçlar heyecan verici");
      fallbackNotes.push("İlk adımlar en değerlileri");
    }
  }

  return {
    summary,
    highlights,
    stats,
    labels,
    fallbackNotes
  };
}

module.exports = {
  generateWrappedSummary
};
