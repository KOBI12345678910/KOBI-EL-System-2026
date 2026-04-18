import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Bell, AlertTriangle, Info, Shield, Fuel, Calendar, FileText,
  MapPin, Clock, Wrench, CheckCircle2, Settings, XCircle,
  Truck, User, Ban, Zap
} from "lucide-react";

/* ── types & style maps ──────────────────────────────────── */
type Severity = "קריטי" | "אזהרה" | "מידע";
type AlertType = "טסט שנתי מתקרב" | "ביטוח פג" | "רישיון נהג לחידוש" | "תחזוקה מתוכננת" | "צריכת דלק חריגה" | "חריגת מסלול" | "השבתה ממושכת" | "תאונה/נזק";

interface FleetAlert {
  id: number; type: AlertType; severity: Severity; title: string;
  description: string; vehicle: string; driver: string; time: string; action: string;
}

const severityCls: Record<Severity, string> = {
  "קריטי": "bg-red-500/20 text-red-400 border-red-500/40",
  "אזהרה": "bg-amber-500/20 text-amber-400 border-amber-500/40",
  "מידע": "bg-blue-500/20 text-blue-400 border-blue-500/40",
};
const severityIcon: Record<Severity, typeof AlertTriangle> = { "קריטי": XCircle, "אזהרה": AlertTriangle, "מידע": Info };
const typeIcon: Record<AlertType, typeof Bell> = {
  "טסט שנתי מתקרב": Calendar, "ביטוח פג": Shield, "רישיון נהג לחידוש": FileText, "תחזוקה מתוכננת": Wrench,
  "צריכת דלק חריגה": Fuel, "חריגת מסלול": MapPin, "השבתה ממושכת": Ban, "תאונה/נזק": Zap,
};

/* ── static data: 12 FALLBACK_ALERTS ───────────────────────────────── */
const FALLBACK_ALERTS: FleetAlert[] = [
  { id: 1, type: "טסט שנתי מתקרב", severity: "קריטי", title: "טסט שנתי פג בעוד 5 ימים", description: "רכב 72-315-84 - משאית וולוו חייב לעבור טסט שנתי עד 13/04/2026. יש לתאם תור במכון רישוי.", vehicle: "72-315-84", driver: "יוסי כהן", time: "לפני שעה", action: "תיאום תור" },
  { id: 2, type: "ביטוח פג", severity: "קריטי", title: "ביטוח מקיף פג תוקף", description: "פוליסת ביטוח מקיף לרכב 55-482-91 פגה ב-06/04/2026. הרכב אינו מכוסה כעת.", vehicle: "55-482-91", driver: "אבי לוי", time: "לפני 3 שעות", action: "חידוש ביטוח" },
  { id: 3, type: "תאונה/נזק", severity: "קריטי", title: "דיווח תאונה - נזק לפגוש קדמי", description: "נהג דיווח על פגיעה בעמוד חניה. נזק לפגוש קדמי ולפנס ימני. הרכב נסיע לא מסוכנת.", vehicle: "38-764-22", driver: "משה ברק", time: "לפני 45 דקות", action: "פתיחת תביעה" },
  { id: 4, type: "צריכת דלק חריגה", severity: "אזהרה", title: "צריכת דלק חריגה ב-35%", description: "רכב 61-928-33 מראה צריכת דלק של 18.2 ליטר/100 קמ לעומת ממוצע 13.5. יתכן תקלה מכנית.", vehicle: "61-928-33", driver: "דוד אזולאי", time: "לפני 2 שעות", action: "בדיקת רכב" },
  { id: 5, type: "חריגת מסלול", severity: "אזהרה", title: "חריגה ממסלול מתוכנן", description: "רכב 44-157-66 סטה 12 קמ מהמסלול המתוכנן באזור מודיעין. הנהג לא עדכן על שינוי.", vehicle: "44-157-66", driver: "רון שמעוני", time: "לפני שעתיים", action: "בירור עם נהג" },
  { id: 6, type: "רישיון נהג לחידוש", severity: "אזהרה", title: "רישיון נהיגה פג בעוד 14 יום", description: "רישיון הנהיגה של חיים פרץ (ת.ז. 302845671) תקף עד 22/04/2026. יש לחדש בהקדם.", vehicle: "—", driver: "חיים פרץ", time: "לפני 5 שעות", action: "תזכורת לנהג" },
  { id: 7, type: "תחזוקה מתוכננת", severity: "אזהרה", title: "טיפול 50,000 קמ מתקרב", description: "רכב 83-291-55 עבר 49,200 קמ. טיפול תקופתי נדרש ב-50,000 קמ כולל החלפת שמן ופילטרים.", vehicle: "83-291-55", driver: "עמית גולן", time: "לפני 6 שעות", action: "תיאום טיפול" },
  { id: 8, type: "השבתה ממושכת", severity: "אזהרה", title: "רכב מושבת 18 ימים", description: "רכב 29-603-17 מושבת מאז 21/03/2026 בשל תקלת מנוע. ממתין לחלק חילוף מיבוא.", vehicle: "29-603-17", driver: "—", time: "לפני יום", action: "מעקב הזמנה" },
  { id: 9, type: "טסט שנתי מתקרב", severity: "מידע", title: "טסט שנתי בעוד 45 יום", description: "רכב 96-417-88 חייב בטסט שנתי עד 23/05/2026. מומלץ לתאם מראש.", vehicle: "96-417-88", driver: "ניר אוחיון", time: "לפני יומיים", action: "תזכורת עתידית" },
  { id: 10, type: "תחזוקה מתוכננת", severity: "מידע", title: "החלפת צמיגים מתוכננת", description: "רכב 17-832-44 - צמיגים קדמיים בשחיקה של 80%. מומלץ להחליף בטיפול הקרוב.", vehicle: "17-832-44", driver: "אלון דהן", time: "לפני יומיים", action: "הוספה לטיפול" },
  { id: 11, type: "ביטוח פג", severity: "מידע", title: "ביטוח צד ג׳ מתחדש בעוד 30 יום", description: "פוליסת צד ג׳ לרכב 64-508-73 מתחדשת ב-08/05/2026. יש לבדוק הצעות מחיר.", vehicle: "64-508-73", driver: "טל רביבו", time: "לפני 3 ימים", action: "בדיקת הצעות" },
  { id: 12, type: "צריכת דלק חריגה", severity: "מידע", title: "עלייה קלה בצריכת דלק", description: "רכב 51-246-90 מראה עלייה של 8% בצריכת דלק בשבועיים האחרונים. יתכן שקשור לעומס.", vehicle: "51-246-90", driver: "גיל מזרחי", time: "לפני 3 ימים", action: "מעקב" },
];

/* ── closed FALLBACK_ALERTS ────────────────────────────────────────── */
const FALLBACK_CLOSED_ALERTS = [
  { id: 101, title: "טסט שנתי בוצע בהצלחה", vehicle: "22-190-37", closedAt: "03/04/2026", closedBy: "יוסי כהן" },
  { id: 102, title: "ביטוח חודש - פוליסה 88431", vehicle: "55-482-91", closedAt: "01/04/2026", closedBy: "מערכת" },
  { id: 103, title: "טיפול 30,000 קמ הושלם", vehicle: "38-764-22", closedAt: "29/03/2026", closedBy: "עמית גולן" },
  { id: 104, title: "חריגת מסלול - אושרה ע״י מנהל", vehicle: "44-157-66", closedAt: "27/03/2026", closedBy: "רון שמעוני" },
];

/* ── component ────────────────────────────────────────────── */
export default function FleetAlerts() {
  const { data: alerts = FALLBACK_ALERTS } = useQuery({
    queryKey: ["logistics-alerts"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/fleet-alerts/alerts");
      if (!res.ok) return FALLBACK_ALERTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_ALERTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: closedAlerts = FALLBACK_CLOSED_ALERTS } = useQuery({
    queryKey: ["logistics-closed-alerts"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/fleet-alerts/closed-alerts");
      if (!res.ok) return FALLBACK_CLOSED_ALERTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_CLOSED_ALERTS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [tab, setTab] = useState("פעילות");
  const [severityFilter, setSeverityFilter] = useState<Severity | "הכל">("הכל");

  const filtered = severityFilter === "הכל"
    ? alerts
    : alerts.filter(a => a.severity === severityFilter);

  const criticalCount = alerts.filter(a => a.severity === "קריטי").length;
  const warningCount = alerts.filter(a => a.severity === "אזהרה").length;
  const infoCount = alerts.filter(a => a.severity === "מידע").length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20">
            <Bell className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">התראות צי רכב</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי - מערכת ניהול התראות</p>
          </div>
        </div>
        <Badge variant="outline" className="text-base px-4 py-1 border-amber-500/40 text-amber-400">
          {alerts.length} התראות פעילות
        </Badge>
      </div>

      {/* ── Summary cards ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          { label: "סה״כ התראות", value: alerts.length, icon: Bell, bg: "bg-slate-500/20", text: "text-slate-300", valCls: "text-foreground" },
          { label: "קריטיות", value: criticalCount, icon: XCircle, bg: "bg-red-500/20", text: "text-red-400", valCls: "text-red-400" },
          { label: "אזהרות", value: warningCount, icon: AlertTriangle, bg: "bg-amber-500/20", text: "text-amber-400", valCls: "text-amber-400" },
          { label: "מידע", value: infoCount, icon: Info, bg: "bg-blue-500/20", text: "text-blue-400", valCls: "text-blue-400" },
        ] as const).map((s, i) => {
          const Icon = s.icon;
          return (
            <Card key={i} className="bg-card border-border">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.bg}`}><Icon className={`w-5 h-5 ${s.text}`} /></div>
                <div>
                  <p className={`text-2xl font-bold ${s.valCls}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Severity progress ───────────────────────────────── */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">התפלגות חומרה</span>
            <span className="text-muted-foreground">{alerts.length} התראות</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-red-400 w-16">קריטי</span>
              <Progress value={(criticalCount / alerts.length) * 100} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground w-6 text-left">{criticalCount}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-amber-400 w-16">אזהרה</span>
              <Progress value={(warningCount / alerts.length) * 100} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground w-6 text-left">{warningCount}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-blue-400 w-16">מידע</span>
              <Progress value={(infoCount / alerts.length) * 100} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground w-6 text-left">{infoCount}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ────────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="פעילות">פעילות</TabsTrigger>
          <TabsTrigger value="נסגרו">נסגרו</TabsTrigger>
          <TabsTrigger value="הגדרות">הגדרות</TabsTrigger>
        </TabsList>

        {/* ── Active alerts tab ─────────────────────────────── */}
        <TabsContent value="פעילות" className="space-y-4 mt-4">
          {/* Filter buttons */}
          <div className="flex gap-2 flex-wrap">
            {(["הכל", "קריטי", "אזהרה", "מידע"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  severityFilter === s
                    ? "bg-foreground/10 border-foreground/30 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {s === "הכל" ? `הכל (${alerts.length})` : `${s} (${alerts.filter(a => a.severity === s).length})`}
              </button>
            ))}
          </div>

          {/* Alert cards */}
          <div className="space-y-3">
            {filtered.map(alert => {
              const SevIcon = severityIcon[alert.severity];
              const TypeIcon = typeIcon[alert.type];
              return (
                <Card key={alert.id} className={`bg-card border ${severityCls[alert.severity].split(" ").find(c => c.startsWith("border")) || "border-border"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg shrink-0 ${severityCls[alert.severity].split(" ").filter(c => !c.startsWith("border")).join(" ")}`}>
                        <TypeIcon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-foreground">{alert.title}</h3>
                            <Badge className={severityCls[alert.severity]}>{alert.severity}</Badge>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span>{alert.time}</span>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">{alert.description}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          {alert.vehicle !== "—" && (
                            <span className="flex items-center gap-1">
                              <Truck className="w-3 h-3" /> {alert.vehicle}
                            </span>
                          )}
                          {alert.driver !== "—" && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" /> {alert.driver}
                            </span>
                          )}
                          <Badge variant="outline" className="text-xs border-foreground/20 text-foreground/70">{alert.type}</Badge>
                        </div>
                        <div className="pt-1">
                          <button className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors">
                            {alert.action} &larr;
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Closed alerts tab ─────────────────────────────── */}
        <TabsContent value="נסגרו" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base">התראות שנסגרו</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">התראה</TableHead>
                    <TableHead className="text-right">רכב</TableHead>
                    <TableHead className="text-right">נסגר בתאריך</TableHead>
                    <TableHead className="text-right">נסגר ע״י</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedAlerts.map(ca => (
                    <TableRow key={ca.id}>
                      <TableCell className="font-medium">{ca.title}</TableCell>
                      <TableCell>{ca.vehicle}</TableCell>
                      <TableCell>{ca.closedAt}</TableCell>
                      <TableCell>{ca.closedBy}</TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-500/20 text-emerald-400">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> נסגר
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Settings tab ──────────────────────────────────── */}
        <TabsContent value="הגדרות" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-4 h-4" /> הגדרות התראות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(Object.keys(typeIcon) as AlertType[]).map(type => {
                const Icon = typeIcon[type];
                return (
                  <div key={type} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-foreground">{type}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">דוא״ל + SMS</Badge>
                      <div className="w-10 h-5 bg-emerald-500/30 rounded-full relative">
                        <div className="w-4 h-4 bg-emerald-400 rounded-full absolute top-0.5 left-0.5" />
                      </div>
                    </div>
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
