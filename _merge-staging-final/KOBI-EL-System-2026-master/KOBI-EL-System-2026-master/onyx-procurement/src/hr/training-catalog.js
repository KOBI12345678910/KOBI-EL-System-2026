/**
 * Training Catalog & Learning Management System (LMS)
 * Agent Y-068 • Techno-Kol Uzi • Mega-ERP • Kobi EL 2026
 *
 * Zero-dependency, bilingual (Hebrew/English), Israeli-labor-law compliant
 * learning management system. Supports:
 *
 *   - Course catalog (in-person / online / self-paced / blended)
 *   - Session scheduling with seat capacity + waitlist
 *   - Enrollment, attendance tracking, completion + certificate issuance
 *   - Learning paths by role
 *   - Mandatory compliance training (Israeli law)
 *   - Certificate repository per employee
 *   - Department training-budget tracking
 *   - קרן השתלמות (study fund) course eligibility
 *   - Session-level feedback collection (NPS + rubrics)
 *
 * Israeli mandatory training encoded (see REQUIRED_COMPLIANCE):
 *   - בטיחות בעבודה — תקנות ארגון הפיקוח על העבודה (מסירת מידע והדרכת עובדים), תשנ"ט-1999
 *   - מניעת הטרדה מינית — חוק למניעת הטרדה מינית, תשנ"ח-1998 § 7(ב) + תקנות 1998
 *   - בטיחות אש — חוק הרשות הארצית לכבאות והצלה, תש"ע-2010
 *   - עזרה ראשונה — צו רישוי עסקים ותקנות הבטיחות בעבודה
 *   - חומ"ס (חומרים מסוכנים) — חוק החומרים המסוכנים, התשנ"ג-1993
 *   - הגנת הפרטיות / GDPR — חוק הגנת הפרטיות, תשמ"א-1981
 *
 * קרן השתלמות rules encoded (see STUDY_FUND_RULES):
 *   - ניתן לממן קורסים מקצועיים המעשירים את העובד בתפקידו או מכשירים לתפקיד חדש
 *   - לא ניתן לממן קורסי תחביב או חופשות/טיולים
 *   - תואר אקדמי ותעודת הסמכה מוכרים
 *   - תקרת הפקדה פטורה ממס: 15,712 ש"ח לשנה (2026)
 *
 * Policy: לא מוחקים רק משדרגים ומגדלים — no destructive methods. All
 * "removal" operations actually upgrade records with status/reason fields.
 *
 * Runtime: pure JS, no dependencies, node:test friendly.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS — Israeli labor & training law
// ═══════════════════════════════════════════════════════════════

const LABELS = {
  COURSE: { he: 'קורס', en: 'Course' },
  SESSION: { he: 'מפגש', en: 'Session' },
  ENROLLED: { he: 'רשום', en: 'Enrolled' },
  WAITLISTED: { he: 'רשימת המתנה', en: 'Waitlisted' },
  COMPLETED: { he: 'הושלם', en: 'Completed' },
  CANCELLED: { he: 'בוטל', en: 'Cancelled' },
  CERTIFICATE: { he: 'תעודה', en: 'Certificate' },
  INSTRUCTOR: { he: 'מדריך', en: 'Instructor' },
  ATTENDANCE: { he: 'נוכחות', en: 'Attendance' },
  PRESENT: { he: 'נוכח', en: 'Present' },
  ABSENT: { he: 'נעדר', en: 'Absent' },
  LATE: { he: 'מאחר', en: 'Late' },
  EXCUSED: { he: 'פטור', en: 'Excused' },
  MANDATORY: { he: 'חובה לפי חוק', en: 'Mandatory by law' },
  STUDY_FUND: { he: 'קרן השתלמות', en: 'Study fund' },
  BUDGET: { he: 'תקציב', en: 'Budget' },
  FEEDBACK: { he: 'משוב', en: 'Feedback' },
};

const COURSE_FORMATS = Object.freeze([
  'in-person',     // פרונטלי
  'online',        // מקוון (לייב)
  'self-paced',    // עצמי (הקלטות)
  'blended',       // משולב
]);

const COURSE_LEVELS = Object.freeze([
  'beginner',      // בסיסי
  'intermediate',  // מתקדם
  'advanced',      // מומחה
  'expert',        // מאסטר
]);

const ATTENDANCE_STATUSES = Object.freeze([
  'present', 'absent', 'late', 'excused',
]);

const ENROLLMENT_STATUSES = Object.freeze([
  'enrolled', 'waitlisted', 'completed', 'cancelled', 'no-show',
]);

/**
 * Israeli mandatory compliance training.
 * Each entry defines the course template, legal citation, renewal frequency
 * (in months), and which employee categories it applies to.
 */
const REQUIRED_COMPLIANCE = Object.freeze([
  {
    code: 'safety-general',
    title_he: 'הדרכת בטיחות כללית',
    title_en: 'General Safety Training',
    law_he: 'תקנות ארגון הפיקוח על העבודה (מסירת מידע והדרכת עובדים), תשנ"ט-1999',
    law_en: 'Work Supervision Organization Regulations (Information & Training), 1999',
    renewalMonths: 12,                    // annual
    appliesTo: ['*'],                     // all employees
    durationMinutes: 60,
  },
  {
    code: 'harassment-prevention',
    title_he: 'מניעת הטרדה מינית',
    title_en: 'Sexual Harassment Prevention',
    law_he: 'חוק למניעת הטרדה מינית, תשנ"ח-1998 § 7(ב)',
    law_en: 'Prevention of Sexual Harassment Law, 1998 § 7(b)',
    renewalMonths: 24,                    // every 2 years
    appliesTo: ['*'],                     // mandatory for all, emphasizing managers
    durationMinutes: 90,
    managerAddendum: true,
  },
  {
    code: 'fire-safety',
    title_he: 'בטיחות אש ומילוט',
    title_en: 'Fire Safety & Evacuation',
    law_he: 'חוק הרשות הארצית לכבאות והצלה, תש"ע-2010',
    law_en: 'National Fire & Rescue Authority Law, 2010',
    renewalMonths: 12,
    appliesTo: ['*'],
    durationMinutes: 45,
  },
  {
    code: 'first-aid',
    title_he: 'עזרה ראשונה',
    title_en: 'First Aid',
    law_he: 'צו רישוי עסקים + תקנות הבטיחות בעבודה (עזרה ראשונה)',
    law_en: 'Business Licensing Order + Safety-at-Work Regulations (First Aid)',
    renewalMonths: 24,                    // biennial
    appliesTo: ['designated-first-aider'],
    durationMinutes: 240,
  },
  {
    code: 'hazmat',
    title_he: 'חומרים מסוכנים (חומ"ס)',
    title_en: 'Hazardous Materials (HAZMAT)',
    law_he: 'חוק החומרים המסוכנים, התשנ"ג-1993',
    law_en: 'Hazardous Materials Law, 1993',
    renewalMonths: 12,
    appliesTo: ['hazmat-handler', 'warehouse', 'construction', 'painter'],
    durationMinutes: 180,
  },
  {
    code: 'privacy-gdpr',
    title_he: 'הגנת הפרטיות ואבטחת מידע',
    title_en: 'Privacy Protection & Data Security',
    law_he: 'חוק הגנת הפרטיות, תשמ"א-1981 + תקנות אבטחת מידע 2017',
    law_en: 'Privacy Protection Law, 1981 + Data Security Regulations 2017',
    renewalMonths: 24,
    appliesTo: ['hr', 'it', 'finance', 'management'],
    durationMinutes: 60,
  },
  {
    code: 'working-at-heights',
    title_he: 'עבודה בגובה',
    title_en: 'Working at Heights',
    law_he: 'תקנות הבטיחות בעבודה (עבודה בגובה), תשס"ז-2007',
    law_en: 'Safety at Work (Working at Heights) Regulations, 2007',
    renewalMonths: 24,
    appliesTo: ['construction', 'painter', 'maintenance'],
    durationMinutes: 480,                 // full 8-hour certification
    certification: true,
  },
]);

/**
 * קרן השתלמות (Study Fund) rules.
 * Israeli employees with study-fund accounts may withdraw to fund
 * approved professional development. Only courses that enrich the
 * employee's current role or qualify them for a new role are eligible.
 * Hobbies, pleasure trips, and personal-interest courses are NOT eligible.
 */
const STUDY_FUND_RULES = Object.freeze({
  // 2026 tax-exempt deposit ceiling (אחוזי הפרשה מקובלים: 7.5% מעביד + 2.5% עובד)
  ANNUAL_CEILING_ILS: 15712,

  // Minimum "ripening" period for withdrawal without tax (years)
  RIPENING_YEARS: 6,
  RIPENING_YEARS_RETIREMENT: 3,

  // Allowed course categories (prefix match or exact)
  ALLOWED_CATEGORIES: [
    'professional',          // הכשרה מקצועית
    'certification',         // תעודת הסמכה מקצועית
    'academic',              // תואר אקדמי
    'technical',             // טכני / הנדסי
    'management',            // ניהול
    'safety',                // בטיחות
    'language',              // שפות (לצורכי עבודה)
    'compliance',            // ציות ורגולציה
    'leadership',            // פיתוח מנהיגות
    'it',                    // טכנולוגיות מידע
  ],

  // Explicitly disallowed (for clarity + audit trail)
  DISALLOWED_CATEGORIES: [
    'hobby',                 // תחביב
    'leisure',               // פנאי
    'vacation',              // טיולים
    'personal-interest',     // עניין אישי לא תעסוקתי
  ],
});

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function nowIso() {
  return new Date().toISOString();
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function isNonEmptyString(x) {
  return typeof x === 'string' && x.trim().length > 0;
}

function clone(o) {
  // structuredClone is Node 17+, but also fall back to JSON round-trip.
  if (typeof structuredClone === 'function') {
    try { return structuredClone(o); } catch (_) { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(o));
}

// ═══════════════════════════════════════════════════════════════
// MAIN CLASS — TrainingCatalog
// ═══════════════════════════════════════════════════════════════

class TrainingCatalog {
  constructor(opts = {}) {
    // immutable storage buckets (we upgrade, never delete)
    this.courses = new Map();            // id -> course
    this.sessions = new Map();           // sessionId -> session
    this.enrollments = [];               // append-only log
    this.attendanceLog = [];             // append-only log
    this.completions = [];               // append-only log
    this.certificates = [];              // append-only repository
    this.feedback = [];                  // append-only feedback store
    this.budgets = new Map();            // "dept:period" -> budget
    this.spend = [];                     // append-only ledger
    this.learningPaths = new Map();      // role -> required course ids
    this.auditLog = [];                  // append-only audit trail

    // optional role -> required courses mapping (can be extended later)
    const defaultPaths = opts.learningPaths || {
      'construction-worker': [
        'safety-general', 'fire-safety', 'working-at-heights', 'first-aid',
      ],
      'painter': [
        'safety-general', 'fire-safety', 'hazmat', 'working-at-heights',
      ],
      'warehouse': [
        'safety-general', 'fire-safety', 'hazmat', 'first-aid',
      ],
      'hr': [
        'safety-general', 'harassment-prevention', 'privacy-gdpr', 'fire-safety',
      ],
      'it': [
        'safety-general', 'privacy-gdpr', 'fire-safety', 'harassment-prevention',
      ],
      'finance': [
        'safety-general', 'privacy-gdpr', 'fire-safety', 'harassment-prevention',
      ],
      'management': [
        'safety-general', 'harassment-prevention', 'privacy-gdpr', 'fire-safety',
        'first-aid',
      ],
      'office': [
        'safety-general', 'harassment-prevention', 'fire-safety',
      ],
    };
    for (const [role, courseIds] of Object.entries(defaultPaths)) {
      this.learningPaths.set(role, [...courseIds]);
    }

    // Counter for deterministic IDs when caller doesn't supply one
    this._counter = 0;

    // seed built-in mandatory compliance courses so they always exist
    for (const req of REQUIRED_COMPLIANCE) {
      this.addCourse({
        id: req.code,
        title_he: req.title_he,
        title_en: req.title_en,
        description: `${req.law_he} | ${req.law_en}`,
        category: 'compliance',
        duration: req.durationMinutes,
        format: 'blended',
        level: 'beginner',
        prerequisites: [],
        instructor: null,
        maxSeats: 50,
        cost: 0,
        mandatory: true,
        complianceCode: req.code,
        renewalMonths: req.renewalMonths,
        appliesTo: req.appliesTo,
        law_he: req.law_he,
        law_en: req.law_en,
      });
    }
  }

  // ──────────────────────────────────────────────────────────
  // 1. addCourse — create course record in catalog
  // ──────────────────────────────────────────────────────────
  addCourse(input) {
    assert(input && typeof input === 'object', 'addCourse: input required');
    const {
      id, title_he, title_en, description, category, duration, format,
      level, prerequisites = [], instructor = null, maxSeats = 30, cost = 0,
      mandatory = false, complianceCode = null, renewalMonths = null,
      appliesTo = null, law_he = null, law_en = null,
    } = input;

    assert(isNonEmptyString(id), 'addCourse: id required');
    assert(isNonEmptyString(title_he) || isNonEmptyString(title_en),
      'addCourse: title_he or title_en required');
    assert(COURSE_FORMATS.includes(format),
      `addCourse: format must be one of ${COURSE_FORMATS.join('|')}`);
    assert(COURSE_LEVELS.includes(level),
      `addCourse: level must be one of ${COURSE_LEVELS.join('|')}`);
    assert(Number.isFinite(duration) && duration >= 0,
      'addCourse: duration must be a non-negative number (minutes)');
    assert(Number.isFinite(maxSeats) && maxSeats >= 0,
      'addCourse: maxSeats must be a non-negative number');
    assert(Number.isFinite(cost) && cost >= 0,
      'addCourse: cost must be a non-negative number');
    assert(Array.isArray(prerequisites), 'addCourse: prerequisites must be array');

    // "לא מוחקים רק משדרגים" — if course exists, UPGRADE it (new version)
    const existing = this.courses.get(id);
    const version = existing ? (existing.version + 1) : 1;
    const previousVersions = existing
      ? [...(existing.previousVersions || []), {
          version: existing.version,
          snapshot: clone({ ...existing, previousVersions: undefined }),
          supersededAt: nowIso(),
        }]
      : [];

    const course = {
      id,
      title_he: title_he || '',
      title_en: title_en || '',
      description: description || '',
      category: category || 'general',
      duration,
      format,
      level,
      prerequisites: [...prerequisites],
      instructor,
      maxSeats,
      cost,
      mandatory: Boolean(mandatory),
      complianceCode,
      renewalMonths,
      appliesTo: appliesTo ? [...appliesTo] : null,
      law_he,
      law_en,
      version,
      previousVersions,
      createdAt: existing ? existing.createdAt : nowIso(),
      updatedAt: nowIso(),
      active: true,
    };

    this.courses.set(id, course);
    this._audit('course.added', { courseId: id, version });
    return course;
  }

  // ──────────────────────────────────────────────────────────
  // 2. scheduleSession — open a new instance of a course
  // ──────────────────────────────────────────────────────────
  scheduleSession(courseId, input = {}) {
    assert(isNonEmptyString(courseId), 'scheduleSession: courseId required');
    const course = this.courses.get(courseId);
    assert(course, `scheduleSession: course ${courseId} not found`);
    assert(course.active, `scheduleSession: course ${courseId} is inactive`);

    const { date, location, instructor, seats } = input;
    assert(isNonEmptyString(date), 'scheduleSession: date required (ISO)');
    const seatCount = Number.isFinite(seats) ? seats : course.maxSeats;
    assert(Number.isFinite(seatCount) && seatCount >= 0,
      'scheduleSession: seats must be non-negative number');

    const sessionId = `${courseId}-${++this._counter}-${Date.parse(date) || 0}`;
    const session = {
      sessionId,
      courseId,
      date,
      location: location || (course.format === 'online' ? 'virtual' : 'TBD'),
      instructor: instructor || course.instructor,
      seats: seatCount,
      enrolledCount: 0,
      enrolled: [],        // employeeIds
      waitlist: [],        // employeeIds (ordered)
      status: 'scheduled',
      createdAt: nowIso(),
      cost: course.cost,
    };

    this.sessions.set(sessionId, session);
    this._audit('session.scheduled', { sessionId, courseId, date });
    return session;
  }

  // ──────────────────────────────────────────────────────────
  // 3. enroll — register an employee; waitlist if full
  // ──────────────────────────────────────────────────────────
  enroll(input) {
    assert(input && typeof input === 'object', 'enroll: input required');
    const { employeeId, sessionId } = input;
    assert(isNonEmptyString(employeeId), 'enroll: employeeId required');
    assert(isNonEmptyString(sessionId), 'enroll: sessionId required');

    const session = this.sessions.get(sessionId);
    assert(session, `enroll: session ${sessionId} not found`);
    assert(session.status === 'scheduled',
      `enroll: session ${sessionId} not open (status=${session.status})`);

    // Idempotent guard: if already enrolled or waitlisted, return existing.
    if (session.enrolled.includes(employeeId)) {
      return {
        employeeId, sessionId, status: 'enrolled',
        waitlistPosition: null, timestamp: nowIso(),
      };
    }
    if (session.waitlist.includes(employeeId)) {
      const pos = session.waitlist.indexOf(employeeId) + 1;
      return {
        employeeId, sessionId, status: 'waitlisted',
        waitlistPosition: pos, timestamp: nowIso(),
      };
    }

    let status, waitlistPosition = null;
    if (session.enrolledCount < session.seats) {
      session.enrolled.push(employeeId);
      session.enrolledCount += 1;
      status = 'enrolled';
    } else {
      session.waitlist.push(employeeId);
      waitlistPosition = session.waitlist.length;
      status = 'waitlisted';
    }

    const record = {
      employeeId, sessionId, courseId: session.courseId,
      status, waitlistPosition, timestamp: nowIso(),
    };
    this.enrollments.push(record);
    this._audit('enroll', record);
    return record;
  }

  /**
   * Cancels an enrollment by UPGRADING its state (never deletes).
   * Automatically promotes the first waitlisted employee.
   */
  cancelEnrollment({ employeeId, sessionId, reason = 'requested' }) {
    assert(isNonEmptyString(employeeId), 'cancelEnrollment: employeeId required');
    assert(isNonEmptyString(sessionId), 'cancelEnrollment: sessionId required');
    const session = this.sessions.get(sessionId);
    assert(session, `cancelEnrollment: session ${sessionId} not found`);

    const idx = session.enrolled.indexOf(employeeId);
    let promoted = null;
    if (idx >= 0) {
      session.enrolled.splice(idx, 1);
      session.enrolledCount -= 1;
      // promote first waitlist
      if (session.waitlist.length > 0) {
        const next = session.waitlist.shift();
        session.enrolled.push(next);
        session.enrolledCount += 1;
        promoted = next;
        this.enrollments.push({
          employeeId: next, sessionId, courseId: session.courseId,
          status: 'enrolled', waitlistPosition: null,
          timestamp: nowIso(), promotedFromWaitlist: true,
        });
      }
    } else {
      const wIdx = session.waitlist.indexOf(employeeId);
      if (wIdx >= 0) session.waitlist.splice(wIdx, 1);
    }

    const record = {
      employeeId, sessionId, courseId: session.courseId,
      status: 'cancelled', reason, timestamp: nowIso(), promoted,
    };
    this.enrollments.push(record);
    this._audit('enrollment.cancelled', record);
    return record;
  }

  // ──────────────────────────────────────────────────────────
  // 4. markAttendance — record attendance for a session
  // ──────────────────────────────────────────────────────────
  markAttendance(sessionId, input) {
    assert(isNonEmptyString(sessionId), 'markAttendance: sessionId required');
    const session = this.sessions.get(sessionId);
    assert(session, `markAttendance: session ${sessionId} not found`);

    assert(input && typeof input === 'object', 'markAttendance: input required');
    const { employeeId, status } = input;
    assert(isNonEmptyString(employeeId), 'markAttendance: employeeId required');
    assert(ATTENDANCE_STATUSES.includes(status),
      `markAttendance: status must be ${ATTENDANCE_STATUSES.join('|')}`);

    const record = {
      sessionId,
      courseId: session.courseId,
      employeeId,
      status,
      timestamp: nowIso(),
    };
    this.attendanceLog.push(record);
    this._audit('attendance', record);
    return record;
  }

  /**
   * Derived attendance summary for a session.
   */
  attendanceSummary(sessionId) {
    const records = this.attendanceLog.filter(a => a.sessionId === sessionId);
    const summary = { present: 0, absent: 0, late: 0, excused: 0, total: records.length };
    for (const r of records) summary[r.status] += 1;
    return summary;
  }

  // ──────────────────────────────────────────────────────────
  // 5. completeCourse — issue certificate (PDF-ready payload)
  // ──────────────────────────────────────────────────────────
  completeCourse(input) {
    assert(input && typeof input === 'object', 'completeCourse: input required');
    const { employeeId, courseId, score, certificateIssued = true, sessionId = null } = input;
    assert(isNonEmptyString(employeeId), 'completeCourse: employeeId required');
    assert(isNonEmptyString(courseId), 'completeCourse: courseId required');
    const course = this.courses.get(courseId);
    assert(course, `completeCourse: course ${courseId} not found`);
    assert(Number.isFinite(score) && score >= 0 && score <= 100,
      'completeCourse: score must be 0..100');

    const completion = {
      employeeId, courseId, sessionId, score,
      passed: score >= 60,
      completedAt: nowIso(),
      certificateId: null,
    };

    let certificate = null;
    if (certificateIssued && completion.passed) {
      certificate = this._issueCertificate({
        employeeId, course, score, sessionId,
      });
      completion.certificateId = certificate.certificateId;
    }

    this.completions.push(completion);
    this._audit('course.completed', completion);
    return { completion, certificate };
  }

  /**
   * Internal: build a certificate record. The `pdf` field is a structured
   * payload (title, fields, etc.) ready for any PDF generator — we do NOT
   * include a real PDF lib (zero-deps rule). A consumer module such as
   * src/pdf/pdf-generator.js can render it.
   */
  _issueCertificate({ employeeId, course, score, sessionId }) {
    const certificateId = `CERT-${course.id}-${employeeId}-${Date.now()}-${++this._counter}`;
    const issuedAt = nowIso();
    const expiresAt = course.renewalMonths
      ? new Date(Date.now() + course.renewalMonths * 30 * 24 * 3600 * 1000).toISOString()
      : null;

    const cert = {
      certificateId,
      employeeId,
      courseId: course.id,
      courseTitle_he: course.title_he,
      courseTitle_en: course.title_en,
      sessionId,
      score,
      issuedAt,
      expiresAt,
      mandatory: course.mandatory,
      complianceCode: course.complianceCode,
      law_he: course.law_he,
      law_en: course.law_en,
      pdf: {
        template: 'training-certificate-v1',
        title_he: 'תעודת סיום קורס',
        title_en: 'Course Completion Certificate',
        fields: [
          { label_he: 'שם העובד', label_en: 'Employee', value: employeeId },
          { label_he: 'שם הקורס', label_en: 'Course', value: course.title_he || course.title_en },
          { label_he: 'ציון', label_en: 'Score', value: `${score}` },
          { label_he: 'תאריך הנפקה', label_en: 'Issued', value: issuedAt.slice(0, 10) },
          expiresAt
            ? { label_he: 'בתוקף עד', label_en: 'Expires', value: expiresAt.slice(0, 10) }
            : null,
          course.law_he
            ? { label_he: 'אסמכתא חוקית', label_en: 'Legal basis', value: course.law_he }
            : null,
        ].filter(Boolean),
      },
    };

    this.certificates.push(cert);
    return cert;
  }

  // ──────────────────────────────────────────────────────────
  // 6. learningPath — required courses for a role
  // ──────────────────────────────────────────────────────────
  learningPath({ role }) {
    assert(isNonEmptyString(role), 'learningPath: role required');
    const courseIds = this.learningPaths.get(role) || [];
    const courses = courseIds
      .map(id => this.courses.get(id))
      .filter(Boolean)
      .map(c => ({
        id: c.id,
        title_he: c.title_he,
        title_en: c.title_en,
        mandatory: c.mandatory,
        duration: c.duration,
        complianceCode: c.complianceCode,
        renewalMonths: c.renewalMonths,
      }));
    return {
      role,
      required: courses,
      totalDuration: courses.reduce((a, c) => a + (c.duration || 0), 0),
    };
  }

  setLearningPath(role, courseIds) {
    assert(isNonEmptyString(role), 'setLearningPath: role required');
    assert(Array.isArray(courseIds), 'setLearningPath: courseIds must be array');
    this.learningPaths.set(role, [...courseIds]);
    this._audit('learning-path.set', { role, courseIds });
    return this.learningPath({ role });
  }

  // ──────────────────────────────────────────────────────────
  // 7. requiredCompliance — mandatory by law
  // ──────────────────────────────────────────────────────────
  requiredCompliance(filter = {}) {
    const { roleOrCategory } = filter;
    const list = REQUIRED_COMPLIANCE
      .filter(req => {
        if (!roleOrCategory) return true;
        return req.appliesTo.includes('*') || req.appliesTo.includes(roleOrCategory);
      })
      .map(req => ({
        code: req.code,
        title_he: req.title_he,
        title_en: req.title_en,
        law_he: req.law_he,
        law_en: req.law_en,
        renewalMonths: req.renewalMonths,
        appliesTo: [...req.appliesTo],
        durationMinutes: req.durationMinutes,
      }));
    return list;
  }

  /**
   * Compliance matrix for a set of employees: shows, for each mandatory
   * training, whether each employee holds a valid (unexpired) cert.
   */
  complianceMatrix(employees) {
    assert(Array.isArray(employees), 'complianceMatrix: employees must be array');
    const mandatory = this.requiredCompliance();
    const now = Date.now();
    const matrix = [];
    for (const emp of employees) {
      const row = {
        employeeId: emp.id,
        role: emp.role,
        items: {},
        compliant: true,
      };
      for (const req of mandatory) {
        if (!req.appliesTo.includes('*') && !req.appliesTo.includes(emp.role)) {
          row.items[req.code] = { required: false, status: 'n/a' };
          continue;
        }
        const cert = this.certificates
          .filter(c => c.employeeId === emp.id && c.complianceCode === req.code)
          .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0];
        if (!cert) {
          row.items[req.code] = { required: true, status: 'missing' };
          row.compliant = false;
        } else if (cert.expiresAt && Date.parse(cert.expiresAt) < now) {
          row.items[req.code] = {
            required: true, status: 'expired',
            issuedAt: cert.issuedAt, expiresAt: cert.expiresAt,
          };
          row.compliant = false;
        } else {
          row.items[req.code] = {
            required: true, status: 'valid',
            issuedAt: cert.issuedAt, expiresAt: cert.expiresAt,
          };
        }
      }
      matrix.push(row);
    }
    return matrix;
  }

  // ──────────────────────────────────────────────────────────
  // 8. certificateRepo — all certs held by an employee
  // ──────────────────────────────────────────────────────────
  certificateRepo(employeeId) {
    assert(isNonEmptyString(employeeId), 'certificateRepo: employeeId required');
    const now = Date.now();
    return this.certificates
      .filter(c => c.employeeId === employeeId)
      .map(c => ({
        ...clone(c),
        expired: c.expiresAt ? Date.parse(c.expiresAt) < now : false,
      }));
  }

  // ──────────────────────────────────────────────────────────
  // 9. budgetTracking — training spend vs budget by department
  // ──────────────────────────────────────────────────────────
  setBudget({ department, period, amount }) {
    assert(isNonEmptyString(department), 'setBudget: department required');
    assert(isNonEmptyString(period), 'setBudget: period required');
    assert(Number.isFinite(amount) && amount >= 0, 'setBudget: amount>=0');
    const key = `${department}:${period}`;
    this.budgets.set(key, { department, period, amount, setAt: nowIso() });
    this._audit('budget.set', { department, period, amount });
    return this.budgets.get(key);
  }

  recordSpend({ department, period, amount, note = '', sessionId = null, employeeId = null }) {
    assert(isNonEmptyString(department), 'recordSpend: department required');
    assert(isNonEmptyString(period), 'recordSpend: period required');
    assert(Number.isFinite(amount) && amount >= 0, 'recordSpend: amount>=0');
    const record = {
      department, period, amount, note, sessionId, employeeId,
      timestamp: nowIso(),
    };
    this.spend.push(record);
    this._audit('spend.recorded', record);
    return record;
  }

  budgetTracking({ department, period }) {
    assert(isNonEmptyString(department), 'budgetTracking: department required');
    assert(isNonEmptyString(period), 'budgetTracking: period required');
    const key = `${department}:${period}`;
    const budget = this.budgets.get(key) || { department, period, amount: 0 };
    const spentRecords = this.spend.filter(
      s => s.department === department && s.period === period
    );
    const spent = spentRecords.reduce((a, s) => a + s.amount, 0);
    const remaining = budget.amount - spent;
    const utilisation = budget.amount > 0 ? spent / budget.amount : 0;
    return {
      department,
      period,
      budget: budget.amount,
      spent,
      remaining,
      utilisation: Number(utilisation.toFixed(4)),
      overBudget: spent > budget.amount,
      entries: spentRecords.length,
      label_he: `ניצול תקציב הדרכה — ${department} ${period}`,
      label_en: `Training budget utilisation — ${department} ${period}`,
    };
  }

  // ──────────────────────────────────────────────────────────
  // 10. studyFundUsage — קרן השתלמות eligible courses
  // ──────────────────────────────────────────────────────────
  /**
   * Returns the list of completions that are eligible for study-fund
   * reimbursement for a given employee in a given calendar year,
   * plus total eligible cost vs. the annual ceiling.
   */
  studyFundUsage({ employeeId, year }) {
    assert(isNonEmptyString(employeeId), 'studyFundUsage: employeeId required');
    assert(Number.isInteger(year) && year > 2000, 'studyFundUsage: year required (int)');

    const eligible = [];
    const ineligible = [];
    for (const comp of this.completions) {
      if (comp.employeeId !== employeeId) continue;
      const y = Number((comp.completedAt || '').slice(0, 4));
      if (y !== year) continue;
      const course = this.courses.get(comp.courseId);
      if (!course) continue;
      const classification = this._classifyForStudyFund(course);
      const entry = {
        courseId: course.id,
        title_he: course.title_he,
        title_en: course.title_en,
        category: course.category,
        cost: course.cost,
        completedAt: comp.completedAt,
        classification,
      };
      if (classification.eligible) eligible.push(entry);
      else ineligible.push(entry);
    }

    const totalEligibleCost = eligible.reduce((a, e) => a + (e.cost || 0), 0);
    const annualCeiling = STUDY_FUND_RULES.ANNUAL_CEILING_ILS;
    return {
      employeeId,
      year,
      eligible,
      ineligible,
      totalEligibleCost,
      annualCeiling,
      overCeiling: totalEligibleCost > annualCeiling,
      remaining: Math.max(0, annualCeiling - totalEligibleCost),
      label_he: LABELS.STUDY_FUND.he,
      label_en: LABELS.STUDY_FUND.en,
      rules: {
        ripeningYears: STUDY_FUND_RULES.RIPENING_YEARS,
        ripeningYearsRetirement: STUDY_FUND_RULES.RIPENING_YEARS_RETIREMENT,
      },
    };
  }

  _classifyForStudyFund(course) {
    const cat = (course.category || '').toLowerCase();
    if (STUDY_FUND_RULES.DISALLOWED_CATEGORIES.some(c => cat.includes(c))) {
      return {
        eligible: false,
        reason_he: 'קטגוריה לא זכאית לקרן השתלמות (תחביב/פנאי)',
        reason_en: 'Category not eligible for study fund (hobby/leisure)',
      };
    }
    if (STUDY_FUND_RULES.ALLOWED_CATEGORIES.some(c => cat === c || cat.startsWith(c))) {
      return {
        eligible: true,
        reason_he: 'קטגוריה מקצועית מוכרת לקרן השתלמות',
        reason_en: 'Professional category recognised by study fund',
      };
    }
    // Unknown category — default to ineligible but flag for review
    return {
      eligible: false,
      reason_he: 'קטגוריה לא מסווגת — דרושה בדיקה ידנית',
      reason_en: 'Category unclassified — manual review required',
      review: true,
    };
  }

  // ──────────────────────────────────────────────────────────
  // 11. feedbackCollection — per-session feedback
  // ──────────────────────────────────────────────────────────
  submitFeedback({ sessionId, employeeId, rating, comments = '', nps = null, rubric = {} }) {
    assert(isNonEmptyString(sessionId), 'submitFeedback: sessionId required');
    assert(this.sessions.has(sessionId), `submitFeedback: session ${sessionId} not found`);
    assert(isNonEmptyString(employeeId), 'submitFeedback: employeeId required');
    assert(Number.isFinite(rating) && rating >= 1 && rating <= 5,
      'submitFeedback: rating 1..5 required');
    if (nps != null) {
      assert(Number.isFinite(nps) && nps >= 0 && nps <= 10,
        'submitFeedback: nps 0..10 required');
    }
    const record = {
      sessionId, employeeId, rating, comments, nps, rubric,
      timestamp: nowIso(),
    };
    this.feedback.push(record);
    this._audit('feedback.submitted', { sessionId, employeeId, rating });
    return record;
  }

  feedbackCollection(sessionId) {
    assert(isNonEmptyString(sessionId), 'feedbackCollection: sessionId required');
    const list = this.feedback.filter(f => f.sessionId === sessionId);
    const count = list.length;
    const avg = count ? list.reduce((a, f) => a + f.rating, 0) / count : 0;
    const nps = (() => {
      const withNps = list.filter(f => f.nps != null);
      if (withNps.length === 0) return null;
      const promoters = withNps.filter(f => f.nps >= 9).length;
      const detractors = withNps.filter(f => f.nps <= 6).length;
      return Math.round(((promoters - detractors) / withNps.length) * 100);
    })();
    return {
      sessionId,
      count,
      averageRating: Number(avg.toFixed(2)),
      nps,
      items: list.map(clone),
      label_he: LABELS.FEEDBACK.he,
      label_en: LABELS.FEEDBACK.en,
    };
  }

  // ──────────────────────────────────────────────────────────
  // Internal audit log
  // ──────────────────────────────────────────────────────────
  _audit(action, payload) {
    this.auditLog.push({ action, payload, at: nowIso() });
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

deepFreeze(REQUIRED_COMPLIANCE);
deepFreeze(STUDY_FUND_RULES);
deepFreeze(LABELS);

module.exports = {
  TrainingCatalog,
  COURSE_FORMATS,
  COURSE_LEVELS,
  ATTENDANCE_STATUSES,
  ENROLLMENT_STATUSES,
  REQUIRED_COMPLIANCE,
  STUDY_FUND_RULES,
  LABELS,
};
