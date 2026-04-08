import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Lock, Shield, ShieldCheck, ShieldAlert, Users, Building2,
  Globe, Eye, EyeOff, Link2, Mail, LayoutGrid, FileText,
  Clock, Download, CheckCircle2, XCircle, AlertTriangle,
  UserCheck, KeyRound, ScrollText,
} from "lucide-react";

/* ── mock data ── */

const permissionLevels = [
  { level: "ציבורי", icon: Globe, desc: "כל העובדים", docs: 1230, color: "text-green-400", bg: "bg-green-900/30 border-green-700/40", pct: 32 },
  { level: "מחלקתי", icon: Building2, desc: "רק חברי מחלקה", docs: 1845, color: "text-blue-400", bg: "bg-blue-900/30 border-blue-700/40", pct: 48 },
  { level: "מוגבל", icon: EyeOff, desc: "רשימת משתמשים ספציפית", docs: 620, color: "text-amber-400", bg: "bg-amber-900/30 border-amber-700/40", pct: 16 },
  { level: "סודי", icon: ShieldAlert, desc: "הנהלה בלבד + אישור מיוחד", docs: 152, color: "text-red-400", bg: "bg-red-900/30 border-red-700/40", pct: 4 },
];

const departments = ["הנדסה", "ייצור", "איכות", "רכש", "מכירות", "כספים", "לוגיסטיקה", "הנהלה"];
const docTypes = ["חוזים", "שרטוטים", "מפרטים", "חשבוניות", "דוחות", "נהלים", "תעודות", "הצעות מחיר", "פרוטוקולים", "מסמכי סודיות"];

const accessMatrix: Record<string, Record<string, string>> = {
  "הנדסה":    { "חוזים": "r", "שרטוטים": "rw", "מפרטים": "rw", "חשבוניות": "x", "דוחות": "r", "נהלים": "r", "תעודות": "r", "הצעות מחיר": "x", "פרוטוקולים": "r", "מסמכי סודיות": "x" },
  "ייצור":    { "חוזים": "x", "שרטוטים": "r", "מפרטים": "r", "חשבוניות": "x", "דוחות": "r", "נהלים": "rw", "תעודות": "r", "הצעות מחיר": "x", "פרוטוקולים": "r", "מסמכי סודיות": "x" },
  "איכות":    { "חוזים": "r", "שרטוטים": "r", "מפרטים": "rw", "חשבוניות": "x", "דוחות": "rw", "נהלים": "rw", "תעודות": "rw", "הצעות מחיר": "x", "פרוטוקולים": "rw", "מסמכי סודיות": "r" },
  "רכש":      { "חוזים": "rw", "שרטוטים": "r", "מפרטים": "r", "חשבוניות": "rw", "דוחות": "r", "נהלים": "r", "תעודות": "r", "הצעות מחיר": "rw", "פרוטוקולים": "r", "מסמכי סודיות": "r" },
  "מכירות":   { "חוזים": "rw", "שרטוטים": "x", "מפרטים": "r", "חשבוניות": "r", "דוחות": "rw", "נהלים": "r", "תעודות": "r", "הצעות מחיר": "rw", "פרוטוקולים": "r", "מסמכי סודיות": "x" },
  "כספים":    { "חוזים": "rw", "שרטוטים": "x", "מפרטים": "x", "חשבוניות": "rw", "דוחות": "rw", "נהלים": "r", "תעודות": "r", "הצעות מחיר": "r", "פרוטוקולים": "r", "מסמכי סודיות": "r" },
  "לוגיסטיקה": { "חוזים": "r", "שרטוטים": "x", "מפרטים": "r", "חשבוניות": "r", "דוחות": "r", "נהלים": "r", "תעודות": "rw", "הצעות מחיר": "x", "פרוטוקולים": "r", "מסמכי סודיות": "x" },
  "הנהלה":    { "חוזים": "rw", "שרטוטים": "rw", "מפרטים": "rw", "חשבוניות": "rw", "דוחות": "rw", "נהלים": "rw", "תעודות": "rw", "הצעות מחיר": "rw", "פרוטוקולים": "rw", "מסמכי סודיות": "rw" },
};

const externalShares = [
  { id: 1, doc: "חוזה ספק מתכת כללי v3.1", sharedWith: "מתכת-פרו בע\"מ", type: "קישור", expires: "2026-05-15", downloads: 4, status: "פעיל" },
  { id: 2, doc: "הצעת מחיר פרויקט דלתא v1.2", sharedWith: "דלתא תעשיות", type: "email", expires: "2026-04-20", downloads: 2, status: "פעיל" },
  { id: 3, doc: "מפרט טכני PCB-8L Rev C", sharedWith: "אלקטרו-טק בע\"מ", type: "portal", expires: "2026-06-01", downloads: 7, status: "פעיל" },
  { id: 4, doc: "דוח ביקורת איכות Q1-2026", sharedWith: "רשות התקינה", type: "קישור", expires: "2026-04-30", downloads: 1, status: "ממתין לפתיחה" },
  { id: 5, doc: "חוזה שכירות מחסן צפון v2.0", sharedWith: "עו\"ד שלום ראובני", type: "email", expires: "2026-05-10", downloads: 3, status: "פעיל" },
  { id: 6, doc: "תעודת ISO 9001:2015", sharedWith: "Lloyd's Register", type: "portal", expires: "2026-12-31", downloads: 12, status: "פעיל" },
];

const accessRequests = [
  { id: "REQ-301", who: "שרה מזרחי", dept: "מכירות", doc: "דוח כספי שנתי 2025", reason: "הכנת הצעה ללקוח אסטרטגי", date: "2026-04-06", priority: "גבוה" },
  { id: "REQ-302", who: "דוד מזרחי", dept: "איכות", doc: "מסמך סודיות פרויקט אומגה", reason: "ביקורת פנימית תקופתית", date: "2026-04-07", priority: "בינוני" },
  { id: "REQ-303", who: "עומר חדד", dept: "לוגיסטיקה", doc: "חוזה ספק בינלאומי 2026", reason: "תיאום משלוח דחוף מחו\"ל", date: "2026-04-07", priority: "גבוה" },
  { id: "REQ-304", who: "מיכל ברק", dept: "בטיחות", doc: "שרטוט מערכת כיבוי אש מפעל", reason: "עדכון נוהל חירום", date: "2026-04-08", priority: "רגיל" },
];

const accessLog = [
  { time: "08:42", user: "יוסי כהן", action: "צפייה", doc: "חוזה ספק מתכת כללי", ip: "10.0.1.45" },
  { time: "09:15", user: "שרה מזרחי", action: "הורדה", doc: "הצעת מחיר פרויקט דלתא", ip: "10.0.2.12" },
  { time: "09:38", user: "אלון גולדשטיין", action: "עריכה", doc: "מפרט טכני PCB-8L Rev C", ip: "10.0.1.78" },
  { time: "10:02", user: "דוד לוי", action: "אישור גישה", doc: "דוח כספי שנתי 2025", ip: "10.0.3.5" },
  { time: "10:44", user: "נועה פרידמן", action: "שיתוף חיצוני", doc: "חוזה שכירות מחסן צפון", ip: "10.0.2.30" },
  { time: "11:10", user: "רחל אברהם", action: "צפייה", doc: "תעודת ISO 9001", ip: "10.0.1.92" },
  { time: "11:35", user: "מיכל ברק", action: "בקשת גישה", doc: "שרטוט מערכת כיבוי אש", ip: "10.0.4.18" },
  { time: "12:00", user: "עומר חדד", action: "הורדה", doc: "אישור יבוא מכס 2026-44", ip: "10.0.2.55" },
];

/* ── helpers ── */

const cellStyle = (v: string) => {
  if (v === "rw") return "text-emerald-400 font-bold";
  if (v === "r") return "text-blue-400";
  return "text-red-400/60";
};
const cellLabel = (v: string) => {
  if (v === "rw") return "✓ קריאה+כתיבה";
  if (v === "r") return "✓ קריאה";
  return "✗ אין";
};

const shareStatusColor: Record<string, string> = {
  "פעיל": "bg-emerald-900/60 text-emerald-300",
  "ממתין לפתיחה": "bg-amber-900/60 text-amber-300",
};

const shareTypeIcon: Record<string, typeof Link2> = {
  "קישור": Link2,
  "email": Mail,
  "portal": LayoutGrid,
};

const priorityColor: Record<string, string> = {
  "גבוה": "bg-red-900/60 text-red-300",
  "בינוני": "bg-amber-900/60 text-amber-300",
  "רגיל": "bg-slate-700/60 text-slate-300",
};

const actionColor: Record<string, string> = {
  "צפייה": "text-blue-400",
  "הורדה": "text-green-400",
  "עריכה": "text-amber-400",
  "אישור גישה": "text-emerald-400",
  "שיתוף חיצוני": "text-purple-400",
  "בקשת גישה": "text-orange-400",
};

/* ── component ── */

export default function DocumentPermissions() {
  const [tab, setTab] = useState("matrix");
  const totalDocs = permissionLevels.reduce((s, p) => s + p.docs, 0);

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg bg-gradient-to-br from-red-600/30 to-orange-600/20 border border-red-500/30">
          <Lock className="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">הרשאות וגישה למסמכים</h1>
          <p className="text-sm text-slate-400">טכנו-כל עוזי — ניהול הרשאות ובקרת גישה למערכת המסמכים הארגונית</p>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "רמות הרשאה", value: "4", icon: ShieldCheck, color: "text-blue-400", border: "border-blue-700/30" },
          { label: "מחלקות", value: "8", icon: Building2, color: "text-emerald-400", border: "border-emerald-700/30" },
          { label: "משתמשים עם גישה מורחבת", value: "5", icon: UserCheck, color: "text-amber-400", border: "border-amber-700/30" },
          { label: "שיתופים חיצוניים פעילים", value: "3", icon: Globe, color: "text-purple-400", border: "border-purple-700/30" },
        ].map((k) => (
          <Card key={k.label} className={`bg-[#0d1117] border ${k.border}`}>
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={`w-8 h-8 ${k.color}`} />
              <div>
                <p className="text-2xl font-bold text-white">{k.value}</p>
                <p className="text-xs text-slate-400">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Permission Levels ── */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-slate-400" /> רמות הרשאה — התפלגות מסמכים
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {permissionLevels.map((p) => (
            <Card key={p.level} className={`${p.bg} border`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <p.icon className={`w-5 h-5 ${p.color}`} />
                  <span className={`font-bold text-lg ${p.color}`}>{p.level}</span>
                </div>
                <p className="text-sm text-slate-300">{p.desc}</p>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-bold text-white">{p.docs.toLocaleString()}</span>
                  <span className="text-xs text-slate-400">מסמכים</span>
                </div>
                <Progress value={p.pct} className="h-2" />
                <p className="text-xs text-slate-500 text-left">{p.pct}% מתוך {totalDocs.toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-[#161b22] border border-slate-700/50 flex-wrap">
          <TabsTrigger value="matrix">מטריצת הרשאות</TabsTrigger>
          <TabsTrigger value="external">שיתופים חיצוניים</TabsTrigger>
          <TabsTrigger value="requests">בקשות גישה</TabsTrigger>
          <TabsTrigger value="log">יומן גישה</TabsTrigger>
        </TabsList>

        {/* ── Tab: Department Access Matrix ── */}
        <TabsContent value="matrix">
          <Card className="bg-[#0d1117] border-slate-700/50">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50">
                    <TableHead className="text-right text-slate-300 font-bold sticky right-0 bg-[#0d1117] min-w-[100px]">מחלקה</TableHead>
                    {docTypes.map((dt) => (
                      <TableHead key={dt} className="text-center text-slate-400 text-xs whitespace-nowrap min-w-[90px]">{dt}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map((dept) => (
                    <TableRow key={dept} className="border-slate-700/30 hover:bg-slate-800/30">
                      <TableCell className="font-semibold text-white sticky right-0 bg-[#0d1117]">{dept}</TableCell>
                      {docTypes.map((dt) => {
                        const v = accessMatrix[dept]?.[dt] ?? "x";
                        return (
                          <TableCell key={dt} className={`text-center text-xs whitespace-nowrap ${cellStyle(v)}`}>
                            {cellLabel(v)}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="flex gap-6 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> קריאה + כתיבה</span>
            <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5 text-blue-400" /> קריאה בלבד</span>
            <span className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-red-400/60" /> אין גישה</span>
          </div>
        </TabsContent>

        {/* ── Tab: External Sharing ── */}
        <TabsContent value="external">
          <Card className="bg-[#0d1117] border-slate-700/50">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50">
                    <TableHead className="text-right text-slate-300">מסמך</TableHead>
                    <TableHead className="text-right text-slate-300">שותף עם</TableHead>
                    <TableHead className="text-center text-slate-300">סוג שיתוף</TableHead>
                    <TableHead className="text-center text-slate-300">תוקף</TableHead>
                    <TableHead className="text-center text-slate-300">הורדות</TableHead>
                    <TableHead className="text-center text-slate-300">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {externalShares.map((s) => {
                    const TypeIcon = shareTypeIcon[s.type] ?? Link2;
                    return (
                      <TableRow key={s.id} className="border-slate-700/30 hover:bg-slate-800/30">
                        <TableCell className="text-white font-medium flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-500" /> {s.doc}
                        </TableCell>
                        <TableCell className="text-slate-300">{s.sharedWith}</TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 text-sm text-slate-300">
                            <TypeIcon className="w-4 h-4 text-slate-400" /> {s.type}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-slate-400 text-sm">{s.expires}</TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center gap-1 text-sm text-slate-300">
                            <Download className="w-3.5 h-3.5 text-slate-500" /> {s.downloads}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={shareStatusColor[s.status] ?? "bg-slate-700 text-slate-300"}>{s.status}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> כל שיתוף חיצוני נרשם ביומן ומפוקח. קישורים פגי-תוקף מושבתים אוטומטית.
          </p>
        </TabsContent>

        {/* ── Tab: Access Requests ── */}
        <TabsContent value="requests">
          <Card className="bg-[#0d1117] border-slate-700/50">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50">
                    <TableHead className="text-right text-slate-300">מבקש</TableHead>
                    <TableHead className="text-right text-slate-300">מחלקה</TableHead>
                    <TableHead className="text-right text-slate-300">מסמך מבוקש</TableHead>
                    <TableHead className="text-right text-slate-300">סיבה</TableHead>
                    <TableHead className="text-center text-slate-300">תאריך</TableHead>
                    <TableHead className="text-center text-slate-300">עדיפות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessRequests.map((r) => (
                    <TableRow key={r.id} className="border-slate-700/30 hover:bg-slate-800/30">
                      <TableCell className="text-white font-medium flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-500" /> {r.who}
                      </TableCell>
                      <TableCell className="text-slate-400">{r.dept}</TableCell>
                      <TableCell className="text-slate-300">{r.doc}</TableCell>
                      <TableCell className="text-slate-400 text-sm max-w-[200px] truncate">{r.reason}</TableCell>
                      <TableCell className="text-center text-slate-400 text-sm">{r.date}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={priorityColor[r.priority] ?? "bg-slate-700 text-slate-300"}>{r.priority}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> {accessRequests.length} בקשות גישה ממתינות לאישור מנהל מערכת או בעל המסמך.
          </p>
        </TabsContent>

        {/* ── Tab: Access Log ── */}
        <TabsContent value="log">
          <Card className="bg-[#0d1117] border-slate-700/50">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50">
                    <TableHead className="text-center text-slate-300">שעה</TableHead>
                    <TableHead className="text-right text-slate-300">משתמש</TableHead>
                    <TableHead className="text-center text-slate-300">פעולה</TableHead>
                    <TableHead className="text-right text-slate-300">מסמך</TableHead>
                    <TableHead className="text-center text-slate-300">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessLog.map((l, i) => (
                    <TableRow key={i} className="border-slate-700/30 hover:bg-slate-800/30">
                      <TableCell className="text-center text-slate-400 font-mono text-sm">{l.time}</TableCell>
                      <TableCell className="text-white font-medium">{l.user}</TableCell>
                      <TableCell className={`text-center font-medium text-sm ${actionColor[l.action] ?? "text-slate-300"}`}>{l.action}</TableCell>
                      <TableCell className="text-slate-300 flex items-center gap-2">
                        <ScrollText className="w-4 h-4 text-slate-500" /> {l.doc}
                      </TableCell>
                      <TableCell className="text-center text-slate-500 font-mono text-xs">{l.ip}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-blue-400" /> יומן הגישה נשמר למשך 7 שנים בהתאם לדרישות רגולציה. כל פעולה מתועדת ומוצפנת.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
