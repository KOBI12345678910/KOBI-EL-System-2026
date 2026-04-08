import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Bot, AlertTriangle, ShieldCheck, Clock, CheckCircle2, XCircle,
  PlayCircle, PauseCircle, Zap, Activity, Search, RefreshCw, Settings,
  TrendingUp, Users, DollarSign, Package, Factory, Truck, FileText,
  BarChart3, Gavel, Wrench, HeartPulse, Star, ArrowUpRight, ArrowDownRight,
  Bell, ThumbsUp, ThumbsDown, Eye, Calendar, Target, Sparkles, Cpu,
  CircleDot, Timer, Shield, Megaphone, ClipboardCheck, AlertCircle,
  ChevronLeft, ChevronRight, LayoutDashboard
} from "lucide-react";

// ──────────────── KPI DATA ────────────────
const FALLBACK_KPIS = [
  { label: "סוכנים פעילים", value: "12/15", delta: "3 מושהים", icon: Bot, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "הרצות כושלות היום", value: "2", delta: "מתוך 187", icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "התראות פתוחות", value: "8", delta: "3 קריטיות", icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10" },
  { label: "ממתינים לאישור", value: "5", delta: "2 דחופים", icon: ClipboardCheck, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "המלצות קריטיות", value: "3", delta: "טיפול מיידי", icon: Megaphone, color: "text-violet-400", bg: "bg-violet-500/10" },
  { label: "ציון AI יומי", value: "87/100", delta: "+4 מאתמול", icon: Brain, color: "text-cyan-400", bg: "bg-cyan-500/10" },
];
// ──────────────── 15 BASH44 AGENTS ────────────────
const FALLBACK_AGENTS = [
  { name: "תזמורן מנכ\"ל", code: "ceo_orchestrator", status: "active" as const, mode: "realtime" as const, model: "BASH44-Ultra", lastRun: "לפני 2 דקות", runsToday: 48, successRate: 97.9, confidence: 94, priority: "critical" as const, icon: Brain },
  { name: "מודיעין לידים", code: "lead_intelligence", status: "active" as const, mode: "event_driven" as const, model: "BASH44-Pro", lastRun: "לפני 5 דקות", runsToday: 34, successRate: 95.6, confidence: 91, priority: "high" as const, icon: Target },
  { name: "המרת מכירות", code: "sales_conversion", status: "active" as const, mode: "realtime" as const, model: "BASH44-Pro", lastRun: "לפני 1 דקות", runsToday: 62, successRate: 93.5, confidence: 88, priority: "critical" as const, icon: TrendingUp },
  { name: "תמחור ומרווח", code: "pricing_margin", status: "active" as const, mode: "scheduled" as const, model: "BASH44-Core", lastRun: "לפני 15 דקות", runsToday: 18, successRate: 98.2, confidence: 92, priority: "high" as const, icon: DollarSign },
  { name: "בקרת פרויקטים", code: "project_control", status: "active" as const, mode: "event_driven" as const, model: "BASH44-Pro", lastRun: "לפני 8 דקות", runsToday: 27, successRate: 96.3, confidence: 90, priority: "high" as const, icon: BarChart3 },
  { name: "אופטימיזציית רכש", code: "procurement_optimizer", status: "paused" as const, mode: "scheduled" as const, model: "BASH44-Core", lastRun: "לפני 45 דקות", runsToday: 12, successRate: 94.1, confidence: 87, priority: "medium" as const, icon: Package },
  { name: "סיכוני מלאי", code: "inventory_risk", status: "active" as const, mode: "event_driven" as const, model: "BASH44-Pro", lastRun: "לפני 3 דקות", runsToday: 41, successRate: 96.8, confidence: 93, priority: "high" as const, icon: AlertCircle },
  { name: "תזמון ייצור", code: "production_scheduler", status: "active" as const, mode: "realtime" as const, model: "BASH44-Ultra", lastRun: "לפני 1 דקות", runsToday: 55, successRate: 97.1, confidence: 95, priority: "critical" as const, icon: Factory },
  { name: "תיאום התקנות", code: "installation_coordinator", status: "active" as const, mode: "event_driven" as const, model: "BASH44-Core", lastRun: "לפני 12 דקות", runsToday: 19, successRate: 92.4, confidence: 86, priority: "medium" as const, icon: Truck },
  { name: "בקרה פיננסית", code: "finance_control", status: "active" as const, mode: "scheduled" as const, model: "BASH44-Pro", lastRun: "לפני 10 דקות", runsToday: 22, successRate: 99.1, confidence: 96, priority: "critical" as const, icon: ShieldCheck },
  { name: "גביה ותשלומים", code: "collections", status: "paused" as const, mode: "scheduled" as const, model: "BASH44-Core", lastRun: "לפני 1 שעה", runsToday: 8, successRate: 91.7, confidence: 84, priority: "medium" as const, icon: Gavel },
  { name: "איכות שירות", code: "service_quality", status: "active" as const, mode: "event_driven" as const, model: "BASH44-Pro", lastRun: "לפני 7 דקות", runsToday: 31, successRate: 95.2, confidence: 89, priority: "high" as const, icon: HeartPulse },
  { name: "מוח מסמכים", code: "document_brain", status: "active" as const, mode: "event_driven" as const, model: "BASH44-Core", lastRun: "לפני 4 דקות", runsToday: 73, successRate: 98.6, confidence: 91, priority: "medium" as const, icon: FileText },
  { name: "דו\"חות הנהלה", code: "executive_reporting", status: "error" as const, mode: "scheduled" as const, model: "BASH44-Ultra", lastRun: "לפני 25 דקות", runsToday: 6, successRate: 83.3, confidence: 78, priority: "high" as const, icon: LayoutDashboard },
  { name: "שער אישורים", code: "approval_gate", status: "active" as const, mode: "realtime" as const, model: "BASH44-Pro", lastRun: "לפני 30 שניות", runsToday: 44, successRate: 100, confidence: 97, priority: "critical" as const, icon: CheckCircle2 },
];
// ──────────────── RECENT RUNS ────────────────
const FALLBACK_RECENT_RUNS = [
  { agent: "תזמורן מנכ\"ל", entityType: "סיכום יומי", entityId: "DS-20260408", trigger: "scheduled", status: "success" as const, confidence: 96, duration: "4.2s", timestamp: "08:02:14" },
  { agent: "המרת מכירות", entityType: "ליד", entityId: "LD-4821", trigger: "event", status: "success" as const, confidence: 91, duration: "1.8s", timestamp: "08:01:47" },
  { agent: "תזמון ייצור", entityType: "הזמנת עבודה", entityId: "WO-1587", trigger: "realtime", status: "success" as const, confidence: 94, duration: "2.3s", timestamp: "08:01:32" },
  { agent: "סיכוני מלאי", entityType: "פריט מלאי", entityId: "INV-3392", trigger: "event", status: "warning" as const, confidence: 72, duration: "3.1s", timestamp: "08:00:58" },
  { agent: "בקרה פיננסית", entityType: "חשבונית", entityId: "FI-9981", trigger: "scheduled", status: "success" as const, confidence: 98, duration: "1.2s", timestamp: "08:00:41" },
  { agent: "מודיעין לידים", entityType: "ליד", entityId: "LD-4820", trigger: "event", status: "success" as const, confidence: 88, duration: "2.7s", timestamp: "07:59:22" },
  { agent: "שער אישורים", entityType: "בקשת אישור", entityId: "AP-334", trigger: "realtime", status: "success" as const, confidence: 97, duration: "0.8s", timestamp: "07:58:55" },
  { agent: "דו\"חות הנהלה", entityType: "דו\"ח שבועי", entityId: "RPT-201", trigger: "scheduled", status: "critical" as const, confidence: 45, duration: "12.4s", timestamp: "07:57:10" },
  { agent: "מוח מסמכים", entityType: "הצעת מחיר", entityId: "QT-2291", trigger: "event", status: "success" as const, confidence: 93, duration: "1.5s", timestamp: "07:56:48" },
  { agent: "איכות שירות", entityType: "תלונת לקוח", entityId: "CS-1104", trigger: "event", status: "warning" as const, confidence: 69, duration: "2.9s", timestamp: "07:55:30" },
  { agent: "תמחור ומרווח", entityType: "הצעת מחיר", entityId: "QT-2290", trigger: "scheduled", status: "success" as const, confidence: 90, duration: "3.6s", timestamp: "07:54:12" },
  { agent: "אופטימיזציית רכש", entityType: "הזמנת רכש", entityId: "PO-6612", trigger: "scheduled", status: "insufficient_data" as const, confidence: 38, duration: "5.1s", timestamp: "07:52:40" },
  { agent: "בקרת פרויקטים", entityType: "פרויקט", entityId: "PRJ-445", trigger: "event", status: "success" as const, confidence: 92, duration: "2.1s", timestamp: "07:51:08" },
  { agent: "תיאום התקנות", entityType: "הזמנת התקנה", entityId: "INST-782", trigger: "event", status: "success" as const, confidence: 85, duration: "1.9s", timestamp: "07:49:33" },
  { agent: "גביה ותשלומים", entityType: "חוב לקוח", entityId: "DB-3310", trigger: "scheduled", status: "warning" as const, confidence: 64, duration: "4.8s", timestamp: "07:47:15" },
];
// ──────────────── ALERTS ────────────────
const FALLBACK_ALERTS = [
  { id: 1, severity: "critical" as const, agent: "דו\"חות הנהלה", entity: "RPT-201", message: "כשל בהפקת דו\"ח שבועי - timeout מול מסד נתונים. ניסיון חוזר נכשל.", role: "מנהל מערכות", time: "לפני 1 שעה" },
  { id: 2, severity: "critical" as const, agent: "סיכוני מלאי", entity: "INV-3392", message: "מלאי אלומיניום 6063-T5 ירד מתחת לסף קריטי. מספיק ל-2 ימי ייצור בלבד.", role: "מנהל רכש", time: "לפני 1 שעה" },
  { id: 3, severity: "critical" as const, agent: "המרת מכירות", entity: "DEAL-892", message: "עסקת מפתח ₪1.2M בסיכון - לקוח לא הגיב 5 ימים. סיכוי סגירה ירד ל-35%.", role: "מנהל מכירות", time: "לפני 2 שעות" },
  { id: 4, severity: "high" as const, agent: "בקרה פיננסית", entity: "FI-CL-447", message: "לקוח 'אלון קבוצה' חרג מ-90 יום תשלום. סה\"כ חוב: ₪485,000.", role: "מנהל כספים", time: "לפני 3 שעות" },
  { id: 5, severity: "high" as const, agent: "תזמון ייצור", entity: "WO-1582", message: "הזמנת עבודה WO-1582 מאחרת ב-2 ימים. צוואר בקבוק בקו חיתוך CNC.", role: "מנהל ייצור", time: "לפני 3 שעות" },
  { id: 6, severity: "high" as const, agent: "איכות שירות", entity: "CS-1104", message: "3 תלונות חוזרות מאותו לקוח על פגמים בזיגוג. דורש בדיקת שורש.", role: "מנהל איכות", time: "לפני 4 שעות" },
  { id: 7, severity: "medium" as const, agent: "מודיעין לידים", entity: "LD-4815", message: "ליד ממכרז ממשלתי - תאריך הגשה בעוד 3 ימים. טרם הוכנה הצעה.", role: "מנהל מכירות", time: "לפני 5 שעות" },
  { id: 8, severity: "medium" as const, agent: "תיאום התקנות", entity: "INST-779", message: "צוות התקנה פרויקט נתניה - חסר טכנאי מוסמך זכוכית. תאריך יעד: מחר.", role: "מנהל תפעול", time: "לפני 5 שעות" },
  { id: 9, severity: "medium" as const, agent: "תמחור ומרווח", entity: "QT-2285", message: "הצעת מחיר לפרויקט גדול עם מרווח 8% בלבד. מינימום מומלץ: 15%.", role: "סמנכ\"ל כספים", time: "לפני 6 שעות" },
  { id: 10, severity: "low" as const, agent: "מוח מסמכים", entity: "DOC-SYS", message: "זוהו 12 מסמכים כפולים במערכת. המלצה לניקוי ומיזוג.", role: "מנהל מערכות", time: "לפני 7 שעות" },
];
// ──────────────── APPROVAL QUEUE ────────────────
const FALLBACK_APPROVALS = [
  { id: 1, recommendation: "הנחה 12% ללקוח 'מגדלי הים' על הזמנה של ₪890K - עמידה ביעד רבעוני", agent: "תמחור ומרווח", requestedRole: "סמנכ\"ל כספים", urgency: "high" as const, entity: "QT-2288", confidence: 91 },
  { id: 2, recommendation: "הזמנת חירום 5 טון אלומיניום 6063-T5 מספק חלופי במחיר +8%", agent: "אופטימיזציית רכש", requestedRole: "מנהל רכש", urgency: "critical" as const, entity: "PO-6615", confidence: 88 },
  { id: 3, recommendation: "הקצאת שעות נוספות לקו CNC - 3 משמרות סופ\"ש לסגירת פער", agent: "תזמון ייצור", requestedRole: "מנהל ייצור", urgency: "high" as const, entity: "WO-1582", confidence: 93 },
  { id: 4, recommendation: "שליחת מכתב התראה רשמי ללקוח 'אלון קבוצה' - חוב 90+ יום", agent: "גביה ותשלומים", requestedRole: "מנהל כספים", urgency: "medium" as const, entity: "FI-CL-447", confidence: 85 },
  { id: 5, recommendation: "הגדלת צוות מכירות דרום ב-2 נציגים - זוהה פער כיסוי אזורי", agent: "המרת מכירות", requestedRole: "מנכ\"ל", urgency: "medium" as const, entity: "SALES-SOUTH", confidence: 79 },
];
// ──────────────── DAILY SUMMARY ────────────────
const dailySummary = {
  date: "08/04/2026",
  overallScore: 87,
  topPriorities: [
    { text: "טיפול מיידי במלאי אלומיניום 6063-T5 - סף קריטי ל-2 ימים בלבד", urgency: "critical" as const },
    { text: "מעקב עסקת מפתח DEAL-892 (₪1.2M) - אבדן סיכוי מהיר", urgency: "critical" as const },
    { text: "תיקון מערכת דו\"חות הנהלה - כשל חוזר מול מסד נתונים", urgency: "high" as const },
    { text: "הכנת הצעה למכרז ממשלתי - תאריך הגשה בעוד 3 ימים", urgency: "high" as const },
    { text: "אישור הזמנת חירום אלומיניום מספק חלופי", urgency: "high" as const },
  ],
  financialWatchlist: [
    { metric: "הכנסות יומיות", value: "₪412K", target: "₪380K", status: "above" as const },
    { metric: "חוב לקוחות פתוח", value: "₪2.8M", target: "₪2.2M", status: "below" as const },
    { metric: "מרווח ממוצע", value: "22.4%", target: "20%", status: "above" as const },
    { metric: "תזרים שבועי", value: "₪-180K", target: "₪0+", status: "below" as const },
  ],
  operationalWatchlist: [
    { metric: "OEE ממוצע", value: "82.3%", target: "85%", status: "below" as const },
    { metric: "הזמנות פתוחות", value: "47", target: "< 40", status: "below" as const },
    { metric: "זמן אספקה ממוצע", value: "3.2 ימים", target: "3.5 ימים", status: "above" as const },
    { metric: "שיעור תקינות קווים", value: "94.1%", target: "95%", status: "below" as const },
  ],
  projectWatchlist: [
    { project: "מגדלי הים - שלב ב'", progress: 72, dueDate: "15/05/2026", status: "on_track" as const, risk: "low" as const },
    { project: "בית ספר נתניה", progress: 45, dueDate: "01/05/2026", status: "at_risk" as const, risk: "high" as const },
    { project: "קניון הנגב - חזיתות", progress: 88, dueDate: "20/04/2026", status: "on_track" as const, risk: "low" as const },
    { project: "מפעל חיפה - הרחבה", progress: 31, dueDate: "30/06/2026", status: "on_track" as const, risk: "medium" as const },
  ],
  decisionsNeeded: [
    { decision: "אישור הזמנת חירום אלומיניום מספק חלופי (+8% מחיר)", owner: "מנהל רכש", deadline: "היום" },
    { decision: "הקצאת שעות נוספות לקו CNC לסגירת פער ייצור", owner: "מנהל ייצור", deadline: "היום" },
    { decision: "אסטרטגיית מעקב עסקת מפתח ₪1.2M - אלון קבוצה", owner: "מנהל מכירות", deadline: "היום" },
    { decision: "אישור הנחה 12% להזמנה ₪890K - מגדלי הים", owner: "סמנכ\"ל כספים", deadline: "מחר" },
    { decision: "גיוס 2 נציגי מכירות לאזור דרום", owner: "מנכ\"ל", deadline: "השבוע" },
  ],
};
// ──────────────── HELPERS ────────────────
const statusConfig = {
  active: { label: "פעיל", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  paused: { label: "מושהה", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  error: { label: "שגיאה", color: "bg-red-500/20 text-red-400 border-red-500/30" },
};
const modeConfig = {
  realtime: { label: "זמן-אמת", color: "bg-cyan-500/20 text-cyan-300" },
  scheduled: { label: "מתוזמן", color: "bg-slate-500/20 text-slate-300" },
  event_driven: { label: "מונחה-אירועים", color: "bg-violet-500/20 text-violet-300" },
};
const priorityConfig = {
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  medium: { label: "בינוני", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};
const runStatusConfig = {
  success: { label: "הצלחה", color: "bg-emerald-500/20 text-emerald-400", icon: CheckCircle2 },
  warning: { label: "אזהרה", color: "bg-amber-500/20 text-amber-400", icon: AlertTriangle },
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400", icon: XCircle },
  insufficient_data: { label: "חסר מידע", color: "bg-slate-500/20 text-slate-400", icon: CircleDot },
};
const severityConfig = {
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400 border-red-500/40", dot: "bg-red-500" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400 border-orange-500/40", dot: "bg-orange-500" },
  medium: { label: "בינוני", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40", dot: "bg-yellow-500" },
  low: { label: "נמוך", color: "bg-blue-500/20 text-blue-400 border-blue-500/40", dot: "bg-blue-500" },
};
const urgencyConfig = {
  critical: { label: "קריטי", color: "text-red-400" },
  high: { label: "דחוף", color: "text-orange-400" },
  medium: { label: "רגיל", color: "text-yellow-400" },
};

// ──────────────── COMPONENT ────────────────
export default function Bash44ControlCenter() {

  const { data: apiData } = useQuery({
    queryKey: ["bash44_control_center"],
    queryFn: () => authFetch("/api/ai/bash44-control-center").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const agents = apiData?.agents ?? FALLBACK_AGENTS;
  const recentRuns = apiData?.recentRuns ?? FALLBACK_RECENT_RUNS;
  const alerts = apiData?.alerts ?? FALLBACK_ALERTS;
  const approvals = apiData?.approvals ?? FALLBACK_APPROVALS;
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("agents");
  const filteredAgents = agents.filter(
    (a) => a.name.includes(searchTerm) || a.code.includes(searchTerm)
  );
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#0d1325] to-[#0a0e1a] text-white p-6 space-y-6">
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Cpu className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-l from-cyan-400 to-violet-400 bg-clip-text text-transparent">
              BASH44 - מרכז שליטה AI
            </h1>
            <p className="text-sm text-slate-400">מערכת הפעלה AI | טכנו-כל עוזי | {dailySummary.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">מערכת פעילה</span>
          </div>
          <Button variant="outline" size="sm" className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700">
            <RefreshCw className="w-4 h-4 ml-1" />
            רענון
          </Button>
          <Button variant="outline" size="sm" className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700">
            <Settings className="w-4 h-4 ml-1" />
            הגדרות
          </Button>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-slate-900/60 border-slate-700/50 hover:border-slate-600/60 transition-all">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
              </div>
              <div className="text-2xl font-bold text-white">{kpi.value}</div>
              <div className="text-xs text-slate-400 mt-1">{kpi.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{kpi.delta}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── MAIN TABS ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-900/80 border border-slate-700/50 p-1 flex-wrap">
          <TabsTrigger value="agents" className="data-[state=active]:bg-cyan-600/20 data-[state=active]:text-cyan-400 text-slate-400 text-sm">
            <Bot className="w-4 h-4 ml-1" />
            סוכנים פעילים
          </TabsTrigger>
          <TabsTrigger value="runs" className="data-[state=active]:bg-violet-600/20 data-[state=active]:text-violet-400 text-slate-400 text-sm">
            <Activity className="w-4 h-4 ml-1" />
            הרצות אחרונות
          </TabsTrigger>
          <TabsTrigger value="alerts" className="data-[state=active]:bg-orange-600/20 data-[state=active]:text-orange-400 text-slate-400 text-sm">
            <Bell className="w-4 h-4 ml-1" />
            התראות AI
            <Badge className="mr-1 bg-red-500/30 text-red-400 border-red-500/40 text-[10px] px-1.5">8</Badge>
          </TabsTrigger>
          <TabsTrigger value="approvals" className="data-[state=active]:bg-amber-600/20 data-[state=active]:text-amber-400 text-slate-400 text-sm">
            <ClipboardCheck className="w-4 h-4 ml-1" />
            תור אישורים
            <Badge className="mr-1 bg-amber-500/30 text-amber-400 border-amber-500/40 text-[10px] px-1.5">5</Badge>
          </TabsTrigger>
          <TabsTrigger value="summary" className="data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-400 text-slate-400 text-sm">
            <Sparkles className="w-4 h-4 ml-1" />
            סיכום יומי
          </TabsTrigger>
        </TabsList>

        {/* ──────── TAB 1: AGENTS ──────── */}
        <TabsContent value="agents" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="חיפוש סוכן לפי שם או קוד..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10 bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">12 פעילים</Badge>
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">2 מושהים</Badge>
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">1 שגיאה</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => {
              const st = statusConfig[agent.status];
              const md = modeConfig[agent.mode];
              const pr = priorityConfig[agent.priority];
              return (
                <Card key={agent.code} className="bg-slate-900/60 border-slate-700/50 hover:border-slate-600/60 transition-all group">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${agent.status === "active" ? "bg-cyan-500/10" : agent.status === "error" ? "bg-red-500/10" : "bg-amber-500/10"}`}>
                          <agent.icon className={`w-5 h-5 ${agent.status === "active" ? "text-cyan-400" : agent.status === "error" ? "text-red-400" : "text-amber-400"}`} />
                        </div>
                        <div>
                          <div className="font-semibold text-white text-sm">{agent.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{agent.code}</div>
                        </div>
                      </div>
                      <Badge className={`text-[10px] border ${pr.color}`}>{pr.label}</Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`text-[10px] border ${st.color}`}>
                        {agent.status === "active" ? <PlayCircle className="w-3 h-3 ml-0.5" /> : agent.status === "paused" ? <PauseCircle className="w-3 h-3 ml-0.5" /> : <XCircle className="w-3 h-3 ml-0.5" />}
                        {st.label}
                      </Badge>
                      <Badge className={`text-[10px] ${md.color}`}>{md.label}</Badge>
                      <span className="text-[10px] text-slate-500">{agent.model}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1 text-slate-400">
                        <Clock className="w-3 h-3" />
                        <span>{agent.lastRun}</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400">
                        <Zap className="w-3 h-3" />
                        <span>{agent.runsToday} הרצות</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">הצלחה</span>
                        <span className={agent.successRate >= 95 ? "text-emerald-400" : agent.successRate >= 85 ? "text-amber-400" : "text-red-400"}>
                          {agent.successRate}%
                        </span>
                      </div>
                      <Progress value={agent.successRate} className="h-1.5 bg-slate-800" />
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">ביטחון ממוצע</span>
                        <span className="text-slate-300">{agent.confidence}%</span>
                      </div>
                      <Progress value={agent.confidence} className="h-1.5 bg-slate-800" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ──────── TAB 2: RECENT RUNS ──────── */}
        <TabsContent value="runs" className="space-y-4">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-violet-400" />
                  הרצות אחרונות - 15 אחרונות
                </CardTitle>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Timer className="w-4 h-4" />
                  187 הרצות היום | 98.9% זמינות
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 text-slate-400 text-xs">
                      <th className="text-right px-4 py-3 font-medium">סוכן</th>
                      <th className="text-right px-4 py-3 font-medium">סוג ישות</th>
                      <th className="text-right px-4 py-3 font-medium">מזהה</th>
                      <th className="text-right px-4 py-3 font-medium">טריגר</th>
                      <th className="text-right px-4 py-3 font-medium">סטטוס</th>
                      <th className="text-right px-4 py-3 font-medium">ביטחון</th>
                      <th className="text-right px-4 py-3 font-medium">משך</th>
                      <th className="text-right px-4 py-3 font-medium">זמן</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((run, idx) => {
                      const rs = runStatusConfig[run.status];
                      const RunIcon = rs.icon;
                      return (
                        <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3 font-medium text-white">{run.agent}</td>
                          <td className="px-4 py-3 text-slate-300">{run.entityType}</td>
                          <td className="px-4 py-3 font-mono text-xs text-cyan-400">{run.entityId}</td>
                          <td className="px-4 py-3">
                            <Badge className="text-[10px] bg-slate-700/50 text-slate-300">
                              {run.trigger === "realtime" ? "זמן-אמת" : run.trigger === "scheduled" ? "מתוזמן" : "אירוע"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={`text-[10px] ${rs.color} flex items-center gap-1 w-fit`}>
                              <RunIcon className="w-3 h-3" />
                              {rs.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${run.confidence >= 85 ? "text-emerald-400" : run.confidence >= 60 ? "text-amber-400" : "text-red-400"}`}>
                                {run.confidence}%
                              </span>
                              <div className="w-12 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${run.confidence >= 85 ? "bg-emerald-500" : run.confidence >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                                  style={{ width: `${run.confidence}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{run.duration}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs font-mono">{run.timestamp}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──────── TAB 3: ALERTS ──────── */}
        <TabsContent value="alerts" className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">3 קריטיות</Badge>
            <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">3 גבוהות</Badge>
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">3 בינוניות</Badge>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">1 נמוכה</Badge>
          </div>
          <div className="space-y-3">
            {alerts.map((alert) => {
              const sv = severityConfig[alert.severity];
              return (
                <Card key={alert.id} className={`bg-slate-900/60 border-slate-700/50 hover:border-slate-600/60 transition-all ${alert.severity === "critical" ? "border-r-2 border-r-red-500" : alert.severity === "high" ? "border-r-2 border-r-orange-500" : ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${sv.dot} flex-shrink-0`} />
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`text-[10px] border ${sv.color}`}>{sv.label}</Badge>
                            <span className="text-xs text-cyan-400 font-medium">{alert.agent}</span>
                            <span className="text-xs text-slate-500 font-mono">{alert.entity}</span>
                          </div>
                          <p className="text-sm text-slate-200 leading-relaxed">{alert.message}</p>
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{alert.role}</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{alert.time}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button variant="outline" size="sm" className="text-xs border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700 h-8">
                          <Eye className="w-3 h-3 ml-1" />
                          פרטים
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs border-emerald-700 bg-emerald-800/20 text-emerald-400 hover:bg-emerald-700/30 h-8">
                          <CheckCircle2 className="w-3 h-3 ml-1" />
                          טופל
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ──────── TAB 4: APPROVAL QUEUE ──────── */}
        <TabsContent value="approvals" className="space-y-4">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-amber-400" />
                תור אישורים - {approvals.length} ממתינים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {approvals.map((item) => {
                const uc = urgencyConfig[item.urgency];
                return (
                  <div key={item.id} className={`p-4 rounded-xl border transition-all hover:border-slate-600/60 ${item.urgency === "critical" ? "bg-red-950/20 border-red-500/30" : item.urgency === "high" ? "bg-amber-950/10 border-amber-500/20" : "bg-slate-800/30 border-slate-700/40"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`text-[10px] border ${item.urgency === "critical" ? "bg-red-500/20 text-red-400 border-red-500/30" : item.urgency === "high" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" : "bg-blue-500/20 text-blue-400 border-blue-500/30"}`}>
                            {uc.label}
                          </Badge>
                          <span className="text-xs text-cyan-400 font-medium">{item.agent}</span>
                          <span className="text-xs text-slate-500 font-mono">{item.entity}</span>
                        </div>
                        <p className="text-sm text-slate-200 leading-relaxed">{item.recommendation}</p>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />נדרש: {item.requestedRole}</span>
                          <span className="flex items-center gap-1"><Star className="w-3 h-3" />ביטחון: {item.confidence}%</span>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button size="sm" className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white h-9 px-4">
                          <ThumbsUp className="w-3.5 h-3.5 ml-1" />
                          אישור
                        </Button>
                        <Button variant="outline" size="sm" className="text-xs border-red-700 bg-red-800/20 text-red-400 hover:bg-red-700/30 h-9 px-4">
                          <ThumbsDown className="w-3.5 h-3.5 ml-1" />
                          דחייה
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──────── TAB 5: DAILY SUMMARY ──────── */}
        <TabsContent value="summary" className="space-y-4">
          {/* Overall Score */}
          <Card className="bg-gradient-to-l from-cyan-950/40 via-slate-900/60 to-violet-950/40 border-slate-700/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">{dailySummary.overallScore}</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">סיכום AI יומי - {dailySummary.date}</h3>
                    <p className="text-sm text-slate-400">ציון בריאות כללי של המערכת | נוצר אוטומטית ע\"י BASH44</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                  <span className="text-lg font-bold text-emerald-400">+4</span>
                  <span className="text-xs text-slate-400">מאתמול</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Priorities */}
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <Target className="w-5 h-5 text-red-400" />
                  עדיפויות עליונות
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dailySummary.topPriorities.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-800/30 border border-slate-700/30">
                    <span className={`text-xs font-bold mt-0.5 ${p.urgency === "critical" ? "text-red-400" : "text-orange-400"}`}>
                      {i + 1}.
                    </span>
                    <span className="text-sm text-slate-200 flex-1">{p.text}</span>
                    <Badge className={`text-[10px] border flex-shrink-0 ${p.urgency === "critical" ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-orange-500/20 text-orange-400 border-orange-500/30"}`}>
                      {p.urgency === "critical" ? "קריטי" : "גבוה"}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Decisions Needed */}
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <Gavel className="w-5 h-5 text-amber-400" />
                  החלטות נדרשות היום
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dailySummary.decisionsNeeded.map((d, i) => (
                  <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-800/30 border border-slate-700/30">
                    <Gavel className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-slate-200">{d.decision}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span>{d.owner}</span>
                        <Badge className={`text-[10px] ${d.deadline === "היום" ? "bg-red-500/20 text-red-400" : d.deadline === "מחר" ? "bg-orange-500/20 text-orange-400" : "bg-blue-500/20 text-blue-400"}`}>
                          {d.deadline}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Financial Watchlist */}
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                  מעקב פיננסי
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dailySummary.financialWatchlist.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/30 border border-slate-700/30">
                    <span className="text-sm text-slate-300">{f.metric}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white">{f.value}</span>
                      <span className="text-xs text-slate-500">/ {f.target}</span>
                      {f.status === "above" ? (
                        <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Operational Watchlist */}
            <Card className="bg-slate-900/60 border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <Factory className="w-5 h-5 text-cyan-400" />
                  מעקב תפעולי
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dailySummary.operationalWatchlist.map((o, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/30 border border-slate-700/30">
                    <span className="text-sm text-slate-300">{o.metric}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white">{o.value}</span>
                      <span className="text-xs text-slate-500">/ {o.target}</span>
                      {o.status === "above" ? (
                        <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Project Watchlist - Full Width */}
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-violet-400" />
                מעקב פרויקטים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {dailySummary.projectWatchlist.map((proj, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-800/30 border border-slate-700/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">{proj.project}</span>
                      <Badge className={`text-[10px] border ${proj.risk === "high" ? "bg-red-500/20 text-red-400 border-red-500/30" : proj.risk === "medium" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"}`}>
                        {proj.risk === "high" ? "סיכון גבוה" : proj.risk === "medium" ? "סיכון בינוני" : "תקין"}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">התקדמות</span>
                        <span className="text-white font-medium">{proj.progress}%</span>
                      </div>
                      <Progress value={proj.progress} className="h-2 bg-slate-800" />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{proj.dueDate}</span>
                      <Badge className={`text-[10px] ${proj.status === "on_track" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                        {proj.status === "on_track" ? "במסלול" : "בסיכון"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}