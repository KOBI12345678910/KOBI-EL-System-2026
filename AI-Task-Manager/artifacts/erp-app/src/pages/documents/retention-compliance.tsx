import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, FileText, AlertTriangle, RefreshCw, Scale, Lock, ClipboardCheck, Gavel, BookOpen, CalendarX2 } from "lucide-react";

/* ── mock data ── */
const retentionPolicies = [
  { type: "חשבוניות מס", period: "7 שנים", basis: "חוק מע\"מ, תשל\"ו-1975", count: 620, nextExpiry: "2026-05-18", status: "תקין" },
  { type: "דוחות כספיים שנתיים", period: "7 שנים", basis: "הוראות רשות המיסים", count: 84, nextExpiry: "2026-08-01", status: "תקין" },
  { type: "חוזי עבודה", period: "7 שנים", basis: "חוק הגנת השכר, תשי\"ח-1958", count: 312, nextExpiry: "2026-06-10", status: "אזהרה" },
  { type: "תעודות בטיחות", period: "25 שנים", basis: "פקודת הבטיחות בעבודה", count: 156, nextExpiry: "2028-12-31", status: "תקין" },
  { type: "אישורי ISO 9001", period: "5 שנים", basis: "תקן ISO 9001:2015", count: 48, nextExpiry: "2026-04-20", status: "אזהרה" },
  { type: "מסמכי יבוא/יצוא", period: "7 שנים", basis: "חוק מע\"מ + פקודת המכס", count: 245, nextExpiry: "2026-09-15", status: "תקין" },
  { type: "הסכמי סודיות (NDA)", period: "10 שנים", basis: "דרישת לקוח / חוזית", count: 78, nextExpiry: "2027-03-01", status: "תקין" },
  { type: "פרוטוקולי דירקטוריון", period: "לצמיתות", basis: "חוק החברות, תשנ\"ט-1999", count: 210, nextExpiry: "—", status: "תקין" },
  { type: "רישומי שכר ונוכחות", period: "7 שנים", basis: "חוק הגנת הפרטיות + רשות המיסים", count: 485, nextExpiry: "2026-07-22", status: "חריגה" },
  { type: "שרטוטים הנדסיים", period: "3 שנים", basis: "תקן ISO 9001 / נוהל פנימי", count: 212, nextExpiry: "2026-05-05", status: "תקין" },
];
const expiringDocuments = [
  { name: "חשבונית מס 41022", type: "חשבונית מס", expiry: "2026-04-15", daysLeft: 7, action: "העברה לארכיון קבוע" },
  { name: "אישור ISO 9001 — מפעל צפון", type: "אישורי ISO", expiry: "2026-04-20", daysLeft: 12, action: "חידוש תעודה דחוף" },
  { name: "חוזה עבודה — דוד מזרחי", type: "חוזי עבודה", expiry: "2026-04-25", daysLeft: 17, action: "הארכת שימור" },
  { name: "דוח מע\"מ Q1-2019", type: "דוחות כספיים", expiry: "2026-04-28", daysLeft: 20, action: "אישור השמדה מסודרת" },
  { name: "חשבונית מס 41078", type: "חשבונית מס", expiry: "2026-05-01", daysLeft: 23, action: "העברה לארכיון קבוע" },
  { name: "שרטוט מסגרת T-280 Rev A", type: "שרטוטים", expiry: "2026-05-05", daysLeft: 27, action: "עדכון גרסה או השמדה" },
  { name: "רישום נוכחות 03/2019", type: "רישומי שכר", expiry: "2026-05-08", daysLeft: 30, action: "אישור השמדה מסודרת" },
  { name: "חשבונית מס 41135", type: "חשבונית מס", expiry: "2026-05-10", daysLeft: 32, action: "העברה לארכיון קבוע" },
];
const legalHolds = [
  { caseRef: "תב\"ע 2024/5582 — תביעת עובד", docsAffected: 34, holdStart: "2025-11-10", authorizedBy: "עו\"ד רחל אברהם" },
  { caseRef: "מכס/2025/112 — ערעור מיסוי יבוא", docsAffected: 18, holdStart: "2026-01-05", authorizedBy: "עו\"ד יוסי כהן" },
  { caseRef: "אז/2026/008 — סכסוך ספק", docsAffected: 12, holdStart: "2026-03-18", authorizedBy: "עו\"ד נועה פרידמן" },
];
const auditFindings = [
  { id: "F-01", finding: "3 חשבוניות מס ללא חותמת זמן דיגיטלית", severity: "בינונית", corrective: "הוספת חותמת זמן רטרואקטיבית", status: "בטיפול" },
  { id: "F-02", finding: "רישומי שכר 2019 לא הועברו לארכיון במועד", severity: "גבוהה", corrective: "העברה דחופה + עדכון נוהל", status: "הושלם" },
  { id: "F-03", finding: "חסר תיעוד הסכמה לפי חוק הגנת הפרטיות ב-2 חוזים", severity: "גבוהה", corrective: "השלמת טפסי הסכמה", status: "בטיפול" },
];
const israeliRegulations = [
  { law: "חוק מע\"מ, תשל\"ו-1975", requirement: "שימור חשבוניות ותיעוד עסקאות", period: "7 שנים", scope: "חשבוניות מס, קבלות, תיעוד פנימי", docs: 620 },
  { law: "פקודת מס הכנסה [נוסח חדש]", requirement: "שמירת ספרים ורישומים חשבונאיים", period: "7 שנים", scope: "דוחות כספיים, ספר הזמנות, תקבולים", docs: 84 },
  { law: "חוק הגנת השכר, תשי\"ח-1958", requirement: "שמירת רישומי שכר ונוכחות", period: "7 שנים", scope: "תלושי שכר, נוכחות, חוזי עבודה", docs: 797 },
  { law: "פקודת הבטיחות בעבודה", requirement: "תיעוד בטיחות ותאונות עבודה", period: "25 שנים", scope: "דוחות תאונות, סקרי סיכונים, הדרכות", docs: 156 },
  { law: "חוק הגנת הפרטיות, תשמ\"א-1981", requirement: "תיעוד הסכמות ומדיניות פרטיות", period: "7 שנים", scope: "טפסי הסכמה, מדיניות פרטיות", docs: 65 },
  { law: "חוק החברות, תשנ\"ט-1999", requirement: "שמירת פרוטוקולים ומסמכי התאגדות", period: "לצמיתות", scope: "פרוטוקולי דירקטוריון, אסיפות, תקנון", docs: 210 },
];

/* ── helpers ── */
const statusColor: Record<string, string> = { "תקין": "bg-emerald-900/60 text-emerald-300", "אזהרה": "bg-amber-900/60 text-amber-300", "חריגה": "bg-red-900/60 text-red-300" };
const severityColor: Record<string, string> = { "גבוהה": "bg-red-900/60 text-red-300", "בינונית": "bg-amber-900/60 text-amber-300", "נמוכה": "bg-emerald-900/60 text-emerald-300" };
const auditStatusColor: Record<string, string> = { "בטיפול": "bg-amber-900/60 text-amber-300", "הושלם": "bg-emerald-900/60 text-emerald-300" };
const daysLeftBadge = (d: number) => <Badge className={d <= 7 ? "bg-red-900/60 text-red-300" : d <= 21 ? "bg-amber-900/60 text-amber-300" : "bg-emerald-900/60 text-emerald-300"}>{d} ימים</Badge>;

const kpis = [
  { label: "מסמכים בשימור", value: "2,450", icon: <FileText className="w-5 h-5" />, color: "text-blue-400" },
  { label: "פגי תוקף", value: "8", icon: <CalendarX2 className="w-5 h-5" />, color: "text-red-400" },
  { label: "דורשים חידוש", value: "12", icon: <RefreshCw className="w-5 h-5" />, color: "text-amber-400" },
  { label: "בהקפאה משפטית", value: "3", icon: <Lock className="w-5 h-5" />, color: "text-purple-400" },
  { label: "עמידה ברגולציה", value: "94%", icon: <ShieldCheck className="w-5 h-5" />, color: "text-emerald-400", isPercent: true },
];

export default function RetentionCompliance() {
  const [tab, setTab] = useState("policies");

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-7 h-7 text-emerald-400" />
        <h1 className="text-2xl font-bold tracking-tight">שימור ותאימות רגולטורית</h1>
        <Badge className="bg-emerald-900/50 text-emerald-300 mr-auto">טכנו-כל עוזי</Badge>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-4 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className={k.color}>{k.icon}</span>
                <span className="text-2xl font-bold">{k.value}</span>
              </div>
              <span className="text-xs text-slate-400">{k.label}</span>
              {(k as any).isPercent && <Progress value={94} className="h-1.5 mt-1" />}
            </CardContent>
          </Card>
        ))}
      </div>
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-[#12121a] border border-[#1e1e2e] flex-wrap">
          <TabsTrigger value="policies">מדיניות שימור</TabsTrigger>
          <TabsTrigger value="expiring">מסמכים לפקיעה</TabsTrigger>
          <TabsTrigger value="legalhold">הקפאה משפטית</TabsTrigger>
          <TabsTrigger value="audit">ביקורת תאימות</TabsTrigger>
          <TabsTrigger value="regulation">רגולציה ישראלית</TabsTrigger>
        </TabsList>
        {/* ── Retention Policies ── */}
        <TabsContent value="policies">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="border-[#1e1e2e]">
                  {["סוג מסמך","תקופת שימור","בסיס רגולטורי","מסמכים בקטגוריה","הבא לפקיעה","סטטוס"].map(h=><TableHead key={h} className="text-right text-slate-400">{h}</TableHead>)}
                </TableRow></TableHeader>
                <TableBody>
                  {retentionPolicies.map((p) => (
                    <TableRow key={p.type} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-medium">{p.type}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-slate-300 border-slate-600">{p.period}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400 max-w-[200px]">{p.basis}</TableCell>
                      <TableCell className="font-mono text-blue-400">{p.count}</TableCell>
                      <TableCell className="text-slate-400">{p.nextExpiry}</TableCell>
                      <TableCell>
                        <Badge className={statusColor[p.status] || "bg-slate-700 text-slate-300"}>{p.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ── Expiring Documents ── */}
        <TabsContent value="expiring">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span className="font-semibold text-amber-300">מסמכים שפוקעים ב-30 הימים הקרובים</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="border-[#1e1e2e]">
                    {["שם מסמך","סוג","תאריך פקיעה","ימים שנותרו","פעולה נדרשת"].map(h=><TableHead key={h} className="text-right text-slate-400">{h}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {expiringDocuments.map((d) => (
                      <TableRow key={d.name} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                        <TableCell className="font-medium">{d.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-slate-300 border-slate-600">{d.type}</Badge>
                        </TableCell>
                        <TableCell className="text-slate-400">{d.expiry}</TableCell>
                        <TableCell>{daysLeftBadge(d.daysLeft)}</TableCell>
                        <TableCell className="text-xs text-slate-300">{d.action}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ── Legal Hold ── */}
        <TabsContent value="legalhold">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Gavel className="w-5 h-5 text-purple-400" />
                <span className="font-semibold text-purple-300">הקפאות משפטיות פעילות</span>
              </div>
              <p className="text-xs text-slate-500 mb-3">מסמכים תחת הקפאה משפטית אינם ניתנים להשמדה, שינוי או העברה עד להסרת ההקפאה.</p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="border-[#1e1e2e]">
                    {["אסמכתא / תיק","מסמכים מושפעים","תחילת הקפאה","אושר ע\"י"].map(h=><TableHead key={h} className="text-right text-slate-400">{h}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {legalHolds.map((h) => (
                      <TableRow key={h.caseRef} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-purple-400 shrink-0" />
                            {h.caseRef}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-purple-400">{h.docsAffected}</TableCell>
                        <TableCell className="text-slate-400">{h.holdStart}</TableCell>
                        <TableCell className="text-xs">{h.authorizedBy}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3 p-3 rounded-lg bg-purple-950/30 border border-purple-900/40 text-xs text-purple-300">
                <Scale className="w-4 h-4 inline ml-1" />
                סה"כ {legalHolds.reduce((s, h) => s + h.docsAffected, 0)} מסמכים תחת הקפאה משפטית. כל גישה/שינוי מתועדים ביומן ביקורת.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* ── Compliance Audit ── */}
        <TabsContent value="audit">
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "ביקורת אחרונה", val: "2026-03-15", cls: "" },
                { label: "ממצאים", val: "3", cls: "text-amber-400" },
                { label: "פעולות מתקנות", val: "1 / 3 הושלמו", cls: "text-emerald-400" },
                { label: "ביקורת הבאה", val: "2026-09-15", cls: "text-blue-400" },
              ].map((c) => (
                <Card key={c.label} className="bg-[#12121a] border-[#1e1e2e]">
                  <CardContent className="p-4">
                    <span className="text-xs text-slate-400">{c.label}</span>
                    <p className={`text-lg font-bold mt-1 ${c.cls}`}>{c.val}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="bg-[#12121a] border-[#1e1e2e]">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <ClipboardCheck className="w-5 h-5 text-amber-400" />
                  <span className="font-semibold">ממצאי ביקורת ופעולות מתקנות</span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow className="border-[#1e1e2e]">
                      {["מזהה","ממצא","חומרה","פעולה מתקנת","סטטוס"].map(h=><TableHead key={h} className="text-right text-slate-400">{h}</TableHead>)}
                    </TableRow></TableHeader>
                    <TableBody>
                      {auditFindings.map((f) => (
                        <TableRow key={f.id} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                          <TableCell className="font-mono text-blue-400">{f.id}</TableCell>
                          <TableCell className="text-sm">{f.finding}</TableCell>
                          <TableCell>
                            <Badge className={severityColor[f.severity] || "bg-slate-700 text-slate-300"}>{f.severity}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-slate-300">{f.corrective}</TableCell>
                          <TableCell>
                            <Badge className={auditStatusColor[f.status] || "bg-slate-700 text-slate-300"}>{f.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            {/* Compliance Progress */}
            <Card className="bg-[#12121a] border-[#1e1e2e]">
              <CardContent className="p-4 space-y-3">
                <span className="font-semibold">מדד עמידה ברגולציה</span>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">ציון כללי</span>
                    <span className="text-emerald-400 font-bold">94%</span>
                  </div>
                  <Progress value={94} className="h-2" />
                </div>
                <p className="text-xs text-slate-500">הציון מחושב: שלמות תיעוד (30%), עמידה בזמנים (25%), חותמות דיגיטליות (20%), פעולות מתקנות (25%).</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {/* ── Israeli Regulatory ── */}
        <TabsContent value="regulation">
          <div className="space-y-4">
            <Card className="bg-[#12121a] border-[#1e1e2e]">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-5 h-5 text-blue-400" />
                  <span className="font-semibold">דרישות רגולטוריות — מדינת ישראל</span>
                </div>
                <p className="text-xs text-slate-500 mb-3">סיכום דרישות שימור על-פי חקיקה ישראלית. אי-עמידה עלולה לגרור קנסות, אי-הכרה בהוצאות, וחשיפה משפטית.</p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow className="border-[#1e1e2e]">
                      {["חוק / תקנה","דרישה","תקופת שימור","היקף מסמכים","מסמכים במערכת"].map(h=><TableHead key={h} className="text-right text-slate-400">{h}</TableHead>)}
                    </TableRow></TableHeader>
                    <TableBody>
                      {israeliRegulations.map((r) => (
                        <TableRow key={r.law} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                          <TableCell className="font-medium text-sm">{r.law}</TableCell>
                          <TableCell className="text-xs text-slate-300">{r.requirement}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-slate-300 border-slate-600">{r.period}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-slate-400 max-w-[180px]">{r.scope}</TableCell>
                          <TableCell className="font-mono text-blue-400">{r.docs}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-[#12121a] border-[#1e1e2e]">
              <CardContent className="p-4 space-y-2">
                <span className="font-semibold text-amber-300">הערות חשובות לעמידה ברגולציה</span>
                <ul className="text-xs text-slate-400 space-y-1.5 list-disc pr-5">
                  <li><span className="text-white font-medium">חוק מע"מ (סעיף 38):</span> חשבוניות מס — 7 שנים מתום שנת המס. השמדה מוקדמת גוררת אי-הכרה בתשומות.</li>
                  <li><span className="text-white font-medium">רשות המיסים:</span> ספרים ורישומים — 7 שנים. מסמכים דיגיטליים חייבים לעמוד בהנחיה 2003/3.</li>
                  <li><span className="text-white font-medium">הגנת הפרטיות:</span> מידע אישי נשמר בהתאם לתקנות אבטחת מידע. חובת תיעוד הסכמות והשמדה בפקיעה.</li>
                  <li><span className="text-white font-medium">פקודת הבטיחות:</span> תיעוד בטיחות ותאונות עבודה — 25 שנה, הארוכה ביותר בחקיקה הישראלית.</li>
                  <li><span className="text-white font-medium">חוק החברות:</span> פרוטוקולי דירקטוריון ואסיפות כלליות — לצמיתות. אין אפשרות השמדה.</li>
                  <li><span className="text-white font-medium">הקפאה משפטית:</span> מסמכים בהליך משפטי מוקפאים אוטומטית — אסור להשמיד/לשנות עד סיום ההליך.</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
