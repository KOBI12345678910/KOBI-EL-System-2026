import { useState } from "react";
import {
  Bell, AlertTriangle, AlertCircle, Info, Clock, FileText,
  UserX, ShieldAlert, CalendarClock, UserPlus, Scale, Wallet,
  CheckCircle2, XCircle, Settings, ChevronLeft, ChevronRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const alertTypes = [
  { key: "contract_ending", label: "חוזה עבודה מסתיים", icon: FileText, color: "text-orange-600" },
  { key: "cert_expired", label: "תוקף הסמכה פג", icon: ShieldAlert, color: "text-red-600" },
  { key: "late_review", label: "הערכת ביצועים מאוחרת", icon: CalendarClock, color: "text-yellow-600" },
  { key: "overtime", label: "חריגת שעות נוספות", icon: Clock, color: "text-purple-600" },
  { key: "unreported_absence", label: "היעדרות לא מדווחת", icon: UserX, color: "text-red-500" },
  { key: "missing_doc", label: "מסמך חסר בתיק", icon: AlertCircle, color: "text-amber-600" },
  { key: "pending_leave", label: "בקשת חופש ממתינה >3 ימים", icon: CalendarClock, color: "text-blue-600" },
  { key: "no_onboarding", label: "עובד חדש ללא onboarding", icon: UserPlus, color: "text-teal-600" },
  { key: "hearing", label: "שימוע מתקרב", icon: Scale, color: "text-red-700" },
  { key: "insurance_renewal", label: "פנסיה/ביטוח לחידוש", icon: Wallet, color: "text-indigo-600" },
];

type Severity = "critical" | "warning" | "info";

interface HRAlert {
  id: number;
  type: string;
  severity: Severity;
  title: string;
  description: string;
  employee: string;
  employeeId: string;
  time: string;
  action: string;
}

const severityConfig: Record<Severity, { label: string; color: string; bgColor: string; icon: typeof AlertTriangle }> = {
  critical: { label: "קריטי", color: "text-red-700", bgColor: "bg-red-100 border-red-300", icon: AlertTriangle },
  warning: { label: "אזהרה", color: "text-yellow-700", bgColor: "bg-yellow-50 border-yellow-300", icon: AlertCircle },
  info: { label: "מידע", color: "text-blue-700", bgColor: "bg-blue-50 border-blue-200", icon: Info },
};

const alerts: HRAlert[] = [
  { id: 1, type: "contract_ending", severity: "critical", title: "חוזה עבודה מסתיים בעוד 7 ימים", description: "חוזה העסקה של העובד מסתיים ב-15/04/2026. נדרשת החלטה על חידוש או סיום.", employee: "דוד כהן", employeeId: "EMP-1042", time: "לפני שעתיים", action: "חידוש חוזה" },
  { id: 2, type: "cert_expired", severity: "critical", title: "תוקף הסמכת בטיחות פג", description: "הסמכת מפעיל מלגזה פגה ב-01/04/2026. אסור להפעיל ציוד עד לחידוש.", employee: "יוסי לוי", employeeId: "EMP-0387", time: "לפני 3 ימים", action: "תיאום הסמכה" },
  { id: 3, type: "hearing", severity: "critical", title: "שימוע מתוכנן בעוד 5 ימים", description: "שימוע לפני פיטורין קבוע ל-13/04/2026. יש להכין תיק ולוודא ייצוג משפטי.", employee: "מירב שלום", employeeId: "EMP-0921", time: "היום", action: "הכנת תיק" },
  { id: 4, type: "overtime", severity: "warning", title: "חריגה של 22 שעות נוספות החודש", description: "העובד חרג ממכסת 40 שעות נוספות חודשיות. סה\"כ 62 שעות נוספות.", employee: "אבי מזרחי", employeeId: "EMP-0514", time: "לפני יום", action: "אישור מנהל" },
  { id: 5, type: "unreported_absence", severity: "warning", title: "היעדרות 3 ימים ללא דיווח", description: "העובד נעדר 3 ימים רצופים ללא הודעה או אישור מחלה.", employee: "רונית ברק", employeeId: "EMP-0673", time: "לפני יום", action: "בירור מיידי" },
  { id: 6, type: "late_review", severity: "warning", title: "הערכת ביצועים מאוחרת ב-45 יום", description: "הערכה שנתית הייתה אמורה להתבצע ב-22/02/2026. טרם הושלמה.", employee: "נועה פרידמן", employeeId: "EMP-0845", time: "לפני שבוע", action: "תזמון הערכה" },
  { id: 7, type: "pending_leave", severity: "warning", title: "בקשת חופשה ממתינה 5 ימים", description: "בקשת חופשה שנתית (14-18/04) ממתינה לאישור מנהל מחלקה.", employee: "שירה אלון", employeeId: "EMP-0291", time: "לפני 5 ימים", action: "העברה לאישור" },
  { id: 8, type: "missing_doc", severity: "warning", title: "חסר אישור רפואי תקופתי", description: "אישור כשירות רפואית תקופתי לא הוגש. תוקף האישור הקודם פג.", employee: "עמית גולן", employeeId: "EMP-0158", time: "לפני 4 ימים", action: "דרישת מסמך" },
  { id: 9, type: "insurance_renewal", severity: "warning", title: "פוליסת ביטוח מנהלים לחידוש", description: "פוליסת ביטוח מנהלים מסתיימת ב-30/04/2026. נדרש חידוש מול סוכן.", employee: "תמר וינשטיין", employeeId: "EMP-0736", time: "לפני 3 ימים", action: "יצירת קשר עם סוכן" },
  { id: 10, type: "no_onboarding", severity: "info", title: "עובד חדש ללא תהליך קליטה", description: "העובד התחיל ב-06/04/2026 וטרם הוקצה לו מנטור או תוכנית קליטה.", employee: "דניאל רוזנברג", employeeId: "EMP-1105", time: "לפני יומיים", action: "הקצאת מנטור" },
  { id: 11, type: "missing_doc", severity: "info", title: "טופס 101 לא עודכן השנה", description: "טופס 101 לשנת 2026 טרם הוגש. יש לעדכן לצורך חישוב מס.", employee: "ליאור כספי", employeeId: "EMP-0462", time: "לפני שבוע", action: "שליחת תזכורת" },
  { id: 12, type: "contract_ending", severity: "info", title: "חוזה מסתיים בעוד 30 יום", description: "חוזה העסקה מסתיים ב-08/05/2026. מומלץ להתחיל תהליך חידוש.", employee: "גיל אברהם", employeeId: "EMP-0829", time: "לפני 3 ימים", action: "פתיחת תהליך" },
  { id: 13, type: "late_review", severity: "info", title: "הערכת ביצועים קרובה", description: "הערכה חצי-שנתית מתוכננת ל-20/04/2026. יש להכין טופס הערכה.", employee: "מיכל דהן", employeeId: "EMP-0594", time: "היום", action: "הכנת טופס" },
  { id: 14, type: "pending_leave", severity: "info", title: "בקשת חופשה ממתינה 4 ימים", description: "בקשת יום חופש ל-20/04 ממתינה לאישור. אין חפיפה עם עובדים אחרים.", employee: "אורן שפירא", employeeId: "EMP-0347", time: "לפני 4 ימים", action: "אישור מהיר" },
];

const closedAlerts = [
  { id: 101, title: "חוזה חודש עם רועי בן דוד", closedBy: "מנהל HR", closedAt: "02/04/2026" },
  { id: 102, title: "הסמכת חשמלאי - יעקב מלכה", closedBy: "מנהל בטיחות", closedAt: "31/03/2026" },
  { id: 103, title: "חופשת מחלה - הדר נחום", closedBy: "מערכת אוטומטית", closedAt: "28/03/2026" },
];

export default function HRAlerts() {
  const [activeTab, setActiveTab] = useState("active");
  const [filterSeverity, setFilterSeverity] = useState<Severity | "all">("all");

  const filtered = filterSeverity === "all" ? alerts : alerts.filter(a => a.severity === filterSeverity);
  const criticalCount = alerts.filter(a => a.severity === "critical").length;
  const warningCount = alerts.filter(a => a.severity === "warning").length;
  const infoCount = alerts.filter(a => a.severity === "info").length;
  const resolvedPercent = Math.round((closedAlerts.length / (alerts.length + closedAlerts.length)) * 100);

  const getAlertTypeInfo = (key: string) => alertTypes.find(t => t.key === key) || alertTypes[0];

  return (
    <div dir="rtl" className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-100">
            <Bell className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">התראות משאבי אנוש</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי | ניהול התראות ומעקב פעילות</p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs px-3 py-1">
          {new Date().toLocaleDateString("he-IL")}
        </Badge>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilterSeverity("all")}>
          <CardContent className="p-4 text-center">
            <Bell className="h-5 w-5 mx-auto mb-1 text-gray-600" />
            <div className="text-2xl font-bold">{alerts.length}</div>
            <div className="text-xs text-muted-foreground">סה"כ התראות</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-red-200" onClick={() => setFilterSeverity("critical")}>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto mb-1 text-red-600" />
            <div className="text-2xl font-bold text-red-600">{criticalCount}</div>
            <div className="text-xs text-muted-foreground">קריטיות</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-yellow-200" onClick={() => setFilterSeverity("warning")}>
          <CardContent className="p-4 text-center">
            <AlertCircle className="h-5 w-5 mx-auto mb-1 text-yellow-600" />
            <div className="text-2xl font-bold text-yellow-600">{warningCount}</div>
            <div className="text-xs text-muted-foreground">אזהרות</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-blue-200" onClick={() => setFilterSeverity("info")}>
          <CardContent className="p-4 text-center">
            <Info className="h-5 w-5 mx-auto mb-1 text-blue-600" />
            <div className="text-2xl font-bold text-blue-600">{infoCount}</div>
            <div className="text-xs text-muted-foreground">מידע</div>
          </CardContent>
        </Card>
      </div>

      {/* Resolution Progress */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">אחוז טיפול בהתראות</span>
            <span className="text-sm text-muted-foreground">{resolvedPercent}%</span>
          </div>
          <Progress value={resolvedPercent} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">{closedAlerts.length} מתוך {alerts.length + closedAlerts.length} התראות טופלו החודש</p>
        </CardContent>
      </Card>

      {/* Alert Types Legend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">סוגי התראות</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex flex-wrap gap-2">
            {alertTypes.map(t => {
              const Icon = t.icon;
              const count = alerts.filter(a => a.type === t.key).length;
              return (
                <Badge key={t.key} variant="outline" className="gap-1.5 py-1 px-2.5">
                  <Icon className={`h-3.5 w-3.5 ${t.color}`} />
                  <span className="text-xs">{t.label}</span>
                  {count > 0 && <span className="text-xs font-bold mr-1">({count})</span>}
                </Badge>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="active" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            פעילות ({filtered.length})
          </TabsTrigger>
          <TabsTrigger value="closed" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            נסגרו ({closedAlerts.length})
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings className="h-3.5 w-3.5" />
            הגדרות
          </TabsTrigger>
        </TabsList>

        {/* Active Alerts Tab */}
        <TabsContent value="active" className="space-y-3 mt-4">
          {filterSeverity !== "all" && (
            <div className="flex items-center gap-2 text-sm">
              <span>מסנן:</span>
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setFilterSeverity("all")}>
                {severityConfig[filterSeverity].label}
                <XCircle className="h-3 w-3" />
              </Badge>
            </div>
          )}
          {filtered.map(alert => {
            const sev = severityConfig[alert.severity];
            const typeInfo = getAlertTypeInfo(alert.type);
            const SevIcon = sev.icon;
            const TypeIcon = typeInfo.icon;
            return (
              <Card key={alert.id} className={`border ${sev.bgColor}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-0.5">
                        <TypeIcon className={`h-5 w-5 ${typeInfo.color}`} />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{alert.title}</h3>
                          <Badge variant={alert.severity === "critical" ? "destructive" : alert.severity === "warning" ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
                            <SevIcon className="h-3 w-3 ml-1" />
                            {sev.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{alert.description}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                          <span className="font-medium text-foreground">{alert.employee}</span>
                          <span>{alert.employeeId}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {alert.time}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button className="text-xs bg-white border rounded-md px-3 py-1.5 hover:bg-gray-50 transition-colors whitespace-nowrap shadow-sm font-medium">
                      {alert.action}
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Closed Alerts Tab */}
        <TabsContent value="closed" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-right p-3 font-medium">מזהה</th>
                    <th className="text-right p-3 font-medium">התראה</th>
                    <th className="text-right p-3 font-medium">נסגר ע"י</th>
                    <th className="text-right p-3 font-medium">תאריך סגירה</th>
                  </tr>
                </thead>
                <tbody>
                  {closedAlerts.map(ca => (
                    <tr key={ca.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-3 text-muted-foreground">#{ca.id}</td>
                      <td className="p-3">{ca.title}</td>
                      <td className="p-3 text-muted-foreground">{ca.closedBy}</td>
                      <td className="p-3 text-muted-foreground">{ca.closedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">הגדרות התראות</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {alertTypes.map(t => {
                const Icon = t.icon;
                return (
                  <div key={t.key} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${t.color}`} />
                      <span className="text-sm">{t.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-[10px]">דוא"ל</Badge>
                      <Badge variant="outline" className="text-[10px]">מערכת</Badge>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600" />
                      </label>
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