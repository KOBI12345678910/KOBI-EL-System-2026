import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  GitFork, RotateCcw, ArrowRightLeft, AlertTriangle,
  History, ShieldCheck, BookOpen, TrendingUp, Calendar,
} from "lucide-react";

/* ── mock data ── */

const versionHistory = [
  { id: "DOC-101", name: "חוזה ספק מתכת כללי", version: "3.1", prevVersion: "3.0", changeType: "עדכון תוכן", changedBy: "יוסי כהן", date: "2026-04-07", time: "09:15", comment: "עדכון מחירי ספק ותנאי תשלום", size: "1.4 MB", status: "נוכחי" },
  { id: "DOC-101", name: "חוזה ספק מתכת כללי", version: "3.0", prevVersion: "2.4", changeType: "אישור", changedBy: "דוד לוי", date: "2026-03-20", time: "14:30", comment: "אישור סופי ע\"י הנהלה", size: "1.3 MB", status: "ארכיון" },
  { id: "DOC-205", name: "שרטוט מסגרת T-400", version: "2.0", prevVersion: "1.9", changeType: "עדכון תוכן", changedBy: "אלון גולדשטיין", date: "2026-04-06", time: "11:42", comment: "תיקון שרטוט חתך A ומידות הרכבה", size: "4.8 MB", status: "נוכחי" },
  { id: "DOC-205", name: "שרטוט מסגרת T-400", version: "1.9", prevVersion: "1.8", changeType: "תיקון", changedBy: "אלון גולדשטיין", date: "2026-03-28", time: "16:05", comment: "תיקון טולרנס חור מרכזי", size: "4.7 MB", status: "ארכיון" },
  { id: "DOC-312", name: "הצעת מחיר פרויקט דלתא", version: "1.2", prevVersion: "1.1", changeType: "עדכון מטא", changedBy: "שרה מזרחי", date: "2026-04-05", time: "08:50", comment: "הוספת סעיף אחריות מורחבת", size: "520 KB", status: "נוכחי" },
  { id: "DOC-312", name: "הצעת מחיר פרויקט דלתא", version: "1.1", prevVersion: "1.0", changeType: "עדכון תוכן", changedBy: "שרה מזרחי", date: "2026-03-15", time: "10:20", comment: "עדכון טבלת מחירים", size: "510 KB", status: "ארכיון" },
  { id: "DOC-312", name: "הצעת מחיר פרויקט דלתא", version: "1.0", prevVersion: "—", changeType: "יצירה", changedBy: "שרה מזרחי", date: "2026-03-01", time: "13:00", comment: "יצירת הצעת מחיר ראשונית", size: "480 KB", status: "ארכיון" },
  { id: "DOC-418", name: "נוהל בטיחות כללי", version: "5.4", prevVersion: "5.3", changeType: "עדכון תוכן", changedBy: "מיכל ברק", date: "2026-04-03", time: "15:30", comment: "עדכון נהלי פינוי חירום קומה 3", size: "2.1 MB", status: "נוכחי" },
  { id: "DOC-523", name: "מפרט טכני PCB-8L", version: "3.0", prevVersion: "2.2", changeType: "אישור", changedBy: "רחל אברהם", date: "2026-04-07", time: "12:10", comment: "אישור מפרט לייצור סדרתי", size: "3.2 MB", status: "נוכחי" },
  { id: "DOC-523", name: "מפרט טכני PCB-8L", version: "2.2", prevVersion: "2.1", changeType: "תיקון", changedBy: "אלון גולדשטיין", date: "2026-04-01", time: "09:45", comment: "תיקון מפרט שכבת נחושת חמישית", size: "3.1 MB", status: "ארכיון" },
  { id: "DOC-640", name: "חוזה שכירות מחסן צפון", version: "2.0", prevVersion: "1.0", changeType: "עדכון תוכן", changedBy: "נועה פרידמן", date: "2026-03-15", time: "10:00", comment: "חידוש חוזה + הרחבת שטח", size: "890 KB", status: "rollback" },
  { id: "DOC-640", name: "חוזה שכירות מחסן צפון", version: "1.0", prevVersion: "—", changeType: "יצירה", changedBy: "נועה פרידמן", date: "2025-09-01", time: "08:30", comment: "חוזה מקורי", size: "780 KB", status: "נוכחי" },
  { id: "DOC-755", name: "תעודת כיול מכשיר M-22", version: "1.1", prevVersion: "1.0", changeType: "חתימה", changedBy: "דוד מזרחי", date: "2026-04-02", time: "14:20", comment: "חתימה דיגיטלית ע\"י מנהל איכות", size: "340 KB", status: "נוכחי" },
  { id: "DOC-863", name: "אישור יבוא מכס 2026-44", version: "1.0", prevVersion: "—", changeType: "יצירה", changedBy: "עומר חדד", date: "2026-04-01", time: "07:55", comment: "הנפקת אישור יבוא חדש", size: "1.1 MB", status: "נוכחי" },
  { id: "DOC-910", name: "רישיון עסק 2026", version: "1.0", prevVersion: "—", changeType: "יצירה", changedBy: "דוד לוי", date: "2026-01-10", time: "09:00", comment: "חידוש רישיון עסק שנתי", size: "620 KB", status: "נוכחי" },
];

const rollbackEvents = [
  { doc: "חוזה שכירות מחסן צפון", docId: "DOC-640", fromVersion: "2.0", toVersion: "1.0", reason: "סעיף שכירות שגוי — נדרש חזרה לנוסח מקורי", approvedBy: "דוד לוי", date: "2026-03-18", time: "11:30" },
  { doc: "מפרט טכני PCB-8L", docId: "DOC-523", fromVersion: "2.1", toVersion: "2.0", reason: "שגיאת ממדים בשכבה 4 — חזרה לגרסה מאומתת", approvedBy: "אלון גולדשטיין", date: "2026-03-25", time: "16:00" },
  { doc: "נוהל בטיחות כללי", docId: "DOC-418", fromVersion: "5.3", toVersion: "5.2", reason: "נוהל פינוי לא תואם תקן — שחזור גרסה קודמת", approvedBy: "מיכל ברק", date: "2026-02-14", time: "09:20" },
];

const comparisonData = {
  docName: "חוזה ספק מתכת כללי",
  docId: "DOC-101",
  versionA: "3.0",
  versionB: "3.1",
  diffs: [
    { field: "תנאי תשלום", before: "שוטף+45", after: "שוטף+60" },
    { field: "מחיר ק\"ג פלדה", before: "₪18.50", after: "₪19.20" },
    { field: "תוקף הסכם", before: "31/12/2026", after: "30/06/2027" },
    { field: "ערבות בנקאית", before: "₪50,000", after: "₪75,000" },
    { field: "אחראי ספק", before: "משה דהן", after: "רונן כץ" },
  ],
  sizeA: "1.3 MB",
  sizeB: "1.4 MB",
  approverA: "דוד לוי",
  approverB: "דוד לוי, רחל אברהם",
  dateA: "2026-03-20",
  dateB: "2026-04-07",
};

const retentionPolicies = [
  { docType: "חוזים", retention: "7 שנים", maxVersions: 50, autoArchive: true, compliance: "ISO 9001" },
  { docType: "שרטוטים", retention: "10 שנים", maxVersions: 100, autoArchive: true, compliance: "ISO 13485" },
  { docType: "הצעות מחיר", retention: "3 שנים", maxVersions: 20, autoArchive: true, compliance: "פנימי" },
  { docType: "נהלי בטיחות", retention: "ללא הגבלה", maxVersions: 999, autoArchive: false, compliance: "תקן 18001" },
  { docType: "מפרטים טכניים", retention: "10 שנים", maxVersions: 100, autoArchive: true, compliance: "ISO 9001" },
  { docType: "תעודות כיול", retention: "5 שנים", maxVersions: 30, autoArchive: true, compliance: "ISO 17025" },
  { docType: "אישורי יבוא", retention: "7 שנים", maxVersions: 10, autoArchive: true, compliance: "רגולציה מכס" },
  { docType: "רישיונות", retention: "5 שנים", maxVersions: 10, autoArchive: true, compliance: "רגולציה עירונית" },
];

/* ── helpers ── */

const changeTypeColor: Record<string, string> = {
  "יצירה": "bg-blue-900/60 text-blue-300",
  "עדכון תוכן": "bg-amber-900/60 text-amber-300",
  "עדכון מטא": "bg-purple-900/60 text-purple-300",
  "אישור": "bg-emerald-900/60 text-emerald-300",
  "חתימה": "bg-cyan-900/60 text-cyan-300",
  "תיקון": "bg-orange-900/60 text-orange-300",
};

const statusColor: Record<string, string> = {
  "נוכחי": "bg-emerald-900/60 text-emerald-300",
  "ארכיון": "bg-slate-700 text-slate-300",
  "rollback": "bg-red-900/60 text-red-300",
};

/* ── KPIs ── */

const kpis = [
  { label: "גרסאות פעילות", value: 412, icon: <GitFork className="w-5 h-5" />, color: "text-blue-400" },
  { label: "שינויים היום", value: 18, icon: <History className="w-5 h-5" />, color: "text-amber-400" },
  { label: "rollbacks החודש", value: 3, icon: <RotateCcw className="w-5 h-5" />, color: "text-red-400" },
  { label: "ממוצע גרסאות למסמך", value: "2.8", icon: <TrendingUp className="w-5 h-5" />, color: "text-emerald-400" },
];

/* ── component ── */

export default function VersionControl() {
  const [tab, setTab] = useState("history");

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <GitFork className="w-7 h-7 text-blue-400" />
        <h1 className="text-2xl font-bold tracking-tight">ניהול גרסאות</h1>
        <Badge className="bg-blue-900/50 text-blue-300 mr-auto">טכנו-כל עוזי</Badge>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-4 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className={k.color}>{k.icon}</span>
                <span className="text-2xl font-bold">{typeof k.value === "number" ? k.value.toLocaleString("he-IL") : k.value}</span>
              </div>
              <span className="text-xs text-slate-400">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-[#12121a] border border-[#1e1e2e] flex-wrap">
          <TabsTrigger value="history">היסטוריה</TabsTrigger>
          <TabsTrigger value="compare">השוואה</TabsTrigger>
          <TabsTrigger value="rollback">rollback</TabsTrigger>
          <TabsTrigger value="policy">מדיניות</TabsTrigger>
        </TabsList>

        {/* ── Version History ── */}
        <TabsContent value="history">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">מסמך</TableHead>
                    <TableHead className="text-right text-slate-400">גרסה</TableHead>
                    <TableHead className="text-right text-slate-400">שינוי</TableHead>
                    <TableHead className="text-right text-slate-400">שונה ע"י</TableHead>
                    <TableHead className="text-right text-slate-400">תאריך</TableHead>
                    <TableHead className="text-right text-slate-400">הערת שינוי</TableHead>
                    <TableHead className="text-right text-slate-400">גודל</TableHead>
                    <TableHead className="text-right text-slate-400">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versionHistory.map((v, i) => (
                    <TableRow key={`${v.id}-${v.version}-${i}`} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell>
                        <span className="font-mono text-blue-400 text-xs">{v.id}</span>
                        <div className="text-sm">{v.name}</div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {v.prevVersion !== "—" && <><span className="text-slate-500">v{v.prevVersion}</span><span className="text-slate-600"> → </span></>}
                        <span className="text-white font-semibold">v{v.version}</span>
                      </TableCell>
                      <TableCell><Badge className={changeTypeColor[v.changeType] || "bg-slate-700 text-slate-300"}>{v.changeType}</Badge></TableCell>
                      <TableCell className="text-sm">{v.changedBy}</TableCell>
                      <TableCell className="text-sm text-slate-400">{v.date} <span className="text-xs text-slate-500">{v.time}</span></TableCell>
                      <TableCell className="text-xs text-slate-300 max-w-[200px] truncate">{v.comment}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-400">{v.size}</TableCell>
                      <TableCell><Badge className={statusColor[v.status] || "bg-slate-700 text-slate-300"}>{v.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Comparison View ── */}
        <TabsContent value="compare">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-5 space-y-5">
              <div className="flex items-center gap-2 mb-3">
                <ArrowRightLeft className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-semibold">השוואת גרסאות — {comparisonData.docName}</h2>
                <Badge variant="outline" className="text-slate-300 border-slate-600 font-mono">{comparisonData.docId}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-[#1a1a2e] border-[#2a2a3e]">
                  <CardContent className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">גרסה ישנה</span>
                      <Badge className="bg-slate-700 text-slate-300 font-mono">v{comparisonData.versionA}</Badge>
                    </div>
                    <div className="text-xs text-slate-500">תאריך: {comparisonData.dateA} | גודל: {comparisonData.sizeA} | מאשר: {comparisonData.approverA}</div>
                  </CardContent>
                </Card>
                <Card className="bg-[#1a1a2e] border-emerald-900/40">
                  <CardContent className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">גרסה חדשה</span>
                      <Badge className="bg-emerald-900/60 text-emerald-300 font-mono">v{comparisonData.versionB}</Badge>
                    </div>
                    <div className="text-xs text-slate-500">תאריך: {comparisonData.dateB} | גודל: {comparisonData.sizeB} | מאשר: {comparisonData.approverB}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Metadata diff table */}
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">שדה</TableHead>
                    <TableHead className="text-right text-slate-400">v{comparisonData.versionA} (לפני)</TableHead>
                    <TableHead className="text-right text-slate-400">v{comparisonData.versionB} (אחרי)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisonData.diffs.map((d) => (
                    <TableRow key={d.field} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-semibold text-sm">{d.field}</TableCell>
                      <TableCell className="text-red-400/80 text-sm bg-red-950/20">{d.before}</TableCell>
                      <TableCell className="text-emerald-400/80 text-sm bg-emerald-950/20">{d.after}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Size comparison bar */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500"><span>v{comparisonData.versionA}</span><span>{comparisonData.sizeA}</span></div>
                  <Progress value={87} className="h-2" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500"><span>v{comparisonData.versionB}</span><span>{comparisonData.sizeB}</span></div>
                  <Progress value={93} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Rollback History ── */}
        <TabsContent value="rollback">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <RotateCcw className="w-5 h-5 text-red-400" />
                <h2 className="text-lg font-semibold">היסטוריית שחזורים (Rollback)</h2>
                <Badge className="bg-red-900/50 text-red-300">{rollbackEvents.length} אירועים</Badge>
              </div>
              {rollbackEvents.map((r, i) => (
                <Card key={i} className="bg-[#1a1a2e] border-[#2a2a3e]">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        <span className="font-semibold">{r.doc}</span>
                        <Badge variant="outline" className="text-slate-300 border-slate-600 font-mono text-xs">{r.docId}</Badge>
                      </div>
                      <span className="text-xs text-slate-400">{r.date} {r.time}</span>
                    </div>
                    <div className="flex items-center gap-1 font-mono text-sm">
                      <Badge className="bg-red-900/40 text-red-300">v{r.fromVersion}</Badge>
                      <span className="text-slate-500">→</span>
                      <Badge className="bg-emerald-900/40 text-emerald-300">v{r.toVersion}</Badge>
                    </div>
                    <div className="text-sm text-slate-300"><span className="text-slate-500">סיבה: </span>{r.reason}</div>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <ShieldCheck className="w-3 h-3 text-emerald-500" />
                      <span>אושר ע"י: {r.approvedBy}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Retention Policy ── */}
        <TabsContent value="policy">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-semibold">מדיניות שמירת גרסאות</h2>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">סוג מסמך</TableHead>
                    <TableHead className="text-right text-slate-400">תקופת שמירה</TableHead>
                    <TableHead className="text-right text-slate-400">מקסימום גרסאות</TableHead>
                    <TableHead className="text-right text-slate-400">ארכוב אוטומטי</TableHead>
                    <TableHead className="text-right text-slate-400">תאימות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {retentionPolicies.map((p) => (
                    <TableRow key={p.docType} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-semibold text-sm">{p.docType}</TableCell>
                      <TableCell className="text-sm">{p.retention}</TableCell>
                      <TableCell className="font-mono text-sm text-slate-400">{p.maxVersions}</TableCell>
                      <TableCell>
                        <Badge className={p.autoArchive ? "bg-emerald-900/60 text-emerald-300" : "bg-slate-700 text-slate-300"}>
                          {p.autoArchive ? "פעיל" : "כבוי"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-cyan-300 border-cyan-800 text-xs">{p.compliance}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Retention distribution */}
              <div className="space-y-2 pt-3">
                <h3 className="text-sm font-medium text-slate-400">התפלגות גרסאות לפי סוג מסמך</h3>
                {[
                  { type: "חוזים", count: 128, pct: 64 },
                  { type: "שרטוטים", count: 95, pct: 48 },
                  { type: "מפרטים טכניים", count: 72, pct: 36 },
                  { type: "נהלי בטיחות", count: 54, pct: 27 },
                  { type: "הצעות מחיר", count: 38, pct: 19 },
                ].map((item) => (
                  <div key={item.type} className="space-y-1">
                    <div className="flex justify-between text-xs"><span className="text-slate-300">{item.type}</span><span className="text-slate-500">{item.count} גרסאות</span></div>
                    <Progress value={item.pct} className="h-2" />
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
