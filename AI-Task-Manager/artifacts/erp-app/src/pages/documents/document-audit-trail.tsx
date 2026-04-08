import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Eye, Download, Upload, Edit3, Trash2, CheckCircle2, PenTool, Share2,
  Printer, ShieldAlert, Shield, Monitor, Smartphone, Tablet, AlertTriangle,
  FileDown, Clock, Users, Activity, BarChart3, XCircle, Lock,
} from "lucide-react";

/* ── mock data ── */

const activityLog = [
  { date: "2026-04-08", time: "16:42", user: "יוסי כהן", action: "צפייה", doc: "DOC-301", docName: "חוזה ספק מתכת כללי", dept: "רכש", ip: "192.168.1.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "16:35", user: "שרה מזרחי", action: "הורדה", doc: "DOC-118", docName: "הצעת מחיר פרויקט דלתא", dept: "מכירות", ip: "192.168.2.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "16:28", user: "אלון גולדשטיין", action: "עריכה", doc: "DOC-205", docName: "מפרט טכני PCB-8L Rev C", dept: "הנדסה", ip: "192.168.1.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "16:15", user: "דוד לוי", action: "אישור", doc: "DOC-301", docName: "חוזה ספק מתכת כללי", dept: "הנהלה", ip: "192.168.3.x", device: "Mobile", status: "הצלחה" },
  { date: "2026-04-08", time: "15:58", user: "רחל אברהם", action: "חתימה", doc: "DOC-410", docName: "נוהל בטיחות עדכון 2026", dept: "איכות", ip: "192.168.1.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "15:40", user: "נועה פרידמן", action: "העלאה", doc: "DOC-512", docName: "דוח תפעול חודשי מרץ", dept: "תפעול", ip: "192.168.4.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "15:22", user: "עומר חדד", action: "שיתוף", doc: "DOC-118", docName: "הצעת מחיר פרויקט דלתא", dept: "מכירות", ip: "192.168.2.x", device: "Tablet", status: "הצלחה" },
  { date: "2026-04-08", time: "15:10", user: "מיכל ברק", action: "הדפסה", doc: "DOC-410", docName: "נוהל בטיחות עדכון 2026", dept: "בטיחות", ip: "192.168.5.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "14:55", user: "דוד מזרחי", action: "צפייה", doc: "DOC-205", docName: "מפרט טכני PCB-8L Rev C", dept: "איכות", ip: "192.168.1.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "14:38", user: "יוסי כהן", action: "הורדה", doc: "DOC-620", docName: "תעודת ISO 9001", dept: "רכש", ip: "192.168.1.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "14:20", user: "שרה מזרחי", action: "שינוי הרשאות", doc: "DOC-118", docName: "הצעת מחיר פרויקט דלתא", dept: "מכירות", ip: "192.168.2.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "14:05", user: "אלון גולדשטיין", action: "העלאה", doc: "DOC-715", docName: "שרטוט מסגרת T-400 v2.1", dept: "הנדסה", ip: "192.168.1.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "13:48", user: "נועה פרידמן", action: "מחיקה", doc: "DOC-099", docName: "טיוטת דוח ישן - ינואר", dept: "תפעול", ip: "192.168.4.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "13:30", user: "רחל אברהם", action: "צפייה", doc: "DOC-620", docName: "תעודת ISO 9001", dept: "איכות", ip: "192.168.1.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "13:12", user: "עומר חדד", action: "הורדה", doc: "DOC-301", docName: "חוזה ספק מתכת כללי", dept: "מכירות", ip: "192.168.2.x", device: "Mobile", status: "הצלחה" },
  { date: "2026-04-08", time: "12:55", user: "דוד לוי", action: "אישור", doc: "DOC-512", docName: "דוח תפעול חודשי מרץ", dept: "הנהלה", ip: "192.168.3.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "12:30", user: "מיכל ברק", action: "עריכה", doc: "DOC-410", docName: "נוהל בטיחות עדכון 2026", dept: "בטיחות", ip: "192.168.5.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "11:45", user: "יוסי כהן", action: "חתימה", doc: "DOC-301", docName: "חוזה ספק מתכת כללי", dept: "רכש", ip: "192.168.1.x", device: "Desktop", status: "הצלחה" },
  { date: "2026-04-08", time: "11:20", user: "שרה מזרחי", action: "הורדה", doc: "DOC-715", docName: "שרטוט מסגרת T-400 v2.1", dept: "מכירות", ip: "192.168.2.x", device: "Desktop", status: "נכשל" },
  { date: "2026-04-08", time: "10:50", user: "דוד מזרחי", action: "שינוי הרשאות", doc: "DOC-620", docName: "תעודת ISO 9001", dept: "איכות", ip: "192.168.1.x", device: "Desktop", status: "נחסם" },
];

const suspiciousEvents = [
  { id: "SEC-001", time: "03:22", user: "חשבון: admin_temp", description: "גישה לא רגילה מחוץ לשעות העבודה — ניסיון כניסה למאגר מסמכים בשעה 03:22", severity: "גבוה", type: "after-hours", ip: "192.168.9.x" },
  { id: "SEC-002", time: "14:10", user: "שרה מזרחי", description: "נפח הורדות חריג — 28 מסמכים ב-15 דקות, חריגה מממוצע יומי של 4", severity: "בינוני", type: "volume", ip: "192.168.2.x" },
  { id: "SEC-003", time: "16:05", user: "משתמש לא מזוהה", description: "ניסיון הסלמת הרשאות — בקשה לשינוי הרשאות אדמין ממשתמש בסיסי", severity: "קריטי", type: "escalation", ip: "192.168.7.x" },
];

const topUsers = [
  { name: "יוסי כהן", actions: 14, dept: "רכש" },
  { name: "שרה מזרחי", actions: 11, dept: "מכירות" },
  { name: "אלון גולדשטיין", actions: 9, dept: "הנדסה" },
  { name: "רחל אברהם", actions: 8, dept: "איכות" },
  { name: "נועה פרידמן", actions: 7, dept: "תפעול" },
];

const topDocs = [
  { doc: "DOC-301", name: "חוזה ספק מתכת כללי", views: 18 },
  { doc: "DOC-118", name: "הצעת מחיר פרויקט דלתא", views: 14 },
  { doc: "DOC-620", name: "תעודת ISO 9001", views: 12 },
  { doc: "DOC-410", name: "נוהל בטיחות עדכון 2026", views: 10 },
  { doc: "DOC-205", name: "מפרט טכני PCB-8L Rev C", views: 9 },
];

const peakHours = [
  { hour: "08:00-09:00", pct: 35 }, { hour: "09:00-10:00", pct: 72 },
  { hour: "10:00-11:00", pct: 88 }, { hour: "11:00-12:00", pct: 95 },
  { hour: "12:00-13:00", pct: 40 }, { hour: "13:00-14:00", pct: 68 },
  { hour: "14:00-15:00", pct: 82 }, { hour: "15:00-16:00", pct: 76 },
  { hour: "16:00-17:00", pct: 55 }, { hour: "17:00-18:00", pct: 20 },
];

/* ── helpers ── */

const actionIcon = (a: string) => {
  const map: Record<string, React.ReactNode> = {
    "צפייה": <Eye className="h-3.5 w-3.5" />, "הורדה": <Download className="h-3.5 w-3.5" />,
    "העלאה": <Upload className="h-3.5 w-3.5" />, "עריכה": <Edit3 className="h-3.5 w-3.5" />,
    "מחיקה": <Trash2 className="h-3.5 w-3.5" />, "אישור": <CheckCircle2 className="h-3.5 w-3.5" />,
    "חתימה": <PenTool className="h-3.5 w-3.5" />, "שיתוף": <Share2 className="h-3.5 w-3.5" />,
    "הדפסה": <Printer className="h-3.5 w-3.5" />, "שינוי הרשאות": <Lock className="h-3.5 w-3.5" />,
  };
  return map[a] ?? <Activity className="h-3.5 w-3.5" />;
};

const statusBadge = (s: string) => {
  if (s === "הצלחה") return <Badge className="bg-emerald-100 text-emerald-700 text-xs">{s}</Badge>;
  if (s === "נכשל") return <Badge className="bg-red-100 text-red-700 text-xs">{s}</Badge>;
  return <Badge className="bg-orange-100 text-orange-700 text-xs">{s}</Badge>;
};

const deviceIcon = (d: string) => {
  if (d === "Mobile") return <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />;
  if (d === "Tablet") return <Tablet className="h-3.5 w-3.5 text-muted-foreground" />;
  return <Monitor className="h-3.5 w-3.5 text-muted-foreground" />;
};

const severityBadge = (s: string) => {
  if (s === "קריטי") return <Badge className="bg-red-600 text-white text-xs">{s}</Badge>;
  if (s === "גבוה") return <Badge className="bg-red-100 text-red-700 text-xs">{s}</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 text-xs">{s}</Badge>;
};

/* ── component ── */

export default function DocumentAuditTrail() {
  const [tab, setTab] = useState("full");

  const kpis = [
    { label: "פעולות היום", value: 67, icon: <Activity className="h-5 w-5 text-blue-600" />, color: "text-blue-700" },
    { label: "משתמשים פעילים", value: 12, icon: <Users className="h-5 w-5 text-violet-600" />, color: "text-violet-700" },
    { label: "הורדות", value: 34, icon: <Download className="h-5 w-5 text-cyan-600" />, color: "text-cyan-700" },
    { label: "שינויים", value: 18, icon: <Edit3 className="h-5 w-5 text-amber-600" />, color: "text-amber-700" },
    { label: "חריגות אבטחה", value: 0, icon: <ShieldAlert className="h-5 w-5 text-emerald-600" />, color: "text-emerald-700" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2.5 rounded-xl"><Eye className="h-6 w-6 text-indigo-600" /></div>
          <div>
            <h1 className="text-2xl font-bold">מעקב פעילות מסמכים</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי — מערכת ניטור ובקרת גישה למסמכים</p>
          </div>
        </div>
        <Badge className="bg-emerald-100 text-emerald-700"><Shield className="h-3.5 w-3.5 ml-1" />תקין — אין חריגות פתוחות</Badge>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-5 gap-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="bg-slate-50 p-2 rounded-lg">{k.icon}</div>
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Suspicious Activity Banner */}
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h2 className="font-semibold text-red-800">אירועים חשודים שזוהו</h2>
            <Badge className="bg-red-600 text-white text-xs mr-2">{suspiciousEvents.length}</Badge>
          </div>
          <div className="space-y-2">
            {suspiciousEvents.map(e => (
              <div key={e.id} className="flex items-start gap-3 bg-white/70 rounded-lg p-3 border border-red-100">
                <div className="mt-0.5">{severityBadge(e.severity)}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span>{e.id}</span>
                    <span className="text-muted-foreground">|</span>
                    <Clock className="h-3 w-3 text-muted-foreground" /><span className="text-xs text-muted-foreground">{e.time}</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-xs">{e.user}</span>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-xs text-muted-foreground">IP: {e.ip}</span>
                  </div>
                  <p className="text-sm text-red-700 mt-1">{e.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="full">יומן מלא</TabsTrigger>
          <TabsTrigger value="anomalies">חריגות</TabsTrigger>
          <TabsTrigger value="stats">סטטיסטיקות</TabsTrigger>
        </TabsList>

        {/* Full Log Tab */}
        <TabsContent value="full">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">תאריך</TableHead>
                    <TableHead className="text-right">שעה</TableHead>
                    <TableHead className="text-right">משתמש</TableHead>
                    <TableHead className="text-right">פעולה</TableHead>
                    <TableHead className="text-right">מסמך</TableHead>
                    <TableHead className="text-right">מחלקה</TableHead>
                    <TableHead className="text-right">IP</TableHead>
                    <TableHead className="text-right">מכשיר</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLog.map((r, i) => (
                    <TableRow key={i} className={r.status !== "הצלחה" ? "bg-red-50/40" : ""}>
                      <TableCell className="text-xs">{r.date}</TableCell>
                      <TableCell className="text-xs font-mono">{r.time}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">{r.user[0]}</div>
                          <span className="text-sm">{r.user}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm">{actionIcon(r.action)}{r.action}</div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono text-muted-foreground">{r.doc}</span>
                        <span className="text-sm mr-1">{r.docName}</span>
                      </TableCell>
                      <TableCell className="text-sm">{r.dept}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{r.ip}</TableCell>
                      <TableCell><div className="flex items-center gap-1">{deviceIcon(r.device)}<span className="text-xs">{r.device}</span></div></TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Anomalies Tab */}
        <TabsContent value="anomalies">
          <div className="space-y-4">
            {suspiciousEvents.map(e => (
              <Card key={e.id} className="border-red-200">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="h-5 w-5 text-red-600" />
                      <span className="font-semibold">{e.id}</span>
                      {severityBadge(e.severity)}
                    </div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{e.time} | IP: {e.ip}</span>
                  </div>
                  <p className="text-sm mb-2"><strong>משתמש:</strong> {e.user}</p>
                  <p className="text-sm text-red-700">{e.description}</p>
                  <div className="mt-3 flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      {e.type === "after-hours" ? "גישה מחוץ לשעות" : e.type === "volume" ? "נפח חריג" : "הסלמת הרשאות"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">דורש בדיקה</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="stats">
          <div className="grid grid-cols-3 gap-4">
            {/* Most Active Users */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-violet-600" />משתמשים פעילים ביותר</h3>
                <div className="space-y-3">
                  {topUsers.map((u, i) => (
                    <div key={u.name} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                      <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-bold">{u.name[0]}</div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.dept}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{u.actions} פעולות</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Most Accessed Docs */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-cyan-600" />מסמכים נצפים ביותר</h3>
                <div className="space-y-3">
                  {topDocs.map((d, i) => (
                    <div key={d.doc} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{d.name}</p>
                        <p className="text-xs font-mono text-muted-foreground">{d.doc}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{d.views} צפיות</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Peak Hours */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-amber-600" />שעות שיא פעילות</h3>
                <div className="space-y-2.5">
                  {peakHours.map(h => (
                    <div key={h.hour} className="flex items-center gap-3">
                      <span className="text-xs font-mono w-20 text-muted-foreground">{h.hour}</span>
                      <div className="flex-1"><Progress value={h.pct} className="h-2" /></div>
                      <span className="text-xs font-bold w-8 text-left">{h.pct}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Export Section */}
      <Card className="border-slate-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileDown className="h-5 w-5 text-slate-600" />
              <div>
                <h3 className="font-semibold">ייצוא יומן ביקורת</h3>
                <p className="text-xs text-muted-foreground">ייצוא נתוני מעקב לצורך עמידה בדרישות רגולציה ותאימות (Compliance)</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors">
                <Download className="h-4 w-4" />ייצוא CSV
              </button>
              <button className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors">
                <Download className="h-4 w-4" />ייצוא PDF
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
