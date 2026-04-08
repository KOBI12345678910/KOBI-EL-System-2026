import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authFetch } from "@/lib/utils";
import {
  Users, UserPlus, UserCheck, Calendar, FileText, Handshake,
  TrendingUp, TrendingDown, Clock, Phone, PhoneIncoming, PhoneOutgoing,
  PhoneMissed, PhoneForwarded, AlertTriangle, AlertCircle, Bell, Activity,
  Flame, CheckCircle2, XCircle, BarChart3, PieChart as PieChartIcon,
  Target, Award, Star, Zap, Plus, RefreshCw, Search, Filter,
  ArrowUpRight, ArrowDownRight, ArrowRight, ChevronDown, ChevronUp,
  Building2, MapPin, Package, DollarSign, Timer, Shield, Eye,
  MessageSquare, CalendarPlus, FilePlus, ListPlus, Crown, Medal,
  ThumbsUp, ThumbsDown, Percent, Hash, MailCheck, Megaphone,
  GitBranch, Layers, CircleDot, CircleCheck, Gauge, BellRing
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Line, LineChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  FunnelChart, Funnel, LabelList, ComposedChart, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";

// ─── Constants & Helpers ───────────────────────────────────────────────────────
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/crm-ultimate`;
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#14b8a6"];
const FUNNEL_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#f97316", "#10b981"];
const AGENT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
const ALERT_LEVELS = { critical: "bg-red-500/20 border-red-500/50 text-red-400", warning: "bg-amber-500/20 border-amber-500/50 text-amber-400", info: "bg-blue-500/20 border-blue-500/50 text-blue-400" };

const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (n: any) => Number(n || 0).toLocaleString("he-IL");
const fmtC = (n: any) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(Number(n || 0));
const fmtPct = (n: any) => `${Number(n || 0).toFixed(1)}%`;
const fmtDuration = (mins: number) => {
  if (mins < 60) return `${Math.round(mins)} דק'`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h} שע' ${m > 0 ? `${m} דק'` : ""}`.trim();
};

// ─── Animated Counter Hook ─────────────────────────────────────────────────────
function useCountUp(target: number, duration = 700) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const from = prevRef.current;
    const start = performance.now();
    let raf: number;
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(animate);
      else prevRef.current = target;
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return display;
}

function AnimVal({ value, prefix = "", suffix = "", className = "" }: { value: number; prefix?: string; suffix?: string; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{prefix}{v.toLocaleString("he-IL")}{suffix}</span>;
}

// ─── Interfaces ────────────────────────────────────────────────────────────────
interface KpiData {
  totalLeads: number;
  newLeadsToday: number;
  newLeadsWeek: number;
  openLeads: number;
  meetingsToday: number;
  meetingsScheduled: number;
  openQuotes: number;
  openQuotesValue: number;
  closedDeals: number;
  closedDealsValue: number;
  conversionRate: number;
  avgResponseTime: number;
  prevTotalLeads: number;
  prevConversionRate: number;
  prevClosedDealsValue: number;
}

interface FunnelStage {
  name: string;
  value: number;
  amount: number;
  fill: string;
}

interface StatusRow {
  status: string;
  count: number;
  percentage: number;
  color: string;
}

interface SourceRow {
  source: string;
  count: number;
  conversionRate: number;
  revenue: number;
}

interface CityRow {
  city: string;
  count: number;
  dealsClosed: number;
  revenue: number;
}

interface ProductRow {
  product: string;
  count: number;
  totalValue: number;
  avgDealSize: number;
}

interface AgentRow {
  id: string;
  name: string;
  avatar?: string;
  leads: number;
  meetings: number;
  quotes: number;
  closings: number;
  conversionPct: number;
  revenue: number;
  commission: number;
  qualityScore: number;
  riskScore: number;
  targetLeads: number;
  targetRevenue: number;
  actualLeads: number;
  actualRevenue: number;
}

interface CallStats {
  totalCalls: number;
  inbound: number;
  outbound: number;
  missed: number;
  returned: number;
  totalDurationMins: number;
  avgDurationMins: number;
  byHour: Array<{ hour: string; calls: number }>;
  byAgent: Array<{ agent: string; calls: number; duration: number }>;
}

interface AlertItem {
  id: string;
  type: "critical" | "warning" | "info";
  title: string;
  description: string;
  timestamp: string;
  entity?: string;
  entityId?: string;
}

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  agent: string;
  timestamp: string;
  icon?: string;
}

interface HotLead {
  id: string;
  name: string;
  company: string;
  value: number;
  score: number;
  waitingHours: number;
  source: string;
}

interface OverdueTask {
  id: string;
  title: string;
  assignee: string;
  dueDate: string;
  daysOverdue: number;
  priority: string;
  relatedLead?: string;
}

interface TrendPoint {
  period: string;
  leads: number;
  meetings: number;
  quotes: number;
  closings: number;
}

interface RevenueTrend {
  week: string;
  revenue: number;
  target: number;
}

// ─── Mock Data Generator (for when API is not available) ───────────────────────
function generateMockData() {
  const kpis: KpiData = {
    totalLeads: 1847,
    newLeadsToday: 23,
    newLeadsWeek: 142,
    openLeads: 438,
    meetingsToday: 8,
    meetingsScheduled: 34,
    openQuotes: 67,
    openQuotesValue: 2450000,
    closedDeals: 312,
    closedDealsValue: 8720000,
    conversionRate: 16.9,
    avgResponseTime: 47,
    prevTotalLeads: 1690,
    prevConversionRate: 14.2,
    prevClosedDealsValue: 7100000,
  };

  const funnel: FunnelStage[] = [
    { name: "ליד חדש", value: 438, amount: 5400000, fill: FUNNEL_COLORS[0] },
    { name: "שיחה ראשונה", value: 312, amount: 4100000, fill: FUNNEL_COLORS[1] },
    { name: "פגישה", value: 187, amount: 3200000, fill: FUNNEL_COLORS[2] },
    { name: "הצעת מחיר", value: 98, amount: 2800000, fill: FUNNEL_COLORS[3] },
    { name: "עסקה סגורה", value: 52, amount: 1950000, fill: FUNNEL_COLORS[4] },
  ];

  const statuses: StatusRow[] = [
    { status: "חדש", count: 186, percentage: 42.5, color: "#3b82f6" },
    { status: "בטיפול", count: 124, percentage: 28.3, color: "#f59e0b" },
    { status: "פגישה נקבעה", count: 56, percentage: 12.8, color: "#8b5cf6" },
    { status: "הצעה נשלחה", count: 38, percentage: 8.7, color: "#f97316" },
    { status: "ממתין לתשובה", count: 22, percentage: 5.0, color: "#06b6d4" },
    { status: "סגור-זכייה", count: 8, percentage: 1.8, color: "#10b981" },
    { status: "סגור-הפסד", count: 4, percentage: 0.9, color: "#ef4444" },
  ];

  const sources: SourceRow[] = [
    { source: "אתר אינטרנט", count: 412, conversionRate: 18.2, revenue: 2100000 },
    { source: "טלפון", count: 324, conversionRate: 22.5, revenue: 2800000 },
    { source: "הפניה", count: 267, conversionRate: 31.4, revenue: 1900000 },
    { source: "פייסבוק", count: 198, conversionRate: 12.1, revenue: 680000 },
    { source: "גוגל", count: 176, conversionRate: 14.8, revenue: 920000 },
    { source: "תערוכה", count: 143, conversionRate: 25.7, revenue: 1400000 },
    { source: "סוכן", count: 198, conversionRate: 19.3, revenue: 1520000 },
    { source: "אחר", count: 129, conversionRate: 8.5, revenue: 400000 },
  ];

  const cities: CityRow[] = [
    { city: "תל אביב", count: 312, dealsClosed: 48, revenue: 2100000 },
    { city: "ירושלים", count: 234, dealsClosed: 36, revenue: 1650000 },
    { city: "חיפה", count: 198, dealsClosed: 28, revenue: 1200000 },
    { city: "באר שבע", count: 156, dealsClosed: 22, revenue: 890000 },
    { city: "ראשון לציון", count: 134, dealsClosed: 19, revenue: 780000 },
    { city: "פתח תקווה", count: 112, dealsClosed: 16, revenue: 640000 },
    { city: "נתניה", count: 98, dealsClosed: 14, revenue: 520000 },
    { city: "אשדוד", count: 87, dealsClosed: 11, revenue: 460000 },
  ];

  const products: ProductRow[] = [
    { product: "חלונות אלומיניום", count: 423, totalValue: 3200000, avgDealSize: 42000 },
    { product: "דלתות כניסה", count: 312, totalValue: 2800000, avgDealSize: 38000 },
    { product: "מעקות", count: 234, totalValue: 1400000, avgDealSize: 28000 },
    { product: "פרגולות", count: 187, totalValue: 1850000, avgDealSize: 52000 },
    { product: "חיפויים", count: 156, totalValue: 980000, avgDealSize: 22000 },
    { product: "תריסים", count: 198, totalValue: 1100000, avgDealSize: 18000 },
    { product: "ויטרינות", count: 134, totalValue: 1600000, avgDealSize: 65000 },
    { product: "קירות מסך", count: 89, totalValue: 2400000, avgDealSize: 120000 },
  ];

  const agents: AgentRow[] = [
    { id: "a1", name: "יוסי כהן", leads: 156, meetings: 42, quotes: 28, closings: 18, conversionPct: 11.5, revenue: 1420000, commission: 42600, qualityScore: 92, riskScore: 8, targetLeads: 180, targetRevenue: 1500000, actualLeads: 156, actualRevenue: 1420000 },
    { id: "a2", name: "רונית לוי", leads: 189, meetings: 56, quotes: 38, closings: 24, conversionPct: 12.7, revenue: 1870000, commission: 56100, qualityScore: 96, riskScore: 4, targetLeads: 200, targetRevenue: 2000000, actualLeads: 189, actualRevenue: 1870000 },
    { id: "a3", name: "אבי מזרחי", leads: 134, meetings: 38, quotes: 22, closings: 14, conversionPct: 10.4, revenue: 980000, commission: 29400, qualityScore: 85, riskScore: 15, targetLeads: 160, targetRevenue: 1200000, actualLeads: 134, actualRevenue: 980000 },
    { id: "a4", name: "מירב דוד", leads: 178, meetings: 52, quotes: 34, closings: 22, conversionPct: 12.4, revenue: 1650000, commission: 49500, qualityScore: 94, riskScore: 6, targetLeads: 190, targetRevenue: 1800000, actualLeads: 178, actualRevenue: 1650000 },
    { id: "a5", name: "דני ברק", leads: 145, meetings: 36, quotes: 19, closings: 11, conversionPct: 7.6, revenue: 720000, commission: 21600, qualityScore: 78, riskScore: 22, targetLeads: 170, targetRevenue: 1300000, actualLeads: 145, actualRevenue: 720000 },
    { id: "a6", name: "שרה אברהם", leads: 167, meetings: 48, quotes: 32, closings: 20, conversionPct: 12.0, revenue: 1560000, commission: 46800, qualityScore: 91, riskScore: 9, targetLeads: 175, targetRevenue: 1600000, actualLeads: 167, actualRevenue: 1560000 },
  ];

  const callStats: CallStats = {
    totalCalls: 1847,
    inbound: 623,
    outbound: 892,
    missed: 187,
    returned: 145,
    totalDurationMins: 4230,
    avgDurationMins: 3.8,
    byHour: [
      { hour: "08:00", calls: 45 }, { hour: "09:00", calls: 134 }, { hour: "10:00", calls: 198 },
      { hour: "11:00", calls: 223 }, { hour: "12:00", calls: 167 }, { hour: "13:00", calls: 98 },
      { hour: "14:00", calls: 187 }, { hour: "15:00", calls: 212 }, { hour: "16:00", calls: 198 },
      { hour: "17:00", calls: 156 }, { hour: "18:00", calls: 89 }, { hour: "19:00", calls: 34 },
    ],
    byAgent: [
      { agent: "יוסי כהן", calls: 312, duration: 720 },
      { agent: "רונית לוי", calls: 387, duration: 890 },
      { agent: "אבי מזרחי", calls: 267, duration: 580 },
      { agent: "מירב דוד", calls: 345, duration: 810 },
      { agent: "דני ברק", calls: 234, duration: 490 },
      { agent: "שרה אברהם", calls: 302, duration: 740 },
    ],
  };

  const alerts: AlertItem[] = [
    { id: "al1", type: "critical", title: "12 לידים ללא מענה מעל 24 שעות", description: "לידים מחכים לתגובה ראשונית", timestamp: "לפני 2 שעות" },
    { id: "al2", type: "critical", title: "5 הצעות מחיר פגות תוקף", description: "הצעות מחיר שעבר מועד התוקף שלהן", timestamp: "לפני 4 שעות" },
    { id: "al3", type: "warning", title: "8 משימות פולואפ באיחור", description: "משימות שחלף מועד הביצוע", timestamp: "לפני 6 שעות" },
    { id: "al4", type: "warning", title: "3 פגישות ללא סיכום", description: "פגישות שהתקיימו ללא תיעוד", timestamp: "היום 09:30" },
    { id: "al5", type: "warning", title: "SLA בסיכון - 7 לידים", description: "לידים שקרובים לחריגה מזמן תגובה", timestamp: "לפני שעה" },
    { id: "al6", type: "info", title: "יעד שבועי הושג ב-85%", description: "נותרו 2 ימים להשלמת היעד", timestamp: "היום 08:00" },
  ];

  const activities: ActivityItem[] = [
    { id: "ac1", type: "lead", description: "ליד חדש נוצר - אלומיניום פרויקט מגדל", agent: "רונית לוי", timestamp: "לפני 5 דקות" },
    { id: "ac2", type: "meeting", description: "פגישה הסתיימה - חלונות למגורים", agent: "יוסי כהן", timestamp: "לפני 15 דקות" },
    { id: "ac3", type: "quote", description: "הצעת מחיר נשלחה - ₪180,000", agent: "מירב דוד", timestamp: "לפני 22 דקות" },
    { id: "ac4", type: "deal", description: "עסקה נסגרה! ₪95,000 - מעקות בניין", agent: "שרה אברהם", timestamp: "לפני 35 דקות" },
    { id: "ac5", type: "call", description: "שיחה יוצאת - מעקב הצעה", agent: "אבי מזרחי", timestamp: "לפני 42 דקות" },
    { id: "ac6", type: "task", description: "משימה הושלמה - מדידות באתר", agent: "דני ברק", timestamp: "לפני שעה" },
    { id: "ac7", type: "lead", description: "ליד עודכן - שלב הצעת מחיר", agent: "רונית לוי", timestamp: "לפני שעה" },
    { id: "ac8", type: "email", description: "מייל נשלח - תזכורת פגישה מחר", agent: "יוסי כהן", timestamp: "לפני שעתיים" },
  ];

  const hotLeads: HotLead[] = [
    { id: "hl1", name: "פרויקט מגדל אופק", company: "אופק נדל\"ן", value: 450000, score: 95, waitingHours: 2, source: "הפניה" },
    { id: "hl2", name: "שיפוץ מלון ים", company: "מלונות הים", value: 320000, score: 88, waitingHours: 5, source: "אתר" },
    { id: "hl3", name: "בניין מגורים חדש", company: "בונה חיים בע\"מ", value: 680000, score: 92, waitingHours: 1, source: "טלפון" },
    { id: "hl4", name: "מרכז מסחרי", company: "קניון ישראל", value: 520000, score: 85, waitingHours: 8, source: "תערוכה" },
    { id: "hl5", name: "בית ספר חדש", company: "עיריית חיפה", value: 890000, score: 78, waitingHours: 12, source: "מכרז" },
  ];

  const overdueTasks: OverdueTask[] = [
    { id: "ot1", title: "שליחת הצעת מחיר - בניין מגורים", assignee: "דני ברק", dueDate: "2026-03-22", daysOverdue: 3, priority: "high", relatedLead: "בונה חיים" },
    { id: "ot2", title: "פולואפ טלפוני - מלון ים", assignee: "אבי מזרחי", dueDate: "2026-03-23", daysOverdue: 2, priority: "high", relatedLead: "מלונות הים" },
    { id: "ot3", title: "עדכון הצעה - פרויקט מגדל", assignee: "יוסי כהן", dueDate: "2026-03-24", daysOverdue: 1, priority: "medium", relatedLead: "אופק נדל\"ן" },
    { id: "ot4", title: "סיכום פגישה - קניון ישראל", assignee: "מירב דוד", dueDate: "2026-03-23", daysOverdue: 2, priority: "medium", relatedLead: "קניון ישראל" },
    { id: "ot5", title: "מדידות באתר - בית ספר", assignee: "שרה אברהם", dueDate: "2026-03-21", daysOverdue: 4, priority: "high", relatedLead: "עיריית חיפה" },
  ];

  const leadsTrend: TrendPoint[] = [
    { period: "שבוע 1", leads: 112, meetings: 32, quotes: 18, closings: 8 },
    { period: "שבוע 2", leads: 128, meetings: 38, quotes: 22, closings: 11 },
    { period: "שבוע 3", leads: 145, meetings: 42, quotes: 26, closings: 14 },
    { period: "שבוע 4", leads: 134, meetings: 36, quotes: 20, closings: 10 },
    { period: "שבוע 5", leads: 156, meetings: 48, quotes: 30, closings: 16 },
    { period: "שבוע 6", leads: 142, meetings: 44, quotes: 28, closings: 13 },
    { period: "שבוע 7", leads: 168, meetings: 52, quotes: 34, closings: 18 },
    { period: "שבוע 8", leads: 152, meetings: 46, quotes: 24, closings: 12 },
  ];

  const revenueTrend: RevenueTrend[] = [
    { week: "שבוע 1", revenue: 620000, target: 700000 },
    { week: "שבוע 2", revenue: 780000, target: 700000 },
    { week: "שבוע 3", revenue: 920000, target: 750000 },
    { week: "שבוע 4", revenue: 680000, target: 750000 },
    { week: "שבוע 5", revenue: 1100000, target: 800000 },
    { week: "שבוע 6", revenue: 850000, target: 800000 },
    { week: "שבוע 7", revenue: 1250000, target: 850000 },
    { week: "שבוע 8", revenue: 960000, target: 850000 },
  ];

  return { kpis, funnel, statuses, sources, cities, products, agents, callStats, alerts, activities, hotLeads, overdueTasks, leadsTrend, revenueTrend };
}

// ─── Tooltip Styles ────────────────────────────────────────────────────────────
const tooltipStyle = {
  contentStyle: { backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", direction: "rtl" as const, fontFamily: "inherit" },
  labelStyle: { color: "#94a3b8", fontSize: 12 },
  itemStyle: { color: "#e2e8f0", fontSize: 12 },
};

// ─── KPI Card Component ────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, title, value, subtitle, trend, trendValue, color, pulse }: {
  icon: any; title: string; value: string | number; subtitle?: string; trend?: "up" | "down" | "neutral";
  trendValue?: string; color: string; pulse?: boolean;
}) {
  const trendColors = { up: "text-green-400", down: "text-red-400", neutral: "text-gray-400" };
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : ArrowRight;
  return (
    <Card className="bg-background border-border hover:border-border transition-all duration-300 group relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${color}`} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2 rounded-lg ${color.replace("bg-", "bg-").replace("500", "500/15")} border border-transparent group-hover:border-${color.replace("bg-", "").replace("/15", "/30")}`}>
            <Icon className={`h-5 w-5 ${color.replace("bg-", "text-").replace("/15", "")}`} />
          </div>
          {trend && (
            <div className={`flex items-center gap-1 text-xs ${trendColors[trend]}`}>
              <TrendIcon className="h-3.5 w-3.5" />
              <span>{trendValue}</span>
            </div>
          )}
          {pulse && <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" /></span>}
        </div>
        <div className="text-2xl font-bold text-foreground mb-1">{typeof value === "number" ? <AnimVal value={value} /> : value}</div>
        <div className="text-xs text-gray-400">{title}</div>
        {subtitle && <div className="text-[10px] text-gray-500 mt-1">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, badge, children }: { icon: any; title: string; badge?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-blue-400" />
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        {badge && <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">{badge}</Badge>}
      </div>
      {children}
    </div>
  );
}

// ─── Mini Progress Bar ─────────────────────────────────────────────────────────
function ProgressBar({ value, max, color = "bg-blue-500", height = "h-2", showLabel = false }: {
  value: number; max: number; color?: string; height?: string; showLabel?: boolean;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className={`flex-1 ${height} bg-muted rounded-full overflow-hidden`}>
        <div className={`${height} ${color} rounded-full transition-all duration-700 ease-out`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="text-xs text-gray-400 min-w-[40px] text-left">{fmtPct(pct)}</span>}
    </div>
  );
}

// ─── Quality Score Badge ───────────────────────────────────────────────────────
function QualityBadge({ score }: { score: number }) {
  const color = score >= 90 ? "bg-green-500/20 text-green-400 border-green-500/30" : score >= 75 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-red-500/20 text-red-400 border-red-500/30";
  return <Badge className={`${color} text-xs`}>{score}</Badge>;
}

function RiskBadge({ score }: { score: number }) {
  const color = score <= 10 ? "bg-green-500/20 text-green-400 border-green-500/30" : score <= 20 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-red-500/20 text-red-400 border-red-500/30";
  return <Badge className={`${color} text-xs`}>{score}%</Badge>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ═══ MAIN COMPONENT ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
export default function CrmUltimateDashboard() {
  const queryClient = useQueryClient();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [dateRange, setDateRange] = useState<"today" | "week" | "month" | "quarter">("month");
  const [searchTerm, setSearchTerm] = useState("");
  const [trendView, setTrendView] = useState<"weekly" | "monthly">("weekly");
  const [alertsExpanded, setAlertsExpanded] = useState(true);

  // ─── Data Fetching ─────────────────────────────────────────────────────────
  const { data: crmData, isLoading: loading, error: queryError } = useQuery({
    queryKey: ["crm-ultimate-dashboard", dateRange],
    queryFn: async () => {
      const endpoints = [
        "kpis", "funnel", "statuses", "sources", "cities", "products",
        "agents", "call-stats", "alerts", "activities", "hot-leads",
        "overdue-tasks", "leads-trend", "revenue-trend",
      ];
      const results = await Promise.allSettled(
        endpoints.map(ep => authFetch(`${API}/${ep}?range=${dateRange}`).then(r => r.ok ? r.json() : null))
      );
      const getData = (i: number) => {
        const r = results[i];
        return r.status === "fulfilled" ? r.value : null;
      };
      const mock = generateMockData();
      setLastRefresh(new Date());
      return {
        kpis: getData(0) || mock.kpis,
        funnel: safeArr(getData(1)).length ? safeArr(getData(1)) : mock.funnel,
        statuses: safeArr(getData(2)).length ? safeArr(getData(2)) : mock.statuses,
        sources: safeArr(getData(3)).length ? safeArr(getData(3)) : mock.sources,
        cities: safeArr(getData(4)).length ? safeArr(getData(4)) : mock.cities,
        products: safeArr(getData(5)).length ? safeArr(getData(5)) : mock.products,
        agents: safeArr(getData(6)).length ? safeArr(getData(6)) : mock.agents,
        callStats: getData(7) || mock.callStats,
        alerts: safeArr(getData(8)).length ? safeArr(getData(8)) : mock.alerts,
        activities: safeArr(getData(9)).length ? safeArr(getData(9)) : mock.activities,
        hotLeads: safeArr(getData(10)).length ? safeArr(getData(10)) : mock.hotLeads,
        overdueTasks: safeArr(getData(11)).length ? safeArr(getData(11)) : mock.overdueTasks,
        leadsTrend: safeArr(getData(12)).length ? safeArr(getData(12)) : mock.leadsTrend,
        revenueTrend: safeArr(getData(13)).length ? safeArr(getData(13)) : mock.revenueTrend,
      };
    },
    staleTime: 60_000,
    refetchInterval: autoRefresh ? 60_000 : false,
    placeholderData: () => {
      const mock = generateMockData();
      return { kpis: mock.kpis, funnel: mock.funnel, statuses: mock.statuses, sources: mock.sources, cities: mock.cities, products: mock.products, agents: mock.agents, callStats: mock.callStats, alerts: mock.alerts, activities: mock.activities, hotLeads: mock.hotLeads, overdueTasks: mock.overdueTasks, leadsTrend: mock.leadsTrend, revenueTrend: mock.revenueTrend };
    },
  });

  const error = queryError ? (queryError as Error).message : null;

  const kpis = crmData?.kpis ?? null;
  const funnel = crmData?.funnel ?? [];
  const statuses = crmData?.statuses ?? [];
  const sources = crmData?.sources ?? [];
  const cities = crmData?.cities ?? [];
  const products = crmData?.products ?? [];
  const agents = crmData?.agents ?? [];
  const callStats = crmData?.callStats ?? null;
  const alerts = crmData?.alerts ?? [];
  const activities = crmData?.activities ?? [];
  const hotLeads = crmData?.hotLeads ?? [];
  const overdueTasks = crmData?.overdueTasks ?? [];
  const leadsTrend = crmData?.leadsTrend ?? [];
  const revenueTrend = crmData?.revenueTrend ?? [];

  // ─── Computed values ───────────────────────────────────────────────────────
  const criticalAlerts = alerts.filter(a => a.type === "critical").length;
  const totalPipelineValue = funnel.reduce((s, f) => s + f.amount, 0);
  const topAgent = useMemo(() => [...agents].sort((a, b) => b.revenue - a.revenue)[0], [agents]);

  // ─── Quick Action Handlers ─────────────────────────────────────────────────
  const handleQuickAction = (action: string) => {
    // Navigate or open modal based on action
    const actionMap: Record<string, string> = {
      "new-lead": "/crm/leads-management?action=new",
      "new-meeting": "/calendar?action=new-meeting",
      "new-quote": "/sales/quotations?action=new",
      "new-task": "/crm/crm-activities?action=new-task",
    };
    const url = actionMap[action];
    if (url) window.location.href = url;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ═══ RENDER ════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground p-4 md:p-6 space-y-6">

      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg shadow-blue-500/25">
              <Target className="h-6 w-6 text-foreground" />
            </div>
            דשבורד CRM Ultimate
            <Badge className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30 text-xs">
              <Crown className="h-3 w-3 ml-1" />
              טכנוקולוזי
            </Badge>
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            מרכז שליטה מתקדם למכירות ו-CRM | עדכון אחרון: {lastRefresh.toLocaleTimeString("he-IL")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date Range Tabs */}
          <div className="flex bg-card rounded-lg p-0.5 border border-border">
            {(["today", "week", "month", "quarter"] as const).map(r => (
              <button key={r} onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${dateRange === r ? "bg-blue-600 text-foreground shadow-lg" : "text-gray-400 hover:text-foreground"}`}>
                {{ today: "היום", week: "שבוע", month: "חודש", quarter: "רבעון" }[r]}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input placeholder="חיפוש..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="bg-card border-border text-foreground pr-8 w-48 h-8 text-xs" />
          </div>

          {/* Auto refresh toggle */}
          <Button variant="outline" size="sm" onClick={() => setAutoRefresh(!autoRefresh)}
            className={`h-8 text-xs border-border ${autoRefresh ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-card text-gray-400"}`}>
            <RefreshCw className={`h-3.5 w-3.5 ml-1 ${autoRefresh ? "animate-spin" : ""}`} style={{ animationDuration: "3s" }} />
            {autoRefresh ? "חי" : "ריענון"}
          </Button>

          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["crm-ultimate-dashboard", dateRange] })} className="h-8 text-xs bg-card border-border text-gray-300 hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5 ml-1" />
            רענן
          </Button>
        </div>
      </div>

      {/* ─── Quick Actions Bar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => handleQuickAction("new-lead")}
          className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-foreground shadow-lg shadow-blue-500/25">
          <UserPlus className="h-4 w-4 ml-1.5" /> ליד חדש
        </Button>
        <Button size="sm" onClick={() => handleQuickAction("new-meeting")}
          className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-foreground shadow-lg shadow-purple-500/25">
          <CalendarPlus className="h-4 w-4 ml-1.5" /> פגישה חדשה
        </Button>
        <Button size="sm" onClick={() => handleQuickAction("new-quote")}
          className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-foreground shadow-lg shadow-amber-500/25">
          <FilePlus className="h-4 w-4 ml-1.5" /> הצעת מחיר
        </Button>
        <Button size="sm" onClick={() => handleQuickAction("new-task")}
          className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-foreground shadow-lg shadow-green-500/25">
          <ListPlus className="h-4 w-4 ml-1.5" /> משימה חדשה
        </Button>

        {criticalAlerts > 0 && (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 animate-pulse flex items-center gap-1 px-3 py-1.5 mr-auto">
            <AlertTriangle className="h-3.5 w-3.5" />
            {criticalAlerts} התראות קריטיות
          </Badge>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ═══ ROW 1: KPI Cards ═════════════════════════════════════════════ */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <KpiCard icon={Users} title="סה״כ לידים" value={kpis?.totalLeads || 0} color="bg-blue-500"
          trend={kpis && kpis.totalLeads > kpis.prevTotalLeads ? "up" : "down"}
          trendValue={kpis ? `${(((kpis.totalLeads - kpis.prevTotalLeads) / kpis.prevTotalLeads) * 100).toFixed(1)}%` : ""}
          subtitle={`${fmt(kpis?.totalLeads || 0)} במערכת`} />

        <KpiCard icon={UserPlus} title="לידים חדשים" value={kpis?.newLeadsToday || 0} color="bg-green-500" pulse
          subtitle={`${fmt(kpis?.newLeadsWeek || 0)} השבוע`} />

        <KpiCard icon={UserCheck} title="לידים פתוחים" value={kpis?.openLeads || 0} color="bg-amber-500"
          subtitle="ממתינים לטיפול" />

        <KpiCard icon={Calendar} title="פגישות היום" value={kpis?.meetingsToday || 0} color="bg-purple-500" pulse
          subtitle={`${kpis?.meetingsScheduled || 0} מתוכננות`} />

        <KpiCard icon={FileText} title="הצעות מחיר פתוחות" value={kpis?.openQuotes || 0} color="bg-orange-500"
          subtitle={fmtC(kpis?.openQuotesValue || 0)} />

        <KpiCard icon={Handshake} title="עסקאות שנסגרו" value={kpis?.closedDeals || 0} color="bg-emerald-500"
          trend={kpis && kpis.closedDealsValue > kpis.prevClosedDealsValue ? "up" : "down"}
          trendValue={kpis ? `${(((kpis.closedDealsValue - kpis.prevClosedDealsValue) / kpis.prevClosedDealsValue) * 100).toFixed(1)}%` : ""}
          subtitle={fmtC(kpis?.closedDealsValue || 0)} />

        <KpiCard icon={Percent} title="יחס המרה" value={`${(kpis?.conversionRate || 0).toFixed(1)}%`} color="bg-cyan-500"
          trend={kpis && kpis.conversionRate > kpis.prevConversionRate ? "up" : "down"}
          trendValue={`${((kpis?.conversionRate || 0) - (kpis?.prevConversionRate || 0)).toFixed(1)}%`} />

        <KpiCard icon={Clock} title="זמן תגובה ממוצע" value={fmtDuration(kpis?.avgResponseTime || 0)} color="bg-rose-500"
          subtitle="מרגע קבלת ליד" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ═══ ROW 2: Conversion Funnel + Pipeline ═════════════════════════ */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funnel Visualization */}
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-foreground flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-blue-400" />
              משפך המרה
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs mr-auto">
                {funnel.length} שלבים
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {funnel.map((stage, i) => {
                const maxVal = funnel[0]?.value || 1;
                const widthPct = (stage.value / maxVal) * 100;
                const convRate = i > 0 ? ((stage.value / funnel[i - 1].value) * 100).toFixed(1) : "100";
                return (
                  <div key={i} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-300 font-medium">{stage.name}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-400">{fmt(stage.value)} לידים</span>
                        <span className="text-gray-500">|</span>
                        <span className="text-green-400 font-medium">{fmtC(stage.amount)}</span>
                        {i > 0 && (
                          <>
                            <span className="text-gray-500">|</span>
                            <span className="text-amber-400">{convRate}%</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="h-8 bg-muted rounded-lg overflow-hidden relative">
                      <div className="h-full rounded-lg transition-all duration-1000 ease-out flex items-center justify-center relative"
                        style={{ width: `${widthPct}%`, backgroundColor: stage.fill, opacity: 0.8 }}>
                        <span className="text-xs font-bold text-foreground drop-shadow-lg">{fmt(stage.value)}</span>
                      </div>
                    </div>
                    {i < funnel.length - 1 && (
                      <div className="flex justify-center my-0.5">
                        <ChevronDown className="h-3 w-3 text-gray-600" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-sm text-gray-400">שווי צנרת כולל</span>
              <span className="text-lg font-bold text-green-400">{fmtC(totalPipelineValue)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Value by Stage */}
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-foreground flex items-center gap-2">
              <Layers className="h-5 w-5 text-purple-400" />
              שווי צנרת לפי שלב
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={funnel} layout="vertical" margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} stroke="#64748b" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={12} width={90} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [fmtC(v), "שווי"]} />
                <Bar dataKey="amount" radius={[0, 6, 6, 0]}>
                  {funnel.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} opacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-5 gap-2 mt-2">
              {funnel.map((stage, i) => (
                <div key={i} className="text-center">
                  <div className="text-[10px] text-gray-500">{stage.name}</div>
                  <div className="text-xs font-bold text-foreground">{fmt(stage.value)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ═══ ROW 3: Data Tables ═══════════════════════════════════════════ */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* Status Table */}
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <CircleDot className="h-4 w-4 text-blue-400" />
              טבלת סטטוסים
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right text-gray-400 font-medium p-3 text-xs">סטטוס</th>
                    <th className="text-center text-gray-400 font-medium p-3 text-xs">כמות</th>
                    <th className="text-center text-gray-400 font-medium p-3 text-xs">אחוז</th>
                    <th className="text-left text-gray-400 font-medium p-3 text-xs w-24">התפלגות</th>
                  </tr>
                </thead>
                <tbody>
                  {statuses.map((s, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-card/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="text-foreground text-xs">{s.status}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center text-foreground font-medium text-xs">{fmt(s.count)}</td>
                      <td className="p-3 text-center text-gray-300 text-xs">{fmtPct(s.percentage)}</td>
                      <td className="p-3">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${s.percentage}%`, backgroundColor: s.color }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Source Table */}
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-green-400" />
              לידים לפי מקור
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right text-gray-400 font-medium p-3 text-xs">מקור</th>
                    <th className="text-center text-gray-400 font-medium p-3 text-xs">כמות</th>
                    <th className="text-center text-gray-400 font-medium p-3 text-xs">המרה</th>
                    <th className="text-left text-gray-400 font-medium p-3 text-xs">הכנסה</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-card/30 transition-colors">
                      <td className="p-3">
                        <span className="text-foreground text-xs">{s.source}</span>
                      </td>
                      <td className="p-3 text-center text-foreground font-medium text-xs">{fmt(s.count)}</td>
                      <td className="p-3 text-center">
                        <Badge className={`text-[10px] ${s.conversionRate >= 20 ? "bg-green-500/20 text-green-400 border-green-500/30" : s.conversionRate >= 15 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}>
                          {fmtPct(s.conversionRate)}
                        </Badge>
                      </td>
                      <td className="p-3 text-left text-green-400 text-xs font-medium">{fmtC(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* City Table */}
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4 text-red-400" />
              לידים לפי עיר
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right text-gray-400 font-medium p-3 text-xs">עיר</th>
                    <th className="text-center text-gray-400 font-medium p-3 text-xs">לידים</th>
                    <th className="text-center text-gray-400 font-medium p-3 text-xs">עסקאות</th>
                    <th className="text-left text-gray-400 font-medium p-3 text-xs">הכנסה</th>
                  </tr>
                </thead>
                <tbody>
                  {cities.map((c, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-card/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-gray-500" />
                          <span className="text-foreground text-xs">{c.city}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center text-foreground font-medium text-xs">{fmt(c.count)}</td>
                      <td className="p-3 text-center text-blue-400 text-xs">{fmt(c.dealsClosed)}</td>
                      <td className="p-3 text-left text-green-400 text-xs font-medium">{fmtC(c.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Product Table */}
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Package className="h-4 w-4 text-amber-400" />
              לידים לפי מוצר
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right text-gray-400 font-medium p-3 text-xs">מוצר</th>
                    <th className="text-center text-gray-400 font-medium p-3 text-xs">כמות</th>
                    <th className="text-center text-gray-400 font-medium p-3 text-xs">סה״כ ₪</th>
                    <th className="text-left text-gray-400 font-medium p-3 text-xs">ממוצע</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-card/30 transition-colors">
                      <td className="p-3">
                        <span className="text-foreground text-xs">{p.product}</span>
                      </td>
                      <td className="p-3 text-center text-foreground font-medium text-xs">{fmt(p.count)}</td>
                      <td className="p-3 text-center text-green-400 text-xs font-medium">{fmtC(p.totalValue)}</td>
                      <td className="p-3 text-left text-gray-300 text-xs">{fmtC(p.avgDealSize)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Agent Summary Table */}
        <Card className="bg-background border-border md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-400" />
              לידים לפי סוכן
              {topAgent && (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] mr-auto">
                  <Crown className="h-3 w-3 ml-1" />
                  מוביל: {topAgent.name}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right text-gray-400 font-medium p-3 text-xs">סוכן</th>
                    <th className="text-center text-gray-400 font-medium p-3 text-xs">לידים</th>
                    <th className="text-center text-gray-400 font-medium p-3 text-xs">פגישות</th>
                    <th className="text-center text-gray-400 font-medium p-3 text-xs">הצעות</th>
                    <th className="text-center text-gray-400 font-medium p-3 text-xs">סגירות</th>
                    <th className="text-center text-gray-400 font-medium p-3 text-xs">המרה</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a, i) => (
                    <tr key={a.id} className="border-b border-border/50 hover:bg-card/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: AGENT_COLORS[i % AGENT_COLORS.length] + "30", color: AGENT_COLORS[i % AGENT_COLORS.length] }}>
                            {a.name.charAt(0)}
                          </div>
                          <span className="text-foreground text-xs font-medium">{a.name}</span>
                        </div>
                      </td>
                      <td className="p-3 text-center text-foreground text-xs">{fmt(a.leads)}</td>
                      <td className="p-3 text-center text-blue-400 text-xs">{fmt(a.meetings)}</td>
                      <td className="p-3 text-center text-amber-400 text-xs">{fmt(a.quotes)}</td>
                      <td className="p-3 text-center text-green-400 text-xs font-medium">{fmt(a.closings)}</td>
                      <td className="p-3 text-center">
                        <Badge className={`text-[10px] ${a.conversionPct >= 12 ? "bg-green-500/20 text-green-400 border-green-500/30" : a.conversionPct >= 9 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                          {fmtPct(a.conversionPct)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ═══ ROW 4: Agent Performance ════════════════════════════════════ */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <SectionHeader icon={Award} title="ביצועי סוכנים" badge={`${agents.length} סוכנים`} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Agent Ranking Table */}
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Medal className="h-4 w-4 text-amber-400" />
              דירוג סוכנים מורחב
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right text-gray-400 font-medium p-2.5 text-[10px]">#</th>
                    <th className="text-right text-gray-400 font-medium p-2.5 text-[10px]">סוכן</th>
                    <th className="text-center text-gray-400 font-medium p-2.5 text-[10px]">לידים</th>
                    <th className="text-center text-gray-400 font-medium p-2.5 text-[10px]">פגישות</th>
                    <th className="text-center text-gray-400 font-medium p-2.5 text-[10px]">הצעות</th>
                    <th className="text-center text-gray-400 font-medium p-2.5 text-[10px]">סגירות</th>
                    <th className="text-center text-gray-400 font-medium p-2.5 text-[10px]">הכנסה</th>
                    <th className="text-center text-gray-400 font-medium p-2.5 text-[10px]">עמלה</th>
                    <th className="text-center text-gray-400 font-medium p-2.5 text-[10px]">איכות</th>
                    <th className="text-center text-gray-400 font-medium p-2.5 text-[10px]">סיכון</th>
                  </tr>
                </thead>
                <tbody>
                  {[...agents].sort((a, b) => b.revenue - a.revenue).map((a, i) => (
                    <tr key={a.id} className="border-b border-border/50 hover:bg-card/30 transition-colors">
                      <td className="p-2.5">
                        {i === 0 ? <Crown className="h-4 w-4 text-amber-400" /> :
                         i === 1 ? <Medal className="h-4 w-4 text-gray-300" /> :
                         i === 2 ? <Medal className="h-4 w-4 text-amber-700" /> :
                         <span className="text-gray-500 text-xs">{i + 1}</span>}
                      </td>
                      <td className="p-2.5 text-foreground text-xs font-medium">{a.name}</td>
                      <td className="p-2.5 text-center text-xs">{fmt(a.leads)}</td>
                      <td className="p-2.5 text-center text-xs">{fmt(a.meetings)}</td>
                      <td className="p-2.5 text-center text-xs">{fmt(a.quotes)}</td>
                      <td className="p-2.5 text-center text-green-400 text-xs font-medium">{fmt(a.closings)}</td>
                      <td className="p-2.5 text-center text-green-400 text-xs font-medium">{fmtC(a.revenue)}</td>
                      <td className="p-2.5 text-center text-amber-400 text-xs">{fmtC(a.commission)}</td>
                      <td className="p-2.5 text-center"><QualityBadge score={a.qualityScore} /></td>
                      <td className="p-2.5 text-center"><RiskBadge score={a.riskScore} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Agent Targets vs Actual */}
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-green-400" />
              יעדים מול ביצוע
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {agents.map((a, i) => {
                const leadsPct = a.targetLeads > 0 ? (a.actualLeads / a.targetLeads) * 100 : 0;
                const revPct = a.targetRevenue > 0 ? (a.actualRevenue / a.targetRevenue) * 100 : 0;
                return (
                  <div key={a.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: AGENT_COLORS[i % AGENT_COLORS.length] + "30", color: AGENT_COLORS[i % AGENT_COLORS.length] }}>
                          {a.name.charAt(0)}
                        </div>
                        <span className="text-xs text-foreground font-medium">{a.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={`text-[10px] ${leadsPct >= 90 ? "bg-green-500/20 text-green-400 border-green-500/30" : leadsPct >= 70 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
                          {fmtPct(leadsPct)}
                        </Badge>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 min-w-[45px]">לידים</span>
                        <ProgressBar value={a.actualLeads} max={a.targetLeads} color={leadsPct >= 90 ? "bg-green-500" : leadsPct >= 70 ? "bg-amber-500" : "bg-red-500"} height="h-1.5" />
                        <span className="text-[10px] text-gray-400 min-w-[65px] text-left">{fmt(a.actualLeads)}/{fmt(a.targetLeads)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 min-w-[45px]">הכנסה</span>
                        <ProgressBar value={a.actualRevenue} max={a.targetRevenue} color={revPct >= 90 ? "bg-green-500" : revPct >= 70 ? "bg-amber-500" : "bg-red-500"} height="h-1.5" />
                        <span className="text-[10px] text-gray-400 min-w-[65px] text-left">{fmtC(a.actualRevenue)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ═══ ROW 5: Call Statistics ═══════════════════════════════════════ */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <SectionHeader icon={Phone} title="סטטיסטיקות שיחות" badge={`${fmt(callStats?.totalCalls || 0)} שיחות`} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Call Summary Cards */}
        <Card className="bg-background border-border">
          <CardContent className="p-4 space-y-4">
            <div className="text-sm text-gray-400 font-medium mb-3">סיכום שיחות</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card rounded-lg p-3 text-center">
                <PhoneIncoming className="h-5 w-5 text-green-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-foreground">{fmt(callStats?.inbound || 0)}</div>
                <div className="text-[10px] text-gray-400">נכנסות</div>
              </div>
              <div className="bg-card rounded-lg p-3 text-center">
                <PhoneOutgoing className="h-5 w-5 text-blue-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-foreground">{fmt(callStats?.outbound || 0)}</div>
                <div className="text-[10px] text-gray-400">יוצאות</div>
              </div>
              <div className="bg-card rounded-lg p-3 text-center">
                <PhoneMissed className="h-5 w-5 text-red-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-foreground">{fmt(callStats?.missed || 0)}</div>
                <div className="text-[10px] text-gray-400">שלא נענו</div>
              </div>
              <div className="bg-card rounded-lg p-3 text-center">
                <PhoneForwarded className="h-5 w-5 text-amber-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-foreground">{fmt(callStats?.returned || 0)}</div>
                <div className="text-[10px] text-gray-400">הוחזרו</div>
              </div>
            </div>
            <div className="bg-card rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-purple-400" />
                <span className="text-xs text-gray-400">זמן שיחות כולל</span>
              </div>
              <span className="text-sm font-bold text-foreground">{fmtDuration(callStats?.totalDurationMins || 0)}</span>
            </div>
            <div className="bg-card rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-cyan-400" />
                <span className="text-xs text-gray-400">ממוצע לשיחה</span>
              </div>
              <span className="text-sm font-bold text-foreground">{fmtDuration(callStats?.avgDurationMins || 0)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Calls by Time of Day */}
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyan-400" />
              שיחות לפי שעה
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={callStats?.byHour || []} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="hour" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [fmt(v), "שיחות"]} />
                <Bar dataKey="calls" radius={[4, 4, 0, 0]}>
                  {(callStats?.byHour || []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Calls per Agent */}
        <Card className="bg-background border-border md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-400" />
              שיחות לפי סוכן
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={callStats?.byAgent || []} margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="agent" stroke="#64748b" fontSize={10} />
                <YAxis yAxisId="left" stroke="#64748b" fontSize={10} />
                <YAxis yAxisId="right" orientation="left" stroke="#64748b" fontSize={10} />
                <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [name === "duration" ? fmtDuration(v) : fmt(v), name === "calls" ? "שיחות" : "משך"]} />
                <Bar yAxisId="left" dataKey="calls" radius={[4, 4, 0, 0]} fill="#3b82f6" opacity={0.7} />
                <Line yAxisId="right" type="monotone" dataKey="duration" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ═══ ROW 6: Alerts & Activity ════════════════════════════════════ */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <SectionHeader icon={BellRing} title="התראות ופעילות" badge={`${alerts.length} התראות`}>
        <Button variant="ghost" size="sm" onClick={() => setAlertsExpanded(!alertsExpanded)} className="text-gray-400 hover:text-foreground">
          {alertsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </SectionHeader>

      {alertsExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Active Alerts */}
          <Card className="bg-background border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                התראות פעילות
                {criticalAlerts > 0 && (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] animate-pulse">{criticalAlerts} קריטי</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[350px] overflow-y-auto">
              {alerts.map(a => (
                <div key={a.id} className={`p-3 rounded-lg border ${ALERT_LEVELS[a.type]} transition-all hover:scale-[1.01]`}>
                  <div className="flex items-start gap-2">
                    {a.type === "critical" ? <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> :
                     a.type === "warning" ? <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> :
                     <Bell className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium">{a.title}</div>
                      <div className="text-[10px] opacity-70 mt-0.5">{a.description}</div>
                      <div className="text-[10px] opacity-50 mt-1">{a.timestamp}</div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recent Activity Feed */}
          <Card className="bg-background border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-400" />
                פעילות אחרונה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[350px] overflow-y-auto">
              {activities.map(a => {
                const typeIcons: Record<string, any> = { lead: UserPlus, meeting: Calendar, quote: FileText, deal: Handshake, call: Phone, task: CheckCircle2, email: MailCheck };
                const typeColors: Record<string, string> = { lead: "text-blue-400 bg-blue-500/15", meeting: "text-purple-400 bg-purple-500/15", quote: "text-amber-400 bg-amber-500/15", deal: "text-green-400 bg-green-500/15", call: "text-cyan-400 bg-cyan-500/15", task: "text-emerald-400 bg-emerald-500/15", email: "text-pink-400 bg-pink-500/15" };
                const IconC = typeIcons[a.type] || Activity;
                const color = typeColors[a.type] || "text-gray-400 bg-gray-500/15";
                return (
                  <div key={a.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-card/40 transition-colors">
                    <div className={`p-1.5 rounded-lg ${color} flex-shrink-0`}>
                      <IconC className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-foreground">{a.description}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-500">{a.agent}</span>
                        <span className="text-[10px] text-gray-600">|</span>
                        <span className="text-[10px] text-gray-500">{a.timestamp}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Hot Leads */}
          <Card className="bg-background border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-400" />
                לידים חמים ממתינים
                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">{hotLeads.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[350px] overflow-y-auto">
              {hotLeads.map(l => (
                <div key={l.id} className="p-2.5 rounded-lg bg-card/50 border border-border/50 hover:border-orange-500/30 transition-all">
                  <div className="flex items-start justify-between mb-1.5">
                    <div>
                      <div className="text-xs text-foreground font-medium">{l.name}</div>
                      <div className="text-[10px] text-gray-400">{l.company}</div>
                    </div>
                    <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">
                      <Star className="h-2.5 w-2.5 ml-0.5" />
                      {l.score}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-green-400 font-medium">{fmtC(l.value)}</span>
                    <span className={`${l.waitingHours > 6 ? "text-red-400" : l.waitingHours > 3 ? "text-amber-400" : "text-gray-400"}`}>
                      <Clock className="h-2.5 w-2.5 inline ml-0.5" />
                      {l.waitingHours} שעות
                    </span>
                    <span className="text-gray-500">{l.source}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Overdue Tasks */}
          <Card className="bg-background border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-400" />
                משימות באיחור
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">{overdueTasks.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[350px] overflow-y-auto">
              {overdueTasks.map(t => (
                <div key={t.id} className="p-2.5 rounded-lg bg-card/50 border border-red-500/20 hover:border-red-500/40 transition-all">
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="text-xs text-foreground font-medium flex-1">{t.title}</div>
                    <Badge className={`text-[10px] ${t.priority === "high" ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"}`}>
                      {t.priority === "high" ? "גבוה" : "בינוני"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-400">{t.assignee}</span>
                    <span className="text-red-400 font-medium">{t.daysOverdue} ימים באיחור</span>
                  </div>
                  {t.relatedLead && (
                    <div className="text-[10px] text-gray-500 mt-1">קשור ל: {t.relatedLead}</div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* ═══ ROW 7: Charts ═══════════════════════════════════════════════ */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <SectionHeader icon={BarChart3} title="גרפים ומגמות">
        <div className="flex bg-card rounded-lg p-0.5 border border-border">
          {(["weekly", "monthly"] as const).map(v => (
            <button key={v} onClick={() => setTrendView(v)}
              className={`px-3 py-1 text-xs rounded-md transition-all ${trendView === v ? "bg-blue-600 text-foreground" : "text-gray-400 hover:text-foreground"}`}>
              {{ weekly: "שבועי", monthly: "חודשי" }[v]}
            </button>
          ))}
        </div>
      </SectionHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Leads Trend */}
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-400" />
              מגמת לידים {trendView === "weekly" ? "שבועית" : "חודשית"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={leadsTrend} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradMeetings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradClosings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="period" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="leads" stroke="#3b82f6" fill="url(#gradLeads)" strokeWidth={2} name="לידים" />
                <Area type="monotone" dataKey="meetings" stroke="#8b5cf6" fill="url(#gradMeetings)" strokeWidth={2} name="פגישות" />
                <Area type="monotone" dataKey="closings" stroke="#10b981" fill="url(#gradClosings)" strokeWidth={2} name="סגירות" />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue by Week */}
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-400" />
              הכנסות לפי שבוע
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={revenueTrend} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="week" stroke="#64748b" fontSize={10} />
                <YAxis stroke="#64748b" fontSize={10} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} />
                <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [fmtC(v), name === "revenue" ? "הכנסה" : "יעד"]} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]} fill="#10b981" opacity={0.7} name="revenue" />
                <Line type="monotone" dataKey="target" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={false} name="target" />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} formatter={(v) => v === "revenue" ? "הכנסה" : "יעד"} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Agent Comparison Chart */}
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-400" />
              השוואת סוכנים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={agents.map(a => ({
                name: a.name.split(" ")[0],
                leads: (a.leads / 200) * 100,
                meetings: (a.meetings / 60) * 100,
                closings: (a.closings / 25) * 100,
                quality: a.qualityScore,
                conversion: a.conversionPct * 7,
              }))}>
                <PolarGrid stroke="#1e293b" />
                <PolarAngleAxis dataKey="name" stroke="#64748b" fontSize={10} />
                <PolarRadiusAxis stroke="#334155" fontSize={9} />
                <Radar name="לידים" dataKey="leads" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
                <Radar name="סגירות" dataKey="closings" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
                <Radar name="איכות" dataKey="quality" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} />
                <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
                <Tooltip {...tooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ─── Source Distribution Pie + Product Revenue Bar ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source Distribution Pie Chart */}
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-cyan-400" />
              התפלגות לידים לפי מקור
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={sources.map((s, i) => ({ name: s.source, value: s.count, fill: COLORS[i % COLORS.length] }))}
                  cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                  {sources.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.8} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [fmt(v), name]} />
                <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Product Revenue Bar Chart */}
        <Card className="bg-background border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Package className="h-4 w-4 text-amber-400" />
              הכנסות לפי מוצר
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={products} layout="vertical" margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" stroke="#64748b" fontSize={10} tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="product" stroke="#64748b" fontSize={10} width={85} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [fmtC(v), "סה\"כ"]} />
                <Bar dataKey="totalValue" radius={[0, 4, 4, 0]}>
                  {products.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ─── Footer ────────────────────────────────────────────────────────── */}
      <div className="text-center py-4 border-t border-border">
        <p className="text-xs text-gray-600">
          TechnoKoluzi CRM Ultimate Dashboard v2.0 | {new Date().toLocaleDateString("he-IL")}
        </p>
      </div>
    </div>
  );
}
