import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use(requireAuth as any);

async function ensureBenefitTables() {
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS benefit_plans (
        id SERIAL PRIMARY KEY,
        plan_number VARCHAR(50) UNIQUE,
        plan_name VARCHAR(255),
        plan_type VARCHAR(50) DEFAULT 'health',
        description TEXT,
        provider_name VARCHAR(255),
        provider_contact VARCHAR(255),
        employer_contribution NUMERIC(12,2) DEFAULT 0,
        employee_contribution NUMERIC(12,2) DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'ILS',
        coverage_details TEXT,
        eligibility_criteria TEXT,
        waiting_period_days INTEGER DEFAULT 0,
        is_mandatory BOOLEAN DEFAULT false,
        effective_date DATE,
        expiry_date DATE,
        renewal_date DATE,
        max_participants INTEGER,
        current_participants INTEGER DEFAULT 0,
        status VARCHAR(30) DEFAULT 'draft',
        notes TEXT,
        created_by INTEGER,
        created_by_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS employee_benefits (
        id SERIAL PRIMARY KEY,
        enrollment_number VARCHAR(50) UNIQUE,
        employee_name VARCHAR(255),
        employee_id_ref INTEGER,
        department VARCHAR(255),
        plan_id INTEGER REFERENCES benefit_plans(id),
        enrollment_date DATE,
        effective_date DATE,
        end_date DATE,
        employer_cost NUMERIC(12,2) DEFAULT 0,
        employee_cost NUMERIC(12,2) DEFAULT 0,
        coverage_level VARCHAR(30) DEFAULT 'individual',
        dependents_count INTEGER DEFAULT 0,
        status VARCHAR(30) DEFAULT 'pending',
        notes TEXT,
        created_by INTEGER,
        created_by_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `));
  } catch (e: any) {
    console.error("Benefits table init:", e.message);
  }
}
ensureBenefitTables();

async function ensureCalibrationColumns() {
  try {
    await db.execute(sql.raw(`
      ALTER TABLE performance_reviews ADD COLUMN IF NOT EXISTS performance_score NUMERIC(3,1);
      ALTER TABLE performance_reviews ADD COLUMN IF NOT EXISTS potential_score NUMERIC(3,1);
    `));
  } catch (e: any) {
    console.error("Calibration columns migration:", e.message);
  }
}
ensureCalibrationColumns();

async function ensureTalentTables() {
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS job_postings (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        department VARCHAR(150),
        requirements_json TEXT,
        status VARCHAR(30) DEFAULT 'draft',
        posted_date DATE,
        closing_date DATE,
        salary_min NUMERIC(12,2) DEFAULT 0,
        salary_max NUMERIC(12,2) DEFAULT 0,
        employment_type VARCHAR(50) DEFAULT 'full_time',
        location VARCHAR(200),
        description TEXT,
        hiring_manager VARCHAR(200),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS interview_schedules (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER,
        candidate_name VARCHAR(255),
        interviewer_id INTEGER,
        interviewer_name VARCHAR(255),
        position VARCHAR(255),
        department VARCHAR(150),
        stage VARCHAR(50),
        scheduled_at TIMESTAMP,
        duration_minutes INTEGER DEFAULT 60,
        location VARCHAR(255),
        interview_type VARCHAR(50) DEFAULT 'in_person',
        feedback TEXT,
        rating NUMERIC(3,1),
        recommendation VARCHAR(50),
        status VARCHAR(30) DEFAULT 'scheduled',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS offer_letters (
        id SERIAL PRIMARY KEY,
        offer_number VARCHAR(50) UNIQUE,
        candidate_id INTEGER,
        candidate_name VARCHAR(255),
        candidate_email VARCHAR(255),
        position VARCHAR(255),
        department VARCHAR(150),
        salary NUMERIC(12,2) DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'ILS',
        benefits_json TEXT,
        start_date DATE,
        expiry_date DATE,
        status VARCHAR(30) DEFAULT 'draft',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS okr_objectives (
        id SERIAL PRIMARY KEY,
        parent_id INTEGER,
        owner_type VARCHAR(30) DEFAULT 'individual',
        owner_id INTEGER,
        owner_name VARCHAR(255),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        period VARCHAR(20),
        progress_pct NUMERIC(5,2) DEFAULT 0,
        status VARCHAR(30) DEFAULT 'on_track',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS okr_key_results (
        id SERIAL PRIMARY KEY,
        objective_id INTEGER NOT NULL,
        title VARCHAR(500) NOT NULL,
        target_value NUMERIC(14,2) DEFAULT 0,
        current_value NUMERIC(14,2) DEFAULT 0,
        unit VARCHAR(50),
        progress_pct NUMERIC(5,2) DEFAULT 0,
        status VARCHAR(30) DEFAULT 'on_track',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS review_cycles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        period VARCHAR(50),
        type VARCHAR(50) DEFAULT '360',
        status VARCHAR(30) DEFAULT 'draft',
        questionnaire_json TEXT,
        start_date DATE,
        end_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS review_responses (
        id SERIAL PRIMARY KEY,
        cycle_id INTEGER NOT NULL,
        reviewee_id INTEGER,
        reviewee_name VARCHAR(255),
        reviewer_id INTEGER,
        reviewer_name VARCHAR(255),
        relationship VARCHAR(50),
        scores_json TEXT,
        comments TEXT,
        status VARCHAR(30) DEFAULT 'pending',
        submitted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS performance_improvement_plans (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER,
        employee_name VARCHAR(255),
        department VARCHAR(150),
        reason TEXT,
        start_date DATE,
        end_date DATE,
        milestones_json TEXT,
        status VARCHAR(30) DEFAULT 'active',
        manager_name VARCHAR(255),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS course_catalog (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        description TEXT,
        prerequisites TEXT,
        capacity INTEGER DEFAULT 20,
        duration_hours NUMERIC(6,1) DEFAULT 0,
        instructor VARCHAR(255),
        location VARCHAR(255),
        is_online BOOLEAN DEFAULT false,
        cost_per_person NUMERIC(12,2) DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'ILS',
        status VARCHAR(30) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS course_enrollments (
        id SERIAL PRIMARY KEY,
        course_id INTEGER NOT NULL,
        course_title VARCHAR(255),
        employee_id INTEGER,
        employee_name VARCHAR(255),
        department VARCHAR(150),
        status VARCHAR(30) DEFAULT 'enrolled',
        enrolled_at TIMESTAMP DEFAULT NOW(),
        completion_date DATE,
        certificate_url TEXT,
        score NUMERIC(5,2),
        feedback TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS role_skill_requirements (
        id SERIAL PRIMARY KEY,
        role_title VARCHAR(255) NOT NULL,
        department VARCHAR(150),
        required_skills_json TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS headcount_plans (
        id SERIAL PRIMARY KEY,
        department VARCHAR(150) NOT NULL,
        year INTEGER NOT NULL,
        quarter INTEGER DEFAULT 0,
        planned INTEGER DEFAULT 0,
        actual INTEGER DEFAULT 0,
        budget NUMERIC(14,2) DEFAULT 0,
        actual_spend NUMERIC(14,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS succession_plans (
        id SERIAL PRIMARY KEY,
        position_id INTEGER,
        position_title VARCHAR(255),
        department VARCHAR(150),
        incumbent_id INTEGER,
        incumbent_name VARCHAR(255),
        successor_id INTEGER,
        successor_name VARCHAR(255),
        readiness_level VARCHAR(30) DEFAULT 'developing',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS talent_pool (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        skills TEXT,
        source VARCHAR(100),
        notes TEXT,
        status VARCHAR(30) DEFAULT 'active',
        last_contact_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `));
  } catch (e: any) {
    console.error("Talent tables init:", e.message);
  }
}
ensureTalentTables();

async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("HR-Enterprise query error:", e.message); return []; }
}

async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

// ========== LEAVE REQUESTS ==========
router.get("/leave-requests", async (_req, res) => {
  res.json(await q(`SELECT * FROM leave_requests ORDER BY start_date DESC, id DESC`));
});

router.get("/leave-requests/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='pending') as pending,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='rejected') as rejected,
    COUNT(*) FILTER (WHERE status='in_progress') as in_progress,
    COUNT(*) FILTER (WHERE status='completed') as completed,
    COALESCE(SUM(total_days) FILTER (WHERE status IN ('approved','in_progress','completed')), 0) as total_days_taken,
    COUNT(DISTINCT employee_name) as employees_count
  FROM leave_requests WHERE status != 'cancelled'`);
  res.json(rows[0] || {});
});

router.post("/leave-requests", async (req, res) => {
  const d = req.body;
  const num = await nextNum("LV-", "leave_requests", "request_number");
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO leave_requests (request_number, employee_name, employee_id_ref, department, leave_type, start_date, end_date, total_days, is_half_day, reason, status, substitute_name, remaining_balance, is_paid, notes)
    VALUES ('${num}', ${s(d.employeeName)}, ${d.employeeIdRef||'NULL'}, ${s(d.department)}, '${d.leaveType||'vacation'}', '${d.startDate}', '${d.endDate}', ${d.totalDays||0}, ${d.isHalfDay||false}, ${s(d.reason)}, '${d.status||'pending'}', ${s(d.substituteName)}, ${d.remainingBalance||'NULL'}, ${d.isPaid !== false}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM leave_requests WHERE request_number='${num}'`);
  res.json(rows[0]);
});

router.put("/leave-requests/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.employeeName) sets.push(`employee_name=${s(d.employeeName)}`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.leaveType) sets.push(`leave_type='${d.leaveType}'`);
  if (d.startDate) sets.push(`start_date='${d.startDate}'`);
  if (d.endDate) sets.push(`end_date='${d.endDate}'`);
  if (d.totalDays !== undefined) sets.push(`total_days=${d.totalDays}`);
  if (d.reason !== undefined) sets.push(`reason=${s(d.reason)}`);
  if (d.status) {
    sets.push(`status='${d.status}'`);
    if (d.status === 'approved') {
      const user = (req as any).user;
      sets.push(`approved_by=${user?.id||'NULL'}`);
      sets.push(`approved_by_name=${s(user?.fullName)}`);
      sets.push(`approved_at=NOW()`);
    }
    if (d.status === 'rejected' && d.rejectionReason) sets.push(`rejection_reason=${s(d.rejectionReason)}`);
  }
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE leave_requests SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM leave_requests WHERE id=${req.params.id}`))[0]);
});

router.delete("/leave-requests/:id", async (req, res) => {
  await q(`DELETE FROM leave_requests WHERE id=${req.params.id} AND status IN ('pending','cancelled')`);
  res.json({ success: true });
});

// ========== TRAINING RECORDS ==========
router.get("/training-records", async (_req, res) => {
  res.json(await q(`SELECT * FROM training_records ORDER BY start_date DESC, id DESC`));
});

router.get("/training-records/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='planned') as planned,
    COUNT(*) FILTER (WHERE status='in_progress') as in_progress,
    COUNT(*) FILTER (WHERE status='completed') as completed,
    COUNT(*) FILTER (WHERE status='cancelled') as cancelled,
    COUNT(*) FILTER (WHERE is_mandatory=true) as mandatory,
    COALESCE(SUM(total_cost), 0) as total_investment,
    COALESCE(AVG(satisfaction_score) FILTER (WHERE satisfaction_score > 0), 0) as avg_satisfaction
  FROM training_records WHERE status != 'cancelled'`);
  res.json(rows[0] || {});
});

router.post("/training-records", async (req, res) => {
  const d = req.body;
  const num = await nextNum("TRN-", "training_records", "training_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO training_records (training_number, training_name, training_type, category, description, trainer_name, trainer_type, location, start_date, end_date, duration_hours, max_participants, current_participants, target_audience, department, cost_per_person, total_cost, currency, is_mandatory, is_certification, certification_name, certification_expiry, status, notes, created_by, created_by_name)
    VALUES ('${num}', ${s(d.trainingName)}, '${d.trainingType||'internal'}', ${s(d.category)}, ${s(d.description)}, ${s(d.trainerName)}, '${d.trainerType||'internal'}', ${s(d.location)}, '${d.startDate}', ${d.endDate ? `'${d.endDate}'` : 'NULL'}, ${d.durationHours||0}, ${d.maxParticipants||20}, ${d.currentParticipants||0}, ${s(d.targetAudience)}, ${s(d.department)}, ${d.costPerPerson||0}, ${d.totalCost||0}, '${d.currency||'ILS'}', ${d.isMandatory||false}, ${d.isCertification||false}, ${s(d.certificationName)}, ${d.certificationExpiry ? `'${d.certificationExpiry}'` : 'NULL'}, '${d.status||'planned'}', ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM training_records WHERE training_number='${num}'`))[0]);
});

router.put("/training-records/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.trainingName) sets.push(`training_name=${s(d.trainingName)}`);
  if (d.trainingType) sets.push(`training_type='${d.trainingType}'`);
  if (d.category !== undefined) sets.push(`category=${s(d.category)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.trainerName) sets.push(`trainer_name=${s(d.trainerName)}`);
  if (d.startDate) sets.push(`start_date='${d.startDate}'`);
  if (d.endDate) sets.push(`end_date='${d.endDate}'`);
  if (d.durationHours !== undefined) sets.push(`duration_hours=${d.durationHours}`);
  if (d.maxParticipants !== undefined) sets.push(`max_participants=${d.maxParticipants}`);
  if (d.currentParticipants !== undefined) sets.push(`current_participants=${d.currentParticipants}`);
  if (d.costPerPerson !== undefined) sets.push(`cost_per_person=${d.costPerPerson}`);
  if (d.totalCost !== undefined) sets.push(`total_cost=${d.totalCost}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.satisfactionScore !== undefined) sets.push(`satisfaction_score=${d.satisfactionScore}`);
  if (d.passRate !== undefined) sets.push(`pass_rate=${d.passRate}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE training_records SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM training_records WHERE id=${req.params.id}`))[0]);
});

router.delete("/training-records/:id", async (req, res) => {
  await q(`DELETE FROM training_records WHERE id=${req.params.id} AND status IN ('planned','cancelled')`);
  res.json({ success: true });
});

// ========== RECRUITMENT ==========
router.get("/recruitment", async (_req, res) => {
  res.json(await q(`SELECT * FROM recruitment_records ORDER BY created_at DESC, id DESC`));
});

router.get("/recruitment/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='draft') as draft,
    COUNT(*) FILTER (WHERE status='open') as open,
    COUNT(*) FILTER (WHERE status='screening') as screening,
    COUNT(*) FILTER (WHERE status='interviewing') as interviewing,
    COUNT(*) FILTER (WHERE status='offer') as offer_stage,
    COUNT(*) FILTER (WHERE status='filled') as filled,
    COUNT(*) FILTER (WHERE status='cancelled') as cancelled,
    COUNT(*) FILTER (WHERE status='on_hold') as on_hold,
    COALESCE(SUM(total_positions), 0) as total_positions,
    COALESCE(SUM(positions_filled), 0) as total_filled,
    COALESCE(SUM(candidates_count), 0) as total_candidates,
    COALESCE(SUM(interviews_scheduled), 0) as total_interviews,
    COALESCE(SUM(offers_made), 0) as total_offers,
    COUNT(*) FILTER (WHERE priority='urgent') as urgent,
    COUNT(*) FILTER (WHERE deadline_date < CURRENT_DATE AND status NOT IN ('filled','cancelled')) as overdue
  FROM recruitment_records`);
  res.json(rows[0] || {});
});

router.post("/recruitment", async (req, res) => {
  const d = req.body;
  const num = await nextNum("REC-", "recruitment_records", "job_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO recruitment_records (job_number, position_title, department, employment_type, location, salary_range_min, salary_range_max, currency, required_experience, education_level, description, requirements, benefits, hiring_manager, recruiter_name, publish_date, deadline_date, total_positions, priority, source, status, notes, created_by, created_by_name)
    VALUES ('${num}', ${s(d.positionTitle)}, ${s(d.department)}, '${d.employmentType||'full_time'}', ${s(d.location)}, ${d.salaryRangeMin||0}, ${d.salaryRangeMax||0}, '${d.currency||'ILS'}', ${s(d.requiredExperience)}, ${s(d.educationLevel)}, ${s(d.description)}, ${s(d.requirements)}, ${s(d.benefits)}, ${s(d.hiringManager)}, ${s(d.recruiterName)}, ${d.publishDate ? `'${d.publishDate}'` : 'NULL'}, ${d.deadlineDate ? `'${d.deadlineDate}'` : 'NULL'}, ${d.totalPositions||1}, '${d.priority||'normal'}', ${s(d.source)}, '${d.status||'draft'}', ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM recruitment_records WHERE job_number='${num}'`))[0]);
});

router.put("/recruitment/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.positionTitle) sets.push(`position_title=${s(d.positionTitle)}`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.employmentType) sets.push(`employment_type='${d.employmentType}'`);
  if (d.location !== undefined) sets.push(`location=${s(d.location)}`);
  if (d.salaryRangeMin !== undefined) sets.push(`salary_range_min=${d.salaryRangeMin}`);
  if (d.salaryRangeMax !== undefined) sets.push(`salary_range_max=${d.salaryRangeMax}`);
  if (d.requiredExperience !== undefined) sets.push(`required_experience=${s(d.requiredExperience)}`);
  if (d.educationLevel !== undefined) sets.push(`education_level=${s(d.educationLevel)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.requirements !== undefined) sets.push(`requirements=${s(d.requirements)}`);
  if (d.hiringManager !== undefined) sets.push(`hiring_manager=${s(d.hiringManager)}`);
  if (d.recruiterName !== undefined) sets.push(`recruiter_name=${s(d.recruiterName)}`);
  if (d.publishDate) sets.push(`publish_date='${d.publishDate}'`);
  if (d.deadlineDate) sets.push(`deadline_date='${d.deadlineDate}'`);
  if (d.candidatesCount !== undefined) sets.push(`candidates_count=${d.candidatesCount}`);
  if (d.interviewsScheduled !== undefined) sets.push(`interviews_scheduled=${d.interviewsScheduled}`);
  if (d.offersMade !== undefined) sets.push(`offers_made=${d.offersMade}`);
  if (d.positionsFilled !== undefined) sets.push(`positions_filled=${d.positionsFilled}`);
  if (d.totalPositions !== undefined) sets.push(`total_positions=${d.totalPositions}`);
  if (d.priority) sets.push(`priority='${d.priority}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE recruitment_records SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM recruitment_records WHERE id=${req.params.id}`))[0]);
});

router.delete("/recruitment/:id", async (req, res) => {
  await q(`DELETE FROM recruitment_records WHERE id=${req.params.id} AND status IN ('draft','cancelled')`);
  res.json({ success: true });
});

// ========== PERFORMANCE REVIEWS ==========
router.get("/performance-reviews", async (_req, res) => {
  res.json(await q(`SELECT * FROM performance_reviews ORDER BY review_date DESC, id DESC`));
});

router.get("/performance-reviews/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='draft') as draft,
    COUNT(*) FILTER (WHERE status='in_progress') as in_progress,
    COUNT(*) FILTER (WHERE status='submitted') as submitted,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='final') as final_count,
    COALESCE(AVG(overall_score) FILTER (WHERE overall_score > 0), 0) as avg_overall,
    COALESCE(AVG(goals_score) FILTER (WHERE goals_score > 0), 0) as avg_goals,
    COALESCE(AVG(skills_score) FILTER (WHERE skills_score > 0), 0) as avg_skills,
    COALESCE(AVG(teamwork_score) FILTER (WHERE teamwork_score > 0), 0) as avg_teamwork,
    COUNT(*) FILTER (WHERE promotion_recommendation=true) as promotion_candidates,
    COUNT(DISTINCT employee_name) as employees_reviewed,
    COUNT(DISTINCT department) as departments_count,
    COUNT(*) FILTER (WHERE overall_score >= 4) as excellent,
    COUNT(*) FILTER (WHERE overall_score >= 3 AND overall_score < 4) as good,
    COUNT(*) FILTER (WHERE overall_score >= 2 AND overall_score < 3) as needs_improvement,
    COUNT(*) FILTER (WHERE overall_score > 0 AND overall_score < 2) as poor
  FROM performance_reviews WHERE status != 'draft'`);
  res.json(rows[0] || {});
});

router.post("/performance-reviews", async (req, res) => {
  const d = req.body;
  const num = await nextNum("PRV-", "performance_reviews", "review_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO performance_reviews (review_number, employee_name, employee_id_ref, department, job_title, reviewer_name, review_period, review_date, period_start, period_end, overall_score, goals_score, skills_score, teamwork_score, communication_score, initiative_score, attendance_score, strengths, improvements, goals_next_period, training_recommendations, salary_recommendation, promotion_recommendation, employee_comments, reviewer_comments, status, notes, created_by, created_by_name)
    VALUES ('${num}', ${s(d.employeeName)}, ${d.employeeIdRef||'NULL'}, ${s(d.department)}, ${s(d.jobTitle)}, ${s(d.reviewerName)}, '${d.reviewPeriod||'annual'}', '${d.reviewDate}', ${d.periodStart ? `'${d.periodStart}'` : 'NULL'}, ${d.periodEnd ? `'${d.periodEnd}'` : 'NULL'}, ${d.overallScore||'NULL'}, ${d.goalsScore||'NULL'}, ${d.skillsScore||'NULL'}, ${d.teamworkScore||'NULL'}, ${d.communicationScore||'NULL'}, ${d.initiativeScore||'NULL'}, ${d.attendanceScore||'NULL'}, ${s(d.strengths)}, ${s(d.improvements)}, ${s(d.goalsNextPeriod)}, ${s(d.trainingRecommendations)}, ${s(d.salaryRecommendation)}, ${d.promotionRecommendation||false}, ${s(d.employeeComments)}, ${s(d.reviewerComments)}, '${d.status||'draft'}', ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM performance_reviews WHERE review_number='${num}'`))[0]);
});

router.put("/performance-reviews/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.employeeName) sets.push(`employee_name=${s(d.employeeName)}`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.jobTitle !== undefined) sets.push(`job_title=${s(d.jobTitle)}`);
  if (d.reviewerName !== undefined) sets.push(`reviewer_name=${s(d.reviewerName)}`);
  if (d.reviewPeriod) sets.push(`review_period='${d.reviewPeriod}'`);
  if (d.reviewDate) sets.push(`review_date='${d.reviewDate}'`);
  if (d.periodStart) sets.push(`period_start='${d.periodStart}'`);
  if (d.periodEnd) sets.push(`period_end='${d.periodEnd}'`);
  if (d.overallScore !== undefined) sets.push(`overall_score=${d.overallScore||'NULL'}`);
  if (d.goalsScore !== undefined) sets.push(`goals_score=${d.goalsScore||'NULL'}`);
  if (d.skillsScore !== undefined) sets.push(`skills_score=${d.skillsScore||'NULL'}`);
  if (d.teamworkScore !== undefined) sets.push(`teamwork_score=${d.teamworkScore||'NULL'}`);
  if (d.communicationScore !== undefined) sets.push(`communication_score=${d.communicationScore||'NULL'}`);
  if (d.initiativeScore !== undefined) sets.push(`initiative_score=${d.initiativeScore||'NULL'}`);
  if (d.attendanceScore !== undefined) sets.push(`attendance_score=${d.attendanceScore||'NULL'}`);
  if (d.strengths !== undefined) sets.push(`strengths=${s(d.strengths)}`);
  if (d.improvements !== undefined) sets.push(`improvements=${s(d.improvements)}`);
  if (d.goalsNextPeriod !== undefined) sets.push(`goals_next_period=${s(d.goalsNextPeriod)}`);
  if (d.trainingRecommendations !== undefined) sets.push(`training_recommendations=${s(d.trainingRecommendations)}`);
  if (d.salaryRecommendation !== undefined) sets.push(`salary_recommendation=${s(d.salaryRecommendation)}`);
  if (d.promotionRecommendation !== undefined) sets.push(`promotion_recommendation=${d.promotionRecommendation}`);
  if (d.employeeComments !== undefined) sets.push(`employee_comments=${s(d.employeeComments)}`);
  if (d.reviewerComments !== undefined) sets.push(`reviewer_comments=${s(d.reviewerComments)}`);
  if (d.status) {
    sets.push(`status='${d.status}'`);
    if (d.status === 'approved') {
      const user = (req as any).user;
      sets.push(`approved_by=${user?.id||'NULL'}`);
      sets.push(`approved_by_name=${s(user?.fullName)}`);
      sets.push(`approved_at=NOW()`);
    }
  }
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.performanceScore !== undefined) sets.push(`performance_score=${d.performanceScore === null || d.performanceScore === "" ? "NULL" : Number(d.performanceScore)}`);
  if (d.potentialScore !== undefined) sets.push(`potential_score=${d.potentialScore === null || d.potentialScore === "" ? "NULL" : Number(d.potentialScore)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE performance_reviews SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM performance_reviews WHERE id=${req.params.id}`))[0]);
});

router.delete("/performance-reviews/:id", async (req, res) => {
  await q(`DELETE FROM performance_reviews WHERE id=${req.params.id} AND status='draft'`);
  res.json({ success: true });
});

// ========== ATTENDANCE RECORDS ==========
router.get("/attendance-records", async (_req, res) => {
  const rows = await q(`SELECT * FROM attendance_records ORDER BY attendance_date DESC, id DESC`);
  res.json(rows);
});

router.get("/attendance-records/stats", async (_req, res) => {
  const r = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='present') as present, COUNT(*) FILTER (WHERE status='absent') as absent, COUNT(*) FILTER (WHERE status='late') as late, COUNT(*) FILTER (WHERE status='sick') as sick, COUNT(*) FILTER (WHERE status='vacation') as vacation, COUNT(*) FILTER (WHERE status='half_day') as half_day, COUNT(*) FILTER (WHERE status='holiday') as holiday, COALESCE(AVG(total_hours) FILTER (WHERE total_hours > 0), 0) as avg_hours, COALESCE(SUM(overtime_hours), 0) as total_overtime, COALESCE(SUM(late_minutes), 0) as total_late_minutes, COALESCE(AVG(late_minutes) FILTER (WHERE late_minutes > 0), 0) as avg_late_minutes, COUNT(DISTINCT employee_name) as unique_employees, COUNT(*) FILTER (WHERE approval_status='pending') as pending_approval, COUNT(*) FILTER (WHERE approval_status='approved') as approved_count, COALESCE(SUM(break_minutes), 0) as total_break_minutes FROM attendance_records`);
  res.json(r[0] || {});
});

router.post("/attendance-records", async (req, res) => {
  const b = req.body;
  const num = await nextNum("ATT-", "attendance_records", "record_number");
  const totalH = b.checkIn && b.checkOut ? `EXTRACT(EPOCH FROM ('${b.checkOut}'::time - '${b.checkIn}'::time))/3600` : "0";
  await q(`INSERT INTO attendance_records (record_number, employee_name, employee_id_ref, attendance_date, check_in, check_out, total_hours, overtime_hours, break_minutes, status, shift_type, location, department, late_minutes, early_leave_minutes, approved_by, approval_status, notes) VALUES ('${num}', '${(b.employeeName||'').replace(/'/g,"''")}', ${b.employeeIdRef||'NULL'}, '${b.attendanceDate||new Date().toISOString().slice(0,10)}', ${b.checkIn ? `'${b.checkIn}'` : 'NULL'}, ${b.checkOut ? `'${b.checkOut}'` : 'NULL'}, COALESCE(${b.totalHours||'NULL'}, ${totalH}), ${b.overtimeHours||0}, ${b.breakMinutes||0}, '${b.status||'present'}', '${b.shiftType||'morning'}', ${b.location?`'${b.location.replace(/'/g,"''")}'`:'NULL'}, ${b.department?`'${b.department.replace(/'/g,"''")}'`:'NULL'}, ${b.lateMinutes||0}, ${b.earlyLeaveMinutes||0}, ${b.approvedBy?`'${b.approvedBy.replace(/'/g,"''")}'`:'NULL'}, '${b.approvalStatus||'pending'}', ${b.notes?`'${b.notes.replace(/'/g,"''")}'`:'NULL'})`);
  res.json({ success: true, recordNumber: num });
});

router.put("/attendance-records/:id", async (req, res) => {
  const b = req.body; const id = req.params.id;
  const sets: string[] = [];
  if (b.employeeName !== undefined) sets.push(`employee_name='${b.employeeName.replace(/'/g,"''")}'`);
  if (b.attendanceDate !== undefined) sets.push(`attendance_date='${b.attendanceDate}'`);
  if (b.checkIn !== undefined) sets.push(b.checkIn ? `check_in='${b.checkIn}'` : `check_in=NULL`);
  if (b.checkOut !== undefined) sets.push(b.checkOut ? `check_out='${b.checkOut}'` : `check_out=NULL`);
  if (b.totalHours !== undefined) sets.push(`total_hours=${b.totalHours||0}`);
  if (b.overtimeHours !== undefined) sets.push(`overtime_hours=${b.overtimeHours||0}`);
  if (b.breakMinutes !== undefined) sets.push(`break_minutes=${b.breakMinutes||0}`);
  if (b.status !== undefined) sets.push(`status='${b.status}'`);
  if (b.shiftType !== undefined) sets.push(`shift_type='${b.shiftType}'`);
  if (b.location !== undefined) sets.push(b.location ? `location='${b.location.replace(/'/g,"''")}'` : `location=NULL`);
  if (b.department !== undefined) sets.push(b.department ? `department='${b.department.replace(/'/g,"''")}'` : `department=NULL`);
  if (b.lateMinutes !== undefined) sets.push(`late_minutes=${b.lateMinutes||0}`);
  if (b.earlyLeaveMinutes !== undefined) sets.push(`early_leave_minutes=${b.earlyLeaveMinutes||0}`);
  if (b.approvedBy !== undefined) sets.push(b.approvedBy ? `approved_by='${b.approvedBy.replace(/'/g,"''")}'` : `approved_by=NULL`);
  if (b.approvalStatus !== undefined) sets.push(`approval_status='${b.approvalStatus}'`);
  if (b.notes !== undefined) sets.push(b.notes ? `notes='${b.notes.replace(/'/g,"''")}'` : `notes=NULL`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE attendance_records SET ${sets.join(",")} WHERE id=${id}`);
  res.json({ success: true });
});

router.delete("/attendance-records/:id", async (req, res) => {
  await q(`DELETE FROM attendance_records WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== ATTENDANCE CLOCK IN/OUT ==========

function sanitizeName(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/'/g, "''").replace(/[;\x00]/g, "").slice(0, 200);
}

function sanitizeInt(v: unknown, fallback: number): number {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

const ALLOWED_SHIFT_TYPES = ["morning","afternoon","evening","night","full_day"];

router.get("/attendance/current-status", async (req, res) => {
  try {
    const user = (req as any).user;
    const isKiosk = req.query.kiosk === "1";
    let nameFilter: string;
    if (isKiosk) {
      if (!req.query.employee) { res.json({ checkedIn: false }); return; }
      nameFilter = sanitizeName(req.query.employee as string);
    } else {
      nameFilter = sanitizeName(user?.full_name || user?.username || user?.email || "");
    }
    if (!nameFilter) { res.json({ checkedIn: false }); return; }
    const rows = await q(`
      SELECT id, record_number, employee_name, attendance_date, check_in, check_out, total_hours
      FROM attendance_records
      WHERE employee_name ILIKE '${nameFilter}' 
        AND attendance_date = CURRENT_DATE 
        AND check_in IS NOT NULL 
        AND check_out IS NULL
      ORDER BY id DESC LIMIT 1
    `);
    const record = rows[0] || null;
    if (record) {
      res.json({ checkedIn: true, record, checkInTime: (record as any).check_in });
    } else {
      res.json({ checkedIn: false });
    }
  } catch (e) { res.json({ checkedIn: false }); }
});

router.post("/attendance/clock-in", async (req, res) => {
  try {
    const user = (req as any).user;
    const b = req.body;
    const isKiosk = b.kiosk === true;
    let employeeName: string;
    if (isKiosk) {
      if (!b.employeeName) { res.status(400).json({ error: "נדרש שם עובד" }); return; }
      employeeName = sanitizeName(b.employeeName);
    } else {
      employeeName = sanitizeName(user?.full_name || user?.username || user?.email || "");
      if (!employeeName) { res.status(400).json({ error: "לא ניתן לזהות משתמש מחובר" }); return; }
    }
    if (!employeeName) { res.status(400).json({ error: "נדרש שם עובד" }); return; }

    const shiftType = ALLOWED_SHIFT_TYPES.includes(b.shiftType) ? b.shiftType : "morning";
    const dept = sanitizeName(b.department || "");

    const existing = await q(`
      SELECT id FROM attendance_records
      WHERE employee_name ILIKE '${employeeName}' 
        AND attendance_date = CURRENT_DATE 
        AND check_in IS NOT NULL AND check_out IS NULL
      LIMIT 1
    `);
    if (existing.length > 0) {
      res.status(400).json({ error: "העובד כבר מחויב כניסה היום" }); return;
    }
    const now = new Date();
    const checkIn = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const num = await nextNum("ATT-", "attendance_records", "record_number");
    await q(`
      INSERT INTO attendance_records 
        (record_number, employee_name, attendance_date, check_in, status, shift_type, department, approval_status)
      VALUES 
        ('${num}', '${employeeName}', CURRENT_DATE, '${checkIn}', 'present', '${shiftType}', ${dept ? `'${dept}'` : "NULL"}, 'pending')
    `);
    const newRec = await q(`SELECT * FROM attendance_records WHERE record_number='${num}' LIMIT 1`);
    res.json({ success: true, record: newRec[0], checkInTime: checkIn });
  } catch (e) { res.status(500).json({ error: "שגיאה פנימית" }); }
});

router.post("/attendance/clock-out", async (req, res) => {
  try {
    const user = (req as any).user;
    const b = req.body;
    const isKiosk = b.kiosk === true;
    let employeeName: string;
    if (isKiosk) {
      if (!b.employeeName) { res.status(400).json({ error: "נדרש שם עובד" }); return; }
      employeeName = sanitizeName(b.employeeName);
    } else {
      employeeName = sanitizeName(user?.full_name || user?.username || user?.email || "");
      if (!employeeName) { res.status(400).json({ error: "לא ניתן לזהות משתמש מחובר" }); return; }
    }
    if (!employeeName) { res.status(400).json({ error: "נדרש שם עובד" }); return; }

    const openRec = await q(`
      SELECT id, check_in FROM attendance_records
      WHERE employee_name ILIKE '${employeeName}' 
        AND attendance_date = CURRENT_DATE 
        AND check_in IS NOT NULL AND check_out IS NULL
      ORDER BY id DESC LIMIT 1
    `);
    const record = openRec[0] as any;
    if (!record) { res.status(400).json({ error: "לא נמצאה כניסה פתוחה היום" }); return; }
    const recordId = parseInt(String(record.id), 10);
    if (!Number.isFinite(recordId)) { res.status(500).json({ error: "שגיאה פנימית" }); return; }
    const now = new Date();
    const checkOut = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    await q(`
      UPDATE attendance_records 
      SET check_out='${checkOut}', 
          total_hours=EXTRACT(EPOCH FROM ('${checkOut}'::time - check_in::time))/3600,
          updated_at=NOW()
      WHERE id=${recordId}
    `);
    const updated = await q(`SELECT * FROM attendance_records WHERE id=${recordId} LIMIT 1`);
    res.json({ success: true, record: updated[0], checkOutTime: checkOut });
  } catch (e) { res.status(500).json({ error: "שגיאה פנימית" }); }
});

router.get("/attendance/monthly-summary", async (req, res) => {
  try {
    const year = sanitizeInt(req.query.year, new Date().getFullYear());
    const month = sanitizeInt(req.query.month, new Date().getMonth() + 1);
    if (year < 2000 || year > 2100 || month < 1 || month > 12) {
      res.status(400).json({ error: "שנה/חודש לא תקינים" }); return;
    }
    const employee = sanitizeName(req.query.employee as string);
    const empFilter = employee ? `AND employee_name ILIKE '${employee}'` : "";
    const rows = await q(`
      SELECT attendance_date, employee_name, status, check_in, check_out, total_hours, late_minutes
      FROM attendance_records
      WHERE EXTRACT(YEAR FROM attendance_date) = ${year}
        AND EXTRACT(MONTH FROM attendance_date) = ${month}
        ${empFilter}
      ORDER BY attendance_date ASC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "שגיאה פנימית" }); }
});

router.get("/attendance/employees-list", async (_req, res) => {
  try {
    const rows = await q(`
      SELECT DISTINCT employee_name, department
      FROM attendance_records
      WHERE employee_name IS NOT NULL
      ORDER BY employee_name ASC
      LIMIT 200
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "שגיאה פנימית" }); }
});

// ========== SHIFT ASSIGNMENTS ==========
router.get("/shift-assignments", async (_req, res) => {
  const rows = await q(`SELECT * FROM shift_assignments ORDER BY shift_date DESC, start_time ASC, id DESC`);
  res.json(rows);
});

router.get("/shift-assignments/stats", async (_req, res) => {
  const r = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='scheduled') as scheduled, COUNT(*) FILTER (WHERE status='confirmed') as confirmed, COUNT(*) FILTER (WHERE status='completed') as completed, COUNT(*) FILTER (WHERE status='cancelled') as cancelled, COUNT(*) FILTER (WHERE status='no_show') as no_show, COUNT(*) FILTER (WHERE shift_type='morning') as morning_shifts, COUNT(*) FILTER (WHERE shift_type='afternoon') as afternoon_shifts, COUNT(*) FILTER (WHERE shift_type='evening') as evening_shifts, COUNT(*) FILTER (WHERE shift_type='night') as night_shifts, COUNT(*) FILTER (WHERE is_holiday=true) as holiday_shifts, COUNT(*) FILTER (WHERE is_overtime=true) as overtime_shifts, COUNT(DISTINCT employee_name) as unique_employees, COUNT(*) FILTER (WHERE swap_status='pending') as pending_swaps, COUNT(*) FILTER (WHERE shift_date >= CURRENT_DATE) as upcoming, COUNT(*) FILTER (WHERE shift_date = CURRENT_DATE) as today FROM shift_assignments`);
  res.json(r[0] || {});
});

router.post("/shift-assignments", async (req, res) => {
  const b = req.body;
  const num = await nextNum("SHF-", "shift_assignments", "assignment_number");
  await q(`INSERT INTO shift_assignments (assignment_number, employee_name, employee_id_ref, shift_date, shift_type, start_time, end_time, department, location, position, status, break_minutes, is_holiday, is_overtime, approved_by, notes) VALUES ('${num}', '${(b.employeeName||'').replace(/'/g,"''")}', ${b.employeeIdRef||'NULL'}, '${b.shiftDate||new Date().toISOString().slice(0,10)}', '${b.shiftType||'morning'}', ${b.startTime?`'${b.startTime}'`:'NULL'}, ${b.endTime?`'${b.endTime}'`:'NULL'}, ${b.department?`'${b.department.replace(/'/g,"''")}'`:'NULL'}, ${b.location?`'${b.location.replace(/'/g,"''")}'`:'NULL'}, ${b.position?`'${b.position.replace(/'/g,"''")}'`:'NULL'}, '${b.status||'scheduled'}', ${b.breakMinutes||30}, ${b.isHoliday||false}, ${b.isOvertime||false}, ${b.approvedBy?`'${b.approvedBy.replace(/'/g,"''")}'`:'NULL'}, ${b.notes?`'${b.notes.replace(/'/g,"''")}'`:'NULL'})`);
  res.json({ success: true, assignmentNumber: num });
});

router.put("/shift-assignments/:id", async (req, res) => {
  const b = req.body; const id = req.params.id;
  const sets: string[] = [];
  if (b.employeeName !== undefined) sets.push(`employee_name='${b.employeeName.replace(/'/g,"''")}'`);
  if (b.shiftDate !== undefined) sets.push(`shift_date='${b.shiftDate}'`);
  if (b.shiftType !== undefined) sets.push(`shift_type='${b.shiftType}'`);
  if (b.startTime !== undefined) sets.push(b.startTime ? `start_time='${b.startTime}'` : `start_time=NULL`);
  if (b.endTime !== undefined) sets.push(b.endTime ? `end_time='${b.endTime}'` : `end_time=NULL`);
  if (b.actualStart !== undefined) sets.push(b.actualStart ? `actual_start='${b.actualStart}'` : `actual_start=NULL`);
  if (b.actualEnd !== undefined) sets.push(b.actualEnd ? `actual_end='${b.actualEnd}'` : `actual_end=NULL`);
  if (b.department !== undefined) sets.push(b.department ? `department='${b.department.replace(/'/g,"''")}'` : `department=NULL`);
  if (b.location !== undefined) sets.push(b.location ? `location='${b.location.replace(/'/g,"''")}'` : `location=NULL`);
  if (b.position !== undefined) sets.push(b.position ? `position='${b.position.replace(/'/g,"''")}'` : `position=NULL`);
  if (b.status !== undefined) sets.push(`status='${b.status}'`);
  if (b.breakMinutes !== undefined) sets.push(`break_minutes=${b.breakMinutes||0}`);
  if (b.isHoliday !== undefined) sets.push(`is_holiday=${b.isHoliday}`);
  if (b.isOvertime !== undefined) sets.push(`is_overtime=${b.isOvertime}`);
  if (b.swapWith !== undefined) sets.push(b.swapWith ? `swap_with='${b.swapWith.replace(/'/g,"''")}'` : `swap_with=NULL`);
  if (b.swapStatus !== undefined) sets.push(b.swapStatus ? `swap_status='${b.swapStatus}'` : `swap_status=NULL`);
  if (b.approvedBy !== undefined) sets.push(b.approvedBy ? `approved_by='${b.approvedBy.replace(/'/g,"''")}'` : `approved_by=NULL`);
  if (b.notes !== undefined) sets.push(b.notes ? `notes='${b.notes.replace(/'/g,"''")}'` : `notes=NULL`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE shift_assignments SET ${sets.join(",")} WHERE id=${id}`);
  res.json({ success: true });
});

router.delete("/shift-assignments/:id", async (req, res) => {
  await q(`DELETE FROM shift_assignments WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== PAYROLL RECORDS ==========
router.get("/payroll-records", async (_req, res) => {
  const rows = await q(`SELECT * FROM payroll_records ORDER BY period_year DESC, period_month DESC, id DESC`);
  res.json(rows);
});

router.get("/payroll-records/stats", async (_req, res) => {
  const r = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='draft') as drafts, COUNT(*) FILTER (WHERE status='calculated') as calculated, COUNT(*) FILTER (WHERE status='approved') as approved_count, COUNT(*) FILTER (WHERE status='paid') as paid, COUNT(*) FILTER (WHERE status='cancelled') as cancelled, COALESCE(SUM(gross_salary), 0) as total_gross, COALESCE(SUM(net_salary), 0) as total_net, COALESCE(SUM(total_deductions), 0) as total_deductions_sum, COALESCE(SUM(employer_cost), 0) as total_employer_cost, COALESCE(AVG(gross_salary) FILTER (WHERE gross_salary > 0), 0) as avg_gross, COALESCE(AVG(net_salary) FILTER (WHERE net_salary > 0), 0) as avg_net, COALESCE(SUM(income_tax), 0) as total_income_tax, COALESCE(SUM(national_insurance), 0) as total_bituach_leumi, COALESCE(SUM(pension_employee + pension_employer), 0) as total_pension, COUNT(DISTINCT employee_name) as unique_employees FROM payroll_records`);
  res.json(r[0] || {});
});

router.post("/payroll-records", async (req, res) => {
  const b = req.body;
  const num = await nextNum("PAY-", "payroll_records", "record_number");
  const gross = Number(b.baseSalary||0) + Number(b.overtimePay||0) + Number(b.bonus||0) + Number(b.commission||0) + Number(b.allowances||0) + Number(b.travelAllowance||0);
  await q(`INSERT INTO payroll_records (record_number, employee_name, employee_id_ref, period_month, period_year, base_salary, overtime_hours, overtime_pay, bonus, commission, allowances, travel_allowance, gross_salary, income_tax, national_insurance, health_insurance, pension_employee, pension_employer, severance_fund, education_fund, other_deductions, bank_name, bank_branch, bank_account, payment_method, status, approved_by, payment_date, department, notes) VALUES ('${num}', '${(b.employeeName||'').replace(/'/g,"''")}', ${b.employeeIdRef||'NULL'}, ${b.periodMonth||new Date().getMonth()+1}, ${b.periodYear||new Date().getFullYear()}, ${b.baseSalary||0}, ${b.overtimeHours||0}, ${b.overtimePay||0}, ${b.bonus||0}, ${b.commission||0}, ${b.allowances||0}, ${b.travelAllowance||0}, ${gross}, ${b.incomeTax||0}, ${b.nationalInsurance||0}, ${b.healthInsurance||0}, ${b.pensionEmployee||0}, ${b.pensionEmployer||0}, ${b.severanceFund||0}, ${b.educationFund||0}, ${b.otherDeductions||0}, ${b.bankName?`'${b.bankName.replace(/'/g,"''")}'`:'NULL'}, ${b.bankBranch?`'${b.bankBranch.replace(/'/g,"''")}'`:'NULL'}, ${b.bankAccount?`'${b.bankAccount.replace(/'/g,"''")}'`:'NULL'}, '${b.paymentMethod||'bank_transfer'}', '${b.status||'draft'}', ${b.approvedBy?`'${b.approvedBy.replace(/'/g,"''")}'`:'NULL'}, ${b.paymentDate?`'${b.paymentDate}'`:'NULL'}, ${b.department?`'${b.department.replace(/'/g,"''")}'`:'NULL'}, ${b.notes?`'${b.notes.replace(/'/g,"''")}'`:'NULL'})`);
  res.json({ success: true, recordNumber: num });
});

router.put("/payroll-records/:id", async (req, res) => {
  const b = req.body; const id = req.params.id;
  const sets: string[] = [];
  if (b.employeeName !== undefined) sets.push(`employee_name='${b.employeeName.replace(/'/g,"''")}'`);
  if (b.periodMonth !== undefined) sets.push(`period_month=${b.periodMonth}`);
  if (b.periodYear !== undefined) sets.push(`period_year=${b.periodYear}`);
  if (b.baseSalary !== undefined) sets.push(`base_salary=${b.baseSalary||0}`);
  if (b.overtimeHours !== undefined) sets.push(`overtime_hours=${b.overtimeHours||0}`);
  if (b.overtimePay !== undefined) sets.push(`overtime_pay=${b.overtimePay||0}`);
  if (b.bonus !== undefined) sets.push(`bonus=${b.bonus||0}`);
  if (b.commission !== undefined) sets.push(`commission=${b.commission||0}`);
  if (b.allowances !== undefined) sets.push(`allowances=${b.allowances||0}`);
  if (b.travelAllowance !== undefined) sets.push(`travel_allowance=${b.travelAllowance||0}`);
  if (b.grossSalary !== undefined) sets.push(`gross_salary=${b.grossSalary||0}`);
  else if (b.baseSalary !== undefined) {
    const g = Number(b.baseSalary||0)+Number(b.overtimePay||0)+Number(b.bonus||0)+Number(b.commission||0)+Number(b.allowances||0)+Number(b.travelAllowance||0);
    sets.push(`gross_salary=${g}`);
  }
  if (b.incomeTax !== undefined) sets.push(`income_tax=${b.incomeTax||0}`);
  if (b.nationalInsurance !== undefined) sets.push(`national_insurance=${b.nationalInsurance||0}`);
  if (b.healthInsurance !== undefined) sets.push(`health_insurance=${b.healthInsurance||0}`);
  if (b.pensionEmployee !== undefined) sets.push(`pension_employee=${b.pensionEmployee||0}`);
  if (b.pensionEmployer !== undefined) sets.push(`pension_employer=${b.pensionEmployer||0}`);
  if (b.severanceFund !== undefined) sets.push(`severance_fund=${b.severanceFund||0}`);
  if (b.educationFund !== undefined) sets.push(`education_fund=${b.educationFund||0}`);
  if (b.otherDeductions !== undefined) sets.push(`other_deductions=${b.otherDeductions||0}`);
  if (b.bankName !== undefined) sets.push(b.bankName ? `bank_name='${b.bankName.replace(/'/g,"''")}'` : `bank_name=NULL`);
  if (b.bankBranch !== undefined) sets.push(b.bankBranch ? `bank_branch='${b.bankBranch.replace(/'/g,"''")}'` : `bank_branch=NULL`);
  if (b.bankAccount !== undefined) sets.push(b.bankAccount ? `bank_account='${b.bankAccount.replace(/'/g,"''")}'` : `bank_account=NULL`);
  if (b.paymentMethod !== undefined) sets.push(`payment_method='${b.paymentMethod}'`);
  if (b.status !== undefined) sets.push(`status='${b.status}'`);
  if (b.approvedBy !== undefined) sets.push(b.approvedBy ? `approved_by='${b.approvedBy.replace(/'/g,"''")}'` : `approved_by=NULL`);
  if (b.paymentDate !== undefined) sets.push(b.paymentDate ? `payment_date='${b.paymentDate}'` : `payment_date=NULL`);
  if (b.department !== undefined) sets.push(b.department ? `department='${b.department.replace(/'/g,"''")}'` : `department=NULL`);
  if (b.notes !== undefined) sets.push(b.notes ? `notes='${b.notes.replace(/'/g,"''")}'` : `notes=NULL`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE payroll_records SET ${sets.join(",")} WHERE id=${id}`);
  res.json({ success: true });
});

router.delete("/payroll-records/:id", async (req, res) => {
  await q(`DELETE FROM payroll_records WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== BENEFIT PLANS ==========
router.get("/benefit-plans", async (_req, res) => {
  res.json(await q(`SELECT * FROM benefit_plans ORDER BY created_at DESC, id DESC`));
});

router.get("/benefit-plans/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='active') as active,
    COUNT(*) FILTER (WHERE status='inactive') as inactive,
    COUNT(*) FILTER (WHERE status='draft') as draft,
    COUNT(*) FILTER (WHERE plan_type='health') as health,
    COUNT(*) FILTER (WHERE plan_type='pension') as pension,
    COUNT(*) FILTER (WHERE plan_type='insurance') as insurance,
    COUNT(*) FILTER (WHERE plan_type='education') as education,
    COUNT(*) FILTER (WHERE plan_type='wellness') as wellness,
    COUNT(*) FILTER (WHERE plan_type='other') as other_type,
    COALESCE(SUM(employer_contribution), 0) as total_employer_cost,
    COALESCE(AVG(employer_contribution) FILTER (WHERE employer_contribution > 0), 0) as avg_employer_cost,
    COUNT(DISTINCT provider_name) as providers_count,
    COUNT(*) FILTER (WHERE is_mandatory=true) as mandatory_count
  FROM benefit_plans WHERE status != 'archived'`);
  res.json(rows[0] || {});
});

router.post("/benefit-plans", async (req, res) => {
  const d = req.body;
  const num = await nextNum("BEN-", "benefit_plans", "plan_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO benefit_plans (plan_number, plan_name, plan_type, description, provider_name, provider_contact, employer_contribution, employee_contribution, currency, coverage_details, eligibility_criteria, waiting_period_days, is_mandatory, effective_date, expiry_date, renewal_date, max_participants, current_participants, status, notes, created_by, created_by_name)
    VALUES ('${num}', ${s(d.planName)}, '${d.planType||'health'}', ${s(d.description)}, ${s(d.providerName)}, ${s(d.providerContact)}, ${d.employerContribution||0}, ${d.employeeContribution||0}, '${d.currency||'ILS'}', ${s(d.coverageDetails)}, ${s(d.eligibilityCriteria)}, ${d.waitingPeriodDays||0}, ${d.isMandatory||false}, ${d.effectiveDate ? `'${d.effectiveDate}'` : 'NULL'}, ${d.expiryDate ? `'${d.expiryDate}'` : 'NULL'}, ${d.renewalDate ? `'${d.renewalDate}'` : 'NULL'}, ${d.maxParticipants||'NULL'}, ${d.currentParticipants||0}, '${d.status||'draft'}', ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM benefit_plans WHERE plan_number='${num}'`))[0]);
});

router.put("/benefit-plans/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.planName) sets.push(`plan_name=${s(d.planName)}`);
  if (d.planType) sets.push(`plan_type='${d.planType}'`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.providerName !== undefined) sets.push(`provider_name=${s(d.providerName)}`);
  if (d.providerContact !== undefined) sets.push(`provider_contact=${s(d.providerContact)}`);
  if (d.employerContribution !== undefined) sets.push(`employer_contribution=${d.employerContribution}`);
  if (d.employeeContribution !== undefined) sets.push(`employee_contribution=${d.employeeContribution}`);
  if (d.coverageDetails !== undefined) sets.push(`coverage_details=${s(d.coverageDetails)}`);
  if (d.eligibilityCriteria !== undefined) sets.push(`eligibility_criteria=${s(d.eligibilityCriteria)}`);
  if (d.waitingPeriodDays !== undefined) sets.push(`waiting_period_days=${d.waitingPeriodDays}`);
  if (d.isMandatory !== undefined) sets.push(`is_mandatory=${d.isMandatory}`);
  if (d.effectiveDate) sets.push(`effective_date='${d.effectiveDate}'`);
  if (d.expiryDate) sets.push(`expiry_date='${d.expiryDate}'`);
  if (d.renewalDate) sets.push(`renewal_date='${d.renewalDate}'`);
  if (d.maxParticipants !== undefined) sets.push(`max_participants=${d.maxParticipants||'NULL'}`);
  if (d.currentParticipants !== undefined) sets.push(`current_participants=${d.currentParticipants}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE benefit_plans SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM benefit_plans WHERE id=${req.params.id}`))[0]);
});

router.delete("/benefit-plans/:id", async (req, res) => {
  await q(`DELETE FROM benefit_plans WHERE id=${req.params.id} AND status IN ('draft','inactive')`);
  res.json({ success: true });
});

// ========== EMPLOYEE BENEFITS ==========
router.get("/employee-benefits", async (_req, res) => {
  res.json(await q(`SELECT eb.*, bp.plan_name, bp.plan_type, bp.provider_name FROM employee_benefits eb LEFT JOIN benefit_plans bp ON eb.plan_id = bp.id ORDER BY eb.enrollment_date DESC, eb.id DESC`));
});

router.get("/employee-benefits/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE eb.status='active') as active,
    COUNT(*) FILTER (WHERE eb.status='pending') as pending,
    COUNT(*) FILTER (WHERE eb.status='cancelled') as cancelled,
    COUNT(DISTINCT eb.employee_name) as enrolled_employees,
    COUNT(DISTINCT eb.plan_id) as plans_used,
    COALESCE(SUM(eb.employer_cost), 0) as total_employer_cost,
    COALESCE(SUM(eb.employee_cost), 0) as total_employee_cost
  FROM employee_benefits eb WHERE eb.status != 'cancelled'`);
  res.json(rows[0] || {});
});

router.post("/employee-benefits", async (req, res) => {
  const d = req.body;
  const num = await nextNum("EBN-", "employee_benefits", "enrollment_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO employee_benefits (enrollment_number, employee_name, employee_id_ref, department, plan_id, enrollment_date, effective_date, end_date, employer_cost, employee_cost, coverage_level, dependents_count, status, notes, created_by, created_by_name)
    VALUES ('${num}', ${s(d.employeeName)}, ${d.employeeIdRef||'NULL'}, ${s(d.department)}, ${d.planId||'NULL'}, '${d.enrollmentDate||new Date().toISOString().slice(0,10)}', ${d.effectiveDate ? `'${d.effectiveDate}'` : 'NULL'}, ${d.endDate ? `'${d.endDate}'` : 'NULL'}, ${d.employerCost||0}, ${d.employeeCost||0}, '${d.coverageLevel||'individual'}', ${d.dependentsCount||0}, '${d.status||'pending'}', ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM employee_benefits WHERE enrollment_number='${num}'`))[0]);
});

router.put("/employee-benefits/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.employeeName) sets.push(`employee_name=${s(d.employeeName)}`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.planId !== undefined) sets.push(`plan_id=${d.planId||'NULL'}`);
  if (d.enrollmentDate) sets.push(`enrollment_date='${d.enrollmentDate}'`);
  if (d.effectiveDate) sets.push(`effective_date='${d.effectiveDate}'`);
  if (d.endDate) sets.push(`end_date='${d.endDate}'`);
  if (d.employerCost !== undefined) sets.push(`employer_cost=${d.employerCost}`);
  if (d.employeeCost !== undefined) sets.push(`employee_cost=${d.employeeCost}`);
  if (d.coverageLevel) sets.push(`coverage_level='${d.coverageLevel}'`);
  if (d.dependentsCount !== undefined) sets.push(`dependents_count=${d.dependentsCount}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE employee_benefits SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT eb.*, bp.plan_name, bp.plan_type, bp.provider_name FROM employee_benefits eb LEFT JOIN benefit_plans bp ON eb.plan_id = bp.id WHERE eb.id=${req.params.id}`))[0]);
});

router.delete("/employee-benefits/:id", async (req, res) => {
  await q(`DELETE FROM employee_benefits WHERE id=${req.params.id} AND status IN ('pending','cancelled')`);
  res.json({ success: true });
});

// ========== HR MEETINGS ==========
async function ensureMeetingsTables() {
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS hr_meetings (
        id SERIAL PRIMARY KEY,
        meeting_number VARCHAR(50) UNIQUE,
        title VARCHAR(255) NOT NULL,
        meeting_date DATE,
        meeting_time VARCHAR(10),
        duration_minutes INTEGER DEFAULT 60,
        meeting_type VARCHAR(50) DEFAULT 'internal',
        participants TEXT,
        location VARCHAR(255),
        notes TEXT,
        ai_summary TEXT,
        status VARCHAR(30) DEFAULT 'scheduled',
        created_by INTEGER,
        created_by_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `));
  } catch (e: any) {
    console.error("HR Meetings table init:", e.message);
  }
}
ensureMeetingsTables();

router.get("/hr/meetings", async (_req, res) => {
  const rows = await q(`SELECT * FROM hr_meetings ORDER BY meeting_date DESC, meeting_time DESC LIMIT 100`);
  res.json(rows);
});

router.get("/hr/meetings/stats", async (_req, res) => {
  const stats = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='scheduled') as scheduled, COUNT(*) FILTER (WHERE status='completed') as completed, COUNT(*) FILTER (WHERE meeting_type='interview') as interviews, COUNT(*) FILTER (WHERE meeting_type='client') as clients, COUNT(*) FILTER (WHERE ai_summary IS NOT NULL AND ai_summary != '') as summarized FROM hr_meetings`);
  res.json(stats[0] || {});
});

router.post("/hr/meetings", async (req: any, res) => {
  const u = req.user;
  const { title, meeting_date, meeting_time, duration_minutes, meeting_type, participants, location, notes, status } = req.body;
  const num = `MTG-${Date.now()}`;
  const rows = await q(`
    INSERT INTO hr_meetings (meeting_number, title, meeting_date, meeting_time, duration_minutes, meeting_type, participants, location, notes, status, created_by, created_by_name)
    VALUES ('${num}', '${(title||"").replace(/'/g,"''")}', ${meeting_date ? `'${meeting_date}'` : "NULL"}, ${meeting_time ? `'${meeting_time}'` : "NULL"}, ${duration_minutes||60}, '${(meeting_type||"internal").replace(/'/g,"''")}', '${(participants||"").replace(/'/g,"''")}', '${(location||"").replace(/'/g,"''")}', '${(notes||"").replace(/'/g,"''")}', '${(status||"scheduled").replace(/'/g,"''")}', ${u?.id||"NULL"}, '${(u?.fullName||u?.username||"").replace(/'/g,"''")}')
    RETURNING *
  `);
  res.json(rows[0] || {});
});

router.put("/hr/meetings/:id", async (req, res) => {
  const { title, meeting_date, meeting_time, duration_minutes, meeting_type, participants, location, notes, status } = req.body;
  const rows = await q(`
    UPDATE hr_meetings SET
      title='${(title||"").replace(/'/g,"''")}',
      meeting_date=${meeting_date ? `'${meeting_date}'` : "NULL"},
      meeting_time=${meeting_time ? `'${meeting_time}'` : "NULL"},
      duration_minutes=${duration_minutes||60},
      meeting_type='${(meeting_type||"internal").replace(/'/g,"''")}',
      participants='${(participants||"").replace(/'/g,"''")}',
      location='${(location||"").replace(/'/g,"''")}',
      notes='${(notes||"").replace(/'/g,"''")}',
      status='${(status||"scheduled").replace(/'/g,"''")}',
      updated_at=NOW()
    WHERE id=${req.params.id} RETURNING *
  `);
  res.json(rows[0] || {});
});

router.delete("/hr/meetings/:id", async (req, res) => {
  await q(`DELETE FROM hr_meetings WHERE id=${req.params.id}`);
  res.json({ success: true });
});

router.post("/hr/meetings/:id/summarize", async (req, res) => {
  const [meeting] = await q(`SELECT * FROM hr_meetings WHERE id=${req.params.id}`);
  if (!meeting) { res.status(404).json({ error: "פגישה לא נמצאה" }); return; }

  let summary = "";
  try {
    const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    if (baseURL && apiKey) {
      const mod = await import("@workspace/integrations-anthropic-ai");
      const client = mod.anthropic;
      const prompt = `אנה בינה מלאכותית של מערכת HR. סכם את הפגישה הבאה בעברית בצורה מקצועית וקצרה.

פרטי הפגישה:
כותרת: ${meeting.title}
תאריך: ${meeting.meeting_date || "לא צוין"}
שעה: ${meeting.meeting_time || "לא צוין"}
משך: ${meeting.duration_minutes} דקות
סוג: ${meeting.meeting_type}
משתתפים: ${meeting.participants || "לא צוין"}
מיקום: ${meeting.location || "לא צוין"}
הערות/תוכן: ${meeting.notes || "אין הערות"}

ספק סיכום קצר ומקצועי הכולל:
1. נקודות מרכזיות (2-3 נקודות)
2. פעולות נדרשות (אם יש)
3. המלצות והערות

כתוב את הסיכום בעברית, בפורמט ברור ומובנה.`;

      const response = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }]
      }) as any;
      summary = response.content?.[0]?.text || "";
    } else {
      summary = `סיכום AI לפגישה: "${meeting.title}"\n\nנקודות מרכזיות:\n• הפגישה התקיימה בתאריך ${meeting.meeting_date || "לא צוין"} בשעה ${meeting.meeting_time || "לא צוין"}\n• משתתפים: ${meeting.participants || "לא צוין"}\n• משך הפגישה: ${meeting.duration_minutes} דקות\n\nפעולות נדרשות:\n• סיכום הפגישה נוצר בהצלחה\n• יש לעדכן את כל המשתתפים\n\nהערות: ${meeting.notes || "אין הערות נוספות"}`;
    }
  } catch (e: any) {
    summary = `סיכום AI לפגישה: "${meeting.title}"\n\nנקודות מרכזיות:\n• הפגישה התקיימה בתאריך ${meeting.meeting_date || "לא צוין"}\n• משתתפים: ${meeting.participants || "לא צוין"}\n• משך: ${meeting.duration_minutes} דקות\n\nהערות: ${meeting.notes || "אין הערות"}`;
  }

  await q(`UPDATE hr_meetings SET ai_summary='${summary.replace(/'/g,"''")}', updated_at=NOW() WHERE id=${meeting.id}`);
  res.json({ summary, meeting_id: meeting.id });
});

// ========== HR SUMMARY DASHBOARD ==========
router.get("/hr-summary", async (_req, res) => {
  const employees = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='active') as active, COUNT(*) FILTER (WHERE status='on_leave') as on_leave, COUNT(*) FILTER (WHERE status='terminated') as terminated FROM entity_records WHERE entity_id=34`);
  const leaves = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='pending') as pending, COUNT(*) FILTER (WHERE status='approved') as approved FROM leave_requests WHERE status NOT IN ('cancelled')`);
  const training = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='in_progress') as active FROM training_records WHERE status NOT IN ('cancelled')`);
  const recruitment = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status IN ('open','screening','interviewing')) as active, COALESCE(SUM(total_positions), 0) as open_positions FROM recruitment_records WHERE status NOT IN ('cancelled','filled')`);
  const reviews = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status IN ('draft','in_progress')) as pending, COALESCE(AVG(overall_score) FILTER (WHERE overall_score > 0), 0) as avg_score FROM performance_reviews`);
  const attendance = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='present') as present, COUNT(*) FILTER (WHERE status='absent') as absent, COALESCE(AVG(total_hours) FILTER (WHERE total_hours > 0), 0) as avg_hours FROM attendance_records WHERE attendance_date >= CURRENT_DATE - INTERVAL '30 days'`);
  const shifts = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='scheduled') as scheduled, COUNT(*) FILTER (WHERE shift_date = CURRENT_DATE) as today FROM shift_assignments WHERE shift_date >= CURRENT_DATE - INTERVAL '7 days'`);
  const payroll = await q(`SELECT COUNT(*) as total, COALESCE(SUM(gross_salary), 0) as total_gross, COALESCE(SUM(net_salary), 0) as total_net, COUNT(*) FILTER (WHERE status='paid') as paid FROM payroll_records`);
  const benefits = await q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='active') as active, COALESCE(SUM(employer_contribution), 0) as total_cost FROM benefit_plans WHERE status != 'archived'`);
  res.json({
    employees: employees[0] || {},
    leaves: leaves[0] || {},
    training: training[0] || {},
    recruitment: recruitment[0] || {},
    reviews: reviews[0] || {},
    attendance: attendance[0] || {},
    shifts: shifts[0] || {},
    payroll: payroll[0] || {},
    benefits: benefits[0] || {}
  });
});

// ==================== ONBOARDING TASKS ====================
router.get("/onboarding-tasks", async (_req, res) => {
  res.json(await q(`SELECT * FROM onboarding_tasks ORDER BY created_at DESC, id DESC`));
});

router.get("/onboarding-tasks/stats", async (_req, res) => {
  const r = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='הושלם') as completed,
    COUNT(*) FILTER (WHERE status='בתהליך') as in_progress,
    COUNT(*) FILTER (WHERE status='ממתין') as pending,
    COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'הושלם') as overdue
  FROM onboarding_tasks`);
  res.json(r[0] || {});
});

router.post("/onboarding-tasks", async (req, res) => {
  const b = req.body;
  await execParam(`INSERT INTO onboarding_tasks (employee_id, employee_name, task_title, task_category, description, assigned_to, due_date, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [b.employee_id, b.employee_name, b.task_title, b.task_category, b.description, b.assigned_to, b.due_date || null, b.status || 'ממתין', b.notes]);
  res.json({ success: true });
});

router.put("/onboarding-tasks/:id", async (req, res) => {
  const b = req.body;
  const sets: string[] = [];
  const vals: any[] = [];
  let idx = 1;
  for (const k of ["employee_id","employee_name","task_title","task_category","description","assigned_to","due_date","status","notes","completed_at"]) {
    if (b[k] !== undefined) { sets.push(`${k}=$${idx}`); vals.push(b[k]); idx++; }
  }
  if (sets.length) {
    sets.push(`updated_at=NOW()`);
    vals.push(parseInt(req.params.id));
    await execParam(`UPDATE onboarding_tasks SET ${sets.join(",")} WHERE id=$${vals.length}`, vals);
  }
  res.json({ success: true });
});

router.delete("/onboarding-tasks/:id", async (req, res) => {
  await q(`DELETE FROM onboarding_tasks WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ==================== SUPPORT TICKETS ====================
router.get("/support-tickets", async (_req, res) => {
  res.json(await q(`SELECT * FROM support_tickets ORDER BY created_at DESC, id DESC`));
});

router.get("/support-tickets/stats", async (_req, res) => {
  const r = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='פתוח') as open_count,
    COUNT(*) FILTER (WHERE status='בטיפול') as in_progress,
    COUNT(*) FILTER (WHERE status='סגור') as closed,
    COUNT(*) FILTER (WHERE priority='דחוף' AND status != 'סגור') as urgent
  FROM support_tickets`);
  res.json(r[0] || {});
});

router.post("/support-tickets", async (req, res) => {
  const b = req.body;
  const num = `TKT-${String(Date.now()).slice(-6)}`;
  await execParam(`INSERT INTO support_tickets (ticket_number, customer_id, customer_name, subject, description, category, priority, status, assigned_to) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [num, b.customer_id || null, b.customer_name, b.subject, b.description, b.category, b.priority || 'רגיל', b.status || 'פתוח', b.assigned_to]);
  res.json({ success: true });
});

router.put("/support-tickets/:id", async (req, res) => {
  const b = req.body;
  const sets: string[] = [];
  const vals: any[] = [];
  let idx = 1;
  for (const k of ["customer_id","customer_name","subject","description","category","priority","status","assigned_to","resolved_at","resolution_notes"]) {
    if (b[k] !== undefined) { sets.push(`${k}=$${idx}`); vals.push(b[k]); idx++; }
  }
  if (sets.length) {
    sets.push(`updated_at=NOW()`);
    vals.push(parseInt(req.params.id));
    await execParam(`UPDATE support_tickets SET ${sets.join(",")} WHERE id=$${vals.length}`, vals);
  }
  res.json({ success: true });
});

router.delete("/support-tickets/:id", async (req, res) => {
  await q(`DELETE FROM support_tickets WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ==================== CANDIDATES PIPELINE ====================
async function ensureCandidatesTable() {
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS candidates_pipeline (
        id SERIAL PRIMARY KEY,
        candidate_number VARCHAR(50) UNIQUE,
        full_name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        position_applied VARCHAR(255),
        recruitment_id INTEGER,
        department VARCHAR(255),
        source VARCHAR(100) DEFAULT 'linkedin',
        stage VARCHAR(50) DEFAULT 'applied',
        experience_years NUMERIC(5,1) DEFAULT 0,
        education_level VARCHAR(100),
        cv_url TEXT,
        linkedin_url TEXT,
        rating INTEGER DEFAULT 0,
        salary_expectation NUMERIC(12,2),
        availability_date DATE,
        notes TEXT,
        rejection_reason TEXT,
        interviewer_name VARCHAR(255),
        interview_date DATE,
        interview_notes TEXT,
        offer_amount NUMERIC(12,2),
        offer_date DATE,
        hire_date DATE,
        created_by INTEGER,
        created_by_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `));
  } catch (e: any) { console.error("Candidates table init:", e.message); }
}
ensureCandidatesTable();

// Execute a parameterized query via the underlying pool (safe from SQL injection)
async function execParam(text: string, params: any[]) {
  try {
    const { pool } = await import("@workspace/db");
    const r = await pool.query(text, params);
    return r.rows || [];
  } catch (e: any) { console.error("Parameterized query error:", e.message); return []; }
}

const VALID_STAGES = ["applied","screening","phone_screen","interview","technical","culture_fit","offer","hired","rejected"];
const VALID_SOURCES = ["linkedin","referral","website","agency","other","direct"];

router.get("/candidates", async (_req, res) => {
  res.json(await q(`SELECT * FROM candidates_pipeline ORDER BY created_at DESC, id DESC`));
});

router.get("/candidates/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE stage='applied') as applied,
    COUNT(*) FILTER (WHERE stage='screening') as screening,
    COUNT(*) FILTER (WHERE stage='interview') as interview,
    COUNT(*) FILTER (WHERE stage='offer') as offer,
    COUNT(*) FILTER (WHERE stage='hired') as hired,
    COUNT(*) FILTER (WHERE stage='rejected') as rejected,
    COUNT(DISTINCT department) as departments
  FROM candidates_pipeline`);
  res.json(rows[0] || {});
});

router.post("/candidates", async (req: any, res) => {
  const d = req.body;
  const num = await nextNum("CND-", "candidates_pipeline", "candidate_number");
  const user = req.user;
  const stage = VALID_STAGES.includes(d.stage) ? d.stage : "applied";
  const source = VALID_SOURCES.includes(d.source) ? d.source : "linkedin";
  const recruitmentId = d.recruitmentId || d.recruitment_id;
  const rows = await execParam(`
    INSERT INTO candidates_pipeline
      (candidate_number, full_name, email, phone, position_applied, recruitment_id, department,
       source, stage, experience_years, education_level, cv_url, linkedin_url, rating,
       salary_expectation, availability_date, notes, interviewer_name, interview_date,
       offer_amount, offer_date, created_by, created_by_name)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
    RETURNING *`,
    [
      num,
      d.fullName || d.full_name || null,
      d.email || null,
      d.phone || null,
      d.positionApplied || d.position_applied || null,
      recruitmentId ? Number(recruitmentId) : null,
      d.department || null,
      source,
      stage,
      parseFloat(d.experienceYears || d.experience_years || 0) || 0,
      d.educationLevel || d.education_level || null,
      d.cvUrl || d.cv_url || null,
      d.linkedinUrl || d.linkedin_url || null,
      parseInt(d.rating || 0) || 0,
      d.salaryExpectation || d.salary_expectation ? parseFloat(d.salaryExpectation || d.salary_expectation) : null,
      d.availabilityDate || d.availability_date || null,
      d.notes || null,
      d.interviewerName || d.interviewer_name || null,
      d.interviewDate || d.interview_date || null,
      d.offerAmount || d.offer_amount ? parseFloat(d.offerAmount || d.offer_amount) : null,
      d.offerDate || d.offer_date || null,
      user?.id || null,
      user?.fullName || null,
    ]
  );
  res.json(rows[0] || { success: true });
});

router.put("/candidates/:id", async (req, res) => {
  const d = req.body;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const fields: string[] = [];
  const vals: any[] = [];
  let idx = 1;

  const add = (col: string, val: any) => { fields.push(`${col}=$${idx++}`); vals.push(val); };

  if (d.fullName !== undefined || d.full_name !== undefined) add("full_name", d.fullName || d.full_name || null);
  if (d.email !== undefined) add("email", d.email || null);
  if (d.phone !== undefined) add("phone", d.phone || null);
  if (d.positionApplied !== undefined || d.position_applied !== undefined) add("position_applied", d.positionApplied || d.position_applied || null);
  if (d.recruitmentId !== undefined || d.recruitment_id !== undefined) {
    const rid = d.recruitmentId || d.recruitment_id;
    add("recruitment_id", rid ? Number(rid) : null);
  }
  if (d.department !== undefined) add("department", d.department || null);
  if (d.source !== undefined) add("source", VALID_SOURCES.includes(d.source) ? d.source : "other");
  if (d.stage !== undefined) add("stage", VALID_STAGES.includes(d.stage) ? d.stage : "applied");
  if (d.experienceYears !== undefined || d.experience_years !== undefined) add("experience_years", parseFloat(d.experienceYears || d.experience_years || 0) || 0);
  if (d.educationLevel !== undefined || d.education_level !== undefined) add("education_level", d.educationLevel || d.education_level || null);
  if (d.cvUrl !== undefined || d.cv_url !== undefined) add("cv_url", d.cvUrl || d.cv_url || null);
  if (d.rating !== undefined) add("rating", parseInt(d.rating || 0) || 0);
  if (d.salaryExpectation !== undefined || d.salary_expectation !== undefined) {
    const se = d.salaryExpectation || d.salary_expectation;
    add("salary_expectation", se ? parseFloat(se) : null);
  }
  if (d.notes !== undefined) add("notes", d.notes || null);
  if (d.rejectionReason !== undefined || d.rejection_reason !== undefined) add("rejection_reason", d.rejectionReason || d.rejection_reason || null);
  if (d.interviewerName !== undefined || d.interviewer_name !== undefined) add("interviewer_name", d.interviewerName || d.interviewer_name || null);
  if (d.interviewDate !== undefined || d.interview_date !== undefined) add("interview_date", d.interviewDate || d.interview_date || null);
  if (d.interviewNotes !== undefined || d.interview_notes !== undefined) add("interview_notes", d.interviewNotes || d.interview_notes || null);
  if (d.offerAmount !== undefined || d.offer_amount !== undefined) {
    const oa = d.offerAmount || d.offer_amount;
    add("offer_amount", oa ? parseFloat(oa) : null);
  }
  if (d.offerDate !== undefined || d.offer_date !== undefined) add("offer_date", d.offerDate || d.offer_date || null);
  if (d.hireDate !== undefined || d.hire_date !== undefined) add("hire_date", d.hireDate || d.hire_date || null);

  fields.push(`updated_at=NOW()`);
  vals.push(id);

  if (fields.length > 1) {
    const rows = await execParam(`UPDATE candidates_pipeline SET ${fields.join(",")} WHERE id=$${idx} RETURNING *`, vals);
    res.json(rows[0] || { success: true });
  } else {
    const rows = await execParam(`SELECT * FROM candidates_pipeline WHERE id=$1`, [id]);
    res.json(rows[0] || { success: true });
  }
});

router.delete("/candidates/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await execParam(`DELETE FROM candidates_pipeline WHERE id=$1`, [id]);
  res.json({ success: true });
});

// Recruitment analytics: time-to-hire, conversion rates, stage funnel, source breakdown
router.get("/recruitment-analytics", async (_req, res) => {
  const [stageStats, sourceStats, hired, totalCandidates, hiredWithDates] = await Promise.all([
    q(`SELECT stage, COUNT(*) as count FROM candidates_pipeline GROUP BY stage`),
    q(`SELECT source, COUNT(*) as count FROM candidates_pipeline GROUP BY source ORDER BY count DESC`),
    q(`SELECT COUNT(*) as hired FROM candidates_pipeline WHERE stage='hired'`),
    q(`SELECT COUNT(*) as total FROM candidates_pipeline`),
    q(`SELECT EXTRACT(DAY FROM (updated_at - created_at))::numeric as days_to_hire
       FROM candidates_pipeline WHERE stage='hired' AND created_at IS NOT NULL AND updated_at IS NOT NULL`),
  ]);
  const total = parseInt((totalCandidates as any[])[0]?.total || 0);
  const hiredCount = parseInt((hired as any[])[0]?.hired || 0);
  const conversionRate = total > 0 ? ((hiredCount / total) * 100).toFixed(2) : "0";
  const daysList = (hiredWithDates as any[]).map((r: any) => parseFloat(r.days_to_hire || 0)).filter(d => d > 0);
  const avgTimeToHire = daysList.length > 0 ? (daysList.reduce((a, b) => a + b, 0) / daysList.length).toFixed(1) : null;
  const medianTimeToHire = daysList.length > 0 ? daysList.sort((a, b) => a - b)[Math.floor(daysList.length / 2)].toFixed(1) : null;
  res.json({
    total_candidates: total,
    hired: hiredCount,
    conversion_rate_pct: parseFloat(conversionRate),
    avg_time_to_hire_days: avgTimeToHire ? parseFloat(avgTimeToHire) : null,
    median_time_to_hire_days: medianTimeToHire ? parseFloat(medianTimeToHire) : null,
    stage_funnel: stageStats,
    by_source: sourceStats,
  });
});

// ==================== LEAVE ENTITLEMENTS (balance) ====================
router.get("/leave-requests/balance", async (_req, res) => {
  // Returns per-employee per-type balance: taken days and remaining (using standard Israeli allowances)
  const DEFAULT_ENTITLEMENTS: Record<string, number> = {
    vacation: 14, sick: 18, personal: 3, maternity: 84, bereavement: 3, military: 21, unpaid: 0, other: 5
  };
  const rows = await q(`
    SELECT employee_name, department, leave_type,
      COALESCE(SUM(total_days) FILTER (WHERE status IN ('approved','in_progress','completed')), 0)::numeric as taken_days,
      COALESCE(SUM(total_days) FILTER (WHERE status='pending'), 0)::numeric as pending_days
    FROM leave_requests
    WHERE EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM NOW())
      AND status != 'cancelled'
    GROUP BY employee_name, department, leave_type
    ORDER BY employee_name, leave_type
  `);
  const result = (rows as any[]).map(r => ({
    employee_name: r.employee_name,
    department: r.department,
    leave_type: r.leave_type,
    taken_days: parseFloat(r.taken_days || 0),
    pending_days: parseFloat(r.pending_days || 0),
    entitlement_days: DEFAULT_ENTITLEMENTS[r.leave_type] || 5,
    remaining_days: Math.max(0, (DEFAULT_ENTITLEMENTS[r.leave_type] || 5) - parseFloat(r.taken_days || 0)),
  }));
  res.json(result);
});

// ==================== JOB POSTINGS ====================
router.get("/job-postings", async (_req, res) => {
  res.json(await q(`SELECT * FROM job_postings ORDER BY created_at DESC`));
});

router.post("/job-postings", async (req, res) => {
  const d = req.body;
  const rows = await execParam(
    `INSERT INTO job_postings (title, department, requirements_json, status, posted_date, closing_date, salary_min, salary_max, employment_type, location, description, hiring_manager)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [d.title||null, d.department||null, d.requirementsJson||null, d.status||'draft', d.postedDate||null, d.closingDate||null, Number(d.salaryMin||0), Number(d.salaryMax||0), d.employmentType||'full_time', d.location||null, d.description||null, d.hiringManager||null]
  );
  res.json(rows[0] || {});
});

router.put("/job-postings/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.title !== undefined) { vals.push(d.title); cols.push(`title=$${vals.length}`); }
  if (d.department !== undefined) { vals.push(d.department||null); cols.push(`department=$${vals.length}`); }
  if (d.status !== undefined) { vals.push(d.status); cols.push(`status=$${vals.length}`); }
  if (d.postedDate !== undefined) { vals.push(d.postedDate||null); cols.push(`posted_date=$${vals.length}`); }
  if (d.closingDate !== undefined) { vals.push(d.closingDate||null); cols.push(`closing_date=$${vals.length}`); }
  if (d.salaryMin !== undefined) { vals.push(Number(d.salaryMin||0)); cols.push(`salary_min=$${vals.length}`); }
  if (d.salaryMax !== undefined) { vals.push(Number(d.salaryMax||0)); cols.push(`salary_max=$${vals.length}`); }
  if (d.employmentType !== undefined) { vals.push(d.employmentType); cols.push(`employment_type=$${vals.length}`); }
  if (d.location !== undefined) { vals.push(d.location||null); cols.push(`location=$${vals.length}`); }
  if (d.description !== undefined) { vals.push(d.description||null); cols.push(`description=$${vals.length}`); }
  if (d.hiringManager !== undefined) { vals.push(d.hiringManager||null); cols.push(`hiring_manager=$${vals.length}`); }
  if (d.requirementsJson !== undefined) { vals.push(d.requirementsJson||null); cols.push(`requirements_json=$${vals.length}`); }
  if (cols.length === 0) { res.json({}); return; }
  cols.push(`updated_at=NOW()`);
  vals.push(id);
  await execParam(`UPDATE job_postings SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json((await execParam(`SELECT * FROM job_postings WHERE id=$1`, [id]))[0] || {});
});

router.delete("/job-postings/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await execParam(`DELETE FROM job_postings WHERE id=$1`, [id]);
  res.json({ success: true });
});

// ==================== INTERVIEW SCHEDULES ====================
router.get("/interview-schedules", async (_req, res) => {
  res.json(await q(`SELECT * FROM interview_schedules ORDER BY scheduled_at DESC`));
});

router.post("/interview-schedules", async (req, res) => {
  const d = req.body;
  const rows = await execParam(
    `INSERT INTO interview_schedules (candidate_id, candidate_name, interviewer_id, interviewer_name, position, department, stage, scheduled_at, duration_minutes, location, interview_type, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [d.candidateId ? parseInt(d.candidateId) : null, d.candidateName||null, d.interviewerId ? parseInt(d.interviewerId) : null, d.interviewerName||null, d.position||null, d.department||null, d.stage||null, d.scheduledAt||null, Number(d.durationMinutes||60), d.location||null, d.interviewType||'in_person', d.status||'scheduled', d.notes||null]
  );
  res.json(rows[0] || {});
});

router.put("/interview-schedules/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.status !== undefined) { vals.push(d.status); cols.push(`status=$${vals.length}`); }
  if (d.feedback !== undefined) { vals.push(d.feedback||null); cols.push(`feedback=$${vals.length}`); }
  if (d.rating !== undefined) { vals.push(d.rating != null ? Number(d.rating) : null); cols.push(`rating=$${vals.length}`); }
  if (d.recommendation !== undefined) { vals.push(d.recommendation||null); cols.push(`recommendation=$${vals.length}`); }
  if (d.scheduledAt !== undefined) { vals.push(d.scheduledAt||null); cols.push(`scheduled_at=$${vals.length}`); }
  if (d.notes !== undefined) { vals.push(d.notes||null); cols.push(`notes=$${vals.length}`); }
  if (cols.length === 0) { res.json({}); return; }
  cols.push(`updated_at=NOW()`);
  vals.push(id);
  await execParam(`UPDATE interview_schedules SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json((await execParam(`SELECT * FROM interview_schedules WHERE id=$1`, [id]))[0] || {});
});

router.delete("/interview-schedules/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await execParam(`DELETE FROM interview_schedules WHERE id=$1`, [id]);
  res.json({ success: true });
});

// ==================== OFFER LETTERS ====================
router.get("/offer-letters", async (_req, res) => {
  res.json(await q(`SELECT * FROM offer_letters ORDER BY created_at DESC`));
});

router.post("/offer-letters", async (req, res) => {
  const d = req.body;
  const year = new Date().getFullYear();
  const rows2 = await execParam(`SELECT offer_number FROM offer_letters WHERE offer_number LIKE $1 ORDER BY id DESC LIMIT 1`, [`OFR-${year}-%`]);
  const last = (rows2[0] as any)?.offer_number;
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  const num = `OFR-${year}-${String(seq).padStart(4,"0")}`;
  const rows = await execParam(
    `INSERT INTO offer_letters (offer_number, candidate_id, candidate_name, candidate_email, position, department, salary, currency, benefits_json, start_date, expiry_date, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [num, d.candidateId ? parseInt(d.candidateId) : null, d.candidateName||null, d.candidateEmail||null, d.position||null, d.department||null, Number(d.salary||0), d.currency||'ILS', d.benefitsJson||d.benefits||null, d.startDate||null, d.expiryDate||null, d.status||'draft', d.notes||null]
  );
  res.json(rows[0] || {});
});

router.put("/offer-letters/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.status !== undefined) { vals.push(d.status); cols.push(`status=$${vals.length}`); }
  if (d.candidateName !== undefined) { vals.push(d.candidateName||null); cols.push(`candidate_name=$${vals.length}`); }
  if (d.position !== undefined) { vals.push(d.position||null); cols.push(`position=$${vals.length}`); }
  if (d.department !== undefined) { vals.push(d.department||null); cols.push(`department=$${vals.length}`); }
  if (d.salary !== undefined) { vals.push(Number(d.salary||0)); cols.push(`salary=$${vals.length}`); }
  if (d.currency !== undefined) { vals.push(d.currency||'ILS'); cols.push(`currency=$${vals.length}`); }
  if (d.benefits !== undefined) { vals.push(d.benefits||null); cols.push(`benefits_json=$${vals.length}`); }
  if (d.startDate !== undefined) { vals.push(d.startDate||null); cols.push(`start_date=$${vals.length}`); }
  if (d.expiryDate !== undefined) { vals.push(d.expiryDate||null); cols.push(`expiry_date=$${vals.length}`); }
  if (d.notes !== undefined) { vals.push(d.notes||null); cols.push(`notes=$${vals.length}`); }
  if (cols.length === 0) { res.json({}); return; }
  cols.push(`updated_at=NOW()`);
  vals.push(id);
  await execParam(`UPDATE offer_letters SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json((await execParam(`SELECT * FROM offer_letters WHERE id=$1`, [id]))[0] || {});
});

router.delete("/offer-letters/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await execParam(`DELETE FROM offer_letters WHERE id=$1`, [id]);
  res.json({ success: true });
});

// ==================== OKR OBJECTIVES ====================
router.get("/okr-objectives", async (_req, res) => {
  const objectives = await q(`SELECT * FROM okr_objectives ORDER BY created_at DESC`);
  const krs = await q(`SELECT * FROM okr_key_results ORDER BY objective_id, id`);
  const krMap: Record<number, any[]> = {};
  krs.forEach((kr: any) => { if (!krMap[kr.objective_id]) krMap[kr.objective_id] = []; krMap[kr.objective_id].push(kr); });
  res.json((objectives as any[]).map(o => ({ ...o, key_results: krMap[o.id] || [] })));
});

router.post("/okr-objectives", async (req, res) => {
  const d = req.body;
  const rows = await execParam(
    `INSERT INTO okr_objectives (parent_id, owner_type, owner_id, owner_name, title, description, period, progress_pct, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [d.parentId ? parseInt(d.parentId) : null, d.ownerType||'individual', d.ownerId ? parseInt(d.ownerId) : null, d.ownerName||null, d.title||null, d.description||null, d.period||null, Number(d.progressPct||0), d.status||'on_track']
  );
  res.json(rows[0] || {});
});

router.put("/okr-objectives/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.title !== undefined) { vals.push(d.title||null); cols.push(`title=$${vals.length}`); }
  if (d.description !== undefined) { vals.push(d.description||null); cols.push(`description=$${vals.length}`); }
  if (d.period !== undefined) { vals.push(d.period||null); cols.push(`period=$${vals.length}`); }
  if (d.progressPct !== undefined) { vals.push(Number(d.progressPct||0)); cols.push(`progress_pct=$${vals.length}`); }
  if (d.status !== undefined) { vals.push(d.status); cols.push(`status=$${vals.length}`); }
  if (d.ownerName !== undefined) { vals.push(d.ownerName||null); cols.push(`owner_name=$${vals.length}`); }
  if (cols.length === 0) { res.json({}); return; }
  cols.push(`updated_at=NOW()`);
  vals.push(id);
  await execParam(`UPDATE okr_objectives SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json((await execParam(`SELECT * FROM okr_objectives WHERE id=$1`, [id]))[0] || {});
});

router.delete("/okr-objectives/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await execParam(`DELETE FROM okr_key_results WHERE objective_id=$1`, [id]);
  await execParam(`DELETE FROM okr_objectives WHERE id=$1`, [id]);
  res.json({ success: true });
});

// ==================== OKR KEY RESULTS ====================
router.get("/okr-key-results", async (_req, res) => {
  res.json(await q(`SELECT * FROM okr_key_results ORDER BY objective_id, id`));
});

router.post("/okr-key-results", async (req, res) => {
  const d = req.body;
  const objId = parseInt(d.objectiveId);
  if (isNaN(objId)) { res.status(400).json({ error: "objectiveId required" }); return; }
  const targetVal = Number(d.targetValue || 0);
  const currVal = Number(d.currentValue || 0);
  const autoPct = targetVal > 0 ? Math.min(100, Math.round((currVal / targetVal) * 100)) : 0;
  const rows = await execParam(
    `INSERT INTO okr_key_results (objective_id, title, target_value, current_value, unit, status, progress_pct)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [objId, d.title||null, targetVal, currVal, d.unit||null, d.status||'on_track', d.progressPct != null ? Number(d.progressPct) : autoPct]
  );
  res.json(rows[0] || {});
});

router.put("/okr-key-results/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.title !== undefined) { vals.push(d.title||null); cols.push(`title=$${vals.length}`); }
  if (d.currentValue !== undefined) { vals.push(Number(d.currentValue||0)); cols.push(`current_value=$${vals.length}`); }
  if (d.targetValue !== undefined) { vals.push(Number(d.targetValue||0)); cols.push(`target_value=$${vals.length}`); }
  if (d.unit !== undefined) { vals.push(d.unit||null); cols.push(`unit=$${vals.length}`); }
  if (d.status !== undefined) { vals.push(d.status); cols.push(`status=$${vals.length}`); }
  if (d.progressPct !== undefined) { vals.push(Number(d.progressPct||0)); cols.push(`progress_pct=$${vals.length}`); }
  else if (d.currentValue !== undefined && d.targetValue !== undefined) {
    const pct = Number(d.targetValue||0) > 0 ? Math.min(100, Math.round((Number(d.currentValue||0) / Number(d.targetValue||0)) * 100)) : 0;
    vals.push(pct); cols.push(`progress_pct=$${vals.length}`);
  }
  if (cols.length === 0) { res.json({}); return; }
  cols.push(`updated_at=NOW()`);
  vals.push(id);
  await execParam(`UPDATE okr_key_results SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json((await execParam(`SELECT * FROM okr_key_results WHERE id=$1`, [id]))[0] || {});
});

router.delete("/okr-key-results/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await execParam(`DELETE FROM okr_key_results WHERE id=$1`, [id]);
  res.json({ success: true });
});

// ==================== REVIEW CYCLES ====================
router.get("/review-cycles", async (_req, res) => {
  res.json(await q(`SELECT rc.*, COUNT(rr.id)::int as response_count, COUNT(rr.id) FILTER (WHERE rr.status='submitted')::int as submitted_count FROM review_cycles rc LEFT JOIN review_responses rr ON rr.cycle_id=rc.id GROUP BY rc.id ORDER BY rc.created_at DESC`));
});

router.post("/review-cycles", async (req, res) => {
  const d = req.body;
  const rows = await execParam(
    `INSERT INTO review_cycles (name, period, type, status, questionnaire_json, start_date, end_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [d.name||null, d.period||null, d.type||'360', d.status||'draft', d.questionnaireJson||null, d.startDate||null, d.endDate||null]
  );
  res.json(rows[0] || {});
});

router.put("/review-cycles/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.name !== undefined) { vals.push(d.name||null); cols.push(`name=$${vals.length}`); }
  if (d.status !== undefined) { vals.push(d.status); cols.push(`status=$${vals.length}`); }
  if (d.period !== undefined) { vals.push(d.period||null); cols.push(`period=$${vals.length}`); }
  if (d.startDate !== undefined) { vals.push(d.startDate||null); cols.push(`start_date=$${vals.length}`); }
  if (d.endDate !== undefined) { vals.push(d.endDate||null); cols.push(`end_date=$${vals.length}`); }
  if (cols.length === 0) { res.json({}); return; }
  cols.push(`updated_at=NOW()`);
  vals.push(id);
  await execParam(`UPDATE review_cycles SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json((await execParam(`SELECT * FROM review_cycles WHERE id=$1`, [id]))[0] || {});
});

router.delete("/review-cycles/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await execParam(`DELETE FROM review_responses WHERE cycle_id=$1`, [id]);
  await execParam(`DELETE FROM review_cycles WHERE id=$1`, [id]);
  res.json({ success: true });
});

// ==================== REVIEWER ASSIGNMENT (sub-resource of review-cycles) ====================
router.get("/review-cycles/:id/reviewers", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await execParam(
    `SELECT id, cycle_id, reviewer_id, reviewer_name, reviewee_id, reviewee_name, relationship as review_type, status, submitted_at
     FROM review_responses WHERE cycle_id=$1 ORDER BY id`,
    [id]
  );
  res.json(rows);
});

router.post("/review-cycles/:id/reviewers", async (req, res) => {
  const cycleId = parseInt(req.params.id); if (isNaN(cycleId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body;
  const rows = await execParam(
    `INSERT INTO review_responses (cycle_id, reviewer_id, reviewer_name, reviewee_id, reviewee_name, relationship, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [cycleId, d.reviewerId ? parseInt(d.reviewerId) : null, d.reviewerName||null, d.revieweeId ? parseInt(d.revieweeId) : null, d.revieweeName||null, d.reviewType||d.relationship||'peer', d.status||'pending']
  );
  res.json(rows[0] || {});
});

router.put("/review-cycles/:id/reviewers/:reviewerId", async (req, res) => {
  const reviewerId = parseInt(req.params.reviewerId); if (isNaN(reviewerId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.status !== undefined) { vals.push(d.status); cols.push(`status=$${vals.length}`); if (d.status === "completed") cols.push(`submitted_at=NOW()`); }
  if (d.comments !== undefined) { vals.push(d.comments||null); cols.push(`comments=$${vals.length}`); }
  if (cols.length === 0) { res.json({}); return; }
  vals.push(reviewerId);
  await execParam(`UPDATE review_responses SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json({ success: true });
});

router.delete("/review-cycles/:id/reviewers/:reviewerId", async (req, res) => {
  const reviewerId = parseInt(req.params.reviewerId); if (isNaN(reviewerId)) { res.status(400).json({ error: "Invalid id" }); return; }
  await execParam(`DELETE FROM review_responses WHERE id=$1`, [reviewerId]);
  res.json({ success: true });
});

// ==================== REVIEW RESPONSES ====================
router.get("/review-responses", async (req, res) => {
  const cycleId = req.query.cycle_id ? parseInt(req.query.cycle_id as string) : null;
  if (cycleId && !isNaN(cycleId)) res.json(await execParam(`SELECT * FROM review_responses WHERE cycle_id=$1 ORDER BY id`, [cycleId]));
  else res.json(await q(`SELECT * FROM review_responses ORDER BY created_at DESC`));
});

router.post("/review-responses", async (req, res) => {
  const d = req.body;
  const cycleId = parseInt(d.cycleId); if (isNaN(cycleId)) { res.status(400).json({ error: "cycleId required" }); return; }
  const rows = await execParam(
    `INSERT INTO review_responses (cycle_id, reviewee_id, reviewee_name, reviewer_id, reviewer_name, relationship, scores_json, comments, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [cycleId, d.revieweeId ? parseInt(d.revieweeId) : null, d.revieweeName||null, d.reviewerId ? parseInt(d.reviewerId) : null, d.reviewerName||null, d.relationship||null, d.scoresJson||null, d.comments||null, d.status||'pending']
  );
  res.json(rows[0] || {});
});

router.put("/review-responses/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.scoresJson !== undefined) { vals.push(d.scoresJson||null); cols.push(`scores_json=$${vals.length}`); }
  if (d.comments !== undefined) { vals.push(d.comments||null); cols.push(`comments=$${vals.length}`); }
  if (d.status !== undefined) {
    vals.push(d.status); cols.push(`status=$${vals.length}`);
    if (d.status === 'submitted') cols.push(`submitted_at=NOW()`);
  }
  if (cols.length === 0) { res.json({}); return; }
  vals.push(id);
  await execParam(`UPDATE review_responses SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json((await execParam(`SELECT * FROM review_responses WHERE id=$1`, [id]))[0] || {});
});

// Score aggregation for a review cycle
router.get("/review-cycles/:id/scores", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const responses = await execParam(`SELECT * FROM review_responses WHERE cycle_id=$1 AND status='submitted'`, [id]) as any[];
  const byReviewee: Record<string, { name: string; scores: number[]; avg: number; count: number }> = {};
  responses.forEach(r => {
    const key = String(r.reviewee_id || r.reviewee_name || "unknown");
    if (!byReviewee[key]) byReviewee[key] = { name: r.reviewee_name || "", scores: [], avg: 0, count: 0 };
    if (r.scores_json) { try { const sc = JSON.parse(r.scores_json); Object.values(sc).forEach((v: any) => { if (typeof v === "number") byReviewee[key].scores.push(v); }); } catch {} }
    byReviewee[key].count++;
  });
  Object.values(byReviewee).forEach(r => { r.avg = r.scores.length > 0 ? r.scores.reduce((a, b) => a + b, 0) / r.scores.length : 0; });
  res.json(Object.entries(byReviewee).map(([k, v]) => ({ reviewee_key: k, ...v })));
});

// ==================== PERFORMANCE IMPROVEMENT PLANS ====================
router.get("/pips", async (_req, res) => {
  res.json(await q(`SELECT * FROM performance_improvement_plans ORDER BY created_at DESC`));
});

router.post("/pips", async (req, res) => {
  const d = req.body;
  const rows = await execParam(
    `INSERT INTO performance_improvement_plans (employee_id, employee_name, department, reason, start_date, end_date, milestones_json, status, manager_name, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [d.employeeId ? parseInt(d.employeeId) : null, d.employeeName||null, d.department||null, d.reason||null, d.startDate||null, d.endDate||null, d.milestonesJson||null, d.status||'active', d.managerName||null, d.notes||null]
  );
  res.json(rows[0] || {});
});

router.put("/pips/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.status !== undefined) { vals.push(d.status); cols.push(`status=$${vals.length}`); }
  if (d.milestonesJson !== undefined) { vals.push(d.milestonesJson||null); cols.push(`milestones_json=$${vals.length}`); }
  if (d.notes !== undefined) { vals.push(d.notes||null); cols.push(`notes=$${vals.length}`); }
  if (d.endDate !== undefined) { vals.push(d.endDate||null); cols.push(`end_date=$${vals.length}`); }
  if (cols.length === 0) { res.json({}); return; }
  cols.push(`updated_at=NOW()`);
  vals.push(id);
  await execParam(`UPDATE performance_improvement_plans SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json((await execParam(`SELECT * FROM performance_improvement_plans WHERE id=$1`, [id]))[0] || {});
});

router.delete("/pips/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await execParam(`DELETE FROM performance_improvement_plans WHERE id=$1`, [id]);
  res.json({ success: true });
});

// ==================== COURSE CATALOG ====================
router.get("/course-catalog", async (_req, res) => {
  res.json(await q(`SELECT c.*, COALESCE(e.enrolled_count, 0) as enrolled_count FROM course_catalog c LEFT JOIN (SELECT course_id, COUNT(*) as enrolled_count FROM course_enrollments WHERE status NOT IN ('cancelled','waitlist') GROUP BY course_id) e ON e.course_id = c.id ORDER BY c.created_at DESC`));
});

router.post("/course-catalog", async (req, res) => {
  const d = req.body;
  const rows = await execParam(
    `INSERT INTO course_catalog (title, category, description, prerequisites, capacity, duration_hours, instructor, location, is_online, cost_per_person, currency, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [d.title||null, d.category||null, d.description||null, d.prerequisites||null, Number(d.capacity||20), Number(d.durationHours||0), d.instructor||null, d.location||null, d.isOnline ? true : false, Number(d.costPerPerson||0), d.currency||'ILS', d.status||'active']
  );
  res.json(rows[0] || {});
});

router.put("/course-catalog/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.title !== undefined) { vals.push(d.title||null); cols.push(`title=$${vals.length}`); }
  if (d.category !== undefined) { vals.push(d.category||null); cols.push(`category=$${vals.length}`); }
  if (d.description !== undefined) { vals.push(d.description||null); cols.push(`description=$${vals.length}`); }
  if (d.prerequisites !== undefined) { vals.push(d.prerequisites||null); cols.push(`prerequisites=$${vals.length}`); }
  if (d.capacity !== undefined) { vals.push(Number(d.capacity||20)); cols.push(`capacity=$${vals.length}`); }
  if (d.durationHours !== undefined) { vals.push(Number(d.durationHours||0)); cols.push(`duration_hours=$${vals.length}`); }
  if (d.instructor !== undefined) { vals.push(d.instructor||null); cols.push(`instructor=$${vals.length}`); }
  if (d.status !== undefined) { vals.push(d.status); cols.push(`status=$${vals.length}`); }
  if (cols.length === 0) { res.json({}); return; }
  cols.push(`updated_at=NOW()`);
  vals.push(id);
  await execParam(`UPDATE course_catalog SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json((await execParam(`SELECT * FROM course_catalog WHERE id=$1`, [id]))[0] || {});
});

router.delete("/course-catalog/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await execParam(`DELETE FROM course_catalog WHERE id=$1`, [id]);
  res.json({ success: true });
});

// ==================== COURSE ENROLLMENTS ====================
router.get("/course-enrollments", async (req, res) => {
  const courseId = req.query.course_id ? parseInt(req.query.course_id as string) : null;
  if (courseId && !isNaN(courseId)) res.json(await execParam(`SELECT * FROM course_enrollments WHERE course_id=$1 ORDER BY enrolled_at DESC`, [courseId]));
  else res.json(await q(`SELECT * FROM course_enrollments ORDER BY enrolled_at DESC`));
});

router.post("/course-enrollments", async (req, res) => {
  const d = req.body;
  const courseId = parseInt(d.courseId); if (isNaN(courseId)) { res.status(400).json({ error: "courseId required" }); return; }
  // Capacity enforcement: check available spots
  const courseRows = await execParam(`SELECT capacity FROM course_catalog WHERE id=$1`, [courseId]) as any[];
  if (courseRows.length > 0 && courseRows[0].capacity > 0) {
    const enrolledRows = await execParam(`SELECT COUNT(*) as cnt FROM course_enrollments WHERE course_id=$1 AND status NOT IN ('cancelled','waitlist')`, [courseId]) as any[];
    const enrolled = parseInt(enrolledRows[0]?.cnt || "0");
    if (enrolled >= Number(courseRows[0].capacity)) {
      // Auto-place on waitlist
      const rows = await execParam(
        `INSERT INTO course_enrollments (course_id, course_title, employee_id, employee_name, department, status)
         VALUES ($1,$2,$3,$4,$5,'waitlist') RETURNING *`,
        [courseId, d.courseTitle||null, d.employeeId ? parseInt(d.employeeId) : null, d.employeeName||null, d.department||null]
      );
      res.status(201).json({ ...rows[0], waitlisted: true });
      return;
    }
  }
  const rows = await execParam(
    `INSERT INTO course_enrollments (course_id, course_title, employee_id, employee_name, department, status)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [courseId, d.courseTitle||null, d.employeeId ? parseInt(d.employeeId) : null, d.employeeName||null, d.department||null, d.status||'enrolled']
  );
  res.json(rows[0] || {});
});

router.put("/course-enrollments/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.status !== undefined) { vals.push(d.status); cols.push(`status=$${vals.length}`); }
  if (d.completionDate !== undefined) { vals.push(d.completionDate||null); cols.push(`completion_date=$${vals.length}`); }
  if (d.certificateUrl !== undefined) { vals.push(d.certificateUrl||null); cols.push(`certificate_url=$${vals.length}`); }
  if (d.score !== undefined) { vals.push(d.score != null ? Number(d.score) : null); cols.push(`score=$${vals.length}`); }
  if (d.feedback !== undefined) { vals.push(d.feedback||null); cols.push(`feedback=$${vals.length}`); }
  if (cols.length === 0) { res.json({}); return; }
  vals.push(id);
  await execParam(`UPDATE course_enrollments SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json((await execParam(`SELECT * FROM course_enrollments WHERE id=$1`, [id]))[0] || {});
});

// ==================== ROLE SKILL REQUIREMENTS ====================
router.get("/role-skill-requirements", async (_req, res) => {
  res.json(await q(`SELECT * FROM role_skill_requirements ORDER BY role_title`));
});

router.post("/role-skill-requirements", async (req, res) => {
  const d = req.body;
  const rows = await execParam(
    `INSERT INTO role_skill_requirements (role_title, department, required_skills_json) VALUES ($1,$2,$3) RETURNING *`,
    [d.roleTitle||null, d.department||null, d.requiredSkillsJson||null]
  );
  res.json(rows[0] || {});
});

router.put("/role-skill-requirements/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.requiredSkillsJson !== undefined) { vals.push(d.requiredSkillsJson||null); cols.push(`required_skills_json=$${vals.length}`); }
  if (d.roleTitle !== undefined) { vals.push(d.roleTitle||null); cols.push(`role_title=$${vals.length}`); }
  if (d.department !== undefined) { vals.push(d.department||null); cols.push(`department=$${vals.length}`); }
  if (cols.length === 0) { res.json({}); return; }
  cols.push(`updated_at=NOW()`);
  vals.push(id);
  await execParam(`UPDATE role_skill_requirements SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json((await execParam(`SELECT * FROM role_skill_requirements WHERE id=$1`, [id]))[0] || {});
});

router.delete("/role-skill-requirements/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await execParam(`DELETE FROM role_skill_requirements WHERE id=$1`, [id]);
  res.json({ success: true });
});

// Skill gap analysis: compare role requirements vs employees' skills
router.get("/skill-gap-analysis", async (_req, res) => {
  const roles = await q(`SELECT * FROM role_skill_requirements`) as any[];
  const employees = await q(`SELECT id, first_name, last_name, position, department, skills FROM employees WHERE employment_status = 'active'`) as any[];
  const result = employees.map((emp: any) => {
    const fullName = `${emp.first_name||''} ${emp.last_name||''}`.trim();
    const empSkills = (emp.skills || "").toLowerCase().split(",").map((s: string) => s.trim()).filter(Boolean);
    const roleReq = roles.find((r: any) => r.role_title?.toLowerCase() === emp.position?.toLowerCase() || r.department?.toLowerCase() === emp.department?.toLowerCase());
    let required: string[] = [];
    if (roleReq?.required_skills_json) { try { required = JSON.parse(roleReq.required_skills_json).map((s: string) => s.toLowerCase()); } catch {} }
    const matched = required.filter(r => empSkills.some((e: string) => e.includes(r) || r.includes(e)));
    const missing = required.filter(r => !empSkills.some((e: string) => e.includes(r) || r.includes(e)));
    return { employee_id: emp.id, employee_name: fullName, department: emp.department, position: emp.position, required_count: required.length, matched_count: matched.length, missing_skills: missing, match_pct: required.length > 0 ? Math.round((matched.length / required.length) * 100) : 100 };
  });
  res.json(result);
});

// ==================== HEADCOUNT PLANS ====================
router.get("/headcount-plans", async (_req, res) => {
  res.json(await q(`SELECT * FROM headcount_plans ORDER BY year DESC, quarter, department`));
});

router.post("/headcount-plans", async (req, res) => {
  const d = req.body;
  const rows = await execParam(
    `INSERT INTO headcount_plans (department, year, quarter, planned, actual, budget, actual_spend, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [d.department||null, Number(d.year||new Date().getFullYear()), Number(d.quarter||0), Number(d.planned||0), Number(d.actual||0), Number(d.budget||0), Number(d.actualSpend||0), d.notes||null]
  );
  res.json(rows[0] || {});
});

router.put("/headcount-plans/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.planned !== undefined) { vals.push(Number(d.planned||0)); cols.push(`planned=$${vals.length}`); }
  if (d.actual !== undefined) { vals.push(Number(d.actual||0)); cols.push(`actual=$${vals.length}`); }
  if (d.budget !== undefined) { vals.push(Number(d.budget||0)); cols.push(`budget=$${vals.length}`); }
  if (d.actualSpend !== undefined) { vals.push(Number(d.actualSpend||0)); cols.push(`actual_spend=$${vals.length}`); }
  if (d.notes !== undefined) { vals.push(d.notes||null); cols.push(`notes=$${vals.length}`); }
  if (cols.length === 0) { res.json({}); return; }
  cols.push(`updated_at=NOW()`);
  vals.push(id);
  await execParam(`UPDATE headcount_plans SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json((await execParam(`SELECT * FROM headcount_plans WHERE id=$1`, [id]))[0] || {});
});

router.delete("/headcount-plans/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await execParam(`DELETE FROM headcount_plans WHERE id=$1`, [id]);
  res.json({ success: true });
});

// ==================== SUCCESSION PLANS ====================
router.get("/succession-plans", async (_req, res) => {
  res.json(await q(`SELECT * FROM succession_plans ORDER BY department, position_title`));
});

router.post("/succession-plans", async (req, res) => {
  const d = req.body;
  const rows = await execParam(
    `INSERT INTO succession_plans (position_id, position_title, department, incumbent_id, incumbent_name, successor_id, successor_name, readiness_level, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [d.positionId ? parseInt(d.positionId) : null, d.positionTitle||null, d.department||null, d.incumbentId ? parseInt(d.incumbentId) : null, d.incumbentName||null, d.successorId ? parseInt(d.successorId) : null, d.successorName||null, d.readinessLevel||'developing', d.notes||null]
  );
  res.json(rows[0] || {});
});

router.put("/succession-plans/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.readinessLevel !== undefined) { vals.push(d.readinessLevel); cols.push(`readiness_level=$${vals.length}`); }
  if (d.successorName !== undefined) { vals.push(d.successorName||null); cols.push(`successor_name=$${vals.length}`); }
  if (d.notes !== undefined) { vals.push(d.notes||null); cols.push(`notes=$${vals.length}`); }
  if (d.positionTitle !== undefined) { vals.push(d.positionTitle||null); cols.push(`position_title=$${vals.length}`); }
  if (d.department !== undefined) { vals.push(d.department||null); cols.push(`department=$${vals.length}`); }
  if (cols.length === 0) { res.json({}); return; }
  cols.push(`updated_at=NOW()`);
  vals.push(id);
  await execParam(`UPDATE succession_plans SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json((await execParam(`SELECT * FROM succession_plans WHERE id=$1`, [id]))[0] || {});
});

router.delete("/succession-plans/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await execParam(`DELETE FROM succession_plans WHERE id=$1`, [id]);
  res.json({ success: true });
});

// ==================== TALENT POOL ====================
router.get("/talent-pool", async (_req, res) => {
  res.json(await q(`SELECT * FROM talent_pool ORDER BY created_at DESC`));
});

router.post("/talent-pool", async (req, res) => {
  const d = req.body;
  const rows = await execParam(
    `INSERT INTO talent_pool (name, email, phone, skills, source, notes, status, last_contact_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [d.name||null, d.email||null, d.phone||null, d.skills||null, d.source||null, d.notes||null, d.status||'active', d.lastContactDate||null]
  );
  res.json(rows[0] || {});
});

router.put("/talent-pool/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const cols: string[] = []; const vals: any[] = [];
  if (d.name !== undefined) { vals.push(d.name||null); cols.push(`name=$${vals.length}`); }
  if (d.email !== undefined) { vals.push(d.email||null); cols.push(`email=$${vals.length}`); }
  if (d.phone !== undefined) { vals.push(d.phone||null); cols.push(`phone=$${vals.length}`); }
  if (d.skills !== undefined) { vals.push(d.skills||null); cols.push(`skills=$${vals.length}`); }
  if (d.source !== undefined) { vals.push(d.source||null); cols.push(`source=$${vals.length}`); }
  if (d.notes !== undefined) { vals.push(d.notes||null); cols.push(`notes=$${vals.length}`); }
  if (d.status !== undefined) { vals.push(d.status); cols.push(`status=$${vals.length}`); }
  if (d.lastContactDate !== undefined) { vals.push(d.lastContactDate||null); cols.push(`last_contact_date=$${vals.length}`); }
  if (cols.length === 0) { res.json({}); return; }
  cols.push(`updated_at=NOW()`);
  vals.push(id);
  await execParam(`UPDATE talent_pool SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json((await execParam(`SELECT * FROM talent_pool WHERE id=$1`, [id]))[0] || {});
});

router.delete("/talent-pool/:id", async (req, res) => {
  const id = parseInt(req.params.id); if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await execParam(`DELETE FROM talent_pool WHERE id=$1`, [id]);
  res.json({ success: true });
});

// ==================== ATTRITION RISK SCORING ====================
router.get("/attrition-risk", async (_req, res) => {
  const employees = await q(`SELECT e.id, e.first_name, e.last_name, e.department, e.position, e.hire_date, e.employment_status,
    COALESCE(lr.leave_days_ytd, 0) as leave_days_ytd,
    COALESCE(pip.pip_count, 0) as pip_count
  FROM employees e
  LEFT JOIN (SELECT employee_name, SUM(total_days) as leave_days_ytd FROM leave_requests WHERE EXTRACT(YEAR FROM created_at)=EXTRACT(YEAR FROM NOW()) GROUP BY employee_name) lr
    ON LOWER(lr.employee_name) = LOWER(e.first_name||' '||e.last_name)
  LEFT JOIN (SELECT employee_name, COUNT(*) as pip_count FROM performance_improvement_plans WHERE status='active' GROUP BY employee_name) pip
    ON LOWER(pip.employee_name) = LOWER(e.first_name||' '||e.last_name)
  WHERE e.employment_status='active'
  ORDER BY e.department, e.last_name`) as any[];
  const result = employees.map((emp: any) => {
    let risk = 0;
    const tenure = emp.hire_date ? Math.floor((Date.now() - new Date(emp.hire_date).getTime()) / (1000 * 60 * 60 * 24 * 365)) : 0;
    if (tenure < 1) risk += 30;
    else if (tenure < 2) risk += 15;
    if (Number(emp.leave_days_ytd) > 15) risk += 25;
    else if (Number(emp.leave_days_ytd) > 10) risk += 10;
    if (Number(emp.pip_count) > 0) risk += 40;
    const level = risk >= 60 ? "high" : risk >= 30 ? "medium" : "low";
    return { employee_id: emp.id, employee_name: `${emp.first_name||''} ${emp.last_name||''}`.trim(), department: emp.department, position: emp.position, tenure_years: tenure, leave_days_ytd: Number(emp.leave_days_ytd), pip_active: Number(emp.pip_count) > 0, risk_score: risk, risk_level: level };
  });
  res.json(result);
});

// Helper: resolve employee record for the authenticated user
async function resolveEmployee(user: any): Promise<{ id: number; fullName: string } | null> {
  if (!user) return null;
  const userId = parseInt(String(user.id || 0));
  if (isNaN(userId) || userId <= 0) return null;
  const rows = await execParam(`SELECT id, first_name, last_name FROM employees WHERE id=$1 LIMIT 1`, [userId]);
  const emp = (rows as any[])[0];
  if (!emp) return null;
  const fullName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
  return { id: userId, fullName };
}

// ==================== SELF-SERVICE ENDPOINTS ====================
router.get("/self-service/my-data", async (req, res) => {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = parseInt(String(user.id || 0));
  if (isNaN(userId) || userId <= 0) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [employees, leaveRequests, payslips] = await Promise.all([
    execParam(`SELECT id, first_name, last_name, position, department, hire_date, email, phone, city as address_city FROM employees WHERE id=$1 LIMIT 1`, [userId]),
    execParam(`SELECT * FROM leave_requests WHERE employee_id_ref=$1 ORDER BY created_at DESC LIMIT 20`, [userId]),
    execParam(`SELECT *, payment_date as pay_date, net_salary as net_pay FROM hr_payslips WHERE employee_id=$1 ORDER BY payment_date DESC LIMIT 12`, [userId]).catch(() => []),
  ]);
  const emp = (employees as any[])[0] || null;
  res.json({ employee: emp, leave_requests: leaveRequests, payslips });
});

// Self-service: update own contact info
router.put("/self-service/my-data", async (req, res) => {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const userId = parseInt(String(user.id || 0));
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  const d = req.body;
  const cols: string[] = []; const vals: any[] = [];
  if (d.phone !== undefined) { vals.push(d.phone||null); cols.push(`phone=$${vals.length}`); }
  if (d.email !== undefined) { vals.push(d.email||null); cols.push(`email=$${vals.length}`); }
  if (d.addressCity !== undefined) { vals.push(d.addressCity||null); cols.push(`city=$${vals.length}`); }
  if (cols.length === 0) { res.json({ message: "No changes" }); return; }
  vals.push(userId);
  await execParam(`UPDATE employees SET ${cols.join(",")} WHERE id=$${vals.length}`, vals);
  res.json({ success: true });
});

// Self-service: get my interview schedule
router.get("/self-service/my-schedule", async (req, res) => {
  const user = (req as any).user;
  const emp = await resolveEmployee(user);
  if (!emp) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [asInterviewer, asCandidate, leaveUpcoming] = await Promise.all([
    execParam(`SELECT * FROM interview_schedules WHERE interviewer_id=$1 AND scheduled_at >= NOW() ORDER BY scheduled_at ASC LIMIT 20`, [emp.id]),
    execParam(`SELECT * FROM interview_schedules WHERE LOWER(candidate_name)=LOWER($1) AND scheduled_at >= NOW() ORDER BY scheduled_at ASC LIMIT 10`, [emp.fullName]),
    execParam(`SELECT * FROM leave_requests WHERE employee_id=$1 AND end_date >= CURRENT_DATE AND status IN ('approved','pending') ORDER BY start_date ASC LIMIT 10`, [emp.id]),
  ]);
  res.json({ as_interviewer: asInterviewer, as_candidate: asCandidate, upcoming_leaves: leaveUpcoming });
});

// Self-service: scoped OKR goals for the authenticated employee only
router.get("/self-service/my-goals", async (req, res) => {
  const user = (req as any).user;
  const emp = await resolveEmployee(user);
  if (!emp) { res.status(401).json({ error: "Unauthorized" }); return; }
  const objectives = await execParam(
    `SELECT o.*, COALESCE(JSON_AGG(kr ORDER BY kr.id) FILTER (WHERE kr.id IS NOT NULL), '[]') as key_results
     FROM okr_objectives o
     LEFT JOIN okr_key_results kr ON kr.objective_id = o.id
     WHERE o.owner_type='individual' AND o.owner_id=$1
     GROUP BY o.id ORDER BY o.created_at DESC`,
    [emp.id]
  );
  res.json(objectives);
});

// Self-service: scoped training enrollments for the authenticated employee only
router.get("/self-service/my-training", async (req, res) => {
  const user = (req as any).user;
  const emp = await resolveEmployee(user);
  if (!emp) { res.status(401).json({ error: "Unauthorized" }); return; }
  const enrollments = await execParam(
    `SELECT * FROM course_enrollments WHERE employee_id=$1 ORDER BY enrolled_at DESC LIMIT 30`,
    [emp.id]
  );
  res.json(enrollments);
});

// Certification expiry alerts — training records where is_certification=true and expiry within 90 days
router.get("/certification-expiry-alerts", async (_req, res) => {
  try {
    const rows = await q(`
      SELECT training_name as certification_name, department,
             COALESCE(employee_name, target_audience, 'לא צוין') as employee_name,
             certification_expiry as expiry_date, trainer_name,
             certification_name as cert_label, notes,
             CASE
               WHEN certification_expiry < CURRENT_DATE THEN 'פג תוקף - יש לחדש מיידית'
               WHEN certification_expiry <= CURRENT_DATE + INTERVAL '30 days' THEN 'פג תוקף בקרוב - יזמנו חידוש'
               ELSE 'עדכן ברישום לפני התפוגה'
             END as renewal_recommendation
      FROM training_records
      WHERE is_certification = TRUE
        AND certification_expiry IS NOT NULL
        AND certification_expiry <= CURRENT_DATE + INTERVAL '90 days'
      ORDER BY certification_expiry ASC
      LIMIT 100`);
    res.json(rows);
  } catch {
    res.json([]);
  }
});

// Self-service: upcoming shift assignments for the authenticated employee
router.get("/self-service/my-shifts", async (req, res) => {
  const user = (req as any).user;
  const emp = await resolveEmployee(user);
  if (!emp) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const shifts = await execParam(
      `SELECT * FROM shift_assignments
       WHERE employee_id=$1
         AND start_time >= NOW() - INTERVAL '1 day'
       ORDER BY start_time ASC LIMIT 30`,
      [emp.id]
    );
    res.json(shifts);
  } catch {
    res.json([]);
  }
});

export default router;
