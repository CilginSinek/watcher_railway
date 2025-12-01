const { ottoman } = require('../config/database');
const { Schema } = require('ottoman');

// Helper to create models with ottoman instance
const createModel = (name, schema, options) => {
  try {
    return ottoman.model(name, schema, options);
  } catch (error) {
    console.error(`Error creating model ${name}:`, error.message);
    throw error;
  }
};

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
  alumnized_at: String,
  "alumni?": Boolean,
  "active?": Boolean,
  created_at: String,
  
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
  timestamps: true
  // Removed indexes - they cause memory corruption in Ottoman
  // Create indexes manually in Couchbase using N1QL
});

const Student = createModel('Student', studentSchema, { 
  collectionName: 'students',
  scopeName: '_default',
  modelKey: 'type' // DB uses 'type' instead of '_type'
});

// ---------------------------------------------------------
// 2. PROJECT MODEL
// ---------------------------------------------------------
const projectSchema = new Schema({
  campusId: { type: Number, required: true },
  login: { type: String, required: true },
  project: { type: String, required: true }, // DB uses 'project' not 'name'
  score: { type: Number, required: true }, // DB uses 'score' not 'final_mark'
  status: { type: String, required: true },
  date: { type: String, required: true }
}, { 
  timestamps: true
  // Removed indexes
});

const Project = createModel('Project', projectSchema, { 
  collectionName: 'projects',
  scopeName: '_default',
  modelKey: 'type'
});

// ---------------------------------------------------------
// 3. LOCATION STATS MODEL
// ---------------------------------------------------------
const locationStatsSchema = new Schema({
  id: { type: Number, required: true },
  login: { type: String, required: true },
  campusId: { type: Number, required: true },
  host: { type: String, required: true },
  begin_at: { type: String, required: true },
  end_at: { type: String, default: null }
}, { 
  timestamps: true
  // Removed indexes - create manually in Couchbase
});

const LocationStats = createModel('LocationStats', locationStatsSchema, { 
  collectionName: 'locationstats',
  scopeName: '_default',
  modelKey: 'type'
});

// ---------------------------------------------------------
// 4. PATRONAGE MODEL
// ---------------------------------------------------------
const patronageSchema = new Schema({
  id: { type: Number, required: true },
  user_id: { type: Number, required: true },
  user_login: { type: String, required: true },
  godfather_id: { type: Number, required: true },
  godfather_login: { type: String, required: true },
  campusId: { type: Number, required: true }
}, { 
  timestamps: true
  // Removed indexes - create manually in Couchbase
});

const Patronage = createModel('Patronage', patronageSchema, { 
  collectionName: 'patronages',
  scopeName: '_default',
  modelKey: 'type'
});

// ---------------------------------------------------------
// 5. FEEDBACK MODEL
// ---------------------------------------------------------
const feedbackSchema = new Schema({
  id: { type: Number, required: true },
  login: { type: String, required: true },
  campusId: { type: Number, required: true },
  rating: { type: Number, default: null },
  comment: { type: String, default: null },
  final_mark: { type: Number, required: true },
  created_at: { type: String, required: true }
}, { 
  timestamps: true
  // Removed indexes - create manually in Couchbase
});

const Feedback = createModel('Feedback', feedbackSchema, { 
  collectionName: 'feedbacks',
  scopeName: '_default',
  modelKey: 'type'
});

module.exports = { 
  Student, 
  Project, 
  LocationStats, 
  Patronage, 
  Feedback
};
