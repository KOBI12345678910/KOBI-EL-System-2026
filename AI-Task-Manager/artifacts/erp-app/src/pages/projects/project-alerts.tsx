import { useState } from "react";
import {
  Bell, AlertTriangle, ShieldAlert, CheckCircle2, DollarSign,
  Clock, TrendingDown, Package, Truck, Wrench, Home, CreditCard,
  Flame, Settings, Search, Filter, Eye, X, ToggleLeft, ToggleRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

type Severity = "critical" | "high" | "medium" | "low";
type AlertType = "budget_overrun" | "schedule_overdue" | "margin_erosion" | "blocked_tasks" |
  "procurement_delay" | "production_delay" | "installation_delay" | "collection_overdue" | "risk_escalation";

interface Alert {
  id: string;
  severity: Severity;
  type: AlertType;
  project: string;
  description: string;
  rule: string;
  timestamp: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

const severityConfig: Record<Severity, { label: string; color: string; icon: any }> = {
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: ShieldAlert },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: AlertTriangle },
  medium: { label: "בינוני", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Bell },
  low: { label: "נמוך", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Bell },
};

const typeConfig: Record<AlertType, { label: string; icon: any }> = {
  budget_overrun: { label: "חריגת תקציב", icon: DollarSign },
  schedule_overdue: { label: "איחור בלוח זמנים", icon: Clock },
  margin_erosion: { label: "שחיקת מרווח", icon: TrendingDown },
  blocked_tasks: { label: "משימות חסומות", icon: Wrench },
  procurement_delay: { label: "עיכוב רכש", icon: Package },
  production_delay: { label: "עיכוב ייצור", icon: Truck },
  installation_delay: { label: "עיכוב התקנה", icon: Home },
  collection_overdue: { label: "איחור גבייה", icon: CreditCard },
  risk_escalation: { label: "הסלמת סיכון", icon: Flame },
};

const activeAlerts: Alert[] = [
  { id: "ALR-001", severity: "critical", type: "budget_overrun", project: "פרויקט מגדלי הים - חיפה", description: "תקציב חומרי גלם חרג ב-94% מהתקציב המקורי", rule: "חריגת תקציב > 90%", timestamp: "2026-04-08 08:15" },
  { id: "ALR-002", severity: "critical", type: "schedule_overdue", project: "מרכז מסחרי רמת גן", description: "איחור של 12 ימים בשלב הייצור - מועד אספקה בסיכון", rule: "איחור > 7 ימים", timestamp: "2026-04-08 07:30" },
  { id: "ALR-003", severity: "high", type: "margin_erosion", project: "בניין משרדים הרצליה", description: "המרווח ירד ל-8.2% - מתחת לסף המינימלי", rule: "מרווח < 10%", timestamp: "2026-04-08 06:45" },
  { id: "ALR-004", severity: "high", type: "blocked_tasks", project: "פרויקט מגדלי הים - חיפה", description: "4 משימות חסומות בהמתנה לאישור תכניות מהנדס", rule: "משימות חסומות > 3", timestamp: "2026-04-07 16:20" },
  { id: "ALR-005", severity: "critical", type: "procurement_delay", project: "מלון ים המלח", description: "אלומיניום 6063-T5 - עיכוב של 3 שבועות מהספק", rule: "עיכוב רכש > 14 יום", timestamp: "2026-04-07 14:00" },
  { id: "ALR-006", severity: "medium", type: "production_delay", project: "בניין מגורים נתניה", description: "קו ייצור חלונות - תפוקה ירדה ב-35%", rule: "ירידת תפוקה > 25%", timestamp: "2026-04-07 11:30" },
  { id: "ALR-007", severity: "high", type: "installation_delay", project: "מרכז מסחרי רמת גן", description: "צוות התקנה מדווח על אי-התאמה במידות באתר", rule: "עיכוב התקנה > 3 ימים", timestamp: "2026-04-07 09:15" },
  { id: "ALR-008", severity: "medium", type: "collection_overdue", project: "קניון הנגב - באר שבע", description: "חשבונית ₪485,000 - 45 יום באיחור גבייה", rule: "איחור גבייה > 30 יום", timestamp: "2026-04-06 17:00" },
  { id: "ALR-009", severity: "low", type: "risk_escalation", project: "בניין משרדים הרצליה", description: "סיכון שינוי תכניות עלה מבינוני לגבוה", rule: "שינוי דרגת סיכון", timestamp: "2026-04-06 15:30" },
  { id: "ALR-010", severity: "medium", type: "budget_overrun", project: "פרויקט וילות קיסריה", description: "תקציב עבודת חוץ חרג ב-91% מהתקציב", rule: "חריגת תקציב > 90%", timestamp: "2026-04-06 13:00" },
  { id: "ALR-011", severity: "high", type: "schedule_overdue", project: "מלון ים המלח", description: "שלב ייצור זכוכית מאחר ב-9 ימים", rule: "איחור > 7 ימים", timestamp: "2026-04-06 10:45" },
  { id: "ALR-012", severity: "low", type: "blocked_tasks", project: "בניין מגורים נתניה", description: "2 משימות ממתינות לאישור תקציב נוסף", rule: "משימות חסומות > 1", timestamp: "2026-04-06 08:20" },
];

const historyAlerts: Alert[] = [
  { id: "ALR-H01", severity: "critical", type: "budget_overrun", project: "פרויקט תעשייה אשדוד", description: "חריגת 96% בתקציב פלדה", rule: "חריגת תקציב > 90%", timestamp: "2026-04-05 08:00", resolvedAt: "2026-04-05 14:30", resolvedBy: "עוזי כהן" },
  { id: "ALR-H02", severity: "high", type: "schedule_overdue", project: "בניין מגורים נתניה", description: "איחור 10 ימים בשלב הרכבה", rule: "איחור > 7 ימים", timestamp: "2026-04-04 09:15", resolvedAt: "2026-04-05 11:00", resolvedBy: "דני לוי" },
  { id: "ALR-H03", severity: "medium", type: "procurement_delay", project: "מרכז מסחרי רמת גן", description: "עיכוב אספקת זכוכית מחוסמת", rule: "עיכוב רכש > 14 יום", timestamp: "2026-04-03 10:00", resolvedAt: "2026-04-04 16:00", resolvedBy: "מירב שלום" },
  { id: "ALR-H04", severity: "high", type: "margin_erosion", project: "קניון הנגב - באר שבע", description: "מרווח ירד ל-7.5%", rule: "מרווח < 10%", timestamp: "2026-04-03 07:30", resolvedAt: "2026-04-04 09:00", resolvedBy: "עוזי כהן" },
  { id: "ALR-H05", severity: "critical", type: "production_delay", project: "מלון ים המלח", description: "תקלה בקו CNC - עצירה מלאה", rule: "עצירת ייצור", timestamp: "2026-04-02 06:00", resolvedAt: "2026-04-02 18:00", resolvedBy: "יוסי מזרחי" },
  { id: "ALR-H06", severity: "low", type: "risk_escalation", project: "פרויקט וילות קיסריה", description: "סיכון מזג אוויר עלה לגבוה", rule: "שינוי דרגת סיכון", timestamp: "2026-04-02 14:00", resolvedAt: "2026-04-03 08:00", resolvedBy: "רונית אביב" },
  { id: "ALR-H07", severity: "medium", type: "collection_overdue", project: "בניין משרדים הרצליה", description: "חשבונית ₪320,000 באיחור 35 יום", rule: "איחור גבייה > 30 יום", timestamp: "2026-04-01 11:00", resolvedAt: "2026-04-02 15:00", resolvedBy: "שרה גולד" },
  { id: "ALR-H08", severity: "high", type: "installation_delay", project: "פרויקט תעשייה אשדוד", description: "עיכוב 5 ימים בהתקנת מערכת חזיתות", rule: "עיכוב התקנה > 3 ימים", timestamp: "2026-04-01 08:30", resolvedAt: "2026-04-01 17:00", resolvedBy: "אבי ברק" },
  { id: "ALR-H09", severity: "medium", type: "blocked_tasks", project: "מגדלי הים - חיפה", description: "3 משימות חסומות בהמתנה לחומרים", rule: "משימות חסומות > 3", timestamp: "2026-03-31 09:00", resolvedAt: "2026-04-01 10:00", resolvedBy: "דני לוי" },
  { id: "ALR-H10", severity: "critical", type: "budget_overrun", project: "מלון ים המלח", description: "תקציב כולל חרג ב-95%", rule: "חריגת תקציב > 90%", timestamp: "2026-03-30 07:00", resolvedAt: "2026-03-31 12:00", resolvedBy: "עוזי כהן" },
  { id: "ALR-H11", severity: "low", type: "schedule_overdue", project: "פרויקט וילות קיסריה", description: "איחור 8 ימים בשלב תכנון", rule: "איחור > 7 ימים", timestamp: "2026-03-29 13:00", resolvedAt: "2026-03-30 09:00", resolvedBy: "מירב שלום" },
  { id: "ALR-H12", severity: "high", type: "procurement_delay", project: "בניין מגורים נתניה", description: "עיכוב 18 יום באספקת אטמים", rule: "עיכוב רכש > 14 יום", timestamp: "2026-03-28 10:00", resolvedAt: "2026-03-29 16:00", resolvedBy: "יוסי מזרחי" },
  { id: "ALR-H13", severity: "medium", type: "production_delay", project: "קניון הנגב - באר שבע", description: "ירידת 30% בתפוקת דלתות", rule: "ירידת תפוקה > 25%", timestamp: "2026-03-27 08:00", resolvedAt: "2026-03-28 14:00", resolvedBy: "אבי ברק" },
  { id: "ALR-H14", severity: "high", type: "margin_erosion", project: "פרויקט תעשייה אשדוד", description: "מרווח 6.8% - מתחת לסף קריטי", rule: "מרווח < 10%", timestamp: "2026-03-26 07:30", resolvedAt: "2026-03-27 11:00", resolvedBy: "שרה גולד" },
  { id: "ALR-H15", severity: "low", type: "collection_overdue", project: "מרכז מסחרי רמת גן", description: "חשבונית ₪180,000 באיחור 32 יום", rule: "איחור גבייה > 30 יום", timestamp: "2026-03-25 14:00", resolvedAt: "2026-03-26 10:00", resolvedBy: "רונית אביב" },
];

interface RuleConfig {
  id: string;
  type: AlertType;
  name: string;
  threshold: string;
  enabled: boolean;
  severity: Severity;
}

const initialRules: RuleConfig[] = [
  { id: "R1", type: "budget_overrun", name: "חריגת תקציב", threshold: "90", enabled: true, severity: "critical" },
  { id: "R2", type: "schedule_overdue", name: "איחור לוח זמנים", threshold: "7", enabled: true, severity: "high" },
  { id: "R3", type: "margin_erosion", name: "שחיקת מרווח רווח", threshold: "10", enabled: true, severity: "high" },
  { id: "R4", type: "blocked_tasks", name: "משימות חסומות", threshold: "3", enabled: true, severity: "medium" },
  { id: "R5", type: "procurement_delay", name: "עיכוב רכש", threshold: "14", enabled: true, severity: "critical" },
  { id: "R6", type: "production_delay", name: "עיכוב ייצור", threshold: "25", enabled: true, severity: "medium" },
  { id: "R7", type: "installation_delay", name: "עיכוב התקנה", threshold: "3", enabled: true, severity: "high" },
  { id: "R8", type: "collection_overdue", name: "איחור גבייה", threshold: "30", enabled: true, severity: "medium" },
  { id: "R9", type: "risk_escalation", name: "הסלמת סיכון", threshold: "1", enabled: true, severity: "low" },
];

const thresholdUnits: Record<AlertType, string> = {
  budget_overrun: "% מהתקציב",
  schedule_overdue: "ימים",
  margin_erosion: "% מרווח מינימלי",
  blocked_tasks: "משימות",
  procurement_delay: "ימים",
  production_delay: "% ירידת תפוקה",
  installation_delay: "ימים",
  collection_overdue: "ימים",
  risk_escalation: "דרגות שינוי",
};

function KpiCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: any; color: string }) {
  return (
    <Card className="border-border/50 bg-card/80">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
          <div className={`p-2 rounded-lg ${color.replace("text-", "bg-").replace("400", "500/20").replace("500", "500/20")}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProjectAlertsPage() {
  const [tab, setTab] = useState("active");
  const [search, setSearch] = useState("");
  const [filterSeverity, setFilterSeverity] = useState<Severity | "all">("all");
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [rules, setRules] = useState<RuleConfig[]>(initialRules);

  const criticalCount = activeAlerts.filter(a => a.severity === "critical").length;
  const budgetAlertCount = activeAlerts.filter(a => a.type === "budget_overrun").length;
  const scheduleAlertCount = activeAlerts.filter(a => a.type === "schedule_overdue" || a.type === "installation_delay" || a.type === "production_delay").length;
  const resolvedTodayCount = historyAlerts.filter(a => a.resolvedAt?.startsWith("2026-04-08") || a.resolvedAt?.startsWith("2026-04-05")).length;

  const filteredActive = activeAlerts.filter(a => {
    const matchSearch = !search || a.project.includes(search) || a.description.includes(search) || a.id.includes(search);
    const matchSeverity = filterSeverity === "all" || a.severity === filterSeverity;
    return matchSearch && matchSeverity;
  });

  const filteredHistory = historyAlerts.filter(a => {
    const matchSearch = !search || a.project.includes(search) || a.description.includes(search) || a.id.includes(search);
    const matchSeverity = filterSeverity === "all" || a.severity === filterSeverity;
    return matchSearch && matchSeverity;
  });

  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const updateThreshold = (id: string, value: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, threshold: value } : r));
  };

  const updateSeverity = (id: string, severity: Severity) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, severity } : r));
  };

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell className="h-7 w-7 text-orange-400" />
            התראות פרויקטים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מערכת התראות חכמה מבוססת כללים עסקיים</p>
        </div>
        <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 text-sm px-3 py-1">
          {activeAlerts.length} התראות פעילות
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard title="התראות פעילות" value={activeAlerts.length} icon={Bell} color="text-orange-400" />
        <KpiCard title="קריטיות" value={criticalCount} icon={ShieldAlert} color="text-red-400" />
        <KpiCard title="התראות תקציב" value={budgetAlertCount} icon={DollarSign} color="text-yellow-400" />
        <KpiCard title="התראות לו״ז" value={scheduleAlertCount} icon={Clock} color="text-blue-400" />
        <KpiCard title="נפתרו היום" value={resolvedTodayCount} icon={CheckCircle2} color="text-green-400" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי פרויקט, תיאור, מזהה..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9 bg-card/80 border-border/50"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "critical", "high", "medium", "low"] as const).map(s => (
            <Button
              key={s}
              size="sm"
              variant={filterSeverity === s ? "default" : "outline"}
              onClick={() => setFilterSeverity(s)}
              className="text-xs"
            >
              {s === "all" ? "הכל" : severityConfig[s].label}
            </Button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card/80 border border-border/50">
          <TabsTrigger value="active" className="gap-2">
            <AlertTriangle className="h-4 w-4" /> התראות פעילות ({filteredActive.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <CheckCircle2 className="h-4 w-4" /> היסטוריה ({filteredHistory.length})
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <Settings className="h-4 w-4" /> הגדרת כללים ({rules.length})
          </TabsTrigger>
        </TabsList>

        {/* Active Alerts */}
        <TabsContent value="active" className="space-y-3 mt-4">
          {filteredActive.length === 0 && (
            <Card className="border-border/50 bg-card/80"><CardContent className="p-8 text-center text-muted-foreground">אין התראות פעילות</CardContent></Card>
          )}
          {filteredActive.map(alert => {
            const sev = severityConfig[alert.severity];
            const typ = typeConfig[alert.type];
            const SevIcon = sev.icon;
            const TypeIcon = typ.icon;
            return (
              <Card key={alert.id} className={`border-border/50 bg-card/80 hover:bg-card transition-colors cursor-pointer ${alert.severity === "critical" ? "border-r-2 border-r-red-500" : ""}`} onClick={() => setSelectedAlert(alert)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg mt-0.5 ${sev.color.split(" ")[0]}`}>
                      <SevIcon className={`h-5 w-5 ${sev.color.split(" ")[1]}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs text-muted-foreground">{alert.id}</span>
                        <Badge className={`text-[10px] ${sev.color}`}>{sev.label}</Badge>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <TypeIcon className="h-3 w-3" /> {typ.label}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-foreground">{alert.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{alert.project}</span>
                        <span>כלל: {alert.rule}</span>
                        <span>{alert.timestamp}</span>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={e => { e.stopPropagation(); setSelectedAlert(alert); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="space-y-3 mt-4">
          {filteredHistory.length === 0 && (
            <Card className="border-border/50 bg-card/80"><CardContent className="p-8 text-center text-muted-foreground">אין התראות בהיסטוריה</CardContent></Card>
          )}
          {filteredHistory.map(alert => {
            const sev = severityConfig[alert.severity];
            const typ = typeConfig[alert.type];
            const TypeIcon = typ.icon;
            return (
              <Card key={alert.id} className="border-border/50 bg-card/80 opacity-80">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg mt-0.5 bg-green-500/20">
                      <CheckCircle2 className="h-5 w-5 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs text-muted-foreground">{alert.id}</span>
                        <Badge className={`text-[10px] ${sev.color}`}>{sev.label}</Badge>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <TypeIcon className="h-3 w-3" /> {typ.label}
                        </Badge>
                        <Badge className="text-[10px] bg-green-500/20 text-green-400">נפתרה</Badge>
                      </div>
                      <p className="text-sm text-foreground">{alert.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{alert.project}</span>
                        <span>נוצרה: {alert.timestamp}</span>
                        <span>נפתרה: {alert.resolvedAt}</span>
                        <span>ע״י: {alert.resolvedBy}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Rules Configuration */}
        <TabsContent value="rules" className="mt-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5 text-muted-foreground" />
                הגדרת כללי התראות
              </CardTitle>
              <p className="text-xs text-muted-foreground">הגדר סף הפעלה, דרגת חומרה והפעלה/כיבוי לכל סוג התראה</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {rules.map(rule => {
                const typ = typeConfig[rule.type];
                const TypeIcon = typ.icon;
                const sev = severityConfig[rule.severity];
                return (
                  <div key={rule.id} className={`flex items-center gap-4 p-4 rounded-lg border border-border/50 ${rule.enabled ? "bg-card" : "bg-muted/20 opacity-60"}`}>
                    <Button size="sm" variant="ghost" onClick={() => toggleRule(rule.id)} className="shrink-0 p-1">
                      {rule.enabled
                        ? <ToggleRight className="h-6 w-6 text-green-400" />
                        : <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                      }
                    </Button>
                    <div className="p-2 rounded-lg bg-card border border-border/30">
                      <TypeIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{rule.name}</p>
                      <p className="text-xs text-muted-foreground">{typ.label}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">סף:</span>
                      <Input
                        type="number"
                        value={rule.threshold}
                        onChange={e => updateThreshold(rule.id, e.target.value)}
                        className="w-20 h-8 text-center text-sm bg-card border-border/50"
                      />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{thresholdUnits[rule.type]}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">חומרה:</span>
                      <select
                        value={rule.severity}
                        onChange={e => updateSeverity(rule.id, e.target.value as Severity)}
                        className="h-8 px-2 text-xs rounded-md border border-border/50 bg-card text-foreground"
                      >
                        <option value="critical">קריטי</option>
                        <option value="high">גבוה</option>
                        <option value="medium">בינוני</option>
                        <option value="low">נמוך</option>
                      </select>
                    </div>
                    <div className="w-16">
                      <Progress value={rule.enabled ? 100 : 0} className="h-1.5" />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedAlert(null)}>
          <Card className="w-full max-w-lg mx-4 border-border/50 bg-card" onClick={e => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">פרטי התראה - {selectedAlert.id}</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setSelectedAlert(null)}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                <Badge className={severityConfig[selectedAlert.severity].color}>{severityConfig[selectedAlert.severity].label}</Badge>
                <Badge variant="outline" className="gap-1">
                  {(() => { const I = typeConfig[selectedAlert.type].icon; return <I className="h-3 w-3" />; })()}
                  {typeConfig[selectedAlert.type].label}
                </Badge>
              </div>
              <div className="space-y-3">
                <div><p className="text-xs text-muted-foreground">פרויקט</p><p className="text-sm font-medium text-foreground">{selectedAlert.project}</p></div>
                <div><p className="text-xs text-muted-foreground">תיאור</p><p className="text-sm text-foreground">{selectedAlert.description}</p></div>
                <div><p className="text-xs text-muted-foreground">כלל מפעיל</p><p className="text-sm text-foreground">{selectedAlert.rule}</p></div>
                <div><p className="text-xs text-muted-foreground">זמן יצירה</p><p className="text-sm text-foreground">{selectedAlert.timestamp}</p></div>
                {selectedAlert.resolvedAt && (
                  <>
                    <div><p className="text-xs text-muted-foreground">זמן פתרון</p><p className="text-sm text-green-400">{selectedAlert.resolvedAt}</p></div>
                    <div><p className="text-xs text-muted-foreground">נפתרה ע״י</p><p className="text-sm text-foreground">{selectedAlert.resolvedBy}</p></div>
                  </>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                {!selectedAlert.resolvedAt && (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                    <CheckCircle2 className="h-4 w-4 ml-1" /> סמן כנפתרה
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setSelectedAlert(null)}>סגור</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}