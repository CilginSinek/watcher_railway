const mongoose = require("mongoose");
const { db1, db2 } = require("./db");

// Mongoose Schemas - students.json yapısına göre
const studentSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  campusId: { type: Number, required: true, index: true },
  email: String,
  login: { type: String, required: true, unique: true, index: true },
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
  created_at: Date,
  updated_at: Date,
  alumnized_at: Date,
  "alumni?": Boolean,
  "active?": Boolean,
  // Milestone bilgileri
  blackholed: { type: Boolean, default: null },
  next_milestone: { type: String, default: null },
  // Piscine durumu (pool_month/pool_year şu an veya gelecekteyse true)
  is_piscine: { type: Boolean, default: false },
  // Transfer öğrenci durumu (alumni olursa false)
  is_trans: { type: Boolean, default: false },
  // Freeze durumu (inactive + agu var)
  freeze: { type: Boolean, default: null },
  // Sinker durumu (inactive + agu yok)
  sinker: { type: Boolean, default: null },
  // Grade bilgisi (HTML'den alınır)
  grade: { 
    type: String, 
    enum: ['Cadet', 'Pisciner', 'Transcender', 'Alumni', 'Staff'],
    default: null 
  },
  // Test account durumu (HTML'den alınır)
  is_test: { type: Boolean, default: false },
  // Level bilgisi (HTML'den alınır - örn: 10.64)
  level: { type: Number, default: null }
}, { timestamps: true });

// Optimization: Add compound indexes for common queries
studentSchema.index({ campusId: 1, 'active?': 1 }); // Active students per campus
studentSchema.index({ campusId: 1, blackholed: 1 }); // Blackholed students
studentSchema.index({ campusId: 1, grade: 1 }); // Students by grade

const projectSchema = new mongoose.Schema({
  campusId: { type: Number, required: true, index: true },
  login: { type: String, required: true, index: true },
  project: { type: String, required: true },
  score: { type: Number, required: true },
  date: { type: String, required: true }, // Ana tarih (güncel)
  penaltyDate: { type: String, default: null }, // Cheat tespit edilip -42 verildiği tarih (varsa)
  status: { 
    type: String, 
    enum: ['success', 'fail', 'in_progress'],
    required: true,
    index: true // Index for filtering by status
  }
}, { timestamps: true });

// Composite index for projects - aynı kişi aynı projede tekrar çekmesin
projectSchema.index({ login: 1, project: 1 }, { unique: true });
// Optimization: Additional indexes for common queries
projectSchema.index({ campusId: 1, status: 1 }); // Projects by campus and status
projectSchema.index({ login: 1, status: 1 }); // User projects by status

// Location Stats Schema - Son 3 ayın lokasyon verileri (tek kayıt per öğrenci)
const locationStatsSchema = new mongoose.Schema({
  login: { type: String, required: true, unique: true, index: true },
  campusId: { type: Number, required: true, index: true },
  // Her ay için toplam süre ve günlük detaylar
  months: {
    type: Map,
    of: {
      totalDuration: String, // "HH:MM:SS" formatında aylık toplam
      days: {
        type: Map,
        of: String // Gün -> "HH:MM:SS" formatında süre
      }
    },
    default: {}
  },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

// Patronage Schema - Godfathers (patroned by) ve Children (patroning)
const patronageSchema = new mongoose.Schema({
  login: { type: String, required: true, unique: true, index: true },
  campusId: { type: Number, required: true, index: true },
  // Godfathers (patroned by) - Bu kişinin mentorları
  godfathers: [{
    login: { type: String, required: true }
  }],
  // Children (patroning) - Bu kişinin mentee'leri
  children: [{
    login: { type: String, required: true }
  }],
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

// Feedback Schema - Kullanıcılara yapılan evaluation feedback'leri
const feedbackSchema = new mongoose.Schema({
  login: { type: String, required: true }, // Feedback alan kişi (sayfanın sahibi)
  campusId: { type: Number, required: true },
  evaluator: { type: String, required: true }, // Feedback veren kişi (evaluated eden)
  evaluated: { type: String, required: true }, // Değerlendirilen kişi (evaluated olan)
  project: { type: String, required: true }, // Hangi proje için
  date: { type: String, required: true }, // Evaluation tarihi
  // Feedback puanları
  rating: { type: Number, default: null }, // 5 üzerinden puan (örn: 5)
  // Rating detayları obje olarak (Nice, Rigorous, Interested, Punctuality)
  ratingDetails: {
    nice: { type: Number, default: null }, // 4 üzerinden (örn: 4)
    rigorous: { type: Number, default: null }, // 4 üzerinden (örn: 4)
    interested: { type: Number, default: null }, // 4 üzerinden (örn: 4)
    punctuality: { type: Number, default: null } // 4 üzerinden (örn: 4)
  },
  comment: { type: String, default: null } // Feedback yorumu
}, { timestamps: true });

// Composite index - aynı feedback tekrar kaydedilmesin
feedbackSchema.index({ login: 1, evaluator: 1, evaluated: 1, project: 1, date: 1 }, { unique: true });
// Optimization: Additional indexes for common queries
feedbackSchema.index({ campusId: 1 }); // Feedbacks by campus
feedbackSchema.index({ login: 1, project: 1 }); // User feedbacks by project
feedbackSchema.index({ evaluated: 1 }); // Feedbacks by evaluated user

// Project Review Schema - Evaluationlar (iduman evaluated skaynar'ın CPP Module 03 projesini)
const projectReviewSchema = new mongoose.Schema({
  campusId: { type: Number, required: true, index: true },
  evaluator: { type: String, required: true }, // Evoyu yapan kişi (iduman)
  evaluated: { type: String, required: true, index: true }, // Evoyu alan kişi (skaynar)
  project: { type: String, required: true }, // Proje ismi (CPP Module 03)
  date: { type: String, required: true }, // Scheduled tarihi
  score: { type: Number, default: null }, // Proje puanı (sınırsız)
  status: { 
    type: String, 
    default: null 
  }, // Proje durumu (ok, invalid_compilation, vs.)
  evaluatorComment: { type: String, default: null } // Evaluator'ın final-mark comment'i
}, { timestamps: true });

// Composite index - aynı review tekrar kaydedilmesin
projectReviewSchema.index({ evaluator: 1, evaluated: 1, project: 1, date: 1 }, { unique: true });
// Optimization: Additional indexes
projectReviewSchema.index({ campusId: 1, status: 1 }); // Reviews by campus and status
projectReviewSchema.index({ evaluator: 1 }); // Reviews by evaluator
projectReviewSchema.index({ evaluated: 1, project: 1 }); // Reviews by evaluated user and project

const eventlogSchema = new mongoose.Schema({
  login: { type: String, required: true, index: true },
  campusId: { type: Number, required: true, index: true },
  eventType: { type: String, required: true }, // Örn: "api_request", "dashboard_view", vs.
  eventData: { type: mongoose.Schema.Types.Mixed }, // Olayla ilgili ek veri (nesne olabilir)
  // Request details
  ip: { type: String },
  userAgent: { type: String },
  method: { type: String }, // GET, POST, etc.
  path: { type: String }, // Request path
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

eventlogSchema.index({ login: 1, eventType: 1, timestamp: -1 }); // Kullanıcı olayları zaman sırasına göre
eventlogSchema.index({ campusId: 1, eventType: 1, timestamp: -1 }); // Kampüs olayları zaman sırasına göre

// Session Schema - User sessions
const sessionSchema = new mongoose.Schema({
  sessionToken: { type: String, required: true, unique: true, index: true },
  login: { type: String, required: true, index: true },
  campusId: { type: Number, required: true },
  userData: { type: mongoose.Schema.Types.Mixed }, // Full user data from 42 API
  usedIps: [{ type: String }], // Array of IPs this session was used from
  lastActivity: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: true }
}, { timestamps: true });

sessionSchema.index({ login: 1, lastActivity: -1 }); // User sessions by last activity
sessionSchema.index({ expiresAt: 1 }); // For automatic cleanup of expired sessions


// DB1 (Primary) - All data except project reviews
const Student = db1.model("Student", studentSchema);
const Project = db1.model("Project", projectSchema);
const LocationStats = db1.model("LocationStats", locationStatsSchema);
const Patronage = db1.model("Patronage", patronageSchema);
const Feedback = db1.model("Feedback", feedbackSchema);

// DB2 (Secondary) - Only project reviews and students
const Student2 = db2.model("Student", studentSchema);
const ProjectReview = db2.model("ProjectReview", projectReviewSchema);
const EventLog = db2.model("EventLog", eventlogSchema);
const Session = db2.model("Session", sessionSchema);

module.exports = { Student, Project, LocationStats, Patronage, Feedback, ProjectReview, Student2, EventLog, Session };
