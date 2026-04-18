import { useState, useEffect, useCallback, useRef } from "react";
import { authFetch } from "@/lib/utils";
import {
  ArrowLeft, RefreshCw, Play, Pause, CheckCircle2, XCircle, Clock,
  Activity, Zap, Bot, Send, Calendar, Settings, ChevronDown, ChevronUp,
  AlertTriangle, TrendingUp, Shield, Eye, MessageSquare, BarChart3,
  Search, Filter, Plus, Trash2, Edit3, X, Check, Users, Cpu
} from "lucide-react";
import { Link } from "wouter";

const API = "/api";

// ─── Types ──────────────────────────────────────────────────────────
interface Agent {
  id: number;
  agent_key: string;
  agent_name: string;
  agent_name_he: string;
  role: string;
  description: string;
  description_he: string;
  avatar_emoji: string;
  color: string;
  capabilities: string[];
  modules_access: string[];
  autonomy_level: string;
  status: string;
  total_actions: number;
  total_resolved: number;
  avg_response_time_ms: number;
  satisfaction_score: number;
  last_active: string;
  active_tasks_count?: number;
  active_schedules_count?: number;
  pending_approvals?: number;
}

interface Task {
  id: number;
  agent_id: number;
  agent_key?: string;
  agent_name_he?: string;
  avatar_emoji?: string;
  task_type: string;
  title: string;
  title_he: string;
  description: string;
  priority: string;
  source_module: string;
  input_data: any;
  output_data: any;
  actions_taken: any[];
  status: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  error_message: string;
  approved_by: string;
  created_at: string;
}

interface Schedule {
  id: number;
  agent_id: number;
  schedule_name: string;
  schedule_type: string;
  cron_expression: string;
  interval_minutes: number;
  trigger_event: string;
  enabled: boolean;
  last_run: string;
  next_run: string;
  run_count: number;
}

interface DashboardStats {
  total_active: number;
  active_tasks: number;
  completed_today: number;
  pending_approvals: number;
  avg_response_time: number;
  success_rate: number;
  critical_alerts: number;
}

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  timestamp: string;
}

// ─── Helpers ────────────────────────────────────────────────────────
const AUTONOMY_LABELS: Record<string, string> = { advisory: "ייעוצי", draft: "טיוטה", auto_low: "אוטומטי נמוך", auto_high: "אוטומטי גבוה" };
const STATUS_LABELS: Record<string, string> = { active: "פעיל", paused: "מושהה", training: "באימון", retired: "לא פעיל" };
const TASK_STATUS_LABELS: Record<string, string> = { queued: "בתור", running: "פועל", completed: "הושלם", failed: "נכשל", needs_approval: "ממתין לאישור", cancelled: "בוטל" };
const PRIORITY_LABELS: Record<string, string> = { low: "נמוך", normal: "רגיל", high: "גבוה", critical: "קריטי" };
const TASK_TYPE_LABELS: Record<string, string> = { alert: "התראה", reminder: "תזכורת", automation: "אוטומציה", fix: "תיקון", analysis: "ניתוח", report: "דוח", communication: "תקשורת", monitoring: "ניטור", qa_test: "בדיקת QA", security_scan: "סריקת אבטחה", performance_test: "בדיקת ביצועים", load_test: "בדיקת עומס", regression: "רגרסיה", smoke_test: "בדיקת עשן", sanity_check: "בדיקת שפיות", audit: "ביקורת" };
const SCHED_TYPE_LABELS: Record<string, string> = { cron: "Cron", interval: "מחזורי", event_trigger: "אירוע" };

const CAP_LABELS: Record<string, string> = {
  lead_scoring: "דירוג לידים", next_best_action: "פעולה הבאה", follow_up_reminders: "תזכורות מעקב",
  quote_drafting: "טיוטת הצעה", conversion_analysis: "ניתוח המרות", customer_communication: "תקשורת לקוחות",
  schedule_optimization: "אופטימיזציית לוח", bottleneck_detection: "זיהוי צווארי בקבוק", material_readiness_check: "בדיקת מוכנות חומרים",
  capacity_planning: "תכנון קיבולת", delay_prediction: "חיזוי עיכובים", work_order_creation: "יצירת הוראות עבודה",
  price_comparison: "השוואת מחירים", reorder_alerts: "התראות הזמנה", supplier_evaluation: "הערכת ספקים",
  purchase_order_drafting: "טיוטת הזמנת רכש", cost_optimization: "אופטימיזציית עלויות", shortage_prediction: "חיזוי מחסור",
  cashflow_forecast: "תחזית תזרים", margin_monitoring: "ניטור רווחיות", expense_anomaly_detection: "זיהוי חריגות הוצאות",
  collection_prioritization: "תעדוף גבייה", budget_variance_alerts: "התראות חריגת תקציב", tax_calculation: "חישוב מס",
  defect_pattern_detection: "זיהוי דפוסי פגמים", scrap_analysis: "ניתוח פסולת", supplier_quality_tracking: "מעקב איכות ספקים",
  measurement_verification: "אימות מדידות", ncr_creation: "יצירת NCR", capa_recommendations: "המלצות CAPA",
  attendance_monitoring: "ניטור נוכחות", overtime_alerts: "התראות שעות נוספות", leave_management: "ניהול חופשות",
  employee_performance_analysis: "ניתוח ביצועי עובדים", training_reminders: "תזכורות הדרכה", payroll_calculation: "חישוב שכר",
  ticket_triage: "מיון פניות", status_updates: "עדכוני סטטוס", warranty_check: "בדיקת אחריות",
  complaint_resolution: "פתרון תלונות", satisfaction_survey: "סקר שביעות רצון", whatsapp_response: "מענה וואטסאפ",
  crew_assignment: "הקצאת צוותים", route_planning: "תכנון מסלולים", customer_confirmation: "אישור לקוחות",
  completion_verification: "אימות השלמה", feedback_collection: "איסוף משוב",
  incident_monitoring: "ניטור אירועים", inspection_scheduling: "תזמון בדיקות", training_compliance: "ציות הדרכות",
  hazard_detection: "זיהוי סיכונים", ppe_verification: "אימות PPE", near_miss_analysis: "ניתוח כמעט-תאונה",
  server_monitoring: "ניטור שרתים", bug_detection: "זיהוי באגים", performance_optimization: "אופטימיזציית ביצועים",
  database_health: "בריאות מסד נתונים", api_testing: "בדיקת API", error_log_analysis: "ניתוח לוגים", auto_fix_common_issues: "תיקון אוטומטי",
  duplicate_detection: "זיהוי כפילויות", data_quality_scoring: "דירוג איכות נתונים", missing_field_alerts: "התראות שדות חסרים",
  consistency_checks: "בדיקות עקביות", data_migration: "העברת נתונים", backup_monitoring: "ניטור גיבויים",
  daily_briefing: "תדריך יומי", risk_summary: "סיכום סיכונים", opportunity_detection: "זיהוי הזדמנויות",
  competitor_monitoring: "ניטור מתחרים", strategic_recommendations: "המלצות אסטרטגיות", kpi_alerts: "התראות KPI",
  // QA Agent capabilities
  build_verification: "אימות בנייה", dev_server_test: "בדיקת שרת פיתוח", production_build: "בנייה לייצור",
  exit_code_check: "בדיקת קוד יציאה", script_validation: "אימות סקריפטים", dependency_audit: "ביקורת תלויות",
  unit_test_execution: "הרצת בדיקות יחידה", coverage_analysis: "ניתוח כיסוי", untested_code_detection: "זיהוי קוד לא נבדק",
  function_validation: "אימות פונקציות", mock_verification: "אימות Mock", assertion_audit: "ביקורת Assertions",
  api_integration_test: "בדיקת אינטגרציית API", database_operation_test: "בדיקת פעולות DB", module_communication_test: "בדיקת תקשורת מודולים",
  data_flow_validation: "אימות זרימת נתונים", service_dependency_check: "בדיקת תלויות שירותים", contract_testing: "בדיקת חוזים",
  workflow_e2e_test: "בדיקת E2E תהליכים", page_load_verification: "אימות טעינת דפים", business_process_test: "בדיקת תהליכים עסקיים",
  cross_module_workflow: "תהליך חוצה מודולים", state_machine_validation: "אימות מכונת מצבים", complete_cycle_test: "בדיקת מחזור מלא",
  change_impact_analysis: "ניתוח השפעת שינויים", critical_path_monitoring: "ניטור נתיבים קריטיים", feature_stability_tracking: "מעקב יציבות",
  snapshot_comparison: "השוואת Snapshots", behavior_diff: "השוואת התנהגות", regression_detection: "זיהוי רגרסיה",
  login_verification: "אימות התחברות", navigation_test: "בדיקת ניווט", crud_smoke_test: "בדיקת CRUD מהירה",
  dashboard_load_test: "בדיקת טעינת דשבורד", critical_function_check: "בדיקת פונקציות קריטיות", quick_health_check: "בדיקת בריאות מהירה",
  change_validation: "אימות שינויים", focused_area_test: "בדיקת אזור ממוקד", obvious_breakage_check: "בדיקת שבירה ברורה",
  config_sanity: "שפיות הגדרות", deployment_readiness: "מוכנות Deploy", quick_validation: "אימות מהיר",
  route_testing: "בדיקת נתיבים", status_code_validation: "אימות קודי סטטוס", schema_validation: "אימות סכימה",
  auth_testing: "בדיקת אימות", error_handling_test: "בדיקת טיפול בשגיאות", pagination_test: "בדיקת עימוד",
  cors_check: "בדיקת CORS", rate_limit_test: "בדיקת הגבלת קצב",
  constraint_check: "בדיקת אילוצים", migration_test: "בדיקת מיגרציה", index_verification: "אימות אינדקסים",
  query_performance: "ביצועי שאילתות", data_consistency: "עקביות נתונים", foreign_key_check: "בדיקת מפתחות זרים", null_check: "בדיקת NULL",
  form_validation_test: "בדיקת אימות טפסים", table_rendering_test: "בדיקת רנדור טבלאות", modal_test: "בדיקת מודלים",
  rtl_layout_check: "בדיקת פריסת RTL", responsive_test: "בדיקה רספונסיבית", dark_mode_test: "בדיקת מצב כהה",
  animation_test: "בדיקת אנימציות", accessibility_audit: "ביקורת נגישות",
  workflow_usability_test: "בדיקת שימושיות", completion_time_measurement: "מדידת זמן השלמה", information_architecture_check: "בדיקת ארכיטקטורת מידע",
  hebrew_translation_audit: "ביקורת תרגום עברית", search_ux_test: "בדיקת UX חיפוש", navigation_flow_test: "בדיקת זרימת ניווט",
  rbac_test: "בדיקת RBAC", row_level_security_test: "בדיקת RLS", api_authorization_test: "בדיקת הרשאות API",
  route_guard_test: "בדיקת שומרי נתיבים", tenant_isolation_test: "בדיקת בידוד שוכרים", privilege_escalation_test: "בדיקת הסלמת הרשאות",
  xss_scan: "סריקת XSS", sql_injection_test: "בדיקת SQL Injection", csrf_check: "בדיקת CSRF",
  auth_bypass_test: "בדיקת עקיפת אימות", sensitive_data_scan: "סריקת מידע רגיש", dependency_vulnerability_scan: "סריקת פגיעויות תלויות",
  owasp_compliance: "תאימות OWASP", header_security_check: "בדיקת Headers אבטחה",
  response_time_measurement: "מדידת זמן תגובה", memory_profiling: "פרופיל זיכרון", bundle_size_analysis: "ניתוח גודל חבילה",
  render_performance: "ביצועי רנדור", query_speed_test: "בדיקת מהירות שאילתות", api_throughput: "תפוקת API", lighthouse_audit: "ביקורת Lighthouse",
  concurrent_user_simulation: "סימולציית משתמשים", heavy_load_test: "בדיקת עומס כבד", breaking_point_identification: "זיהוי נקודת שבירה",
  degradation_measurement: "מדידת דגרדציה", connection_pool_test: "בדיקת Pool חיבורים", memory_leak_detection: "זיהוי דליפות זיכרון",
  extreme_load_test: "בדיקת עומס קיצוני", failure_recovery_test: "בדיקת התאוששות", graceful_degradation_check: "בדיקת דגרדציה מבוקרת",
  error_handling_under_stress: "שגיאות תחת לחץ", resource_exhaustion_test: "בדיקת מיצוי משאבים", chaos_engineering: "הנדסת כאוס",
  cross_browser_test: "בדיקה חוצת דפדפנים", mobile_compatibility: "תאימות מובייל", tablet_test: "בדיקת טאבלט",
  screen_size_test: "בדיקת גודלי מסך", os_version_test: "בדיקת גרסאות OS", rtl_rendering_check: "בדיקת רנדור RTL", touch_interaction_test: "בדיקת אינטראקציית מגע",
  user_scenario_simulation: "סימולציית תרחישי משתמש", business_acceptance_test: "בדיקת קבלה עסקית", role_based_workflow_test: "בדיקת תהליך לפי תפקיד",
  real_world_scenario: "תרחיש עולם אמיתי", data_entry_test: "בדיקת הזנת נתונים", report_generation_test: "בדיקת הפקת דוחות",
  release_criteria_check: "בדיקת קריטריוני שחרור", critical_bug_scan: "סריקת באגים קריטיים", documentation_completeness: "שלמות תיעוד",
  rollback_plan_validation: "אימות תוכנית חזרה", monitoring_check: "בדיקת ניטור", changelog_generation: "הפקת Changelog",
  error_rate_monitoring: "ניטור שיעור שגיאות", response_time_tracking: "מעקב זמן תגובה", database_health_check: "בדיקת בריאות DB",
  memory_monitoring: "ניטור זיכרון", disk_space_check: "בדיקת מקום דיסק", ssl_certificate_check: "בדיקת תעודות SSL",
  uptime_monitoring: "ניטור זמינות", alert_management: "ניהול התראות",
};

function formatDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function relativeTime(d: string | null) {
  if (!d) return "לא זמין";
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return "לפני פחות מדקה";
  if (diff < 3600000) return `לפני ${Math.floor(diff / 60000)} דקות`;
  if (diff < 86400000) return `לפני ${Math.floor(diff / 3600000)} שעות`;
  return `לפני ${Math.floor(diff / 86400000)} ימים`;
}

const statusColor = (s: string) => {
  switch (s) {
    case "active": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "paused": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "training": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "retired": return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    default: return "bg-gray-500/20 text-gray-400";
  }
};

const taskStatusColor = (s: string) => {
  switch (s) {
    case "completed": return "bg-emerald-500/20 text-emerald-400";
    case "running": return "bg-blue-500/20 text-blue-400";
    case "queued": return "bg-gray-500/20 text-gray-400";
    case "failed": return "bg-red-500/20 text-red-400";
    case "needs_approval": return "bg-amber-500/20 text-amber-400";
    case "cancelled": return "bg-gray-500/20 text-gray-500";
    default: return "bg-gray-500/20 text-gray-400";
  }
};

const priorityColor = (p: string) => {
  switch (p) {
    case "critical": return "text-red-400";
    case "high": return "text-orange-400";
    case "normal": return "text-gray-300";
    case "low": return "text-gray-500";
    default: return "text-gray-400";
  }
};

// ─── Main Component ─────────────────────────────────────────────────
export default function AIAgentsDashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agentTasks, setAgentTasks] = useState<Task[]>([]);
  const [agentSchedules, setAgentSchedules] = useState<Schedule[]>([]);
  const [view, setView] = useState<"grid" | "detail" | "chat" | "approvals" | "timeline">("grid");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Chat state
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatConvId, setChatConvId] = useState<number | null>(null);
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Schedule form
  const [showSchedForm, setShowSchedForm] = useState(false);
  const [schedForm, setSchedForm] = useState({ schedule_name: "", schedule_type: "cron", cron_expression: "", interval_minutes: 60, trigger_event: "" });

  // Task execution form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ task_type: "automation", title: "", priority: "normal", source_module: "", description: "" });

  // ─── Data fetching ──────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [agentsRes, statsRes, activeRes] = await Promise.all([
        authFetch(`${API}/ai-agents/registry`),
        authFetch(`${API}/ai-agents/dashboard`),
        authFetch(`${API}/ai-agents/active-tasks`),
      ]);
      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (activeRes.ok) setActiveTasks(await activeRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchAgentDetail = async (agent: Agent) => {
    setSelectedAgent(agent);
    setView("detail");
    try {
      const [tasksRes, schedRes] = await Promise.all([
        authFetch(`${API}/ai-agents/${agent.agent_key}/tasks?limit=30`),
        authFetch(`${API}/ai-agents/${agent.agent_key}/schedules`),
      ]);
      if (tasksRes.ok) setAgentTasks(await tasksRes.json());
      if (schedRes.ok) setAgentSchedules(await schedRes.json());
    } catch (e) { console.error(e); }
  };

  // ─── Actions ────────────────────────────────────────────────────
  const toggleAgent = async (agent: Agent) => {
    const endpoint = agent.status === "active" ? "pause" : "activate";
    await authFetch(`${API}/ai-agents/${agent.agent_key}/${endpoint}`, { method: "POST" });
    fetchAll();
    if (selectedAgent?.agent_key === agent.agent_key) fetchAgentDetail({ ...agent, status: endpoint === "pause" ? "paused" : "active" });
  };

  const executeTask = async () => {
    if (!selectedAgent) return;
    await authFetch(`${API}/ai-agents/${selectedAgent.agent_key}/execute-task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskForm),
    });
    setShowTaskForm(false);
    setTaskForm({ task_type: "automation", title: "", priority: "normal", source_module: "", description: "" });
    fetchAgentDetail(selectedAgent);
    fetchAll();
  };

  const approveTask = async (task: Task) => {
    await authFetch(`${API}/ai-agents/${task.agent_key || selectedAgent?.agent_key}/tasks/${task.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved_by: "admin" }),
    });
    fetchAll();
    if (selectedAgent) fetchAgentDetail(selectedAgent);
  };

  const rejectTask = async (task: Task) => {
    await authFetch(`${API}/ai-agents/${task.agent_key || selectedAgent?.agent_key}/tasks/${task.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Rejected by admin" }),
    });
    fetchAll();
    if (selectedAgent) fetchAgentDetail(selectedAgent);
  };

  const createSchedule = async () => {
    if (!selectedAgent) return;
    await authFetch(`${API}/ai-agents/${selectedAgent.agent_key}/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedForm),
    });
    setShowSchedForm(false);
    setSchedForm({ schedule_name: "", schedule_type: "cron", cron_expression: "", interval_minutes: 60, trigger_event: "" });
    fetchAgentDetail(selectedAgent);
  };

  const deleteSchedule = async (schedId: number) => {
    if (!selectedAgent) return;
    await authFetch(`${API}/ai-agents/${selectedAgent.agent_key}/schedules/${schedId}`, { method: "DELETE" });
    fetchAgentDetail(selectedAgent);
  };

  const runScheduled = async () => {
    await authFetch(`${API}/ai-agents/run-scheduled`, { method: "POST" });
    fetchAll();
  };

  // ─── Chat ───────────────────────────────────────────────────────
  const openChat = (agent: Agent) => {
    setChatAgent(agent);
    setChatMessages([]);
    setChatConvId(null);
    setChatInput("");
    setView("chat");
  };

  const sendChat = async () => {
    if (!chatAgent || !chatInput.trim()) return;
    setChatSending(true);
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: msg, timestamp: new Date().toISOString() }]);

    try {
      const res = await authFetch(`${API}/ai-agents/${chatAgent.agent_key}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, conversation_id: chatConvId, user_id: "admin", user_name: "מנהל" }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatConvId(data.conversation_id);
        setChatMessages(prev => [...prev, { role: "agent", content: data.response, timestamp: new Date().toISOString() }]);
      }
    } catch (e) { console.error(e); }
    setChatSending(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  // ─── Filter ─────────────────────────────────────────────────────
  const filteredAgents = agents.filter(a =>
    !searchTerm || a.agent_name_he.includes(searchTerm) || a.role.toLowerCase().includes(searchTerm.toLowerCase()) || a.agent_key.includes(searchTerm)
  );

  const opsAgents = filteredAgents.filter(a => !a.agent_key.startsWith("qa_"));
  const qaAgents = filteredAgents.filter(a => a.agent_key.startsWith("qa_"));

  const pendingApprovals = activeTasks.filter(t => t.status === "needs_approval");

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#0f1629] to-[#0a0e1a] text-white" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#0f1629]/90 backdrop-blur-xl border-b border-white/5 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {view !== "grid" && (
              <button onClick={() => { setView("grid"); setSelectedAgent(null); }} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-xl">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                  AI Agents Command Center
                </h1>
                <p className="text-xs text-gray-400">מרכז שליטה - סוכנים חכמים</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {pendingApprovals.length > 0 && (
              <button onClick={() => setView("approvals")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 transition text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>{pendingApprovals.length} ממתינים לאישור</span>
              </button>
            )}
            <button onClick={() => setView("timeline")} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition text-sm text-gray-300">
              <Activity className="w-4 h-4" />
              <span>ציר זמן</span>
            </button>
            <button onClick={runScheduled} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30 transition text-sm">
              <Zap className="w-4 h-4" />
              <span>הפעל מתוזמנים</span>
            </button>
            <button onClick={fetchAll} disabled={loading} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition">
              <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-[1800px] mx-auto space-y-6">
        {/* ─── KPI Cards ──────────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: "סוכנים פעילים", value: stats.total_active, icon: <Users className="w-5 h-5" />, color: "from-emerald-500/20 to-green-500/20", text: "text-emerald-400" },
              { label: "משימות פעילות", value: stats.active_tasks, icon: <Activity className="w-5 h-5" />, color: "from-blue-500/20 to-cyan-500/20", text: "text-blue-400" },
              { label: "הושלמו היום", value: stats.completed_today, icon: <CheckCircle2 className="w-5 h-5" />, color: "from-violet-500/20 to-purple-500/20", text: "text-violet-400" },
              { label: "ממתינים לאישור", value: stats.pending_approvals, icon: <Clock className="w-5 h-5" />, color: "from-amber-500/20 to-orange-500/20", text: "text-amber-400" },
              { label: "זמן תגובה ממוצע", value: `${(stats.avg_response_time / 1000).toFixed(1)}s`, icon: <Zap className="w-5 h-5" />, color: "from-cyan-500/20 to-teal-500/20", text: "text-cyan-400" },
              { label: "שיעור הצלחה", value: `${stats.success_rate}%`, icon: <TrendingUp className="w-5 h-5" />, color: "from-green-500/20 to-emerald-500/20", text: "text-green-400" },
              { label: "התראות קריטיות", value: stats.critical_alerts, icon: <AlertTriangle className="w-5 h-5" />, color: "from-red-500/20 to-rose-500/20", text: "text-red-400" },
            ].map((kpi, i) => (
              <div key={i} className={`rounded-xl bg-gradient-to-br ${kpi.color} border border-white/5 p-4`}>
                <div className={`flex items-center gap-2 ${kpi.text} mb-2`}>
                  {kpi.icon}
                  <span className="text-xs font-medium">{kpi.label}</span>
                </div>
                <div className="text-2xl font-bold text-white">{kpi.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ─── GRID VIEW ─────────────────────────────────────────── */}
        {view === "grid" && (
          <>
            {/* Search */}
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="חיפוש סוכן..."
                  className="w-full pr-10 pl-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-violet-500/50"
                />
              </div>
            </div>

            {/* Operations Agents */}
            {opsAgents.length > 0 && (
              <div className="flex items-center gap-3 mt-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/30 to-purple-500/30 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-violet-400" />
                </div>
                <h2 className="text-lg font-bold text-violet-300">סוכני תפעול ({opsAgents.length})</h2>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {opsAgents.map(agent => (
                <div
                  key={agent.id}
                  className="group rounded-xl bg-gradient-to-br from-white/[0.04] to-white/[0.02] border border-white/[0.06] hover:border-white/[0.15] transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/5 cursor-pointer"
                  onClick={() => fetchAgentDetail(agent)}
                >
                  <div className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="text-3xl w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: agent.color + "22" }}>
                          {agent.avatar_emoji}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-white group-hover:text-violet-300 transition">{agent.agent_name_he}</h3>
                          <p className="text-xs text-gray-500">{agent.role}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColor(agent.status)}`}>
                        {STATUS_LABELS[agent.status]}
                      </span>
                    </div>

                    {/* Capabilities */}
                    <div className="flex flex-wrap gap-1 mb-4">
                      {(agent.capabilities || []).slice(0, 4).map((c, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/5">
                          {CAP_LABELS[c] || c}
                        </span>
                      ))}
                      {(agent.capabilities || []).length > 4 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-500">
                          +{agent.capabilities.length - 4}
                        </span>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                        <div className="text-sm font-bold text-white">{agent.total_actions}</div>
                        <div className="text-[10px] text-gray-500">פעולות</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                        <div className="text-sm font-bold text-white">{agent.total_resolved}</div>
                        <div className="text-[10px] text-gray-500">נפתרו</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                        <div className="text-sm font-bold" style={{ color: agent.satisfaction_score >= 4 ? "#10b981" : agent.satisfaction_score >= 3 ? "#f59e0b" : "#ef4444" }}>
                          {agent.satisfaction_score?.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-gray-500">דירוג</div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-white/5">
                      <span className="text-[10px] text-gray-500">{relativeTime(agent.last_active)}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); openChat(agent); }}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition text-gray-400 hover:text-violet-400"
                          title="צ'אט"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); toggleAgent(agent); }}
                          className={`p-1.5 rounded-lg hover:bg-white/10 transition ${agent.status === "active" ? "text-emerald-400" : "text-gray-500"}`}
                          title={agent.status === "active" ? "השהה" : "הפעל"}
                        >
                          {agent.status === "active" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* QA Testing Agents */}
            {qaAgents.length > 0 && (
              <>
                <div className="flex items-center gap-3 mt-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500/30 to-teal-500/30 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h2 className="text-lg font-bold text-emerald-300">סוכני QA ובדיקות ({qaAgents.length})</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {qaAgents.map(agent => (
                    <div
                      key={agent.id}
                      className="group rounded-xl bg-gradient-to-br from-white/[0.04] to-white/[0.02] border border-emerald-500/10 hover:border-emerald-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/5 cursor-pointer"
                      onClick={() => fetchAgentDetail(agent)}
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="text-3xl w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: agent.color + "22" }}>
                              {agent.avatar_emoji}
                            </div>
                            <div>
                              <h3 className="font-bold text-sm text-white group-hover:text-emerald-300 transition">{agent.agent_name_he}</h3>
                              <p className="text-xs text-gray-500">{agent.role}</p>
                            </div>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColor(agent.status)}`}>
                            {STATUS_LABELS[agent.status]}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-4">
                          {(agent.capabilities || []).slice(0, 4).map((c, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400/70 border border-emerald-500/10">
                              {CAP_LABELS[c] || c}
                            </span>
                          ))}
                          {(agent.capabilities || []).length > 4 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-500">
                              +{agent.capabilities.length - 4}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                            <div className="text-sm font-bold text-white">{agent.total_actions}</div>
                            <div className="text-[10px] text-gray-500">בדיקות</div>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                            <div className="text-sm font-bold text-white">{agent.total_resolved}</div>
                            <div className="text-[10px] text-gray-500">עברו</div>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                            <div className="text-sm font-bold" style={{ color: agent.satisfaction_score >= 4 ? "#10b981" : agent.satisfaction_score >= 3 ? "#f59e0b" : "#ef4444" }}>
                              {agent.satisfaction_score?.toFixed(1)}
                            </div>
                            <div className="text-[10px] text-gray-500">דירוג</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-white/5">
                          <span className="text-[10px] text-gray-500">{relativeTime(agent.last_active)}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={e => { e.stopPropagation(); openChat(agent); }}
                              className="p-1.5 rounded-lg hover:bg-white/10 transition text-gray-400 hover:text-emerald-400"
                              title="צ׳אט"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); toggleAgent(agent); }}
                              className={`p-1.5 rounded-lg hover:bg-white/10 transition ${agent.status === "active" ? "text-emerald-400" : "text-gray-500"}`}
                              title={agent.status === "active" ? "השהה" : "הפעל"}
                            >
                              {agent.status === "active" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Active Tasks Feed */}
            {activeTasks.length > 0 && (
              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  משימות פעילות בזמן אמת
                </h2>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {activeTasks.slice(0, 15).map(task => (
                    <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition">
                      <span className="text-xl">{task.avatar_emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white truncate">{task.title_he || task.title}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${taskStatusColor(task.status)}`}>
                            {TASK_STATUS_LABELS[task.status]}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">{task.agent_name_he} | {TASK_TYPE_LABELS[task.task_type] || task.task_type}</div>
                      </div>
                      <span className={`text-xs font-medium ${priorityColor(task.priority)}`}>{PRIORITY_LABELS[task.priority]}</span>
                      {task.status === "needs_approval" && (
                        <div className="flex gap-1">
                          <button onClick={() => approveTask(task)} className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"><Check className="w-3.5 h-3.5" /></button>
                          <button onClick={() => rejectTask(task)} className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ─── DETAIL VIEW ───────────────────────────────────────── */}
        {view === "detail" && selectedAgent && (
          <div className="space-y-6">
            {/* Agent Header */}
            <div className="rounded-xl bg-gradient-to-br from-white/[0.04] to-white/[0.02] border border-white/[0.06] p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-5xl w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: selectedAgent.color + "22" }}>
                    {selectedAgent.avatar_emoji}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{selectedAgent.agent_name_he}</h2>
                    <p className="text-sm text-gray-400">{selectedAgent.role} | {AUTONOMY_LABELS[selectedAgent.autonomy_level]}</p>
                    <p className="text-xs text-gray-500 mt-1 max-w-lg">{selectedAgent.description_he}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openChat(selectedAgent)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/30 text-violet-400 hover:bg-violet-500/30 transition text-sm">
                    <MessageSquare className="w-4 h-4" />
                    צ'אט
                  </button>
                  <button onClick={() => setShowTaskForm(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 transition text-sm">
                    <Play className="w-4 h-4" />
                    הפעל משימה
                  </button>
                  <button onClick={() => toggleAgent(selectedAgent)} className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition text-sm ${selectedAgent.status === "active" ? "bg-amber-500/20 border-amber-500/30 text-amber-400" : "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"}`}>
                    {selectedAgent.status === "active" ? <><Pause className="w-4 h-4" /> השהה</> : <><Play className="w-4 h-4" /> הפעל</>}
                  </button>
                </div>
              </div>

              {/* Capabilities */}
              <div className="mt-4 flex flex-wrap gap-2">
                {(selectedAgent.capabilities || []).map((c, i) => (
                  <span key={i} className="text-xs px-3 py-1 rounded-full border border-white/10 bg-white/5 text-gray-300">
                    {CAP_LABELS[c] || c}
                  </span>
                ))}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-5 gap-3 mt-4">
                {[
                  { label: "סה\"כ פעולות", value: selectedAgent.total_actions },
                  { label: "נפתרו", value: selectedAgent.total_resolved },
                  { label: "זמן תגובה", value: `${(selectedAgent.avg_response_time_ms / 1000).toFixed(1)}s` },
                  { label: "דירוג", value: selectedAgent.satisfaction_score?.toFixed(1) },
                  { label: "פעילות אחרונה", value: relativeTime(selectedAgent.last_active) },
                ].map((s, i) => (
                  <div key={i} className="text-center p-3 rounded-lg bg-white/[0.03]">
                    <div className="text-lg font-bold text-white">{s.value}</div>
                    <div className="text-[10px] text-gray-500">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Task Execution Form Modal */}
            {showTaskForm && (
              <div className="rounded-xl bg-white/[0.04] border border-violet-500/20 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-violet-400">הפעלת משימה חדשה</h3>
                  <button onClick={() => setShowTaskForm(false)} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">סוג משימה</label>
                    <select value={taskForm.task_type} onChange={e => setTaskForm(p => ({ ...p, task_type: e.target.value }))} className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                      {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">עדיפות</label>
                    <select value={taskForm.priority} onChange={e => setTaskForm(p => ({ ...p, priority: e.target.value }))} className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                      {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-400 mb-1 block">כותרת</label>
                    <input value={taskForm.title} onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))} className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-gray-600" placeholder="כותרת המשימה..." />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-400 mb-1 block">תיאור</label>
                    <textarea value={taskForm.description} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))} rows={2} className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-gray-600" placeholder="תיאור נוסף..." />
                  </div>
                </div>
                <button onClick={executeTask} className="px-6 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition">
                  הפעל משימה
                </button>
              </div>
            )}

            {/* Tasks History */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                היסטוריית משימות
              </h3>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {agentTasks.length === 0 && <p className="text-sm text-gray-500 text-center py-8">אין משימות עדיין</p>}
                {agentTasks.map(task => (
                  <div key={task.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${taskStatusColor(task.status)}`}>
                          {TASK_STATUS_LABELS[task.status]}
                        </span>
                        <span className="text-sm font-medium text-white">{task.title_he || task.title}</span>
                        <span className={`text-xs ${priorityColor(task.priority)}`}>{PRIORITY_LABELS[task.priority]}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {task.duration_ms && <span className="text-[10px] text-gray-500">{(task.duration_ms / 1000).toFixed(1)}s</span>}
                        <span className="text-[10px] text-gray-500">{formatDate(task.created_at)}</span>
                        {task.status === "needs_approval" && (
                          <div className="flex gap-1">
                            <button onClick={() => approveTask(task)} className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"><Check className="w-3 h-3" /></button>
                            <button onClick={() => rejectTask(task)} className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"><X className="w-3 h-3" /></button>
                          </div>
                        )}
                      </div>
                    </div>
                    {task.actions_taken && (task.actions_taken as any[]).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(task.actions_taken as any[]).map((a: any, i: number) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400">
                            {a.action}: {typeof a.result === "string" ? a.result.slice(0, 50) : ""}
                          </span>
                        ))}
                      </div>
                    )}
                    {task.output_data && (task.output_data as any).summary && (
                      <p className="text-xs text-gray-500 mt-1">{(task.output_data as any).summary}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Schedules */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-400" />
                  תזמונים
                </h3>
                <button onClick={() => setShowSchedForm(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-400 text-xs hover:bg-purple-500/30 transition">
                  <Plus className="w-3 h-3" />
                  תזמון חדש
                </button>
              </div>

              {showSchedForm && (
                <div className="mb-4 p-4 rounded-lg bg-white/[0.03] border border-purple-500/20 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">שם</label>
                      <input value={schedForm.schedule_name} onChange={e => setSchedForm(p => ({ ...p, schedule_name: e.target.value }))} className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white" placeholder="שם התזמון" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">סוג</label>
                      <select value={schedForm.schedule_type} onChange={e => setSchedForm(p => ({ ...p, schedule_type: e.target.value }))} className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                        {Object.entries(SCHED_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    {schedForm.schedule_type === "cron" && (
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Cron Expression</label>
                        <input value={schedForm.cron_expression} onChange={e => setSchedForm(p => ({ ...p, cron_expression: e.target.value }))} className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white font-mono" placeholder="0 8 * * 1-5" dir="ltr" />
                      </div>
                    )}
                    {schedForm.schedule_type === "interval" && (
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">מרווח (דקות)</label>
                        <input type="number" value={schedForm.interval_minutes} onChange={e => setSchedForm(p => ({ ...p, interval_minutes: +e.target.value }))} className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white" />
                      </div>
                    )}
                    {schedForm.schedule_type === "event_trigger" && (
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">אירוע</label>
                        <input value={schedForm.trigger_event} onChange={e => setSchedForm(p => ({ ...p, trigger_event: e.target.value }))} className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white" placeholder="ticket_created" dir="ltr" />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={createSchedule} className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm transition">שמור</button>
                    <button onClick={() => setShowSchedForm(false)} className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-sm transition">ביטול</button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {agentSchedules.length === 0 && <p className="text-sm text-gray-500 text-center py-4">אין תזמונים</p>}
                {agentSchedules.map(sched => (
                  <div key={sched.id} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${sched.enabled ? "bg-emerald-400" : "bg-gray-500"}`} />
                      <div>
                        <div className="text-sm font-medium text-white">{sched.schedule_name}</div>
                        <div className="text-xs text-gray-500 flex gap-3" dir="ltr">
                          <span>{SCHED_TYPE_LABELS[sched.schedule_type]}</span>
                          {sched.cron_expression && <span className="font-mono">{sched.cron_expression}</span>}
                          {sched.interval_minutes && <span>כל {sched.interval_minutes} דקות</span>}
                          {sched.trigger_event && <span>{sched.trigger_event}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>הפעלות: {sched.run_count}</span>
                      <span>אחרון: {formatDate(sched.last_run)}</span>
                      <button onClick={() => deleteSchedule(sched.id)} className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── CHAT VIEW ─────────────────────────────────────────── */}
        {view === "chat" && chatAgent && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden" style={{ height: "calc(100vh - 320px)" }}>
            {/* Chat Header */}
            <div className="flex items-center gap-3 p-4 border-b border-white/5 bg-white/[0.02]">
              <div className="text-3xl">{chatAgent.avatar_emoji}</div>
              <div>
                <h3 className="font-bold text-white">{chatAgent.agent_name_he}</h3>
                <p className="text-xs text-gray-500">{chatAgent.role} | {STATUS_LABELS[chatAgent.status]}</p>
              </div>
              <div className="mr-auto flex gap-2">
                <button onClick={() => fetchAgentDetail(chatAgent)} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 hover:bg-white/10 transition">
                  <Eye className="w-3.5 h-3.5 inline ml-1" />
                  פרטים
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ height: "calc(100% - 130px)" }}>
              {chatMessages.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-5xl mb-4">{chatAgent.avatar_emoji}</div>
                  <p className="text-lg font-medium mb-2">שלום! אני {chatAgent.agent_name_he}</p>
                  <p className="text-sm">איך אוכל לעזור לך היום?</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-4">
                    {["מה הסטטוס?", "יש בעיות?", "תן לי דוח"].map((q, i) => (
                      <button key={i} onClick={() => { setChatInput(q); }} className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white transition">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[70%] p-3 rounded-xl ${msg.role === "user" ? "bg-violet-500/20 border border-violet-500/20 text-violet-100" : "bg-white/[0.06] border border-white/[0.08] text-gray-200"}`}>
                    {msg.role === "agent" && (
                      <div className="flex items-center gap-1 mb-1 text-[10px] text-gray-500">
                        <span>{chatAgent.avatar_emoji}</span>
                        <span>{chatAgent.agent_name_he}</span>
                      </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <span className="text-[10px] text-gray-600 mt-1 block">{formatDate(msg.timestamp)}</span>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/5 bg-white/[0.02]">
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder={`שאל את ${chatAgent.agent_name_he}...`}
                  className="flex-1 p-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-violet-500/50"
                  disabled={chatSending}
                />
                <button onClick={sendChat} disabled={chatSending || !chatInput.trim()} className="px-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── APPROVALS VIEW ────────────────────────────────────── */}
        {view === "approvals" && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Shield className="w-6 h-6 text-amber-400" />
              תור אישורים
            </h2>
            {pendingApprovals.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500/50" />
                <p className="text-lg">אין משימות ממתינות לאישור</p>
              </div>
            )}
            <div className="space-y-3">
              {pendingApprovals.map(task => (
                <div key={task.id} className="p-4 rounded-xl bg-white/[0.02] border border-amber-500/10 hover:border-amber-500/20 transition">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{task.avatar_emoji}</span>
                      <div>
                        <h4 className="font-medium text-white">{task.title_he || task.title}</h4>
                        <p className="text-xs text-gray-500">{task.agent_name_he} | {TASK_TYPE_LABELS[task.task_type]} | {PRIORITY_LABELS[task.priority]}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => approveTask(task)} className="flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition text-sm">
                        <Check className="w-4 h-4" />
                        אשר
                      </button>
                      <button onClick={() => rejectTask(task)} className="flex items-center gap-1 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition text-sm">
                        <X className="w-4 h-4" />
                        דחה
                      </button>
                    </div>
                  </div>
                  {task.actions_taken && (task.actions_taken as any[]).length > 0 && (
                    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
                      <p className="text-xs text-gray-400 mb-2 font-medium">פעולות שבוצעו:</p>
                      {(task.actions_taken as any[]).map((a: any, i: number) => (
                        <div key={i} className="text-xs text-gray-500 flex gap-2 py-0.5">
                          <span className="text-violet-400">{a.action}</span>
                          <span>{a.result}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {task.output_data && (task.output_data as any).recommendations && (
                    <div className="mt-2 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                      <p className="text-xs text-gray-400 mb-1 font-medium">המלצות:</p>
                      {((task.output_data as any).recommendations as string[]).map((r, i) => (
                        <p key={i} className="text-xs text-gray-500">- {r}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── TIMELINE VIEW ─────────────────────────────────────── */}
        {view === "timeline" && (
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-6">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Activity className="w-6 h-6 text-cyan-400" />
              ציר זמן פעילות
            </h2>
            <div className="relative">
              <div className="absolute right-6 top-0 bottom-0 w-px bg-white/10" />
              <div className="space-y-4">
                {activeTasks.concat(agentTasks).slice(0, 30).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((task, i) => (
                  <div key={`${task.id}-${i}`} className="relative flex gap-4 pr-10">
                    <div className="absolute right-4 top-2 w-4 h-4 rounded-full border-2 border-white/20 bg-[#0f1629]" style={{ borderColor: task.status === "completed" ? "#10b981" : task.status === "running" ? "#3b82f6" : task.status === "needs_approval" ? "#f59e0b" : "#6b7280" }} />
                    <div className="flex-1 p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{task.avatar_emoji || "🤖"}</span>
                        <span className="text-sm font-medium text-white">{task.title_he || task.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${taskStatusColor(task.status)}`}>{TASK_STATUS_LABELS[task.status]}</span>
                        <span className={`text-xs mr-auto ${priorityColor(task.priority)}`}>{PRIORITY_LABELS[task.priority]}</span>
                      </div>
                      <div className="text-xs text-gray-500 flex gap-3">
                        <span>{task.agent_name_he || ""}</span>
                        <span>{TASK_TYPE_LABELS[task.task_type] || task.task_type}</span>
                        {task.duration_ms && <span>{(task.duration_ms / 1000).toFixed(1)}s</span>}
                        <span className="mr-auto">{formatDate(task.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {activeTasks.length === 0 && agentTasks.length === 0 && (
                  <p className="text-center text-gray-500 py-12">אין פעילות להצגה. הפעל סוכן או תזמון כדי לראות תוצאות.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
