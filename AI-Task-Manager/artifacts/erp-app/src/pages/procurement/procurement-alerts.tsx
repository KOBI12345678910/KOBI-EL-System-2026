import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell, AlertTriangle, Clock, Truck, DollarSign, ShieldAlert,
  FileX, PackageX, TrendingUp, CheckCircle2, Timer, Settings,
  ChevronLeft, PhoneOff, ClipboardX, AlertOctagon, Eye
} from "lucide-react";

// ============================================================
// TYPES & DATA — טכנו-כל עוזי Procurement Alerts
// ============================================================
type Severity = "critical" | "high" | "medium";
type AlertType =
  | "delayed_delivery"
  | "price_increase"
  | "supplier_risk"
  | "order_not_approved"
  | "missing_receipt"
  | "mismatch_order_vs_delivery"
  | "over_budget_order"
  | "no_response_from_supplier";

interface ProcAlert {
  id: string;
  type: AlertType;
  severity: Severity;
  title: string;
  description: string;
  po?: string;
  supplier: string;
  createdAt: string;
  resolved: boolean;
  actionLabel: string;
}

const typeConfig: Record<AlertType, { icon: typeof Bell; label: string }> = {
  delayed_delivery:          { icon: Truck,          label: "עיכוב אספקה" },
  price_increase:            { icon: TrendingUp,     label: "עליית מחיר" },
  supplier_risk:             { icon: ShieldAlert,    label: "סיכון ספק" },
  order_not_approved:        { icon: ClipboardX,     label: "הזמנה לא מאושרת" },
  missing_receipt:           { icon: FileX,          label: "קבלה חסרה" },
  mismatch_order_vs_delivery:{ icon: PackageX,       label: "אי-התאמה" },
  over_budget_order:         { icon: DollarSign,     label: "חריגת תקציב" },
  no_response_from_supplier: { icon: PhoneOff,       label: "אין מענה מספק" },
};

const severityStyle: Record<Severity, { bg: string; text: string; label: string; border: string }> = {
  critical: { bg: "bg-red-500/15",    text: "text-red-400",    label: "קריטי",  border: "border-red-500/40" },
  high:     { bg: "bg-orange-500/15", text: "text-orange-400", label: "גבוה",   border: "border-orange-500/40" },
  medium:   { bg: "bg-amber-500/15",  text: "text-amber-400",  label: "בינוני", border: "border-amber-500/40" },
};

const alerts: ProcAlert[] = [
  {
    id: "AL-001", type: "delayed_delivery", severity: "critical",
    title: "איחור 12 יום – משלוח אלומיניום מ-Foshan Glass",
    description: "הזמנה PO-000458 הייתה אמורה להגיע ב-27/03. הספק עדכן על עיכוב נוסף בנמל שנזן. קו ייצור 2 עלול לעצור.",
    po: "PO-000458", supplier: "Foshan Glass Co.", createdAt: "לפני 3 שעות", resolved: false, actionLabel: "צור קשר עם ספק",
  },
  {
    id: "AL-002", type: "price_increase", severity: "high",
    title: "עליית מחיר 18% – זכוכית מחוסמת מ-Alumil SA",
    description: "הספק שלח הודעת עדכון מחירון. זכוכית מחוסמת 10 מ\"מ עלתה מ-₪185 ל-₪218 ליחידה. השפעה שנתית: ₪340K.",
    po: "PO-000462", supplier: "Alumil SA", createdAt: "לפני 5 שעות", resolved: false, actionLabel: "בדוק חלופות",
  },
  {
    id: "AL-003", type: "supplier_risk", severity: "critical",
    title: "התראת סיכון – Foshan Glass: ירידה ברמת שירות",
    description: "3 איחורים ברצף, ציון איכות ירד ל-72. שיעור אספקה בזמן ירד ל-64% ברבעון האחרון. מומלץ לשקול ספק חלופי.",
    supplier: "Foshan Glass Co.", createdAt: "לפני 8 שעות", resolved: false, actionLabel: "פתח הערכת ספק",
  },
  {
    id: "AL-004", type: "order_not_approved", severity: "high",
    title: "הזמנה PR-000131 ממתינה לאישור 5 ימים",
    description: "דרישת רכש ₪95,000 עבור פרופילי Schüco ממתינה לאישור CFO. חומרים נדרשים לפרויקט מגדלי הים ב-15/04.",
    po: "PR-000131", supplier: "Schüco International", createdAt: "לפני יום", resolved: false, actionLabel: "שלח תזכורת",
  },
  {
    id: "AL-005", type: "missing_receipt", severity: "medium",
    title: "קבלה חסרה – PO-000455 מ-Alumil SA",
    description: "הסחורה התקבלה במחסן לפני 6 ימים אך טופס קבלת סחורה טרם הוזן למערכת. Three-Way Matching חסום.",
    po: "PO-000455", supplier: "Alumil SA", createdAt: "לפני יומיים", resolved: false, actionLabel: "הזן קבלה",
  },
  {
    id: "AL-006", type: "mismatch_order_vs_delivery", severity: "critical",
    title: "אי-התאמה בכמות – PO-000454 מ-Foshan Glass",
    description: "הוזמנו 500 יח' זכוכית שטוחה, התקבלו 420 יח' בלבד. חסרים 80 יח' (16%). הספק טוען ששלח הכל.",
    po: "PO-000454", supplier: "Foshan Glass Co.", createdAt: "לפני יומיים", resolved: false, actionLabel: "פתח חקירה",
  },
  {
    id: "AL-007", type: "over_budget_order", severity: "high",
    title: "חריגת תקציב – קטגוריית ברזל ב-9.1%",
    description: "הוצאה מצטברת על ברזל: ₪1,200,000 מתוך תקציב ₪1,100,000. חריגה של ₪100K. עלייה בביקוש מפרויקטים 3-5.",
    supplier: "מפעלי ברזל השרון", createdAt: "לפני 3 ימים", resolved: false, actionLabel: "בקש תוספת תקציב",
  },
  {
    id: "AL-008", type: "no_response_from_supplier", severity: "medium",
    title: "אין מענה 7 ימים – RFQ לאביזרי תריסים",
    description: "נשלח RFQ-0034 ל-3 ספקים. ספק \"דלתות הצפון\" לא הגיב למרות 2 תזכורות. מועד אחרון להצעות: 12/04.",
    supplier: "דלתות הצפון בע\"מ", createdAt: "לפני 4 ימים", resolved: false, actionLabel: "החלף ספק",
  },
  {
    id: "AL-009", type: "delayed_delivery", severity: "medium",
    title: "עיכוב 3 ימים – חומרי איטום מספק מקומי",
    description: "PO-000460 בעיכוב קל. הספק מעדכן שייצור יסתיים מחר ומשלוח יצא ביום ראשון.",
    po: "PO-000460", supplier: "חומרי בניין ישראל", createdAt: "לפני 5 ימים", resolved: false, actionLabel: "עקוב",
  },
  {
    id: "AL-010", type: "price_increase", severity: "medium",
    title: "עליית מחיר 6% – פרופילי אלומיניום",
    description: "Schüco הודיעו על עדכון מחירון Q2. עלייה ממוצעת 6% על סדרת AWS. השפעה: ₪85K ברבעון.",
    supplier: "Schüco International", createdAt: "לפני 6 ימים", resolved: false, actionLabel: "נהל מו\"מ",
  },
  {
    id: "AL-011", type: "mismatch_order_vs_delivery", severity: "high",
    title: "סחורה פגומה – 15 יח' זכוכית סדוקה",
    description: "מתוך PO-000459 התגלו 15 לוחות זכוכית עם סדקים. נדרשת החזרה והזמנה חוזרת. עלות: ₪12,500.",
    po: "PO-000459", supplier: "Foshan Glass Co.", createdAt: "לפני 6 ימים", resolved: false, actionLabel: "פתח החזרה",
  },
  {
    id: "AL-100", type: "delayed_delivery", severity: "high",
    title: "איחור 5 ימים – ברגים מיוחדים מגרמניה",
    description: "PO-000451 ממפעלי Fischer. המשלוח תקוע בשדה התעופה בפרנקפורט בגלל שביתה.",
    po: "PO-000451", supplier: "Fischer GmbH", createdAt: "08/04 09:00", resolved: true, actionLabel: "נפתר",
  },
];

const alertRules = [
  { type: "delayed_delivery",           threshold: "עיכוב > 2 ימים", active: true },
  { type: "price_increase",             threshold: "עלייה > 5%",     active: true },
  { type: "supplier_risk",              threshold: "ציון < 75",      active: true },
  { type: "order_not_approved",         threshold: "המתנה > 3 ימים", active: true },
  { type: "missing_receipt",            threshold: "קבלה חסרה > 3 ימים", active: true },
  { type: "mismatch_order_vs_delivery", threshold: "פער > 5%",       active: true },
  { type: "over_budget_order",          threshold: "חריגה > 5%",     active: false },
  { type: "no_response_from_supplier",  threshold: "אין מענה > 5 ימים", active: true },
];

// ============================================================
// COMPONENT
// ============================================================
export default function ProcurementAlerts() {
  const [tab, setTab] = useState("active");

  const active   = alerts.filter(a => !a.resolved);
  const critical = active.filter(a => a.severity === "critical");
  const high     = active.filter(a => a.severity === "high");
  const medium   = active.filter(a => a.severity === "medium");
  const resolved = alerts.filter(a => a.resolved);

  const kpis = [
    { label: "התראות פעילות", value: active.length,   icon: Bell,          color: "text-blue-400" },
    { label: "קריטיות",       value: critical.length, icon: AlertOctagon,  color: "text-red-400" },
    { label: "גבוהות",        value: high.length,     icon: AlertTriangle, color: "text-orange-400" },
    { label: "בינוניות",      value: medium.length,   icon: Clock,         color: "text-amber-400" },
    { label: "נפתרו היום",    value: resolved.length, icon: CheckCircle2,  color: "text-emerald-400" },
    { label: "זמן טיפול ממוצע", value: "4.2 שעות",   icon: Timer,         color: "text-purple-400" },
  ];

  const listForTab = tab === "active" ? active : tab === "critical" ? critical : tab === "history" ? resolved : [];

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <span className="relative">
            <Bell className="h-7 w-7 text-primary" />
            <span className="absolute -top-1 -left-1 h-3 w-3 rounded-full bg-red-500 animate-pulse" />
          </span>
          מרכז התראות רכש
        </h1>
        <Badge variant="outline" className="text-xs text-muted-foreground">טכנו-כל עוזי — מתכת / אלומיניום / זכוכית</Badge>
      </div>

      {/* ── KPI ROW ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k => (
          <Card key={k.label} className="bg-muted/40 border-muted">
            <CardContent className="p-4 flex flex-col items-center gap-1">
              <k.icon className={`h-5 w-5 ${k.color}`} />
              <span className="text-2xl font-bold">{k.value}</span>
              <span className="text-[11px] text-muted-foreground">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── TABS ── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/60">
          <TabsTrigger value="active">פעילות ({active.length})</TabsTrigger>
          <TabsTrigger value="critical">קריטיות ({critical.length})</TabsTrigger>
          <TabsTrigger value="history">היסטוריה</TabsTrigger>
          <TabsTrigger value="settings">הגדרות</TabsTrigger>
        </TabsList>

        {/* ── ACTIVE / CRITICAL / HISTORY ── */}
        {["active", "critical", "history"].map(t => (
          <TabsContent key={t} value={t} className="space-y-3 mt-4">
            {listForTab.length === 0 && tab === t && (
              <Card className="bg-muted/30 border-dashed border-muted">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500/60" />
                  אין התראות להצגה
                </CardContent>
              </Card>
            )}
            {tab === t && listForTab.map(a => <AlertCard key={a.id} alert={a} />)}
          </TabsContent>
        ))}

        {/* ── SETTINGS ── */}
        <TabsContent value="settings" className="mt-4">
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-5 w-5 text-muted-foreground" />
                כללי התראות — תצורה נוכחית
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alertRules.map(r => {
                const cfg = typeConfig[r.type as AlertType];
                const Icon = cfg.icon;
                return (
                  <div key={r.type} className="flex items-center justify-between py-2 border-b border-muted last:border-0">
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{cfg.label}</span>
                      <Badge variant="outline" className="text-[11px]">{r.threshold}</Badge>
                    </div>
                    <Badge className={r.active
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"}>
                      {r.active ? "פעיל" : "כבוי"}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// ALERT CARD
// ============================================================
function AlertCard({ alert }: { alert: ProcAlert }) {
  const sev = severityStyle[alert.severity];
  const cfg = typeConfig[alert.type];
  const Icon = cfg.icon;

  return (
    <Card className={`${sev.bg} border ${sev.border} transition-all hover:brightness-110`}>
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-start gap-4">
        {/* icon + severity */}
        <div className="flex items-center gap-3 sm:flex-col sm:items-center sm:min-w-[70px]">
          <div className={`p-2 rounded-lg ${sev.bg}`}>
            <Icon className={`h-5 w-5 ${sev.text}`} />
          </div>
          <Badge className={`${sev.bg} ${sev.text} border ${sev.border} text-[11px]`}>{sev.label}</Badge>
        </div>

        {/* body */}
        <div className="flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug">{alert.title}</h3>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{alert.createdAt}</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{alert.description}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="outline" className="text-[11px]">{cfg.label}</Badge>
            {alert.po && <Badge variant="outline" className="text-[11px] font-mono">{alert.po}</Badge>}
            <Badge variant="outline" className="text-[11px]">{alert.supplier}</Badge>
          </div>
        </div>

        {/* action */}
        <button className={`shrink-0 self-center px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
          alert.resolved
            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 cursor-default"
            : `${sev.bg} ${sev.text} ${sev.border} hover:brightness-125`
        }`}>
          {alert.resolved ? (
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> נפתר</span>
          ) : (
            <span className="flex items-center gap-1"><ChevronLeft className="h-3.5 w-3.5" /> {alert.actionLabel}</span>
          )}
        </button>
      </CardContent>
    </Card>
  );
}
