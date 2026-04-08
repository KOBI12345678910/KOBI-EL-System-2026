import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Bell, AlertTriangle, XCircle, CheckCircle, Clock, Eye, EyeOff,
  Shield, DollarSign, TrendingDown, TrendingUp, Users, Building2,
  CreditCard, Globe, Target, Zap, Settings2, Plus, Search, Filter,
  ArrowUpRight, ArrowDownRight, BellRing, BellOff, Volume2, VolumeX,
  Mail, MessageSquare, Smartphone, ChevronRight, MoreHorizontal,
  Trash2, Archive, RefreshCw, CheckCheck, Loader2
} from "lucide-react";

// ============================================================
// TYPES
// ============================================================
type AlertSeverity = "critical" | "high" | "medium" | "low" | "info";
type AlertCategory = "cashflow" | "receivables" | "payables" | "risk" | "compliance" | "budget" | "operations" | "fx" | "covenant" | "fraud";
type AlertStatus = "active" | "acknowledged" | "resolved" | "snoozed" | "dismissed";

interface FinAlert {
  id: number;
  title: string;
  description: string;
  category: AlertCategory;
  severity: AlertSeverity;
  status: AlertStatus;
  source: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  amount?: number;
  threshold?: string;
  currentValue?: string;
  triggeredAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  snoozedUntil?: string;
  channels: string[];
  assignedTo?: string;
  actionRequired?: string;
}

// ============================================================
// CATEGORY CONFIG
// ============================================================
const CATEGORIES: Record<AlertCategory, { label: string; icon: any; color: string; bg: string }> = {
  cashflow: { label: "תזרים מזומנים", icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
  receivables: { label: "חייבים וגבייה", icon: Users, color: "text-amber-600", bg: "bg-amber-50" },
  payables: { label: "זכאים ותשלומים", icon: Building2, color: "text-purple-600", bg: "bg-purple-50" },
  risk: { label: "סיכונים", icon: Shield, color: "text-red-600", bg: "bg-red-50" },
  compliance: { label: "רגולציה ומס", icon: Target, color: "text-indigo-600", bg: "bg-indigo-50" },
  budget: { label: "תקציב", icon: TrendingDown, color: "text-orange-600", bg: "bg-orange-50" },
  operations: { label: "תפעולי", icon: Zap, color: "text-green-600", bg: "bg-green-50" },
  fx: { label: 'מט"ח', icon: Globe, color: "text-pink-600", bg: "bg-pink-50" },
  covenant: { label: "Covenants", icon: Shield, color: "text-teal-600", bg: "bg-teal-50" },
  fraud: { label: "חשד להונאה", icon: AlertTriangle, color: "text-red-800", bg: "bg-red-100" },
};

const SEVERITY_CONFIG: Record<AlertSeverity, { label: string; color: string; bg: string; border: string; icon: any }> = {
  critical: { label: "קריטי", color: "text-red-700", bg: "bg-red-100", border: "border-red-300", icon: XCircle },
  high: { label: "גבוה", color: "text-orange-700", bg: "bg-orange-100", border: "border-orange-300", icon: AlertTriangle },
  medium: { label: "בינוני", color: "text-amber-700", bg: "bg-amber-100", border: "border-amber-300", icon: Clock },
  low: { label: "נמוך", color: "text-blue-700", bg: "bg-blue-100", border: "border-blue-300", icon: Eye },
  info: { label: "מידע", color: "text-gray-700", bg: "bg-gray-100", border: "border-gray-300", icon: Bell },
};

// ============================================================
// FALLBACK ALERTS DATA
// ============================================================
const FALLBACK_ALERTS: FinAlert[] = [
  {
    id: 1, title: "יתרת מזומנים מתחת לסף", description: "יתרת מזומנים בבנק לאומי ירדה מתחת ל-₪500K - הסף המינימלי שנקבע",
    category: "cashflow", severity: "critical", status: "active", source: "auto",
    entityType: "bank_account", entityId: "BA-001", entityName: "לאומי עו\"ש",
    amount: 420000, threshold: "₪500,000", currentValue: "₪420,000",
    triggeredAt: "2026-04-08 09:15", channels: ["email", "sms", "push"], assignedTo: "CFO",
    actionRequired: "העבר כספים מפיקדון או הגדל מסגרת"
  },
  {
    id: 2, title: "חשבונית באיחור 90+ ימים", description: "משרד הביטחון - חשבונית INV-000198 בסך ₪185K באיחור של 92 ימים",
    category: "receivables", severity: "critical", status: "acknowledged", source: "auto",
    entityType: "document", entityId: "INV-000198", entityName: "משרד הביטחון",
    amount: 185000, threshold: "90 ימים", currentValue: "92 ימים",
    triggeredAt: "2026-04-07 08:00", acknowledgedAt: "2026-04-07 08:45", acknowledgedBy: "שרה כהן",
    channels: ["email"], assignedTo: "גבייה"
  },
  {
    id: 3, title: "חריגת תקציב מחלקת שיווק", description: "הוצאות שיווק חרגו ב-12% מהתקציב הרבעוני",
    category: "budget", severity: "high", status: "active", source: "auto",
    threshold: "₪100,000", currentValue: "₪112,000",
    triggeredAt: "2026-04-06 14:00", channels: ["email"], assignedTo: "סמנכ\"ל שיווק",
    actionRequired: "אישור חריגה או קיזוז מרבעון הבא"
  },
  {
    id: 4, title: "שער EUR/ILS עלה מעל 3.90", description: "שער היורו חצה את הרף העליון - חשיפה לא מגודרת של €230K",
    category: "fx", severity: "high", status: "active", source: "market_feed",
    threshold: "3.90", currentValue: "3.92", amount: 230000,
    triggeredAt: "2026-04-08 10:30", channels: ["email", "push"], assignedTo: "Treasury",
    actionRequired: "בדוק הגדלת גידור - Forward נוסף"
  },
  {
    id: 5, title: "Covenant Current Ratio מתקרב לסף", description: "Current Ratio ירד ל-1.65 - קרוב לסף של 1.5 (headroom 10%)",
    category: "covenant", severity: "medium", status: "active", source: "auto",
    threshold: "1.50", currentValue: "1.65",
    triggeredAt: "2026-04-05 12:00", channels: ["email"], assignedTo: "CFO"
  },
  {
    id: 6, title: "כשל סליקת אשראי - 3 עסקאות ברצף", description: "3 עסקאות סליקה נכשלו מאותו מסוף - בדיקת תקינות נדרשת",
    category: "operations", severity: "high", status: "active", source: "payment_gateway",
    triggeredAt: "2026-04-08 11:20", channels: ["email", "sms"], assignedTo: "IT",
    actionRequired: "בדוק מסוף סליקה T-001"
  },
  {
    id: 7, title: "עסקה חריגה - סכום גבוה מהרגיל", description: "תשלום יוצא של ₪450K לספק חדש - חורג מ-3σ מהממוצע",
    category: "fraud", severity: "critical", status: "active", source: "anomaly_detection",
    amount: 450000, threshold: "3σ = ₪180K", currentValue: "₪450K",
    triggeredAt: "2026-04-08 11:45", channels: ["email", "sms", "push"], assignedTo: "CFO",
    actionRequired: "אשר או חסום - בדיקת ספק נדרשת"
  },
  {
    id: 8, title: "מועד הגשת דוח מע\"מ בעוד 5 ימים", description: "דוח מע\"מ לחודש מרץ 2026 - מועד הגשה 15.04.2026",
    category: "compliance", severity: "medium", status: "active", source: "calendar",
    triggeredAt: "2026-04-10 08:00", channels: ["email"], assignedTo: "חשבונאות",
    actionRequired: "ודא שכל החשבוניות עודכנו"
  },
  {
    id: 9, title: "תשלום לספק Foshan נדחה", description: "SWIFT payment $180K נדחה ע\"י הבנק - חסר אישור OFAC",
    category: "payables", severity: "high", status: "acknowledged", source: "bank_notification",
    amount: 180000, entityName: "Foshan Glass Co.",
    triggeredAt: "2026-04-07 16:00", acknowledgedAt: "2026-04-08 08:00", acknowledgedBy: "Treasury",
    channels: ["email"], actionRequired: "השלם טופס compliance ושלח שוב"
  },
  {
    id: 10, title: "ירידת DSO ב-15% - חיובי!", description: "DSO ירד מ-48 ל-42 ימים - שיפור בגבייה",
    category: "receivables", severity: "info", status: "resolved", source: "auto",
    currentValue: "42 ימים", threshold: "48 ימים (קודם)",
    triggeredAt: "2026-04-01 08:00", resolvedAt: "2026-04-01 08:00", resolvedBy: "system",
    channels: ["email"]
  },
  {
    id: 11, title: "פרויקט קרית אתא - חריגה 15%", description: "עלויות בפועל חורגות ב-15% מהתקציב המקורי",
    category: "budget", severity: "high", status: "active", source: "auto",
    entityType: "project", entityName: "קרית אתא - שלב ב'", amount: 180000,
    threshold: "₪1,200,000", currentValue: "₪1,380,000",
    triggeredAt: "2026-04-04 09:00", channels: ["email"], assignedTo: "PM"
  },
  {
    id: 12, title: "ריכוזיות לקוח A עלתה ל-38%", description: "לקוח A מהווה 38% מההכנסות - מעל הסף של 35%",
    category: "risk", severity: "medium", status: "snoozed", source: "auto",
    threshold: "35%", currentValue: "38%", snoozedUntil: "2026-04-15",
    triggeredAt: "2026-04-01 08:00", channels: ["email"], assignedTo: "CFO"
  },
];

// ============================================================
// FALLBACK ALERT RULES
// ============================================================
const FALLBACK_ALERT_RULES = [
  { id: 1, name: "יתרת מזומנים מינימלית", category: "cashflow", condition: "cash_balance < 500000", severity: "critical", channels: ["email", "sms", "push"], isActive: true },
  { id: 2, name: "חשבונית באיחור 60+", category: "receivables", condition: "days_overdue > 60", severity: "high", channels: ["email"], isActive: true },
  { id: 3, name: "חשבונית באיחור 90+", category: "receivables", condition: "days_overdue > 90", severity: "critical", channels: ["email", "sms"], isActive: true },
  { id: 4, name: "חריגת תקציב 10%+", category: "budget", condition: "actual > budget * 1.10", severity: "high", channels: ["email"], isActive: true },
  { id: 5, name: "שער מט\"ח חריג", category: "fx", condition: "rate > upper_bound OR rate < lower_bound", severity: "high", channels: ["email", "push"], isActive: true },
  { id: 6, name: "Covenant Headroom < 15%", category: "covenant", condition: "headroom < 0.15", severity: "medium", channels: ["email"], isActive: true },
  { id: 7, name: "כשל סליקה רצוף", category: "operations", condition: "consecutive_failures >= 3", severity: "high", channels: ["email", "sms"], isActive: true },
  { id: 8, name: "עסקה חריגה (>3σ)", category: "fraud", condition: "amount > mean + 3 * stddev", severity: "critical", channels: ["email", "sms", "push"], isActive: true },
  { id: 9, name: "מועד דיווח רגולטורי", category: "compliance", condition: "days_until_deadline <= 7", severity: "medium", channels: ["email"], isActive: true },
  { id: 10, name: "ריכוזיות לקוח > 35%", category: "risk", condition: "customer_concentration > 35", severity: "medium", channels: ["email"], isActive: true },
  { id: 11, name: "DSO עולה מעל 50", category: "receivables", condition: "dso > 50", severity: "medium", channels: ["email"], isActive: true },
  { id: 12, name: "תשלום ספק נדחה", category: "payables", condition: "payment.rejected", severity: "high", channels: ["email"], isActive: true },
];

// ============================================================
// HELPERS
// ============================================================
const fmt = (v: number) => `₪${v.toLocaleString("he-IL")}`;

function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const cfg = SEVERITY_CONFIG[severity];
  const Icon = cfg.icon;
  return (
    <Badge className={`${cfg.bg} ${cfg.color} border ${cfg.border} text-[10px] gap-0.5`}>
      <Icon className="h-3 w-3" />{cfg.label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: AlertStatus }) {
  switch (status) {
    case "active": return <Badge className="bg-red-100 text-red-700 text-[9px]"><BellRing className="h-2.5 w-2.5 ml-0.5" />פעילה</Badge>;
    case "acknowledged": return <Badge className="bg-blue-100 text-blue-700 text-[9px]"><Eye className="h-2.5 w-2.5 ml-0.5" />נצפתה</Badge>;
    case "resolved": return <Badge className="bg-emerald-100 text-emerald-700 text-[9px]"><CheckCircle className="h-2.5 w-2.5 ml-0.5" />נפתרה</Badge>;
    case "snoozed": return <Badge className="bg-purple-100 text-purple-700 text-[9px]"><BellOff className="h-2.5 w-2.5 ml-0.5" />מושהית</Badge>;
    case "dismissed": return <Badge className="bg-gray-100 text-gray-700 text-[9px]"><EyeOff className="h-2.5 w-2.5 ml-0.5" />בוטלה</Badge>;
  }
}

function ChannelIcons({ channels }: { channels: string[] }) {
  return (
    <div className="flex gap-1">
      {channels.includes("email") && <Mail className="h-3 w-3 text-blue-500" />}
      {channels.includes("sms") && <Smartphone className="h-3 w-3 text-green-500" />}
      {channels.includes("push") && <Bell className="h-3 w-3 text-amber-500" />}
      {channels.includes("whatsapp") && <MessageSquare className="h-3 w-3 text-emerald-500" />}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function FinanceAlerts() {
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "all">("active");
  const [search, setSearch] = useState("");
  const [showCreateRule, setShowCreateRule] = useState(false);

  const { data: alerts = FALLBACK_ALERTS, isLoading: isLoadingAlerts } = useQuery({
    queryKey: ["finance-alerts"],
    queryFn: async () => {
      const r = await authFetch("/api/finance/alerts");
      if (!r.ok) return FALLBACK_ALERTS;
      return r.json();
    },
  });

  const { data: alertRules = FALLBACK_ALERT_RULES, isLoading: isLoadingRules } = useQuery({
    queryKey: ["finance-alert-rules"],
    queryFn: async () => {
      const r = await authFetch("/api/finance/alerts/rules");
      if (!r.ok) return FALLBACK_ALERT_RULES;
      return r.json();
    },
  });

  const isLoading = isLoadingAlerts || isLoadingRules;

  const filtered = useMemo(() =>
    alerts.filter((a: FinAlert) => {
      if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
      if (severityFilter !== "all" && a.severity !== severityFilter) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (search && !a.title.includes(search) && !a.description.includes(search)) return false;
      return true;
    }).sort((a, b) => {
      const sev = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      return sev[a.severity] - sev[b.severity];
    }),
    [categoryFilter, severityFilter, statusFilter, search, alerts]
  );

  // Summary
  const activeAlerts = alerts.filter((a: FinAlert) => a.status === "active");
  const criticalCount = activeAlerts.filter((a: FinAlert) => a.severity === "critical").length;
  const highCount = activeAlerts.filter((a: FinAlert) => a.severity === "high").length;
  const acknowledgedCount = alerts.filter((a: FinAlert) => a.status === "acknowledged").length;
  const resolvedToday = alerts.filter((a: FinAlert) => a.status === "resolved" && a.resolvedAt?.startsWith("2026-04-08")).length;

  // Category summary
  const categorySummary = useMemo(() =>
    Object.entries(CATEGORIES).map(([key, cfg]) => ({
      key: key as AlertCategory,
      ...cfg,
      count: activeAlerts.filter((a: FinAlert) => a.category === key).length,
      criticalCount: activeAlerts.filter((a: FinAlert) => a.category === key && a.severity === "critical").length,
    })).filter(c => c.count > 0).sort((a, b) => b.criticalCount - a.criticalCount || b.count - a.count),
    [alerts]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="mr-3 text-muted-foreground">טוען התראות פיננסיות...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-7 w-7 text-primary" /> התראות פיננסיות
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            מעקב חריגות | סיכונים | תזרים | רגולציה | Covenants | חשד הונאה
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {/* acknowledge all */}}>
            <CheckCheck className="h-3.5 w-3.5 ml-1" /> סמן הכל כנצפה
          </Button>
          <Button variant="outline" size="sm"><Settings2 className="h-3.5 w-3.5 ml-1" /> הגדרות</Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-5 gap-3">
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="pt-3 pb-2 flex items-center gap-3">
            <XCircle className="h-8 w-8 text-red-600" />
            <div>
              <p className="text-[10px] text-red-700">קריטיות</p>
              <p className="text-2xl font-bold text-red-800">{criticalCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/40">
          <CardContent className="pt-3 pb-2 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-orange-600" />
            <div>
              <p className="text-[10px] text-orange-700">גבוהות</p>
              <p className="text-2xl font-bold text-orange-800">{highCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="pt-3 pb-2 flex items-center gap-3">
            <BellRing className="h-8 w-8 text-amber-600" />
            <div>
              <p className="text-[10px] text-amber-700">פעילות</p>
              <p className="text-2xl font-bold text-amber-800">{activeAlerts.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="pt-3 pb-2 flex items-center gap-3">
            <Eye className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-[10px] text-blue-700">נצפו</p>
              <p className="text-2xl font-bold text-blue-800">{acknowledgedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="pt-3 pb-2 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
            <div>
              <p className="text-[10px] text-emerald-700">נפתרו היום</p>
              <p className="text-2xl font-bold text-emerald-800">{resolvedToday}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Chips */}
      <div className="flex gap-2 flex-wrap">
        {categorySummary.map(cat => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.key}
              onClick={() => setCategoryFilter(categoryFilter === cat.key ? "all" : cat.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                categoryFilter === cat.key ? `${cat.bg} border-current ${cat.color}` : "bg-card border-border hover:bg-accent"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {cat.label}
              <Badge variant="secondary" className="text-[9px] h-4 px-1">{cat.count}</Badge>
              {cat.criticalCount > 0 && (
                <span className="h-4 px-1 rounded-full bg-red-500 text-white text-[9px] flex items-center">{cat.criticalCount}</span>
              )}
            </button>
          );
        })}
      </div>

      <Tabs defaultValue="alerts">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="alerts" className="text-xs gap-1"><Bell className="h-3.5 w-3.5" /> התראות ({filtered.length})</TabsTrigger>
          <TabsTrigger value="rules" className="text-xs gap-1"><Settings2 className="h-3.5 w-3.5" /> כללים ({alertRules.length})</TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1"><Clock className="h-3.5 w-3.5" /> היסטוריה</TabsTrigger>
        </TabsList>

        {/* Alerts List */}
        <TabsContent value="alerts" className="space-y-3">
          {/* Filters */}
          <Card>
            <CardContent className="pt-3 pb-3">
              <div className="flex gap-3 items-center">
                <div className="relative flex-1">
                  <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="חפש התראה..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs pr-8" />
                </div>
                <Select value={severityFilter} onValueChange={v => setSeverityFilter(v as any)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="חומרה" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל החומרות</SelectItem>
                    {Object.entries(SEVERITY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="סטטוס" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    <SelectItem value="active">פעילות</SelectItem>
                    <SelectItem value="acknowledged">נצפו</SelectItem>
                    <SelectItem value="resolved">נפתרו</SelectItem>
                    <SelectItem value="snoozed">מושהות</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Alert Cards */}
          <ScrollArea className="max-h-[600px]">
            <div className="space-y-2">
              {filtered.map(alert => {
                const catCfg = CATEGORIES[alert.category];
                const CatIcon = catCfg.icon;
                const sevCfg = SEVERITY_CONFIG[alert.severity];

                return (
                  <Card key={alert.id} className={`border-r-4 ${
                    alert.severity === "critical" ? "border-r-red-500 bg-red-50/20" :
                    alert.severity === "high" ? "border-r-orange-500 bg-orange-50/10" :
                    alert.severity === "medium" ? "border-r-amber-400" :
                    alert.severity === "info" ? "border-r-blue-300" : ""
                  }`}>
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className={`p-2 rounded-lg ${catCfg.bg} shrink-0`}>
                          <CatIcon className={`h-5 w-5 ${catCfg.color}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm">{alert.title}</h3>
                            <SeverityBadge severity={alert.severity} />
                            <StatusBadge status={alert.status} />
                            <Badge variant="outline" className="text-[9px]">{catCfg.label}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{alert.description}</p>

                          {/* Details row */}
                          <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{alert.triggeredAt}</span>
                            {alert.amount && <span className="font-mono font-semibold text-foreground">{fmt(alert.amount)}</span>}
                            {alert.threshold && <span>סף: {alert.threshold}</span>}
                            {alert.currentValue && <span>בפועל: <strong>{alert.currentValue}</strong></span>}
                            {alert.assignedTo && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{alert.assignedTo}</span>}
                            <ChannelIcons channels={alert.channels} />
                          </div>

                          {/* Action required */}
                          {alert.actionRequired && alert.status === "active" && (
                            <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
                              <strong>נדרש:</strong> {alert.actionRequired}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1 shrink-0">
                          {alert.status === "active" && (
                            <Button variant="outline" size="sm" className="h-7 text-[10px]">
                              <Eye className="h-3 w-3 ml-1" />נצפה
                            </Button>
                          )}
                          {(alert.status === "active" || alert.status === "acknowledged") && (
                            <Button variant="outline" size="sm" className="h-7 text-[10px]">
                              <CheckCircle className="h-3 w-3 ml-1" />פתור
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 text-[10px]">
                            <BellOff className="h-3 w-3 ml-1" />השהה
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {filtered.length === 0 && (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
                    <p>אין התראות תואמות</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Alert Rules */}
        <TabsContent value="rules">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">כללי התראה ({alertRules.length})</CardTitle>
              <Button size="sm"><Plus className="h-3.5 w-3.5 ml-1" /> כלל חדש</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">כלל</TableHead>
                    <TableHead className="text-right text-xs font-semibold">קטגוריה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">תנאי</TableHead>
                    <TableHead className="text-right text-xs font-semibold">חומרה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">ערוצים</TableHead>
                    <TableHead className="text-right text-xs font-semibold">פעיל</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertRules.map(rule => (
                    <TableRow key={rule.id} className="hover:bg-muted/10">
                      <TableCell className="font-medium text-xs">{rule.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[9px]">{CATEGORIES[rule.category as AlertCategory]?.label}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground max-w-[200px] truncate">{rule.condition}</TableCell>
                      <TableCell><SeverityBadge severity={rule.severity as AlertSeverity} /></TableCell>
                      <TableCell><ChannelIcons channels={rule.channels} /></TableCell>
                      <TableCell>
                        <Switch checked={rule.isActive} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">היסטוריית התראות</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {alerts.filter(a => a.status === "resolved" || a.acknowledgedAt).sort((a, b) =>
                  (b.resolvedAt || b.acknowledgedAt || "").localeCompare(a.resolvedAt || a.acknowledgedAt || "")
                ).map(a => (
                  <div key={a.id} className="flex items-center gap-3 py-2 border-b last:border-0 text-xs">
                    <SeverityBadge severity={a.severity} />
                    <span className="flex-1">{a.title}</span>
                    <span className="text-muted-foreground">
                      {a.resolvedAt ? `נפתר ${a.resolvedAt}` : a.acknowledgedAt ? `נצפה ${a.acknowledgedAt}` : ""}
                    </span>
                    <StatusBadge status={a.status} />
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
