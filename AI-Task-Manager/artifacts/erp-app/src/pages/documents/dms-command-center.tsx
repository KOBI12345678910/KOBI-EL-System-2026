import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Files, FileText, FileClock, FileCheck, FileWarning, Upload,
  Download, Pen, CheckCircle, Clock, AlertTriangle, HardDrive,
  GitBranch, PenTool, LayoutTemplate, FolderOpen, Users, BarChart3,
  Eye, Shield, Search, TrendingUp
} from "lucide-react";

// ============================================================
// DMS DATA — טכנו-כל עוזי
// ============================================================
const kpis = [
  { label: 'סה"כ מסמכים', value: "3,847", icon: Files, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "ממתינים לאישור", value: "23", icon: FileClock, color: "text-amber-600", bg: "bg-amber-50" },
  { label: "פג תוקף", value: "8", icon: FileWarning, color: "text-red-600", bg: "bg-red-50" },
  { label: "נסרקו היום", value: "12", icon: Upload, color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "אחסון בשימוש", value: "78%", sub: "מ-500GB", icon: HardDrive, color: "text-purple-600", bg: "bg-purple-50" },
  { label: "גרסאות פעילות", value: "412", icon: GitBranch, color: "text-indigo-600", bg: "bg-indigo-50" },
  { label: "חתימות ממתינות", value: "6", icon: PenTool, color: "text-orange-600", bg: "bg-orange-50" },
  { label: "תבניות זמינות", value: "45", icon: LayoutTemplate, color: "text-cyan-600", bg: "bg-cyan-50" },
];

const recentActivity = [
  { action: "העלאה", doc: "הזמנת רכש PR-001284", user: "יוסי אברהם", time: "לפני 5 דקות", icon: Upload, color: "text-blue-600" },
  { action: "אישור", doc: "פרוטוקול בדיקה QC-0087", user: "מיכל לוי", time: "לפני 12 דקות", icon: CheckCircle, color: "text-emerald-600" },
  { action: "עריכה", doc: "מפרט טכני — פרופיל Pro-X", user: "דני כהן", time: "לפני 18 דקות", icon: Pen, color: "text-amber-600" },
  { action: "חתימה", doc: "חוזה ספק Foshan Glass 2026", user: "עוזי טכנו-כל (מנכ\"ל)", time: "לפני 25 דקות", icon: PenTool, color: "text-purple-600" },
  { action: "הורדה", doc: "תעודת משלוח DN-5590", user: "שרה גולד", time: "לפני 32 דקות", icon: Download, color: "text-slate-600" },
  { action: "העלאה", doc: "דוח בדיקת איכות — זכוכית מחוסמת", user: "אבי רוזן", time: "לפני 40 דקות", icon: Upload, color: "text-blue-600" },
  { action: "אישור", doc: "הצעת מחיר Q-2026-0312", user: "רונית שמעון", time: "לפני 55 דקות", icon: CheckCircle, color: "text-emerald-600" },
  { action: "עריכה", doc: "נוהל עבודה — קו ייצור A", user: "מיכל לוי", time: "לפני שעה", icon: Pen, color: "text-amber-600" },
  { action: "הורדה", doc: "תכנית פרויקט — מגדלי הים", user: "דוד ביטון", time: "לפני שעתיים", icon: Download, color: "text-slate-600" },
  { action: "חתימה", doc: "אישור תקציב רבעון 2", user: "שלמה פינקל (CFO)", time: "לפני 3 שעות", icon: PenTool, color: "text-purple-600" },
];

const categories = [
  { name: "מסמכי ייצור", total: 820, recent: 34, pending: 5, icon: "🏭", color: "bg-blue-50 border-blue-200" },
  { name: "מסמכי רכש", total: 645, recent: 22, pending: 8, icon: "📦", color: "bg-amber-50 border-amber-200" },
  { name: "מסמכי פרויקטים", total: 512, recent: 18, pending: 3, icon: "📐", color: "bg-emerald-50 border-emerald-200" },
  { name: "מסמכי איכות", total: 340, recent: 12, pending: 2, icon: "✅", color: "bg-purple-50 border-purple-200" },
  { name: "מסמכי כספים", total: 1530, recent: 41, pending: 5, icon: "💰", color: "bg-red-50 border-red-200" },
];

const pendingApprovals = [
  { doc: "הזמנת רכש PR-001284", type: "רכש", requester: "יוסי אברהם", approver: "שלמה פינקל", since: "3 שעות", urgency: "high" },
  { doc: "מפרט טכני — חלון Premium", type: "ייצור", requester: "דני כהן", approver: "מיכל לוי", since: "5 שעות", urgency: "high" },
  { doc: "חוזה שירות — חברת ניקיון", type: "כספים", requester: "רונית שמעון", approver: "עוזי טכנו-כל", since: "יום", urgency: "medium" },
  { doc: "תכנית בטיחות 2026", type: "איכות", requester: "אבי רוזן", approver: "מיכל לוי", since: "יום", urgency: "medium" },
  { doc: "הצעת מחיר — פרויקט נהריה", type: "פרויקטים", requester: "דוד ביטון", approver: "שלמה פינקל", since: "2 ימים", urgency: "medium" },
  { doc: "נוהל עבודה — מכונת חיתוך CNC", type: "ייצור", requester: "מיכל לוי", approver: "עוזי טכנו-כל", since: "2 ימים", urgency: "low" },
  { doc: "תעודת משלוח DN-5588", type: "רכש", requester: "שרה גולד", approver: "יוסי אברהם", since: "3 ימים", urgency: "high" },
  { doc: "דוח הוצאות נסיעות Q1", type: "כספים", requester: "אורלי דוד", approver: "שלמה פינקל", since: "4 ימים", urgency: "low" },
  { doc: "סקר סיכונים — ספקים בינלאומיים", type: "רכש", requester: "יוסי אברהם", approver: "עוזי טכנו-כל", since: "5 ימים", urgency: "medium" },
  { doc: "תוכנית הדרכה — עובדים חדשים", type: "איכות", requester: "אבי רוזן", approver: "מיכל לוי", since: "5 ימים", urgency: "low" },
];

const alerts = [
  { type: "expiry", message: "תעודת ISO 9001 פוגעת ב-15/04/2026", severity: "critical", icon: FileWarning },
  { type: "expiry", message: "רישיון עסק — חידוש נדרש עד 30/04/2026", severity: "critical", icon: FileWarning },
  { type: "signature", message: "חוזה ספק Alumil — חתימה חסרה (14 יום)", severity: "high", icon: PenTool },
  { type: "review", message: "נוהל בטיחות אש — סקירה שנתית באיחור 30 יום", severity: "high", icon: FileClock },
  { type: "storage", message: "אחסון מחלקת כספים — 92% מהמכסה", severity: "medium", icon: HardDrive },
  { type: "review", message: "מפרט טכני דגם B — לא עודכן 6 חודשים", severity: "medium", icon: FileClock },
  { type: "signature", message: "הסכם סודיות — עובד חדש טרם חתם", severity: "low", icon: PenTool },
  { type: "expiry", message: "אישור כבאות — פג תוקף ב-01/05/2026", severity: "low", icon: FileWarning },
];

const storageByDept = [
  { dept: "כספים", used: 145, quota: 150, pct: 92 },
  { dept: "ייצור", used: 98, quota: 120, pct: 82 },
  { dept: "רכש", used: 72, quota: 100, pct: 72 },
  { dept: "פרויקטים", used: 48, quota: 80, pct: 60 },
  { dept: "איכות", used: 27, quota: 50, pct: 54 },
];

const topDownloaded = [
  { doc: "קטלוג מוצרים 2026", downloads: 234, dept: "מכירות" },
  { doc: "מחירון ייצור — אלומיניום", downloads: 189, dept: "מכירות" },
  { doc: "נוהל בטיחות כללי", downloads: 156, dept: "ייצור" },
  { doc: "תבנית הצעת מחיר", downloads: 142, dept: "מכירות" },
  { doc: "מדריך הדרכה — ERP", downloads: 128, dept: "IT" },
];

const userActivity = [
  { user: "יוסי אברהם", uploads: 48, downloads: 92, edits: 31, approvals: 15 },
  { user: "מיכל לוי", uploads: 35, downloads: 64, edits: 52, approvals: 28 },
  { user: "דני כהן", uploads: 29, downloads: 78, edits: 18, approvals: 8 },
  { user: "שרה גולד", uploads: 42, downloads: 55, edits: 22, approvals: 12 },
  { user: "אבי רוזן", uploads: 21, downloads: 43, edits: 14, approvals: 19 },
];

const urgencyColor = (u: string) =>
  u === "high" ? "bg-red-100 text-red-700" : u === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600";

const severityColor = (s: string) =>
  s === "critical" ? "bg-red-100 text-red-700" : s === "high" ? "bg-orange-100 text-orange-700" : s === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600";

const severityLabel = (s: string) =>
  s === "critical" ? "קריטי" : s === "high" ? "גבוה" : s === "medium" ? "בינוני" : "נמוך";

export default function DmsCommandCenter() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Files className="h-7 w-7 text-primary" /> מרכז פיקוד ניהול מסמכים
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            ניהול מסמכים ארגוני | אישורים | חתימות | גרסאות | אחסון — טכנו-כל עוזי
          </p>
        </div>
        <Badge variant="outline" className="text-xs gap-1">
          <HardDrive className="h-3 w-3" /> 390GB / 500GB
        </Badge>
      </div>

      {/* ── KPI Strip (8 cards) ──────────────────────────── */}
      <div className="grid grid-cols-8 gap-2">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg}/40 border-0 shadow-sm`}>
              <CardContent className="pt-2 pb-1.5 text-center px-1">
                <Icon className={`h-3.5 w-3.5 mx-auto ${kpi.color} mb-0.5`} />
                <p className="text-[8px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-sm font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
                {"sub" in kpi && kpi.sub && (
                  <p className="text-[7px] text-muted-foreground">{kpi.sub}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Recent Activity Feed ─────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" /> פעילות אחרונה
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            {recentActivity.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-center gap-2 py-1 border-b border-dashed last:border-0">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${item.color}`} />
                  <span className="text-xs font-medium">{item.action}</span>
                  <span className="text-xs text-muted-foreground truncate flex-1">{item.doc}</span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{item.user}</span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{item.time}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ─────────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="overview" className="text-xs gap-1"><FolderOpen className="h-3.5 w-3.5" /> סקירה</TabsTrigger>
          <TabsTrigger value="approvals" className="text-xs gap-1"><FileCheck className="h-3.5 w-3.5" /> סטטוס אישורים</TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> התראות</TabsTrigger>
          <TabsTrigger value="usage" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> שימוש</TabsTrigger>
        </TabsList>

        {/* ── Tab: סקירה ──────────────────────────────────── */}
        <TabsContent value="overview" className="mt-3">
          <div className="grid grid-cols-5 gap-3">
            {categories.map((cat, i) => (
              <Card key={i} className={`${cat.color} border shadow-sm`}>
                <CardContent className="pt-4 pb-3 text-center">
                  <span className="text-2xl">{cat.icon}</span>
                  <p className="text-sm font-semibold mt-2">{cat.name}</p>
                  <p className="text-2xl font-bold font-mono mt-1">{cat.total.toLocaleString()}</p>
                  <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <TrendingUp className="h-3 w-3 text-emerald-500" /> {cat.recent} החודש
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-3 w-3 text-amber-500" /> {cat.pending} ממתינים
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">התפלגות מסמכים לפי סוג</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {categories.map((cat, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs w-28 text-right">{cat.name}</span>
                    <Progress value={(cat.total / 3847) * 100} className="flex-1 h-2" />
                    <span className="text-xs font-mono w-16 text-left">{cat.total} ({((cat.total / 3847) * 100).toFixed(1)}%)</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: סטטוס אישורים ──────────────────────────── */}
        <TabsContent value="approvals" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileCheck className="h-4 w-4" /> 10 אישורים ממתינים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מסמך</TableHead>
                    <TableHead className="text-right">סוג</TableHead>
                    <TableHead className="text-right">מבקש</TableHead>
                    <TableHead className="text-right">מאשר</TableHead>
                    <TableHead className="text-right">ממתין</TableHead>
                    <TableHead className="text-right">דחיפות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingApprovals.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium">{item.doc}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{item.type}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{item.requester}</TableCell>
                      <TableCell className="text-xs">{item.approver}</TableCell>
                      <TableCell className="text-xs">{item.since}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${urgencyColor(item.urgency)}`}>
                          {item.urgency === "high" ? "גבוה" : item.urgency === "medium" ? "בינוני" : "נמוך"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: התראות ─────────────────────────────────── */}
        <TabsContent value="alerts" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> התראות פעילות ({alerts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {alerts.map((alert, i) => {
                  const Icon = alert.icon;
                  return (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30">
                      <Icon className={`h-4 w-4 shrink-0 ${
                        alert.severity === "critical" ? "text-red-500" :
                        alert.severity === "high" ? "text-orange-500" :
                        alert.severity === "medium" ? "text-amber-500" : "text-slate-400"
                      }`} />
                      <span className="text-xs flex-1">{alert.message}</span>
                      <Badge className={`text-[10px] ${severityColor(alert.severity)}`}>
                        {severityLabel(alert.severity)}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: שימוש ──────────────────────────────────── */}
        <TabsContent value="usage" className="mt-3 space-y-4">
          {/* Storage by department */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <HardDrive className="h-4 w-4" /> אחסון לפי מחלקה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {storageByDept.map((dept, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{dept.dept}</span>
                      <span className="text-muted-foreground">{dept.used}GB / {dept.quota}GB ({dept.pct}%)</span>
                    </div>
                    <Progress
                      value={dept.pct}
                      className={`h-2 ${dept.pct > 90 ? "[&>div]:bg-red-500" : dept.pct > 75 ? "[&>div]:bg-amber-500" : ""}`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            {/* Top downloaded docs */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Download className="h-4 w-4" /> מסמכים הכי מורדים
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">מסמך</TableHead>
                      <TableHead className="text-right">מחלקה</TableHead>
                      <TableHead className="text-right">הורדות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topDownloaded.map((doc, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{doc.doc}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{doc.dept}</Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{doc.downloads}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* User activity */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" /> פעילות משתמשים
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">משתמש</TableHead>
                      <TableHead className="text-right">העלאות</TableHead>
                      <TableHead className="text-right">הורדות</TableHead>
                      <TableHead className="text-right">עריכות</TableHead>
                      <TableHead className="text-right">אישורים</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userActivity.map((u, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium">{u.user}</TableCell>
                        <TableCell className="text-xs font-mono">{u.uploads}</TableCell>
                        <TableCell className="text-xs font-mono">{u.downloads}</TableCell>
                        <TableCell className="text-xs font-mono">{u.edits}</TableCell>
                        <TableCell className="text-xs font-mono">{u.approvals}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
