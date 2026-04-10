import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Bell, AlertTriangle, AlertOctagon, ShieldAlert, CheckCircle, Clock,
  Package, Factory, DollarSign, Truck, Users, TrendingDown, Wrench,
  Star, Eye, XCircle, Filter, ArrowUpRight, Settings, Ship,
  ShoppingCart, BarChart3, UserX, Megaphone, ToggleLeft, ToggleRight
} from "lucide-react";

type Severity = "critical" | "high" | "medium" | "low";
type AlertType = "delayed_procurement" | "delayed_import" | "stock_shortage" | "production_delay" |
  "pricing_margin" | "quality_failure" | "installation_delay" | "supplier_risk" | "customer_risk" | "executive_escalation";

interface Alert {
  id: number;
  type: AlertType;
  severity: Severity;
  module: string;
  title: string;
  description: string;
  reference: string;
  time: string;
  status: "active" | "acknowledged" | "resolved";
}

interface AlertRule {
  id: number;
  module: string;
  trigger: string;
  severity: Severity;
  recipients: string[];
  active: boolean;
}

const severityConfig: Record<Severity, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: "קריטי", color: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/40" },
  high:     { label: "גבוה", color: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/30" },
  medium:   { label: "בינוני", color: "text-yellow-400", bg: "bg-yellow-500/15", border: "border-yellow-500/30" },
  low:      { label: "נמוך", color: "text-blue-400", bg: "bg-blue-500/15", border: "border-blue-500/30" },
};

const moduleConfig: Record<string, { label: string; icon: typeof Bell; color: string }> = {
  procurement:  { label: "רכש", icon: ShoppingCart, color: "text-cyan-400" },
  import:       { label: "יבוא", icon: Ship, color: "text-indigo-400" },
  inventory:    { label: "מלאי", icon: Package, color: "text-amber-400" },
  production:   { label: "ייצור", icon: Factory, color: "text-emerald-400" },
  pricing:      { label: "תמחור", icon: DollarSign, color: "text-green-400" },
  quality:      { label: "איכות", icon: ShieldAlert, color: "text-purple-400" },
  installation: { label: "התקנות", icon: Wrench, color: "text-pink-400" },
  suppliers:    { label: "ספקים", icon: Truck, color: "text-teal-400" },
  customers:    { label: "לקוחות", icon: Users, color: "text-sky-400" },
  executive:    { label: "הנהלה", icon: Star, color: "text-red-400" },
};

const FALLBACK_ALERTS: Alert[] = [
  { id: 1, type: "executive_escalation", severity: "critical", module: "executive", title: "אסקלציה: עסקת אלון פרויקטים תקועה 14 יום", description: "עסקה בסך 2.8M NIS ללא התקדמות. הלקוח איים לעבור למתחרה.", reference: "DEAL-4521", time: "לפני 12 דקות", status: "active" },
  { id: 2, type: "production_delay", severity: "critical", module: "production", title: "קו ייצור C עצר — תקלת PLC", description: "קו ברזל/הרכבה מושבת. WO-002458 מתעכב. השפעה על 3 הזמנות.", reference: "WO-002458", time: "לפני 25 דקות", status: "active" },
  { id: 3, type: "stock_shortage", severity: "critical", module: "inventory", title: "מחסור קריטי: פרופיל אלומיניום 100mm", description: "מלאי נותר: 45 יח׳ (צריכה יומית: 120). ייגמר תוך 9 שעות.", reference: "SKU-AL100", time: "לפני 38 דקות", status: "active" },
  { id: 4, type: "delayed_import", severity: "critical", module: "import", title: "משלוח מטורקיה תקוע בנמל חיפה 6 ימים", description: "קונטיינר MSKU-7734521 — בעיה ברישיון יבוא. 480 יח׳ זכוכית מחוסמת.", reference: "IMP-2026-0187", time: "לפני 1 שעה", status: "active" },
  { id: 5, type: "quality_failure", severity: "high", module: "quality", title: "כשל בדיקת QC — אצוות חלונות Premium", description: "3 מתוך 8 דגימות נכשלו בבדיקת אטימות. שיעור כשל 37.5%.", reference: "QC-8841", time: "לפני 45 דקות", status: "active" },
  { id: 6, type: "supplier_risk", severity: "high", module: "suppliers", title: "ספק גלובל-טק: 3 איחורים ברצף", description: "ספק דירוג A הפך ל-B. זמן אספקה ממוצע עלה מ-14 ל-22 יום.", reference: "SUP-0034", time: "לפני 1.5 שעות", status: "active" },
  { id: 7, type: "delayed_procurement", severity: "high", module: "procurement", title: "הזמנת רכש PO-6622 מאחרת 8 ימים", description: "חומרי גלם לקו הרכבה. הספק טוען עיכוב ייצור.", reference: "PO-6622", time: "לפני 2 שעות", status: "active" },
  { id: 8, type: "pricing_margin", severity: "high", module: "pricing", title: "מרווח שלילי בהצעה QT-1190", description: "הצעת מחיר ללקוח שיכון ובינוי — מרווח -2.3%. עלות חומר עלתה.", reference: "QT-1190", time: "לפני 2.5 שעות", status: "active" },
  { id: 9, type: "customer_risk", severity: "high", module: "customers", title: "לקוח VIP ביטל 2 הזמנות השבוע", description: "קבוצת דניה סיבוס — ביטולים בשווי 340K NIS. סימן לאובדן.", reference: "CUS-0012", time: "לפני 3 שעות", status: "acknowledged" },
  { id: 10, type: "installation_delay", severity: "high", module: "installation", title: "התקנה באתר רמת-גן מתעכבת 3 ימים", description: "צוות התקנה ממתין לאישור קונסטרוקטור. הלקוח מאיים בקנס.", reference: "INST-0782", time: "לפני 3 שעות", status: "active" },
  { id: 11, type: "stock_shortage", severity: "medium", module: "inventory", title: "מלאי נמוך: ברגי נירוסטה M8", description: "מלאי: 2,400 (מינימום: 5,000). הזמנה אוטומטית נשלחה.", reference: "SKU-BR-M8", time: "לפני 4 שעות", status: "acknowledged" },
  { id: 12, type: "production_delay", severity: "medium", module: "production", title: "WO-002460 — ייצור איטי מהצפוי", description: "דלתות הזזה 2.4m: קצב 60% מהיעד. בעיית כיול.", reference: "WO-002460", time: "לפני 4.5 שעות", status: "active" },
  { id: 13, type: "delayed_procurement", severity: "medium", module: "procurement", title: "הצעת מחיר מספק חדש לא התקבלה", description: "ספק מטאל-פרו לא הגיש הצעה תוך 5 ימי עסקים.", reference: "RFQ-0455", time: "לפני 5 שעות", status: "active" },
  { id: 14, type: "supplier_risk", severity: "medium", module: "suppliers", title: "ספק יוניברסל חומרים — דירוג ירד ל-C", description: "בעיות איכות חוזרות. 2 אצוות נפסלו החודש.", reference: "SUP-0041", time: "לפני 6 שעות", status: "active" },
  { id: 15, type: "delayed_import", severity: "medium", module: "import", title: "עיכוב מכס — משלוח חומרי איטום מגרמניה", description: "ממתין לאישור תקן ישראלי. צפי: 2-3 ימים נוספים.", reference: "IMP-2026-0192", time: "לפני 7 שעות", status: "acknowledged" },
  { id: 16, type: "pricing_margin", severity: "low", module: "pricing", title: "עדכון מחירון: אלומיניום עלה 4%", description: "מחיר אלומיניום LME עלה. יש לעדכן 12 הצעות פתוחות.", reference: "PRICE-UPD-042", time: "לפני 8 שעות", status: "active" },
  { id: 17, type: "quality_failure", severity: "low", module: "quality", title: "סטיית מידות קלה — פרופיל Pro-X", description: "סטייה 0.5mm (מותר עד 1mm). בגבול. מומלץ מעקב.", reference: "QC-8839", time: "לפני 10 שעות", status: "resolved" },
];

const FALLBACK_ALERT_RULES: AlertRule[] = [
  { id: 1, module: "procurement", trigger: "איחור מעל 5 ימים בהזמנת רכש", severity: "high", recipients: ["מנהל רכש", "סמנכ״ל תפעול"], active: true },
  { id: 2, module: "import", trigger: "משלוח תקוע בנמל מעל 3 ימים", severity: "critical", recipients: ["מנהל יבוא", "מנהל לוגיסטיקה"], active: true },
  { id: 3, module: "inventory", trigger: "מלאי מתחת לנקודת הזמנה", severity: "critical", recipients: ["מנהל מחסן", "מנהל רכש"], active: true },
  { id: 4, module: "production", trigger: "השבתת קו מעל 30 דקות", severity: "critical", recipients: ["מנהל ייצור", "מנהל תחזוקה"], active: true },
  { id: 5, module: "pricing", trigger: "מרווח שלילי בהצעת מחיר", severity: "high", recipients: ["מנהל תמחור", "סמנכ״ל כספים"], active: true },
  { id: 6, module: "quality", trigger: "שיעור כשל QC מעל 10%", severity: "high", recipients: ["מנהל איכות", "מנהל ייצור"], active: true },
  { id: 7, module: "installation", trigger: "עיכוב התקנה מעל 2 ימים", severity: "high", recipients: ["מנהל התקנות", "מנהל פרויקט"], active: true },
  { id: 8, module: "suppliers", trigger: "3 איחורים רצופים מספק", severity: "high", recipients: ["מנהל רכש", "סמנכ״ל תפעול"], active: true },
  { id: 9, module: "customers", trigger: "לקוח VIP מבטל 2+ הזמנות בחודש", severity: "high", recipients: ["מנהל מכירות", "מנכ״ל"], active: true },
  { id: 10, module: "executive", trigger: "עסקה מעל 1M NIS ללא התקדמות 10 ימים", severity: "critical", recipients: ["מנכ״ל", "סמנכ״ל מכירות"], active: true },
  { id: 11, module: "inventory", trigger: "פריט לא זז מעל 90 יום", severity: "low", recipients: ["מנהל מחסן"], active: false },
  { id: 12, module: "pricing", trigger: "עלייה מעל 5% במחיר חומר גלם", severity: "medium", recipients: ["מנהל תמחור"], active: true },
];

const kpis = {
  totalActive: alerts.filter(a => a.status !== "resolved").length,
  critical: alerts.filter(a => a.severity === "critical" && a.status !== "resolved").length,
  high: alerts.filter(a => a.severity === "high" && a.status !== "resolved").length,
  medium: alerts.filter(a => a.severity === "medium" && a.status !== "resolved").length,
  resolvedToday: alerts.filter(a => a.status === "resolved").length,
  avgResolution: "2.4 שעות",
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const cfg = severityConfig[severity];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color}`}>
      {severity === "critical" && <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" /></span>}
      {cfg.label}
    </span>
  );
}

function ModuleTag({ module }: { module: string }) {
  const cfg = moduleConfig[module];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-white/5 ${cfg.color}`}>
      <Icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  const sev = severityConfig[alert.severity];
  return (
    <Card className={`border-r-4 ${sev.border} bg-[#0d1117]/80 hover:bg-[#161b22] transition-all`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <SeverityBadge severity={alert.severity} />
              <ModuleTag module={alert.module} />
              {alert.status === "acknowledged" && <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-400">נצפה</Badge>}
              {alert.status === "resolved" && <Badge variant="outline" className="text-xs border-green-500/30 text-green-400">טופל</Badge>}
            </div>
            <h3 className="font-semibold text-sm text-white/90">{alert.title}</h3>
            <p className="text-xs text-white/50">{alert.description}</p>
            <div className="flex items-center gap-3 text-[11px] text-white/40">
              <span className="font-mono">{alert.reference}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{alert.time}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            {alert.status === "active" && (
              <>
                <button className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600/20 text-blue-400 text-xs hover:bg-blue-600/30 transition-colors">
                  <Eye className="h-3 w-3" />צפה
                </button>
                <button className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600/20 text-emerald-400 text-xs hover:bg-emerald-600/30 transition-colors">
                  <CheckCircle className="h-3 w-3" />טפל
                </button>
              </>
            )}
            {alert.status === "acknowledged" && (
              <button className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600/20 text-emerald-400 text-xs hover:bg-emerald-600/30 transition-colors">
                <CheckCircle className="h-3 w-3" />סגור
              </button>
            )}
            {alert.status === "resolved" && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded bg-green-900/20 text-green-500/60 text-xs">
                <CheckCircle className="h-3 w-3" />נסגר
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const alerts = FALLBACK_ALERTS;

export default function NotificationsCenter() {
  const { data: notificationscenterData } = useQuery({
    queryKey: ["notifications-center"],
    queryFn: () => authFetch("/api/platform/notifications_center"),
    staleTime: 5 * 60 * 1000,
  });

  const alerts = notificationscenterData ?? FALLBACK_ALERTS;
  const alertRules = FALLBACK_ALERT_RULES;

  const [tab, setTab] = useState("all");

  const criticalAlerts = alerts.filter(a => a.severity === "critical" && a.status !== "resolved");
  const moduleGroups = Object.entries(
    alerts.reduce<Record<string, Alert[]>>((acc, a) => { (acc[a.module] ??= []).push(a); return acc; }, {})
  ).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <span className="relative">
              <Bell className="h-7 w-7 text-red-500" />
              <span className="absolute -top-1 -left-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                <span className="absolute inline-flex rounded-full h-3.5 w-3.5 bg-red-600 text-[8px] text-white font-bold flex items-center justify-center">{kpis.critical}</span>
              </span>
            </span>
            מרכז התראות ופיקוד
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">טכנו-כל עוזי | ניטור חי של כל המודולים | {alerts.length} התראות פעילות</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 text-white/70 text-xs hover:bg-white/10 transition"><Filter className="h-3.5 w-3.5" />סינון</button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 text-white/70 text-xs hover:bg-white/10 transition"><Settings className="h-3.5 w-3.5" />הגדרות</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-2">
        {[
          { label: "התראות פעילות", value: kpis.totalActive, icon: Bell, color: "text-white", bg: "bg-slate-800" },
          { label: "קריטי", value: kpis.critical, icon: AlertOctagon, color: "text-red-400", bg: "bg-red-950/50" },
          { label: "גבוה", value: kpis.high, icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-950/50" },
          { label: "בינוני", value: kpis.medium, icon: TrendingDown, color: "text-yellow-400", bg: "bg-yellow-950/50" },
          { label: "טופלו היום", value: kpis.resolvedToday, icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-950/50" },
          { label: "זמן טיפול ממוצע", value: kpis.avgResolution, icon: Clock, color: "text-sky-400", bg: "bg-sky-950/50" },
        ].map((k, i) => {
          const Icon = k.icon;
          return (
            <Card key={i} className={`${k.bg} border-white/5`}>
              <CardContent className="p-3 flex items-center gap-3">
                <Icon className={`h-5 w-5 ${k.color}`} />
                <div>
                  <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
                  <div className="text-[10px] text-white/50">{k.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Severity Progress Bar */}
      <Card className="bg-[#0d1117] border-white/5">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs text-white/50 mb-1.5">
            <BarChart3 className="h-3.5 w-3.5" />התפלגות חומרה
          </div>
          <div className="flex h-3 rounded-full overflow-hidden">
            <div className="bg-red-500" style={{ width: `${(kpis.critical / kpis.totalActive) * 100}%` }} title={`קריטי: ${kpis.critical}`} />
            <div className="bg-orange-500" style={{ width: `${(kpis.high / kpis.totalActive) * 100}%` }} title={`גבוה: ${kpis.high}`} />
            <div className="bg-yellow-500" style={{ width: `${(kpis.medium / kpis.totalActive) * 100}%` }} title={`בינוני: ${kpis.medium}`} />
            <div className="bg-blue-500" style={{ width: `${((kpis.totalActive - kpis.critical - kpis.high - kpis.medium) / kpis.totalActive) * 100}%` }} title="נמוך" />
          </div>
        </CardContent>
      </Card>

      {/* Main Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="all">הכל ({alerts.length})</TabsTrigger>
          <TabsTrigger value="critical" className="text-red-400">קריטי ({criticalAlerts.length})</TabsTrigger>
          <TabsTrigger value="by-module">לפי מודול</TabsTrigger>
          <TabsTrigger value="rules">כללי התראה</TabsTrigger>
        </TabsList>

        {/* All Alerts */}
        <TabsContent value="all" className="space-y-2 mt-3">
          {alerts.map(a => <AlertCard key={a.id} alert={a} />)}
        </TabsContent>

        {/* Critical Only */}
        <TabsContent value="critical" className="space-y-2 mt-3">
          {criticalAlerts.length === 0 ? (
            <Card className="bg-[#0d1117] border-white/5">
              <CardContent className="p-8 text-center text-white/40">
                <CheckCircle className="h-10 w-10 mx-auto mb-2 text-emerald-500/50" />
                <p>אין התראות קריטיות פעילות</p>
              </CardContent>
            </Card>
          ) : (
            criticalAlerts.map(a => <AlertCard key={a.id} alert={a} />)
          )}
        </TabsContent>

        {/* By Module */}
        <TabsContent value="by-module" className="space-y-4 mt-3">
          {moduleGroups.map(([mod, modAlerts]) => {
            const cfg = moduleConfig[mod];
            if (!cfg) return null;
            const Icon = cfg.icon;
            const activeCnt = modAlerts.filter(a => a.status !== "resolved").length;
            const critCnt = modAlerts.filter(a => a.severity === "critical" && a.status !== "resolved").length;
            return (
              <Card key={mod} className="bg-[#0d1117] border-white/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className={`flex items-center gap-2 ${cfg.color}`}>
                      <Icon className="h-4 w-4" />{cfg.label}
                    </span>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs border-white/10 text-white/60">{activeCnt} פעילות</Badge>
                      {critCnt > 0 && <Badge className="text-xs bg-red-500/20 text-red-400 border-red-500/30">{critCnt} קריטי</Badge>}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  {modAlerts.map(a => <AlertCard key={a.id} alert={a} />)}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Alert Rules Config */}
        <TabsContent value="rules" className="mt-3">
          <Card className="bg-[#0d1117] border-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-white/80">
                <Settings className="h-4 w-4" />כללי התראה — תצורה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-white/50">
                      <th className="py-2 px-2 text-right font-medium">מודול</th>
                      <th className="py-2 px-2 text-right font-medium">תנאי הפעלה</th>
                      <th className="py-2 px-2 text-right font-medium">חומרה</th>
                      <th className="py-2 px-2 text-right font-medium">נמענים</th>
                      <th className="py-2 px-2 text-center font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertRules.map(rule => {
                      const cfg = moduleConfig[rule.module];
                      const Icon = cfg?.icon;
                      return (
                        <tr key={rule.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="py-2.5 px-2">
                            <span className={`flex items-center gap-1.5 ${cfg?.color ?? "text-white/60"}`}>
                              {Icon && <Icon className="h-3.5 w-3.5" />}{cfg?.label ?? rule.module}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-white/70">{rule.trigger}</td>
                          <td className="py-2.5 px-2"><SeverityBadge severity={rule.severity} /></td>
                          <td className="py-2.5 px-2">
                            <div className="flex flex-wrap gap-1">
                              {rule.recipients.map((r, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-white/5 text-white/50 text-[10px]">{r}</span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {rule.active ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400"><ToggleRight className="h-4 w-4" />פעיל</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-white/30"><ToggleLeft className="h-4 w-4" />מושבת</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}