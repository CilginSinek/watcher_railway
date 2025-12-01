const { Schema, model } = require('ottoman');

// ---------------------------------------------------------
// 1. STUDENT MODEL
// ---------------------------------------------------------
const studentSchema = new Schema({
  id: { type: Number, required: true },
  campusId: { type: Number, required: true },
  email: String,
  login: { type: String, required: true },
  first_name: String,
  last_name: String,
  usual_full_name: String,
  usual_first_name: String,
  url: String,
  phone: String,
  displayname: String,
  kind: String,
  image: {
    link: String,
    versions: {
      large: String,
      medium: String,
      small: String,
      micro: String
    }
  },
  "staff?": Boolean,
  correction_point: Number,
  pool_month: String,
  pool_year: String,
  wallet: Number,
  anonymize_date: String,
  data_erasure_date: String,
  alumnized_at: String, // Tarih veya null olabiliyor, String/Mixed güvenli
  "alumni?": Boolean,
  "active?": Boolean,
  created_at: String,
  
  // KRİTİK DEĞİŞİKLİKLER (Null hatasını çözer)
  blackholed: { type: Schema.Types.Mixed, default: null },
  next_milestone: { type: Schema.Types.Mixed, default: null },
  freeze: { type: Schema.Types.Mixed, default: null },
  sinker: { type: Schema.Types.Mixed, default: null },
  grade: { type: Schema.Types.Mixed, default: null }, 
  
  is_piscine: { type: Boolean, default: false },
  is_trans: { type: Boolean, default: false },
  is_test: { type: Boolean, default: false },
  level: { type: Number, default: null }
}, { 
  timestamps: true,
  indexes: {
    findByCampusAndActive: { by: ['campusId', 'active?'] },
    findByLogin: { by: 'login' },
    findById: { by: 'id' } // ID ile arama için index
  }
});

const Student = model('Student', studentSchema, { 
  collectionName: 'students',
  scopeName: '_default' 
});

// ---------------------------------------------------------
// 2. PROJECT MODEL
// ---------------------------------------------------------
const projectSchema = new Schema({
  campusId: { type: Number, required: true },
  login: { type: String, required: true },
  project: { type: String, required: true },
  score: { type: Number, required: true },
  date: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['success', 'fail', 'in_progress'],
    required: true
  }
}, { 
  timestamps: true,
  indexes: {
    findUniqueRecord: { by: ['login', 'project', 'date'] }, // Composite Index
    findByStatus: { by: ['campusId', 'status'] }
  }
});

const Project = model('Project', projectSchema, { 
  collectionName: 'projects',
  scopeName: '_default'
});

// ---------------------------------------------------------
// 3. LOCATION STATS MODEL
// ---------------------------------------------------------
const locationStatsSchema = new Schema({
  login: { type: String, required: true },
  campusId: { type: Number, required: true },
  months: {
    type: Schema.Types.Mixed, 
    default: {}
  },
  lastUpdated: { type: Date, default: () => new Date() }
}, { 
  timestamps: true,
  indexes: {
    findByLogin: { by: 'login' }
  }
});

const LocationStats = model('LocationStats', locationStatsSchema, { 
  collectionName: 'locationstats',
  scopeName: '_default'
});

// ---------------------------------------------------------
// 4. PATRONAGE MODEL
// ---------------------------------------------------------
const patronageSchema = new Schema({
  login: { type: String, required: true },
  campusId: { type: Number, required: true },
  godfathers: [{
    login: { type: String, required: true }
  }],
  children: [{
    login: { type: String, required: true }
  }],
  lastUpdated: { type: Date, default: () => new Date() }
}, { 
  timestamps: true,
  indexes: {
    findByLogin: { by: 'login' }
  }
});

const Patronage = model('Patronage', patronageSchema, { 
  collectionName: 'patronages',
  scopeName: '_default'
});

// ---------------------------------------------------------
// 5. FEEDBACK MODEL
// ---------------------------------------------------------
const feedbackSchema = new Schema({
  login: { type: String, required: true },
  campusId: { type: Number, required: true },
  evaluator: { type: String, required: true },
  evaluated: { type: String, required: true },
  project: { type: String, required: true },
  date: { type: String, required: true },
  rating: { type: Number, default: null },
  ratingDetails: {
    nice: { type: Number, default: null },
    rigorous: { type: Number, default: null },
    interested: { type: Number, default: null },
    punctuality: { type: Number, default: null }
  },
  comment: { type: String, default: null }
}, { 
  timestamps: true,
  indexes: {
    findUniqueFeedback: { by: ['login', 'evaluator', 'evaluated', 'project', 'date'] }
  }
});

const Feedback = model('Feedback', feedbackSchema, { 
  collectionName: 'feedbacks',
  scopeName: '_default'
});

// ---------------------------------------------------------
// 6. PROJECT REVIEW MODEL
// ---------------------------------------------------------
const projectReviewSchema = new Schema({
  login: { type: String, required: true },
  campusId: { type: Number, required: true },
  evaluator: { type: String, required: true },
  evaluated: { type: String, required: true },
  project: { type: String, required: true },
  date: { type: String, required: true },
  score: { type: Number, default: null },
  status: { type: String, default: null },
  evaluatorComment: { type: String, default: null },
}, { 
  timestamps: true,
  indexes: {
    findUniqueReview: { by: ['evaluator', 'evaluated', 'project', 'date'] }
  }
});

const ProjectReview = model('ProjectReview', projectReviewSchema, { 
  collectionName: 'projectreviews',
  scopeName: '_default'
});

module.exports = { 
  Student, 
  Project, 
  LocationStats, 
  Patronage, 
  Feedback, 
  ProjectReview 
};