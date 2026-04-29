import { Router, type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";
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

// ─── helpers ────────────────────────────────────────────────────────
async function q(sql: string, params: any[] = []) {
  try {
    const r = await pool.query(sql, params);
    return r.rows;
  } catch (e: any) {
    console.error("[AI-Agents]", e.message);
    return [];
  }
}

async function q1(sql: string, params: any[] = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

// ─── auto-create tables + seed ──────────────────────────────────────
async function ensureTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agents_registry (
        id SERIAL PRIMARY KEY,
        agent_key VARCHAR(80) UNIQUE NOT NULL,
        agent_name VARCHAR(200) NOT NULL,
        agent_name_he VARCHAR(200),
        role VARCHAR(120),
        description TEXT,
        description_he TEXT,
        avatar_emoji VARCHAR(10),
        color VARCHAR(40),
        capabilities JSONB DEFAULT '[]'::jsonb,
        modules_access JSONB DEFAULT '[]'::jsonb,
        autonomy_level VARCHAR(30) DEFAULT 'advisory' CHECK (autonomy_level IN ('advisory','draft','auto_low','auto_high')),
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','paused','training','retired')),
        total_actions INT DEFAULT 0,
        total_resolved INT DEFAULT 0,
        avg_response_time_ms INT DEFAULT 0,
        satisfaction_score REAL DEFAULT 0,
        last_active TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_agent_tasks (
        id SERIAL PRIMARY KEY,
        agent_id INT REFERENCES ai_agents_registry(id) ON DELETE CASCADE,
        task_type VARCHAR(40) CHECK (task_type IN ('alert','reminder','automation','fix','analysis','report','communication','monitoring','qa_test','security_scan','performance_test','load_test','regression','smoke_test','sanity_check','audit')),
        title VARCHAR(400),
        title_he VARCHAR(400),
        description TEXT,
        priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
        source_module VARCHAR(80),
        source_entity_type VARCHAR(80),
        source_entity_id VARCHAR(80),
        input_data JSONB DEFAULT '{}'::jsonb,
        output_data JSONB DEFAULT '{}'::jsonb,
        actions_taken JSONB DEFAULT '[]'::jsonb,
        status VARCHAR(30) DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','needs_approval','cancelled')),
        assigned_at TIMESTAMPTZ DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        duration_ms INT,
        error_message TEXT,
        approved_by VARCHAR(120),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_agent_schedules (
        id SERIAL PRIMARY KEY,
        agent_id INT REFERENCES ai_agents_registry(id) ON DELETE CASCADE,
        schedule_name VARCHAR(200),
        schedule_type VARCHAR(30) CHECK (schedule_type IN ('cron','interval','event_trigger')),
        cron_expression VARCHAR(80),
        interval_minutes INT,
        trigger_event VARCHAR(200),
        enabled BOOLEAN DEFAULT true,
        last_run TIMESTAMPTZ,
        next_run TIMESTAMPTZ,
        run_count INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_agent_conversations (
        id SERIAL PRIMARY KEY,
        agent_id INT REFERENCES ai_agents_registry(id) ON DELETE CASCADE,
        user_id VARCHAR(120),
        user_name VARCHAR(200),
        messages JSONB DEFAULT '[]'::jsonb,
        context JSONB DEFAULT '{}'::jsonb,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','closed')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // ─── seed 12 agents ───────────────────────────────────────────
    const agents = [
      {
        agent_key: "sales_copilot",
        agent_name: "Sales Copilot AI",
        agent_name_he: "סוכן מכירות AI",
        role: "Sales Copilot",
        description: "Drives revenue by scoring leads, drafting quotes, scheduling follow-ups, and recommending next-best actions for the sales team.",
        description_he: "מניע הכנסות באמצעות דירוג לידים, טיוטות הצעות מחיר, תזכורות מעקב והמלצות על הפעולה הבאה הטובה ביותר.",
        avatar_emoji: "💼",
        color: "#3b82f6",
        capabilities: ["lead_scoring","next_best_action","follow_up_reminders","quote_drafting","conversion_analysis","customer_communication"],
        modules_access: ["crm","sales","quotations"],
        autonomy_level: "draft"
      },
      {
        agent_key: "production_planner",
        agent_name: "Production Planner AI",
        agent_name_he: "מתכנן ייצור AI",
        role: "Production Planner",
        description: "Optimizes production schedules, detects bottlenecks, verifies material readiness, and predicts delays before they happen.",
        description_he: "מתכנן לוחות ייצור, מזהה צווארי בקבוק, מוודא מוכנות חומרי גלם וחוזה עיכובים מראש.",
        avatar_emoji: "🏭",
        color: "#f59e0b",
        capabilities: ["schedule_optimization","bottleneck_detection","material_readiness_check","capacity_planning","delay_prediction","work_order_creation"],
        modules_access: ["production","inventory","work_orders"],
        autonomy_level: "auto_low"
      },
      {
        agent_key: "procurement_agent",
        agent_name: "Procurement Agent AI",
        agent_name_he: "סוכן רכש AI",
        role: "Procurement Agent",
        description: "Compares supplier prices, alerts on reorder points, evaluates suppliers, and drafts purchase orders to minimize costs.",
        description_he: "משווה מחירי ספקים, מתריע על נקודות הזמנה מחדש, מעריך ספקים ומכין טיוטות הזמנות רכש.",
        avatar_emoji: "📦",
        color: "#10b981",
        capabilities: ["price_comparison","reorder_alerts","supplier_evaluation","purchase_order_drafting","cost_optimization","shortage_prediction"],
        modules_access: ["procurement","inventory","suppliers"],
        autonomy_level: "draft"
      },
      {
        agent_key: "finance_controller",
        agent_name: "Finance Controller AI",
        agent_name_he: "בקר פיננסי AI",
        role: "Finance Controller",
        description: "Forecasts cash flow, monitors margins, detects expense anomalies, prioritizes collections, and tracks budget variances.",
        description_he: "חוזה תזרים מזומנים, מנטר רווחיות, מזהה חריגות הוצאות, מתעדף גבייה ועוקב אחר סטיות תקציב.",
        avatar_emoji: "💰",
        color: "#8b5cf6",
        capabilities: ["cashflow_forecast","margin_monitoring","expense_anomaly_detection","collection_prioritization","budget_variance_alerts","tax_calculation"],
        modules_access: ["finance","invoicing","budgets"],
        autonomy_level: "advisory"
      },
      {
        agent_key: "quality_inspector",
        agent_name: "Quality Inspector AI",
        agent_name_he: "מפקח איכות AI",
        role: "Quality Inspector",
        description: "Detects defect patterns, analyzes scrap rates, tracks supplier quality, and creates NCRs with corrective action recommendations.",
        description_he: "מזהה דפוסי פגמים, מנתח שיעורי פסולת, עוקב אחר איכות ספקים ויוצר NCR עם המלצות לפעולות מתקנות.",
        avatar_emoji: "🔍",
        color: "#ef4444",
        capabilities: ["defect_pattern_detection","scrap_analysis","supplier_quality_tracking","measurement_verification","ncr_creation","capa_recommendations"],
        modules_access: ["quality","production","suppliers"],
        autonomy_level: "draft"
      },
      {
        agent_key: "hr_manager",
        agent_name: "HR Manager AI",
        agent_name_he: "מנהל משאבי אנוש AI",
        role: "HR Manager",
        description: "Monitors attendance, alerts on overtime, manages leave requests, analyzes performance, and calculates payroll.",
        description_he: "מנטר נוכחות, מתריע על שעות נוספות, מנהל חופשות, מנתח ביצועים ומחשב שכר.",
        avatar_emoji: "👥",
        color: "#ec4899",
        capabilities: ["attendance_monitoring","overtime_alerts","leave_management","employee_performance_analysis","training_reminders","payroll_calculation"],
        modules_access: ["hr","attendance","payroll"],
        autonomy_level: "auto_low"
      },
      {
        agent_key: "customer_service",
        agent_name: "Customer Service AI",
        agent_name_he: "שירות לקוחות AI",
        role: "Customer Service",
        description: "Triages support tickets, sends status updates, checks warranty, resolves complaints, and handles WhatsApp responses.",
        description_he: "ממיין פניות תמיכה, שולח עדכוני סטטוס, בודק אחריות, מטפל בתלונות ועונה בוואטסאפ.",
        avatar_emoji: "🎧",
        color: "#06b6d4",
        capabilities: ["ticket_triage","status_updates","warranty_check","complaint_resolution","satisfaction_survey","whatsapp_response"],
        modules_access: ["support","crm","whatsapp"],
        autonomy_level: "auto_high"
      },
      {
        agent_key: "installation_coordinator",
        agent_name: "Installation Coordinator AI",
        agent_name_he: "מתאם התקנות AI",
        role: "Installation Coordinator",
        description: "Optimizes installation schedules, assigns crews, plans routes, confirms with customers, and verifies completion.",
        description_he: "מתכנן לוחות התקנות, מקצה צוותים, מתכנן מסלולים, מאשר עם לקוחות ומוודא השלמה.",
        avatar_emoji: "🔧",
        color: "#f97316",
        capabilities: ["schedule_optimization","crew_assignment","route_planning","customer_confirmation","completion_verification","feedback_collection"],
        modules_access: ["installations","crm","calendar"],
        autonomy_level: "auto_low"
      },
      {
        agent_key: "safety_officer",
        agent_name: "Safety Officer AI",
        agent_name_he: "קצין בטיחות AI",
        role: "Safety Officer",
        description: "Monitors safety incidents, schedules inspections, tracks training compliance, detects hazards, and analyzes near-misses.",
        description_he: "מנטר אירועי בטיחות, מתזמן בדיקות, עוקב אחר הדרכות, מזהה סיכונים ומנתח אירועי כמעט-תאונה.",
        avatar_emoji: "🛡️",
        color: "#eab308",
        capabilities: ["incident_monitoring","inspection_scheduling","training_compliance","hazard_detection","ppe_verification","near_miss_analysis"],
        modules_access: ["safety","hr","production"],
        autonomy_level: "advisory"
      },
      {
        agent_key: "devops_engineer",
        agent_name: "DevOps Engineer AI",
        agent_name_he: "מהנדס DevOps AI",
        role: "DevOps Engineer",
        description: "Monitors servers, detects bugs, optimizes performance, checks database health, tests APIs, analyzes error logs, and auto-fixes common issues.",
        description_he: "מנטר שרתים, מזהה באגים, מייעל ביצועים, בודק בריאות מסד נתונים, בודק API, מנתח לוגים ומתקן בעיות נפוצות.",
        avatar_emoji: "⚙️",
        color: "#6366f1",
        capabilities: ["server_monitoring","bug_detection","performance_optimization","database_health","api_testing","error_log_analysis","auto_fix_common_issues"],
        modules_access: ["system","monitoring","logs"],
        autonomy_level: "auto_high"
      },
      {
        agent_key: "data_steward",
        agent_name: "Data Steward AI",
        agent_name_he: "אחראי נתונים AI",
        role: "Data Steward",
        description: "Detects duplicate records, scores data quality, alerts on missing fields, runs consistency checks, and monitors backups.",
        description_he: "מזהה רשומות כפולות, מדרג איכות נתונים, מתריע על שדות חסרים, מבצע בדיקות עקביות ומנטר גיבויים.",
        avatar_emoji: "🗄️",
        color: "#14b8a6",
        capabilities: ["duplicate_detection","data_quality_scoring","missing_field_alerts","consistency_checks","data_migration","backup_monitoring"],
        modules_access: ["system","all_modules","database"],
        autonomy_level: "auto_low"
      },
      {
        agent_key: "ceo_advisor",
        agent_name: "CEO Advisor AI",
        agent_name_he: 'יועץ מנכ"ל AI',
        role: "CEO Advisor",
        description: "Provides daily briefings, risk summaries, opportunity detection, competitor monitoring, strategic recommendations, and KPI alerts.",
        description_he: "מספק תדריכים יומיים, סיכומי סיכונים, זיהוי הזדמנויות, ניטור מתחרים, המלצות אסטרטגיות והתראות KPI.",
        avatar_emoji: "👔",
        color: "#0ea5e9",
        capabilities: ["daily_briefing","risk_summary","opportunity_detection","competitor_monitoring","strategic_recommendations","kpi_alerts"],
        modules_access: ["executive","all_modules","strategy"],
        autonomy_level: "advisory"
      },
      // ─── 20 QA Testing Agents ─────────────────────────────────────
      {
        agent_key: "qa_terminal_runtime",
        agent_name: "Terminal Runtime QA Agent",
        agent_name_he: "סוכן QA - הרצת טרמינל",
        role: "Terminal Runtime Tester",
        description: "Runs build commands, dev server, production builds, verifies exit codes, checks output for errors, validates all scripts in package.json.",
        description_he: "מריץ פקודות בנייה, שרת פיתוח, בנייה לייצור, מאמת קודי יציאה, בודק פלט לשגיאות, מאמת כל הסקריפטים ב-package.json.",
        avatar_emoji: "🖥️",
        color: "#374151",
        capabilities: ["build_verification","dev_server_test","production_build","exit_code_check","script_validation","dependency_audit"],
        modules_access: ["system","build","terminal"],
        autonomy_level: "auto_high"
      },
      {
        agent_key: "qa_unit_test",
        agent_name: "Unit Test QA Agent",
        agent_name_he: "סוכן QA - בדיקות יחידה",
        role: "Unit Test Runner",
        description: "Runs all unit tests, checks coverage thresholds, identifies untested code paths, validates pure functions and utilities.",
        description_he: "מריץ כל בדיקות יחידה, בודק סף כיסוי, מזהה נתיבי קוד שלא נבדקו, מאמת פונקציות טהורות ושירותים.",
        avatar_emoji: "🧪",
        color: "#7c3aed",
        capabilities: ["unit_test_execution","coverage_analysis","untested_code_detection","function_validation","mock_verification","assertion_audit"],
        modules_access: ["system","testing","all_modules"],
        autonomy_level: "auto_high"
      },
      {
        agent_key: "qa_integration_test",
        agent_name: "Integration Test QA Agent",
        agent_name_he: "סוכן QA - בדיקות אינטגרציה",
        role: "Integration Tester",
        description: "Tests API endpoints end-to-end, verifies database operations, checks inter-module communication, validates data flow across services.",
        description_he: "בודק נקודות API מקצה לקצה, מאמת פעולות מסד נתונים, בודק תקשורת בין מודולים, מאמת זרימת נתונים.",
        avatar_emoji: "🔗",
        color: "#2563eb",
        capabilities: ["api_integration_test","database_operation_test","module_communication_test","data_flow_validation","service_dependency_check","contract_testing"],
        modules_access: ["system","api","database","all_modules"],
        autonomy_level: "auto_high"
      },
      {
        agent_key: "qa_system_test",
        agent_name: "System Test QA Agent",
        agent_name_he: "סוכן QA - בדיקות מערכת",
        role: "System Tester",
        description: "Tests complete business workflows end-to-end: lead→quote→order→production→delivery→invoice. Validates all 609 pages load correctly.",
        description_he: "בודק תהליכים עסקיים מלאים מקצה לקצה: ליד→הצעה→הזמנה→ייצור→משלוח→חשבונית. מאמת ש-609 דפים נטענים.",
        avatar_emoji: "🏗️",
        color: "#059669",
        capabilities: ["workflow_e2e_test","page_load_verification","business_process_test","cross_module_workflow","state_machine_validation","complete_cycle_test"],
        modules_access: ["all_modules"],
        autonomy_level: "auto_high"
      },
      {
        agent_key: "qa_regression",
        agent_name: "Regression Test QA Agent",
        agent_name_he: "סוכן QA - בדיקות רגרסיה",
        role: "Regression Tester",
        description: "Detects broken functionality after code changes. Compares before/after behavior, monitors critical paths, tracks feature stability over time.",
        description_he: "מזהה פונקציונליות שנשברה אחרי שינויי קוד. משווה התנהגות לפני/אחרי, מנטר נתיבים קריטיים, עוקב אחר יציבות.",
        avatar_emoji: "🔄",
        color: "#dc2626",
        capabilities: ["change_impact_analysis","critical_path_monitoring","feature_stability_tracking","snapshot_comparison","behavior_diff","regression_detection"],
        modules_access: ["all_modules","git","testing"],
        autonomy_level: "auto_high"
      },
      {
        agent_key: "qa_smoke_test",
        agent_name: "Smoke Test QA Agent",
        agent_name_he: "סוכן QA - בדיקות עשן",
        role: "Smoke Tester",
        description: "Quick verification that all critical functions work: login, navigation, CRUD operations on core entities, dashboard loading.",
        description_he: "בדיקה מהירה שכל הפונקציות הקריטיות עובדות: התחברות, ניווט, פעולות CRUD על ישויות ליבה, טעינת דשבורד.",
        avatar_emoji: "💨",
        color: "#9333ea",
        capabilities: ["login_verification","navigation_test","crud_smoke_test","dashboard_load_test","critical_function_check","quick_health_check"],
        modules_access: ["all_modules"],
        autonomy_level: "auto_high"
      },
      {
        agent_key: "qa_sanity_check",
        agent_name: "Sanity Check QA Agent",
        agent_name_he: "סוכן QA - בדיקות שפיות",
        role: "Sanity Checker",
        description: "Validates that recent changes work as expected without deep testing. Focuses on changed areas only, verifies no obvious breakage.",
        description_he: "מאמת שהשינויים האחרונים עובדים כצפוי. מתמקד רק באזורים שהשתנו, מוודא שאין שבירה ברורה.",
        avatar_emoji: "🧠",
        color: "#0891b2",
        capabilities: ["change_validation","focused_area_test","obvious_breakage_check","config_sanity","deployment_readiness","quick_validation"],
        modules_access: ["all_modules","git"],
        autonomy_level: "auto_high"
      },
      {
        agent_key: "qa_api_test",
        agent_name: "API Test QA Agent",
        agent_name_he: "סוכן QA - בדיקות API",
        role: "API Tester",
        description: "Tests all 330+ API routes: status codes, response schemas, error handling, authentication, rate limiting, CORS, pagination, filtering.",
        description_he: "בודק 330+ נתיבי API: קודי סטטוס, סכימות תגובה, טיפול בשגיאות, אימות, הגבלת קצב, CORS, עימוד, סינון.",
        avatar_emoji: "🌐",
        color: "#ea580c",
        capabilities: ["route_testing","status_code_validation","schema_validation","auth_testing","error_handling_test","pagination_test","cors_check","rate_limit_test"],
        modules_access: ["api","system","all_modules"],
        autonomy_level: "auto_high"
      },
      {
        agent_key: "qa_database",
        agent_name: "Database QA Agent",
        agent_name_he: "סוכן QA - בדיקות מסד נתונים",
        role: "Database Tester",
        description: "Validates schema integrity, checks constraints, tests migrations, verifies indexes, monitors query performance, checks data consistency.",
        description_he: "מאמת תקינות סכימה, בודק אילוצים, בודק מיגרציות, מוודא אינדקסים, מנטר ביצועי שאילתות, בודק עקביות נתונים.",
        avatar_emoji: "🗃️",
        color: "#4338ca",
        capabilities: ["schema_validation","constraint_check","migration_test","index_verification","query_performance","data_consistency","foreign_key_check","null_check"],
        modules_access: ["database","system"],
        autonomy_level: "auto_low"
      },
      {
        agent_key: "qa_ui_test",
        agent_name: "UI Test QA Agent",
        agent_name_he: "סוכן QA - בדיקות ממשק",
        role: "UI Tester",
        description: "Tests all UI components: forms, tables, modals, navigation, RTL layout, responsive design, dark mode, animations, accessibility.",
        description_he: "בודק כל רכיבי ממשק: טפסים, טבלאות, מודלים, ניווט, פריסת RTL, עיצוב רספונסיבי, מצב כהה, אנימציות, נגישות.",
        avatar_emoji: "🎨",
        color: "#e11d48",
        capabilities: ["form_validation_test","table_rendering_test","modal_test","rtl_layout_check","responsive_test","dark_mode_test","animation_test","accessibility_audit"],
        modules_access: ["ui","all_modules"],
        autonomy_level: "auto_high"
      },
      {
        agent_key: "qa_ux_test",
        agent_name: "UX Test QA Agent",
        agent_name_he: "סוכן QA - בדיקות חוויית משתמש",
        role: "UX Tester",
        description: "Evaluates user workflows, measures click-to-complete times, checks information architecture, validates Hebrew translations, tests search UX.",
        description_he: "מעריך תהליכי משתמש, מודד זמני השלמה, בודק ארכיטקטורת מידע, מאמת תרגומים לעברית, בודק UX חיפוש.",
        avatar_emoji: "👁️",
        color: "#be185d",
        capabilities: ["workflow_usability_test","completion_time_measurement","information_architecture_check","hebrew_translation_audit","search_ux_test","navigation_flow_test"],
        modules_access: ["ui","all_modules"],
        autonomy_level: "advisory"
      },
      {
        agent_key: "qa_permissions",
        agent_name: "Permission Test QA Agent",
        agent_name_he: "סוכן QA - בדיקות הרשאות",
        role: "Permission Tester",
        description: "Tests RBAC enforcement: role-based access, row-level security, API authorization, route guards, data isolation between tenants.",
        description_he: "בודק אכיפת RBAC: גישה לפי תפקיד, אבטחה ברמת שורה, הרשאות API, שומרי נתיבים, בידוד נתונים בין שוכרים.",
        avatar_emoji: "🔐",
        color: "#b91c1c",
        capabilities: ["rbac_test","row_level_security_test","api_authorization_test","route_guard_test","tenant_isolation_test","privilege_escalation_test"],
        modules_access: ["security","permissions","all_modules"],
        autonomy_level: "draft"
      },
      {
        agent_key: "qa_security",
        agent_name: "Security Test QA Agent",
        agent_name_he: "סוכן QA - בדיקות אבטחה",
        role: "Security Tester",
        description: "Scans for XSS, SQL injection, CSRF, authentication bypass, sensitive data exposure, insecure dependencies, OWASP Top 10 compliance.",
        description_he: "סורק XSS, הזרקת SQL, CSRF, עקיפת אימות, חשיפת מידע רגיש, תלויות לא מאובטחות, תאימות OWASP Top 10.",
        avatar_emoji: "🛡️",
        color: "#991b1b",
        capabilities: ["xss_scan","sql_injection_test","csrf_check","auth_bypass_test","sensitive_data_scan","dependency_vulnerability_scan","owasp_compliance","header_security_check"],
        modules_access: ["security","api","system","all_modules"],
        autonomy_level: "advisory"
      },
      {
        agent_key: "qa_performance",
        agent_name: "Performance Test QA Agent",
        agent_name_he: "סוכן QA - בדיקות ביצועים",
        role: "Performance Tester",
        description: "Measures response times, memory usage, bundle sizes, render performance, database query speed, API throughput, lighthouse scores.",
        description_he: "מודד זמני תגובה, שימוש בזיכרון, גודל חבילות, ביצועי רנדור, מהירות שאילתות, תפוקת API, ציוני Lighthouse.",
        avatar_emoji: "⚡",
        color: "#d97706",
        capabilities: ["response_time_measurement","memory_profiling","bundle_size_analysis","render_performance","query_speed_test","api_throughput","lighthouse_audit"],
        modules_access: ["system","api","ui","all_modules"],
        autonomy_level: "auto_high"
      },
      {
        agent_key: "qa_load_test",
        agent_name: "Load Test QA Agent",
        agent_name_he: "סוכן QA - בדיקות עומס",
        role: "Load Tester",
        description: "Simulates concurrent users, tests system under heavy load, identifies breaking points, measures degradation curves, tests connection pool limits.",
        description_he: "מדמה משתמשים במקביל, בודק מערכת תחת עומס כבד, מזהה נקודות שבירה, מודד עקומות דגרדציה.",
        avatar_emoji: "📊",
        color: "#c2410c",
        capabilities: ["concurrent_user_simulation","heavy_load_test","breaking_point_identification","degradation_measurement","connection_pool_test","memory_leak_detection"],
        modules_access: ["system","api","database"],
        autonomy_level: "auto_low"
      },
      {
        agent_key: "qa_stress_test",
        agent_name: "Stress Test QA Agent",
        agent_name_he: "סוכן QA - בדיקות לחץ",
        role: "Stress Tester",
        description: "Pushes system beyond normal limits, tests recovery after failure, validates graceful degradation, checks error handling under extreme conditions.",
        description_he: "דוחף מערכת מעבר לגבולות, בודק התאוששות אחרי כשל, מאמת דגרדציה מבוקרת, בודק טיפול בשגיאות בתנאים קיצוניים.",
        avatar_emoji: "💪",
        color: "#92400e",
        capabilities: ["extreme_load_test","failure_recovery_test","graceful_degradation_check","error_handling_under_stress","resource_exhaustion_test","chaos_engineering"],
        modules_access: ["system","api","database"],
        autonomy_level: "advisory"
      },
      {
        agent_key: "qa_compatibility",
        agent_name: "Compatibility Test QA Agent",
        agent_name_he: "סוכן QA - בדיקות תאימות",
        role: "Compatibility Tester",
        description: "Tests across browsers (Chrome, Firefox, Safari, Edge), devices (mobile, tablet, desktop), OS versions, screen sizes, and RTL rendering.",
        description_he: "בודק בין דפדפנים (Chrome, Firefox, Safari, Edge), מכשירים (נייד, טאבלט, שולחני), גרסאות OS, גודלי מסך, RTL.",
        avatar_emoji: "📱",
        color: "#0d9488",
        capabilities: ["cross_browser_test","mobile_compatibility","tablet_test","screen_size_test","os_version_test","rtl_rendering_check","touch_interaction_test"],
        modules_access: ["ui","system"],
        autonomy_level: "auto_high"
      },
      {
        agent_key: "qa_uat",
        agent_name: "UAT QA Agent",
        agent_name_he: "סוכן QA - בדיקות קבלה",
        role: "UAT Tester",
        description: "Simulates real user scenarios: factory manager creating work orders, accountant generating invoices, installer logging completions.",
        description_he: "מדמה תרחישי משתמש אמיתיים: מנהל מפעל יוצר הזמנות עבודה, חשב מייצר חשבוניות, מתקין מדווח השלמות.",
        avatar_emoji: "👤",
        color: "#4f46e5",
        capabilities: ["user_scenario_simulation","business_acceptance_test","role_based_workflow_test","real_world_scenario","data_entry_test","report_generation_test"],
        modules_access: ["all_modules"],
        autonomy_level: "advisory"
      },
      {
        agent_key: "qa_release_readiness",
        agent_name: "Release Readiness QA Agent",
        agent_name_he: "סוכן QA - מוכנות שחרור",
        role: "Release Manager",
        description: "Validates release criteria: all tests pass, no critical bugs, documentation complete, rollback plan ready, monitoring configured.",
        description_he: "מאמת קריטריוני שחרור: כל הבדיקות עוברות, אין באגים קריטיים, תיעוד מלא, תוכנית חזרה מוכנה, ניטור מוגדר.",
        avatar_emoji: "🚀",
        color: "#7c2d12",
        capabilities: ["release_criteria_check","critical_bug_scan","documentation_completeness","rollback_plan_validation","monitoring_check","changelog_generation"],
        modules_access: ["all_modules","system","testing"],
        autonomy_level: "draft"
      },
      {
        agent_key: "qa_monitoring",
        agent_name: "Monitoring QA Agent",
        agent_name_he: "סוכן QA - ניטור ובקרה",
        role: "Production Monitor",
        description: "Continuous production monitoring: error rates, response times, database health, memory usage, disk space, SSL certificates, uptime.",
        description_he: "ניטור רציף בייצור: שיעורי שגיאות, זמני תגובה, בריאות מסד נתונים, שימוש בזיכרון, מקום דיסק, תעודות SSL, זמינות.",
        avatar_emoji: "📡",
        color: "#065f46",
        capabilities: ["error_rate_monitoring","response_time_tracking","database_health_check","memory_monitoring","disk_space_check","ssl_certificate_check","uptime_monitoring","alert_management"],
        modules_access: ["system","monitoring","database"],
        autonomy_level: "auto_high"
      },
    ];

    for (const a of agents) {
      await client.query(`
        INSERT INTO ai_agents_registry (agent_key, agent_name, agent_name_he, role, description, description_he, avatar_emoji, color, capabilities, modules_access, autonomy_level, status, total_actions, total_resolved, avg_response_time_ms, satisfaction_score, last_active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active', floor(random()*500+50)::int, floor(random()*400+30)::int, floor(random()*3000+200)::int, round((random()*2+3)::numeric,1), NOW() - (random()*interval '48 hours'))
        ON CONFLICT (agent_key) DO NOTHING
      `, [a.agent_key, a.agent_name, a.agent_name_he, a.role, a.description, a.description_he, a.avatar_emoji, a.color, JSON.stringify(a.capabilities), JSON.stringify(a.modules_access), a.autonomy_level]);
    }

    // seed some demo schedules
    const agentRows = await client.query(`SELECT id, agent_key FROM ai_agents_registry`);
    const agentMap: Record<string, number> = {};
    for (const r of agentRows.rows) agentMap[r.agent_key] = r.id;

    const schedules = [
      { key: "sales_copilot", name: "בדיקת לידים חמים", type: "cron", cron: "0 8 * * 1-5", interval: null, trigger: null },
      { key: "production_planner", name: "אופטימיזציית לוח ייצור", type: "cron", cron: "30 6 * * *", interval: null, trigger: null },
      { key: "finance_controller", name: "ניטור תזרים מזומנים", type: "interval", cron: null, interval: 60, trigger: null },
      { key: "quality_inspector", name: "סריקת חריגות איכות", type: "cron", cron: "0 7 * * *", interval: null, trigger: null },
      { key: "hr_manager", name: "דוח נוכחות יומי", type: "cron", cron: "0 9 * * 1-5", interval: null, trigger: null },
      { key: "devops_engineer", name: "בדיקת בריאות מערכת", type: "interval", cron: null, interval: 15, trigger: null },
      { key: "data_steward", name: "סריקת כפילויות", type: "cron", cron: "0 2 * * 0", interval: null, trigger: null },
      { key: "ceo_advisor", name: "תדריך בוקר", type: "cron", cron: "0 7 * * 1-5", interval: null, trigger: null },
      { key: "customer_service", name: "טיפול בפניות חדשות", type: "event_trigger", cron: null, interval: null, trigger: "ticket_created" },
      { key: "safety_officer", name: "סריקת אירועי בטיחות", type: "cron", cron: "0 6 * * *", interval: null, trigger: null },
      // QA Agent schedules
      { key: "qa_terminal_runtime", name: "בדיקת בנייה אוטומטית", type: "cron", cron: "0 3 * * *", interval: null, trigger: null },
      { key: "qa_smoke_test", name: "בדיקת עשן מהירה", type: "interval", cron: null, interval: 30, trigger: null },
      { key: "qa_api_test", name: "סריקת API שגרתית", type: "cron", cron: "0 4 * * *", interval: null, trigger: null },
      { key: "qa_database", name: "בדיקת תקינות מסד נתונים", type: "cron", cron: "0 2 * * *", interval: null, trigger: null },
      { key: "qa_security", name: "סריקת אבטחה יומית", type: "cron", cron: "0 1 * * *", interval: null, trigger: null },
      { key: "qa_performance", name: "מדידת ביצועים", type: "interval", cron: null, interval: 60, trigger: null },
      { key: "qa_monitoring", name: "ניטור בריאות מערכת", type: "interval", cron: null, interval: 5, trigger: null },
      { key: "qa_regression", name: "בדיקת רגרסיה אחרי deploy", type: "event_trigger", cron: null, interval: null, trigger: "deployment_completed" },
      { key: "qa_sanity_check", name: "בדיקת שפיות אחרי שינוי", type: "event_trigger", cron: null, interval: null, trigger: "code_change" },
      { key: "qa_release_readiness", name: "בדיקת מוכנות שחרור", type: "event_trigger", cron: null, interval: null, trigger: "release_candidate" },
    ];
    for (const s of schedules) {
      if (!agentMap[s.key]) continue;
      await client.query(`
        INSERT INTO ai_agent_schedules (agent_id, schedule_name, schedule_type, cron_expression, interval_minutes, trigger_event, enabled, run_count, next_run)
        VALUES ($1,$2,$3,$4,$5,$6,true,floor(random()*100)::int, NOW() + interval '1 hour')
        ON CONFLICT DO NOTHING
      `, [agentMap[s.key], s.name, s.type, s.cron, s.interval, s.trigger]);
    }

    console.log("[AI-Agents] Tables created & 32 agents seeded (12 operations + 20 QA)");
  } finally {
    client.release();
  }
}

ensureTables().catch(e => console.error("[AI-Agents] init error:", e.message));

// ─── simulate task execution ────────────────────────────────────────
function simulateExecution(agentKey: string, capabilities: string[], taskType: string, inputData: any): { output_data: any; actions_taken: any[]; duration_ms: number } {
  const now = new Date().toISOString();
  const duration_ms = Math.floor(Math.random() * 4000 + 500);

  const actionTemplates: Record<string, () => any[]> = {
    sales_copilot: () => [
      { action: "analyze_lead_data", target: "leads_table", result: "Scored 12 leads, 3 hot opportunities identified", timestamp: now },
      { action: "draft_follow_up", target: "email_queue", result: "3 follow-up emails drafted for review", timestamp: now },
      { action: "update_pipeline", target: "crm_pipeline", result: "Pipeline value updated: +$45,000", timestamp: now },
    ],
    production_planner: () => [
      { action: "analyze_capacity", target: "production_lines", result: "Line B at 92% capacity - bottleneck risk", timestamp: now },
      { action: "optimize_schedule", target: "work_orders", result: "Reordered 5 work orders for optimal flow", timestamp: now },
      { action: "check_materials", target: "inventory", result: "2 materials below safety stock", timestamp: now },
    ],
    procurement_agent: () => [
      { action: "compare_prices", target: "suppliers", result: "Found 15% savings with alternate supplier", timestamp: now },
      { action: "draft_po", target: "purchase_orders", result: "PO draft created for 3 items", timestamp: now },
      { action: "alert_shortage", target: "inventory", result: "5 items approaching reorder point", timestamp: now },
    ],
    finance_controller: () => [
      { action: "forecast_cashflow", target: "finance_reports", result: "30-day forecast: positive trend, +12%", timestamp: now },
      { action: "detect_anomaly", target: "expenses", result: "1 unusual expense detected: Office supplies +340%", timestamp: now },
      { action: "prioritize_collections", target: "invoices", result: "8 overdue invoices prioritized for follow-up", timestamp: now },
    ],
    quality_inspector: () => [
      { action: "scan_defects", target: "quality_records", result: "Pattern detected: 3% defect rate on Line C", timestamp: now },
      { action: "create_ncr", target: "ncr_log", result: "NCR #247 created for welding defects", timestamp: now },
      { action: "recommend_capa", target: "capa_log", result: "CAPA recommendation: recalibrate welding equipment", timestamp: now },
    ],
    hr_manager: () => [
      { action: "check_attendance", target: "attendance_records", result: "2 employees absent without notice", timestamp: now },
      { action: "overtime_alert", target: "hr_alerts", result: "3 employees exceeding 10h overtime this week", timestamp: now },
      { action: "training_reminder", target: "training_log", result: "5 employees have overdue safety certifications", timestamp: now },
    ],
    customer_service: () => [
      { action: "triage_tickets", target: "support_tickets", result: "12 new tickets triaged, 3 marked critical", timestamp: now },
      { action: "send_update", target: "customer_notifications", result: "Status updates sent to 8 customers", timestamp: now },
      { action: "check_warranty", target: "warranty_records", result: "2 warranty claims verified and approved", timestamp: now },
    ],
    installation_coordinator: () => [
      { action: "optimize_routes", target: "installation_schedule", result: "Routes optimized: saved 45min travel time", timestamp: now },
      { action: "assign_crews", target: "crew_assignments", result: "3 crews assigned to tomorrow's installations", timestamp: now },
      { action: "confirm_customers", target: "customer_confirmations", result: "5 customer confirmations sent via SMS", timestamp: now },
    ],
    safety_officer: () => [
      { action: "scan_incidents", target: "safety_log", result: "0 new incidents, 1 near-miss reported", timestamp: now },
      { action: "check_compliance", target: "training_records", result: "12 employees need PPE refresher course", timestamp: now },
      { action: "schedule_inspection", target: "inspection_calendar", result: "Weekly floor inspection scheduled", timestamp: now },
    ],
    devops_engineer: () => [
      { action: "health_check", target: "servers", result: "All 4 servers healthy, avg CPU 34%", timestamp: now },
      { action: "scan_errors", target: "error_logs", result: "2 recurring errors found in API gateway", timestamp: now },
      { action: "auto_fix", target: "system_config", result: "Cache cleared, stale connections recycled", timestamp: now },
    ],
    data_steward: () => [
      { action: "duplicate_scan", target: "all_tables", result: "Found 7 potential duplicate customer records", timestamp: now },
      { action: "quality_score", target: "data_quality", result: "Overall data quality score: 94.2%", timestamp: now },
      { action: "missing_fields", target: "data_validation", result: "23 records missing required fields", timestamp: now },
    ],
    ceo_advisor: () => [
      { action: "daily_briefing", target: "executive_dashboard", result: "Revenue +8% WoW, 3 risks identified", timestamp: now },
      { action: "risk_analysis", target: "risk_register", result: "Supply chain risk elevated due to delays", timestamp: now },
      { action: "opportunity_scan", target: "market_data", result: "New market opportunity in northern region", timestamp: now },
    ],
    // ─── QA Agents ───────────────────────────────────────────────────
    qa_terminal_runtime: () => [
      { action: "build_check", target: "vite_build", result: "Production build: 3,763 modules, 0 errors, 17.83s", timestamp: now },
      { action: "dev_server_test", target: "dev_server", result: "Dev server starts in 2.1s, hot reload working", timestamp: now },
      { action: "script_validation", target: "package_json", result: "All 8 scripts validated successfully", timestamp: now },
    ],
    qa_unit_test: () => [
      { action: "run_tests", target: "test_suite", result: `${Math.floor(Math.random()*200+800)} tests passed, ${Math.floor(Math.random()*3)} failed`, timestamp: now },
      { action: "coverage_check", target: "coverage_report", result: `Code coverage: ${(Math.random()*15+80).toFixed(1)}% (threshold: 80%)`, timestamp: now },
      { action: "untested_scan", target: "source_files", result: `${Math.floor(Math.random()*10+2)} files with low coverage identified`, timestamp: now },
    ],
    qa_integration_test: () => [
      { action: "api_e2e_test", target: "api_routes", result: `330 routes tested, ${330-Math.floor(Math.random()*5)} passed`, timestamp: now },
      { action: "db_operation_test", target: "database", result: "All CRUD operations verified on 85 tables", timestamp: now },
      { action: "data_flow_check", target: "modules", result: "Cross-module data flow validated for 12 workflows", timestamp: now },
    ],
    qa_system_test: () => [
      { action: "workflow_test", target: "business_processes", result: "Lead→Quote→Order→Production→Delivery flow: PASS", timestamp: now },
      { action: "page_load_test", target: "frontend", result: `609 pages verified, ${609-Math.floor(Math.random()*3)} load correctly`, timestamp: now },
      { action: "state_machine_test", target: "workflow_engine", result: "10 workflow registries validated, all transitions correct", timestamp: now },
    ],
    qa_regression: () => [
      { action: "diff_analysis", target: "git_changes", result: `${Math.floor(Math.random()*20+5)} files changed, impact analysis complete`, timestamp: now },
      { action: "critical_path_test", target: "core_flows", result: "All 15 critical business paths: PASS", timestamp: now },
      { action: "snapshot_compare", target: "ui_snapshots", result: `${Math.floor(Math.random()*5)} visual regressions detected`, timestamp: now },
    ],
    qa_smoke_test: () => [
      { action: "login_test", target: "auth", result: "Login/logout flow: PASS", timestamp: now },
      { action: "nav_test", target: "sidebar", result: "All 65 navigation items accessible", timestamp: now },
      { action: "crud_test", target: "core_entities", result: "Create/Read/Update on 12 core entities: PASS", timestamp: now },
    ],
    qa_sanity_check: () => [
      { action: "change_validation", target: "recent_changes", result: "Recent changes validated, no obvious breakage", timestamp: now },
      { action: "config_check", target: "configuration", result: "All config files valid, no missing env vars", timestamp: now },
      { action: "deployment_ready", target: "build_output", result: "Build artifact valid, ready for deployment", timestamp: now },
    ],
    qa_api_test: () => [
      { action: "route_scan", target: "api_routes", result: `330 endpoints scanned: ${Math.floor(Math.random()*5+325)} return correct status codes`, timestamp: now },
      { action: "schema_validation", target: "responses", result: `JSON schema validation: ${(Math.random()*3+97).toFixed(1)}% compliance`, timestamp: now },
      { action: "auth_check", target: "protected_routes", result: "All protected routes properly guarded with JWT", timestamp: now },
    ],
    qa_database: () => [
      { action: "schema_check", target: "pg_tables", result: "85 tables validated, all constraints intact", timestamp: now },
      { action: "index_audit", target: "pg_indexes", result: `${Math.floor(Math.random()*10+45)} indexes verified, ${Math.floor(Math.random()*3)} missing recommended`, timestamp: now },
      { action: "query_perf", target: "slow_queries", result: `${Math.floor(Math.random()*5)} slow queries identified (>100ms)`, timestamp: now },
    ],
    qa_ui_test: () => [
      { action: "form_test", target: "forms", result: `${Math.floor(Math.random()*50+150)} forms tested, all validations working`, timestamp: now },
      { action: "rtl_check", target: "layout", result: "RTL layout: 100% compliance across all pages", timestamp: now },
      { action: "responsive_test", target: "breakpoints", result: "Mobile/tablet/desktop: all breakpoints rendering correctly", timestamp: now },
    ],
    qa_ux_test: () => [
      { action: "workflow_usability", target: "user_flows", result: "Average task completion: 3.2 clicks (target: <5)", timestamp: now },
      { action: "hebrew_audit", target: "translations", result: `Hebrew coverage: ${(Math.random()*5+94).toFixed(1)}%, ${Math.floor(Math.random()*20+5)} untranslated strings`, timestamp: now },
      { action: "search_ux", target: "search_features", result: "Global search returns results in <200ms", timestamp: now },
    ],
    qa_permissions: () => [
      { action: "rbac_test", target: "roles", result: "8 roles tested: admin, manager, worker, viewer, accountant, installer, qa, guest", timestamp: now },
      { action: "api_auth_test", target: "endpoints", result: "All 330 endpoints enforce proper authorization", timestamp: now },
      { action: "escalation_test", target: "privilege", result: "No privilege escalation vulnerabilities found", timestamp: now },
    ],
    qa_security: () => [
      { action: "xss_scan", target: "inputs", result: `${Math.floor(Math.random()*200+100)} input fields scanned, 0 XSS vulnerabilities`, timestamp: now },
      { action: "sql_injection", target: "queries", result: "All queries parameterized, 0 injection risks", timestamp: now },
      { action: "dependency_scan", target: "node_modules", result: `${Math.floor(Math.random()*5)} vulnerabilities found (${Math.floor(Math.random()*3)} low, ${Math.floor(Math.random()*2)} moderate)`, timestamp: now },
    ],
    qa_performance: () => [
      { action: "response_time", target: "api", result: `Avg response time: ${Math.floor(Math.random()*50+80)}ms (target: <200ms)`, timestamp: now },
      { action: "bundle_analysis", target: "frontend", result: `Bundle size: ${(Math.random()*2+4).toFixed(1)}MB (gzipped: ${(Math.random()*0.5+1.2).toFixed(1)}MB)`, timestamp: now },
      { action: "lighthouse", target: "web_vitals", result: `Performance: ${Math.floor(Math.random()*10+85)}, Accessibility: ${Math.floor(Math.random()*5+92)}, SEO: ${Math.floor(Math.random()*5+90)}`, timestamp: now },
    ],
    qa_load_test: () => [
      { action: "concurrent_users", target: "system", result: `System stable with ${Math.floor(Math.random()*200+300)} concurrent users`, timestamp: now },
      { action: "breaking_point", target: "capacity", result: `Breaking point: ~${Math.floor(Math.random()*500+800)} simultaneous requests/sec`, timestamp: now },
      { action: "pool_test", target: "db_connections", result: `Connection pool: ${Math.floor(Math.random()*10+20)} active, ${Math.floor(Math.random()*5+5)} idle, 0 exhausted`, timestamp: now },
    ],
    qa_stress_test: () => [
      { action: "extreme_load", target: "system", result: "System handled 2x normal load for 30min without crash", timestamp: now },
      { action: "recovery_test", target: "failover", result: "Recovery after simulated failure: 4.2 seconds", timestamp: now },
      { action: "graceful_degradation", target: "overload", result: "Graceful degradation active: non-critical features disabled at 90% load", timestamp: now },
    ],
    qa_compatibility: () => [
      { action: "browser_test", target: "browsers", result: "Chrome ✓, Firefox ✓, Safari ✓, Edge ✓", timestamp: now },
      { action: "mobile_test", target: "devices", result: "iOS Safari ✓, Android Chrome ✓, responsive: all breakpoints pass", timestamp: now },
      { action: "rtl_cross_browser", target: "layout", result: "RTL rendering consistent across all browsers", timestamp: now },
    ],
    qa_uat: () => [
      { action: "factory_manager_flow", target: "production", result: "Work order creation→assignment→completion flow: PASS", timestamp: now },
      { action: "accountant_flow", target: "finance", result: "Invoice generation→payment→reconciliation flow: PASS", timestamp: now },
      { action: "installer_flow", target: "installations", result: "Schedule→dispatch→complete→photo upload flow: PASS", timestamp: now },
    ],
    qa_release_readiness: () => [
      { action: "criteria_check", target: "release", result: "12/12 release criteria met", timestamp: now },
      { action: "bug_scan", target: "issues", result: "0 critical, 2 medium, 5 low severity bugs open", timestamp: now },
      { action: "rollback_plan", target: "deployment", result: "Rollback plan verified, previous version available", timestamp: now },
    ],
    qa_monitoring: () => [
      { action: "error_rate", target: "logs", result: `Error rate: ${(Math.random()*0.5+0.1).toFixed(2)}% (threshold: <1%)`, timestamp: now },
      { action: "uptime_check", target: "services", result: `Uptime: ${(99.5+Math.random()*0.49).toFixed(2)}% (30-day)`, timestamp: now },
      { action: "resource_check", target: "infrastructure", result: `CPU: ${Math.floor(Math.random()*30+20)}%, Memory: ${Math.floor(Math.random()*20+40)}%, Disk: ${Math.floor(Math.random()*15+30)}%`, timestamp: now },
    ],
  };

  const actions = (actionTemplates[agentKey] || (() => [{ action: "execute_task", target: "system", result: "Task completed", timestamp: now }]))();
  const output_data = {
    summary: `Agent ${agentKey} completed ${taskType} task successfully`,
    findings_count: Math.floor(Math.random() * 10 + 1),
    recommendations: actions.map((a: any) => a.result),
    confidence: +(Math.random() * 0.3 + 0.7).toFixed(2),
    next_suggested_action: capabilities[Math.floor(Math.random() * capabilities.length)],
  };

  return { output_data, actions_taken: actions, duration_ms };
}

// chat response simulation
function generateChatResponse(agentKey: string, message: string, capabilities: string[]): string {
  const responses: Record<string, string[]> = {
    sales_copilot: [
      "ניתחתי את הנתונים. יש לנו 5 לידים חמים שצריכים מעקב היום. הליד עם הפוטנציאל הגבוה ביותר הוא מחברת אלומיניום ישראל.",
      "זיהיתי הזדמנות מכירה חוזרת אצל 3 לקוחות שרכשו בשנה שעברה. ממליץ לשלוח הצעת מחיר מעודכנת.",
      "שיעור ההמרה החודשי עלה ב-12%. הגורם העיקרי: שיפור בזמני מענה.",
    ],
    production_planner: [
      "לוח הייצור לשבוע הבא מותאם. קו B עמוס ב-92% - ממליץ להעביר 2 הזמנות לקו A.",
      "זיהיתי עיכוב צפוי בהזמנה #1234. חומר גלם צפוי להגיע ביום רביעי במקום שלישי.",
      "הקיבולת הכוללת השבוע: 87%. יש מקום ל-3 הזמנות נוספות.",
    ],
    procurement_agent: [
      "השוואת מחירים הושלמה: ספק מתכות הצפון זול ב-15% מהספק הנוכחי לפרופילי אלומיניום.",
      "5 פריטים מתקרבים לנקודת הזמנה מחדש. טיוטת הזמנת רכש מוכנה לאישור.",
      "ציון איכות ספקים: ספק A - 4.8/5, ספק B - 3.9/5, ספק C - 4.2/5.",
    ],
    finance_controller: [
      "תחזית תזרים 30 יום: חיובית. צפי הכנסות: 2.3M, צפי הוצאות: 1.8M.",
      "זיהיתי חריגת הוצאות: ציוד משרדי עלה 340% מהממוצע החודשי. ממליץ לבדוק.",
      '8 חשבוניות באיחור תשלום. סכום כולל: 450,000 ש"ח. תעדוף גבייה מוכן.',
    ],
    quality_inspector: [
      "סריקת איכות הושלמה. שיעור פגמים: 2.1% - בתוך הנורמה. קו C מראה מגמת עלייה.",
      "NCR חדש #247 נוצר: פגמי ריתוך בסדרה 890. המלצה: כיול ציוד ריתוך.",
      "איכות ספקים: 94% התאמה לתקן. ספק D ירד מ-96% ל-88% - דרוש מעקב.",
    ],
    hr_manager: [
      "דוח נוכחות: 2 עובדים חסרים ללא הודעה. 3 עובדים חרגו ב-10+ שעות נוספות.",
      "5 עובדים צריכים לחדש הסמכות בטיחות השבוע. תזכורות נשלחו.",
      "ניתוח ביצועים רבעוני: 85% מהעובדים עמדו ביעדים. 3 עובדים מצטיינים.",
    ],
    customer_service: [
      "12 פניות חדשות מוינו: 3 קריטיות, 5 גבוהות, 4 רגילות. הפניות הקריטיות מטופלות.",
      "שביעות רצון לקוחות השבוע: 4.6/5. שיפור של 0.3 נקודות מהשבוע שעבר.",
      "2 תביעות אחריות אומתו ואושרו. מספרי אישור נשלחו ללקוחות.",
    ],
    installation_coordinator: [
      "לוח התקנות מחר: 5 התקנות, 3 צוותים. מסלולים מותאמים - חיסכון של 45 דקות.",
      "אישורי לקוחות: 4 מתוך 5 אישרו. ללקוח #789 נשלחה תזכורת נוספת.",
      "סטטוס התקנות היום: 3 הושלמו בהצלחה, 1 בתהליך, 1 עוכבה בגלל מזג אוויר.",
    ],
    safety_officer: [
      "סריקה יומית: 0 אירועי בטיחות, 1 דיווח כמעט-תאונה. הנחיות עדכניות.",
      "12 עובדים צריכים רענון הדרכת PPE. נקבעה הדרכה ליום חמישי.",
      "בדיקה שבועית נקבעה ליום ראשון. כל תחנות הכיבוי נבדקו ותקינות.",
    ],
    devops_engineer: [
      "בדיקת בריאות: 4/4 שרתים פעילים. CPU ממוצע: 34%, זיכרון: 61%.",
      "2 שגיאות חוזרות ב-API Gateway. ביצעתי ניקוי מטמון ומיחזור חיבורים.",
      "ביצועי מסד נתונים: 99.7% uptime. 3 שאילתות איטיות זוהו ומותאמו.",
    ],
    data_steward: [
      "סריקת כפילויות: 7 רשומות לקוחות כפולות מזוהות. ממתין לאישור מיזוג.",
      "ציון איכות נתונים כולל: 94.2%. שיפור של 1.3% מהשבוע שעבר.",
      "23 רשומות עם שדות חסרים. דוח מפורט נשלח למנהלי המודולים.",
    ],
    ceo_advisor: [
      "תדריך בוקר: הכנסות +8% WoW. 3 סיכונים מזוהים, 2 הזדמנויות חדשות.",
      "סיכון שרשרת אספקה מוגבר: עיכוב ממפעל בסין. ממליץ על ספק חלופי.",
      'הזדמנות שוק חדשה באזור הצפון. פוטנציאל הכנסות: 500K-1M ש"ח לשנה.',
    ],
  };

  // QA agent responses
  const qaResponses: Record<string, string[]> = {
    qa_terminal_runtime: [
      "בנייה הושלמה בהצלחה: 3,763 מודולים, 0 שגיאות, 17.83 שניות. כל הסקריפטים ב-package.json תקינים.",
      "שרת הפיתוח פועל תקין. Hot reload עובד. זמן אתחול: 2.1 שניות.",
      "בנייה לייצור עברה בהצלחה. גודל חבילה: 4.8MB. אין אזהרות קריטיות.",
    ],
    qa_unit_test: [
      "הרצתי 847 בדיקות יחידה. 844 עברו, 3 נכשלו. כיסוי קוד: 87.3%.",
      "זיהיתי 8 קבצים עם כיסוי נמוך מ-60%. ממליץ להוסיף בדיקות ל-entity-api.ts ו-pricing-engine.ts.",
      "כל הפונקציות הטהורות ב-lib/ עוברות בדיקה. Mock-ים תקינים.",
    ],
    qa_integration_test: [
      "330 נתיבי API נבדקו. 327 עוברים, 3 צריכים תיקון. פרטים בדוח.",
      "בדיקות מסד נתונים: כל פעולות ה-CRUD על 85 טבלאות עוברות בהצלחה.",
      "זרימת נתונים בין מודולים תקינה. 12 תהליכים עסקיים נבדקו.",
    ],
    qa_system_test: [
      "תהליך מלא ליד→הצעה→הזמנה→ייצור→משלוח→חשבונית: עובר בהצלחה.",
      "609 דפים נבדקו. כולם נטענים תוך פחות מ-3 שניות. 2 דפים עם אזהרות.",
      "10 רגיסטרי workflow מאומתים. כל המעברים בין סטטוסים תקינים.",
    ],
    qa_security: [
      "סריקת אבטחה הושלמה. 0 פגיעויות XSS, 0 הזרקות SQL. כל הקלטים מסוננים.",
      "כל השאילתות משתמשות בפרמטרים ($1,$2). אין סיכון להזרקת SQL.",
      "סריקת תלויות: 2 פגיעויות ברמה נמוכה. ממליץ לעדכן 3 חבילות.",
    ],
    qa_performance: [
      "זמן תגובה ממוצע: 95ms. 99 אחוזון: 340ms. הכל בגבולות היעד.",
      "גודל חבילה: 4.8MB (דחוס: 1.4MB). ציון Lighthouse: ביצועים 89, נגישות 94.",
      "3 שאילתות איטיות זוהו (>100ms). ממליץ להוסיף אינדקסים.",
    ],
    qa_monitoring: [
      "שיעור שגיאות: 0.12%. זמינות: 99.97%. כל השירותים פעילים.",
      "CPU: 28%, זיכרון: 52%, דיסק: 34%. הכל בגבולות בריאים.",
      "0 התראות קריטיות ב-24 שעות האחרונות. 2 אזהרות על שימוש בזיכרון.",
    ],
  };
  Object.assign(responses, qaResponses);

  const agentResponses = responses[agentKey] || ["ביצעתי את הבדיקה. הכל תקין. האם תרצה מידע נוסף?"];
  const lowerMsg = message.toLowerCase();

  // keyword-based selection
  if (lowerMsg.includes("סטטוס") || lowerMsg.includes("status") || lowerMsg.includes("מצב"))
    return agentResponses[0];
  if (lowerMsg.includes("בעיה") || lowerMsg.includes("problem") || lowerMsg.includes("שגיאה"))
    return agentResponses[1] || agentResponses[0];
  if (lowerMsg.includes("דוח") || lowerMsg.includes("report") || lowerMsg.includes("סיכום"))
    return agentResponses[2] || agentResponses[0];

  return agentResponses[Math.floor(Math.random() * agentResponses.length)];
}

// ═══════════════════════════════════════════════════════════════════
//  ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

// ─── Dashboard summary ──────────────────────────────────────────────
router.get("/ai-agents/dashboard", async (_req: Request, res: Response) => {
  const stats = await q1(`
    SELECT
      (SELECT COUNT(*) FROM ai_agents_registry WHERE status='active') AS total_active,
      (SELECT COUNT(*) FROM ai_agent_tasks WHERE status='running') AS active_tasks,
      (SELECT COUNT(*) FROM ai_agent_tasks WHERE status='completed' AND completed_at > NOW() - INTERVAL '24 hours') AS completed_today,
      (SELECT COUNT(*) FROM ai_agent_tasks WHERE status='needs_approval') AS pending_approvals,
      (SELECT COALESCE(AVG(avg_response_time_ms),0)::int FROM ai_agents_registry WHERE status='active') AS avg_response_time,
      (SELECT CASE WHEN COUNT(*)=0 THEN 100 ELSE ROUND(COUNT(*) FILTER(WHERE status='completed')::numeric / COUNT(*) * 100, 1) END FROM ai_agent_tasks) AS success_rate,
      (SELECT COUNT(*) FROM ai_agent_tasks WHERE priority='critical' AND status NOT IN ('completed','cancelled')) AS critical_alerts
  `);
  res.json(stats || { total_active: 0, active_tasks: 0, completed_today: 0, pending_approvals: 0, avg_response_time: 0, success_rate: 100, critical_alerts: 0 });
});

// ─── Registry: list all agents ──────────────────────────────────────
router.get("/ai-agents/registry", async (_req: Request, res: Response) => {
  const rows = await q(`
    SELECT r.*,
      (SELECT COUNT(*) FROM ai_agent_tasks t WHERE t.agent_id = r.id AND t.status='running') AS active_tasks_count,
      (SELECT COUNT(*) FROM ai_agent_schedules s WHERE s.agent_id = r.id AND s.enabled = true) AS active_schedules_count
    FROM ai_agents_registry r ORDER BY r.agent_name_he
  `);
  res.json(rows);
});

// ─── Active tasks across all agents ─────────────────────────────────
router.get("/ai-agents/active-tasks", async (_req: Request, res: Response) => {
  const rows = await q(`
    SELECT t.*, r.agent_key, r.agent_name_he, r.avatar_emoji
    FROM ai_agent_tasks t
    JOIN ai_agents_registry r ON r.id = t.agent_id
    WHERE t.status IN ('running','queued','needs_approval')
    ORDER BY
      CASE t.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
      t.created_at DESC
  `);
  res.json(rows);
});

// ─── Run scheduled tasks ────────────────────────────────────────────
router.post("/ai-agents/run-scheduled", async (_req: Request, res: Response) => {
  const due = await q(`
    SELECT s.*, r.agent_key, r.capabilities
    FROM ai_agent_schedules s
    JOIN ai_agents_registry r ON r.id = s.agent_id
    WHERE s.enabled = true AND (s.next_run IS NULL OR s.next_run <= NOW())
    AND r.status = 'active'
  `);

  const results: any[] = [];
  for (const sched of due) {
    const caps = (sched.capabilities || []) as string[];
    const { output_data, actions_taken, duration_ms } = simulateExecution(sched.agent_key, caps, "automation", {});

    const [task] = await q(`
      INSERT INTO ai_agent_tasks (agent_id, task_type, title, title_he, description, priority, source_module, input_data, output_data, actions_taken, status, started_at, completed_at, duration_ms)
      VALUES ($1, 'automation', $2, $2, 'Scheduled execution', 'normal', 'scheduler', '{}', $3, $4, 'completed', NOW(), NOW(), $5)
      RETURNING *
    `, [sched.agent_id, sched.schedule_name, JSON.stringify(output_data), JSON.stringify(actions_taken), duration_ms]);

    // update schedule
    await q(`UPDATE ai_agent_schedules SET last_run = NOW(), next_run = NOW() + COALESCE(interval_minutes * interval '1 minute', interval '1 hour'), run_count = run_count + 1 WHERE id = $1`, [sched.id]);
    await q(`UPDATE ai_agents_registry SET total_actions = total_actions + 1, total_resolved = total_resolved + 1, last_active = NOW() WHERE id = $1`, [sched.agent_id]);

    results.push(task);
  }
  res.json({ triggered: results.length, tasks: results });
});

// ─── Single agent detail ────────────────────────────────────────────
router.get("/ai-agents/:agentKey", async (req: Request, res: Response) => {
  const agent = await q1(`
    SELECT r.*,
      (SELECT COUNT(*) FROM ai_agent_tasks t WHERE t.agent_id = r.id) AS total_tasks,
      (SELECT COUNT(*) FROM ai_agent_tasks t WHERE t.agent_id = r.id AND t.status='running') AS active_tasks_count,
      (SELECT COUNT(*) FROM ai_agent_tasks t WHERE t.agent_id = r.id AND t.status='needs_approval') AS pending_approvals,
      (SELECT COUNT(*) FROM ai_agent_schedules s WHERE s.agent_id = r.id AND s.enabled = true) AS active_schedules_count
    FROM ai_agents_registry r WHERE r.agent_key = $1
  `, [req.params.agentKey]);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  res.json(agent);
});

// ─── Activate / Pause ───────────────────────────────────────────────
router.post("/ai-agents/:agentKey/activate", async (req: Request, res: Response) => {
  const rows = await q(`UPDATE ai_agents_registry SET status = 'active', last_active = NOW() WHERE agent_key = $1 RETURNING *`, [req.params.agentKey]);
  if (!rows.length) return res.status(404).json({ error: "Agent not found" });
  res.json(rows[0]);
});

router.post("/ai-agents/:agentKey/pause", async (req: Request, res: Response) => {
  const rows = await q(`UPDATE ai_agents_registry SET status = 'paused' WHERE agent_key = $1 RETURNING *`, [req.params.agentKey]);
  if (!rows.length) return res.status(404).json({ error: "Agent not found" });
  res.json(rows[0]);
});

// ─── Execute task ───────────────────────────────────────────────────
router.post("/ai-agents/:agentKey/execute-task", async (req: Request, res: Response) => {
  const agent = await q1(`SELECT * FROM ai_agents_registry WHERE agent_key = $1`, [req.params.agentKey]);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const { task_type = "automation", title, title_he, description, priority = "normal", source_module, source_entity_type, source_entity_id, input_data = {} } = req.body;

  const capabilities = (agent.capabilities || []) as string[];
  const needsApproval = agent.autonomy_level === "advisory" || (agent.autonomy_level === "draft" && priority === "critical");

  const { output_data, actions_taken, duration_ms } = simulateExecution(agent.agent_key, capabilities, task_type, input_data);
  const finalStatus = needsApproval ? "needs_approval" : "completed";

  const [task] = await q(`
    INSERT INTO ai_agent_tasks (agent_id, task_type, title, title_he, description, priority, source_module, source_entity_type, source_entity_id, input_data, output_data, actions_taken, status, started_at, completed_at, duration_ms)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, NOW(), ${finalStatus === "completed" ? "NOW()" : "NULL"}, $14)
    RETURNING *
  `, [agent.id, task_type, title || `${agent.agent_name_he} - ${task_type}`, title_he || title || `${agent.agent_name_he} - ${task_type}`, description || "", priority, source_module || "", source_entity_type || "", source_entity_id || "", JSON.stringify(input_data), JSON.stringify(output_data), JSON.stringify(actions_taken), finalStatus, duration_ms]);

  await q(`UPDATE ai_agents_registry SET total_actions = total_actions + 1, ${finalStatus === "completed" ? "total_resolved = total_resolved + 1," : ""} last_active = NOW() WHERE id = $1`, [agent.id]);

  res.json(task);
});

// ─── Task history per agent ─────────────────────────────────────────
router.get("/ai-agents/:agentKey/tasks", async (req: Request, res: Response) => {
  const agent = await q1(`SELECT id FROM ai_agents_registry WHERE agent_key = $1`, [req.params.agentKey]);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const rows = await q(`SELECT * FROM ai_agent_tasks WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [agent.id, limit, offset]);
  res.json(rows);
});

// ─── Task detail ────────────────────────────────────────────────────
router.get("/ai-agents/:agentKey/tasks/:taskId", async (req: Request, res: Response) => {
  const row = await q1(`
    SELECT t.*, r.agent_key, r.agent_name_he, r.avatar_emoji
    FROM ai_agent_tasks t JOIN ai_agents_registry r ON r.id = t.agent_id
    WHERE r.agent_key = $1 AND t.id = $2
  `, [req.params.agentKey, req.params.taskId]);
  if (!row) return res.status(404).json({ error: "Task not found" });
  res.json(row);
});

// ─── Approve / Reject task ──────────────────────────────────────────
router.post("/ai-agents/:agentKey/tasks/:taskId/approve", async (req: Request, res: Response) => {
  const { approved_by = "system" } = req.body;
  const rows = await q(`
    UPDATE ai_agent_tasks SET status = 'completed', completed_at = NOW(), approved_by = $1
    WHERE id = $2 AND status = 'needs_approval' RETURNING *
  `, [approved_by, req.params.taskId]);
  if (!rows.length) return res.status(404).json({ error: "Task not found or not pending approval" });
  // increment resolved count
  if (rows[0].agent_id) await q(`UPDATE ai_agents_registry SET total_resolved = total_resolved + 1 WHERE id = $1`, [rows[0].agent_id]);
  res.json(rows[0]);
});

router.post("/ai-agents/:agentKey/tasks/:taskId/reject", async (req: Request, res: Response) => {
  const { reason = "" } = req.body;
  const rows = await q(`
    UPDATE ai_agent_tasks SET status = 'cancelled', error_message = $1, completed_at = NOW()
    WHERE id = $2 AND status = 'needs_approval' RETURNING *
  `, [reason, req.params.taskId]);
  if (!rows.length) return res.status(404).json({ error: "Task not found or not pending approval" });
  res.json(rows[0]);
});

// ─── Schedules CRUD ─────────────────────────────────────────────────
router.get("/ai-agents/:agentKey/schedules", async (req: Request, res: Response) => {
  const agent = await q1(`SELECT id FROM ai_agents_registry WHERE agent_key = $1`, [req.params.agentKey]);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  const rows = await q(`SELECT * FROM ai_agent_schedules WHERE agent_id = $1 ORDER BY created_at DESC`, [agent.id]);
  res.json(rows);
});

router.post("/ai-agents/:agentKey/schedules", async (req: Request, res: Response) => {
  const agent = await q1(`SELECT id FROM ai_agents_registry WHERE agent_key = $1`, [req.params.agentKey]);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  const { schedule_name, schedule_type, cron_expression, interval_minutes, trigger_event, enabled = true } = req.body;
  const [row] = await q(`
    INSERT INTO ai_agent_schedules (agent_id, schedule_name, schedule_type, cron_expression, interval_minutes, trigger_event, enabled, next_run)
    VALUES ($1,$2,$3,$4,$5,$6,$7, NOW() + COALESCE($5 * interval '1 minute', interval '1 hour'))
    RETURNING *
  `, [agent.id, schedule_name, schedule_type, cron_expression || null, interval_minutes || null, trigger_event || null, enabled]);
  res.json(row);
});

router.put("/ai-agents/:agentKey/schedules/:schedId", async (req: Request, res: Response) => {
  const { schedule_name, schedule_type, cron_expression, interval_minutes, trigger_event, enabled } = req.body;
  const rows = await q(`
    UPDATE ai_agent_schedules
    SET schedule_name = COALESCE($1, schedule_name),
        schedule_type = COALESCE($2, schedule_type),
        cron_expression = COALESCE($3, cron_expression),
        interval_minutes = COALESCE($4, interval_minutes),
        trigger_event = COALESCE($5, trigger_event),
        enabled = COALESCE($6, enabled)
    WHERE id = $7 RETURNING *
  `, [schedule_name, schedule_type, cron_expression, interval_minutes, trigger_event, enabled, req.params.schedId]);
  if (!rows.length) return res.status(404).json({ error: "Schedule not found" });
  res.json(rows[0]);
});

router.delete("/ai-agents/:agentKey/schedules/:schedId", async (_req: Request, res: Response) => {
  await q(`DELETE FROM ai_agent_schedules WHERE id = $1`, [_req.params.schedId]);
  res.json({ ok: true });
});

// ─── Chat ───────────────────────────────────────────────────────────
router.post("/ai-agents/:agentKey/chat", async (req: Request, res: Response) => {
  const agent = await q1(`SELECT * FROM ai_agents_registry WHERE agent_key = $1`, [req.params.agentKey]);
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const { message, conversation_id, user_id = "user", user_name = "משתמש" } = req.body;
  const now = new Date().toISOString();
  const capabilities = (agent.capabilities || []) as string[];
  const response = generateChatResponse(agent.agent_key, message, capabilities);

  const userMsg = { role: "user", content: message, timestamp: now };
  const agentMsg = { role: "agent", content: response, timestamp: new Date(Date.now() + 800).toISOString() };

  let convId = conversation_id;
  if (convId) {
    // append to existing
    await q(`
      UPDATE ai_agent_conversations
      SET messages = messages || $1::jsonb || $2::jsonb
      WHERE id = $3
    `, [JSON.stringify(userMsg), JSON.stringify(agentMsg), convId]);
  } else {
    // create new conversation
    const [conv] = await q(`
      INSERT INTO ai_agent_conversations (agent_id, user_id, user_name, messages, context, status)
      VALUES ($1, $2, $3, $4, '{}', 'active')
      RETURNING *
    `, [agent.id, user_id, user_name, JSON.stringify([userMsg, agentMsg])]);
    convId = conv?.id;
  }

  await q(`UPDATE ai_agents_registry SET last_active = NOW() WHERE id = $1`, [agent.id]);

  res.json({ conversation_id: convId, response, agent_key: agent.agent_key, agent_name_he: agent.agent_name_he, avatar_emoji: agent.avatar_emoji });
});

// ─── Conversations list ─────────────────────────────────────────────
router.get("/ai-agents/:agentKey/conversations", async (req: Request, res: Response) => {
  const agent = await q1(`SELECT id FROM ai_agents_registry WHERE agent_key = $1`, [req.params.agentKey]);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  const rows = await q(`SELECT * FROM ai_agent_conversations WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 50`, [agent.id]);
  res.json(rows);
});

export default router;
