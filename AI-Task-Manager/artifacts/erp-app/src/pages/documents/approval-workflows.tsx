import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  GitPullRequest, Clock, CheckCircle2, XCircle, Timer, ShieldCheck,
  FileText, ChevronLeft, AlertTriangle, Settings2, BarChart3, History,
} from "lucide-react";

/* ── approval chain visual step indicator ── */

function ApprovalChain({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center gap-1">
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                done
                  ? "bg-emerald-900/60 text-emerald-300"
                  : active
                  ? "bg-blue-900/60 text-blue-300 ring-1 ring-blue-500"
                  : "bg-slate-800 text-slate-500"
              }`}
            >
              {done && <CheckCircle2 className="w-3 h-3" />}
              {active && <Clock className="w-3 h-3 animate-pulse" />}
              {s}
            </span>
            {i < steps.length - 1 && <ChevronLeft className="w-3 h-3 text-slate-600" />}
          </div>
        );
      })}
    </div>
  );
}

/* ── mock data ── */

const pendingApprovals = [
  { id: "APR-301", doc: "הזמנת רכש PO-8820", type: "הזמנת רכש", requester: "יוסי כהן", steps: ["מנהל ישיר", "מנהל מחלקה", "הנהלה"], currentStep: 1, since: "2026-04-06", urgency: "דחוף", status: "ממתין לשלב 2" },
  { id: "APR-302", doc: "חוזה לקוח דלתא-2026", type: "חוזה", requester: "שרה מזרחי", steps: ["מנהל ישיר", "משפטי", "מנהל מחלקה", "הנהלה"], currentStep: 0, since: "2026-04-07", urgency: "קריטי", status: "ממתין לשלב 1" },
  { id: "APR-303", doc: "שרטוט מסגרת T-500", type: "שרטוט", requester: "אלון גולדשטיין", steps: ["מנהל ישיר", "הנדסה ראשית"], currentStep: 1, since: "2026-04-05", urgency: "רגיל", status: "ממתין לשלב 2" },
  { id: "APR-304", doc: "שינוי מפרט PCB-9L", type: "מפרט", requester: "דוד מזרחי", steps: ["מנהל ישיר", "מנהל מחלקה", "הנהלה"], currentStep: 0, since: "2026-04-07", urgency: "דחוף", status: "ממתין לשלב 1" },
  { id: "APR-305", doc: "מסמך איכות ISO-4401", type: "איכות", requester: "מיכל ברק", steps: ["מנהל ישיר", "איכות ראשית"], currentStep: 0, since: "2026-04-08", urgency: "רגיל", status: "ממתין לשלב 1" },
  { id: "APR-306", doc: "תשלום ספק מתכת-פרו", type: "תשלום", requester: "רחל אברהם", steps: ["מנהל ישיר", "כספים", "הנהלה"], currentStep: 2, since: "2026-04-03", urgency: "קריטי", status: "ממתין לשלב 3" },
  { id: "APR-307", doc: "הזמנת רכש PO-8835", type: "הזמנת רכש", requester: "עומר חדד", steps: ["מנהל ישיר", "מנהל מחלקה", "הנהלה"], currentStep: 0, since: "2026-04-08", urgency: "רגיל", status: "ממתין לשלב 1" },
  { id: "APR-308", doc: "חוזה ספק אלומיניום בע\"מ", type: "חוזה", requester: "נועה פרידמן", steps: ["מנהל ישיר", "משפטי", "מנהל מחלקה", "הנהלה"], currentStep: 2, since: "2026-04-02", urgency: "דחוף", status: "ממתין לשלב 3" },
  { id: "APR-309", doc: "שרטוט ציר SH-50", type: "שרטוט", requester: "אלון גולדשטיין", steps: ["מנהל ישיר", "הנדסה ראשית"], currentStep: 0, since: "2026-04-07", urgency: "רגיל", status: "ממתין לשלב 1" },
  { id: "APR-310", doc: "שינוי מפרט סגסוגת T7", type: "מפרט", requester: "דוד מזרחי", steps: ["מנהל ישיר", "מנהל מחלקה", "הנהלה"], currentStep: 1, since: "2026-04-06", urgency: "רגיל", status: "ממתין לשלב 2" },
  { id: "APR-311", doc: "מסמך איכות בדיקת חומרים", type: "איכות", requester: "מיכל ברק", steps: ["מנהל ישיר", "איכות ראשית"], currentStep: 1, since: "2026-04-04", urgency: "דחוף", status: "ממתין לשלב 2" },
  { id: "APR-312", doc: "תשלום ספק חשמל-טק", type: "תשלום", requester: "רחל אברהם", steps: ["מנהל ישיר", "כספים", "הנהלה"], currentStep: 0, since: "2026-04-08", urgency: "רגיל", status: "ממתין לשלב 1" },
];

const workflowTemplates = [
  { name: "אישור הזמנת רכש", steps: 3, chain: ["מנהל ישיר", "מנהל מחלקה", "הנהלה"], avgTime: "3.8 שעות", activeCount: 5, color: "text-blue-400" },
  { name: "אישור חוזה לקוח", steps: 4, chain: ["מנהל ישיר", "משפטי", "מנהל מחלקה", "הנהלה"], avgTime: "6.1 שעות", activeCount: 3, color: "text-purple-400" },
  { name: "אישור שרטוט הנדסי", steps: 2, chain: ["מנהל ישיר", "הנדסה ראשית"], avgTime: "2.4 שעות", activeCount: 4, color: "text-cyan-400" },
  { name: "אישור שינוי מפרט", steps: 3, chain: ["מנהל ישיר", "מנהל מחלקה", "הנהלה"], avgTime: "4.5 שעות", activeCount: 2, color: "text-amber-400" },
  { name: "אישור מסמך איכות", steps: 2, chain: ["מנהל ישיר", "איכות ראשית"], avgTime: "1.9 שעות", activeCount: 3, color: "text-emerald-400" },
  { name: "אישור תשלום ספק", steps: 3, chain: ["מנהל ישיר", "כספים", "הנהלה"], avgTime: "5.2 שעות", activeCount: 2, color: "text-rose-400" },
];

const approvalHistory = [
  { id: "APR-290", doc: "הזמנת רכש PO-8801", action: "מאושר", by: "דוד לוי", date: "2026-04-07 14:32", duration: "3.1 שעות" },
  { id: "APR-289", doc: "חוזה לקוח אלפא-טק", action: "מאושר", by: "אלון גולדשטיין", date: "2026-04-07 11:15", duration: "5.8 שעות" },
  { id: "APR-288", doc: "שרטוט מסגרת T-480", action: "מאושר", by: "מיכל ברק", date: "2026-04-07 09:44", duration: "2.0 שעות" },
  { id: "APR-287", doc: "מפרט טכני גלגל שיניים G12", action: "נדחה", by: "נועה פרידמן", date: "2026-04-06 16:20", duration: "4.7 שעות" },
  { id: "APR-286", doc: "תשלום ספק פלדה-נט", action: "מאושר", by: "רחל אברהם", date: "2026-04-06 13:05", duration: "5.4 שעות" },
  { id: "APR-285", doc: "מסמך איכות בדיקת ריתוך", action: "מאושר", by: "דוד מזרחי", date: "2026-04-06 10:30", duration: "1.6 שעות" },
  { id: "APR-284", doc: "הזמנת רכש PO-8790", action: "מאושר", by: "יוסי כהן", date: "2026-04-05 15:48", duration: "3.9 שעות" },
  { id: "APR-283", doc: "חוזה ספק אופטיקה בע\"מ", action: "נדחה", by: "שרה מזרחי", date: "2026-04-05 12:10", duration: "7.2 שעות" },
  { id: "APR-282", doc: "שרטוט ציר SH-45", action: "מאושר", by: "אלון גולדשטיין", date: "2026-04-05 09:22", duration: "2.3 שעות" },
  { id: "APR-281", doc: "תשלום ספק רכיבים-פלוס", action: "מאושר", by: "עומר חדד", date: "2026-04-04 17:05", duration: "4.8 שעות" },
];

const slaDashboard = [
  { workflow: "אישור הזמנת רכש", target: "4 שעות", avg: "3.8 שעות", compliance: 88, breaches: 3, total: 25 },
  { workflow: "אישור חוזה לקוח", target: "8 שעות", avg: "6.1 שעות", compliance: 94, breaches: 1, total: 18 },
  { workflow: "אישור שרטוט הנדסי", target: "3 שעות", avg: "2.4 שעות", compliance: 96, breaches: 1, total: 22 },
  { workflow: "אישור שינוי מפרט", target: "5 שעות", avg: "4.5 שעות", compliance: 85, breaches: 2, total: 14 },
  { workflow: "אישור מסמך איכות", target: "2 שעות", avg: "1.9 שעות", compliance: 92, breaches: 1, total: 12 },
  { workflow: "אישור תשלום ספק", target: "6 שעות", avg: "5.2 שעות", compliance: 90, breaches: 2, total: 20 },
];

/* ── helpers ── */

const urgencyColor: Record<string, string> = {
  "רגיל": "bg-slate-700 text-slate-300",
  "דחוף": "bg-amber-900/60 text-amber-300",
  "קריטי": "bg-red-900/60 text-red-300",
};

const statusColor: Record<string, string> = {
  "ממתין לשלב 1": "bg-amber-900/60 text-amber-300",
  "ממתין לשלב 2": "bg-blue-900/60 text-blue-300",
  "ממתין לשלב 3": "bg-purple-900/60 text-purple-300",
  "מאושר": "bg-emerald-900/60 text-emerald-300",
  "נדחה": "bg-red-900/60 text-red-300",
};

/* ── KPIs ── */

const kpis = [
  { label: "ממתינים לאישור", value: 23, icon: <Clock className="w-5 h-5" />, color: "text-amber-400" },
  { label: "אושרו היום", value: 8, icon: <CheckCircle2 className="w-5 h-5" />, color: "text-emerald-400" },
  { label: "נדחו", value: 2, icon: <XCircle className="w-5 h-5" />, color: "text-red-400" },
  { label: "ממוצע זמן אישור", value: "4.2 שעות", icon: <Timer className="w-5 h-5" />, color: "text-blue-400" },
  { label: "SLA עמידה", value: "91%", icon: <ShieldCheck className="w-5 h-5" />, color: "text-purple-400" },
];

/* ── component ── */

export default function ApprovalWorkflows() {
  const [tab, setTab] = useState("pending");

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <GitPullRequest className="w-7 h-7 text-purple-400" />
        <h1 className="text-2xl font-bold tracking-tight">זרימות אישור מסמכים</h1>
        <Badge className="bg-purple-900/50 text-purple-300 mr-auto">טכנו-כל עוזי</Badge>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
          <TabsTrigger value="pending">ממתינים לאישור</TabsTrigger>
          <TabsTrigger value="templates">תבניות זרימה</TabsTrigger>
          <TabsTrigger value="history">היסטוריית אישורים</TabsTrigger>
          <TabsTrigger value="sla">לוח SLA</TabsTrigger>
        </TabsList>

        {/* ── Pending Approvals ── */}
        <TabsContent value="pending">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">מזהה בקשה</TableHead>
                    <TableHead className="text-right text-slate-400">מסמך</TableHead>
                    <TableHead className="text-right text-slate-400">סוג</TableHead>
                    <TableHead className="text-right text-slate-400">מבקש</TableHead>
                    <TableHead className="text-right text-slate-400">שרשרת אישור</TableHead>
                    <TableHead className="text-right text-slate-400">ממתין מאז</TableHead>
                    <TableHead className="text-right text-slate-400">דחיפות</TableHead>
                    <TableHead className="text-right text-slate-400">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingApprovals.map((a) => (
                    <TableRow key={a.id} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-mono text-purple-400">{a.id}</TableCell>
                      <TableCell className="font-medium">{a.doc}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-slate-300 border-slate-600">{a.type}</Badge>
                      </TableCell>
                      <TableCell>{a.requester}</TableCell>
                      <TableCell>
                        <ApprovalChain steps={a.steps} current={a.currentStep} />
                      </TableCell>
                      <TableCell className="text-slate-400">{a.since}</TableCell>
                      <TableCell>
                        <Badge className={urgencyColor[a.urgency] || "bg-slate-700 text-slate-300"}>{a.urgency}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColor[a.status] || "bg-slate-700 text-slate-300"}>{a.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Workflow Templates ── */}
        <TabsContent value="templates">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflowTemplates.map((wf) => (
              <Card key={wf.name} className="bg-[#12121a] border-[#1e1e2e]">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings2 className={`w-5 h-5 ${wf.color}`} />
                      <h3 className="font-semibold text-sm">{wf.name}</h3>
                    </div>
                    <Badge variant="outline" className="text-slate-400 border-slate-600">{wf.steps} שלבים</Badge>
                  </div>

                  <div className="flex items-center gap-1 text-xs flex-wrap">
                    {wf.chain.map((step, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">{step}</span>
                        {i < wf.chain.length - 1 && <ChevronLeft className="w-3 h-3 text-slate-600" />}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500">זמן ממוצע</span>
                      <p className="text-blue-400 font-mono font-semibold">{wf.avgTime}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">בקשות פעילות</span>
                      <p className="text-amber-400 font-mono font-semibold">{wf.activeCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Approval History ── */}
        <TabsContent value="history">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">מזהה</TableHead>
                    <TableHead className="text-right text-slate-400">מסמך</TableHead>
                    <TableHead className="text-right text-slate-400">פעולה</TableHead>
                    <TableHead className="text-right text-slate-400">מאשר</TableHead>
                    <TableHead className="text-right text-slate-400">תאריך ושעה</TableHead>
                    <TableHead className="text-right text-slate-400">משך טיפול</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvalHistory.map((h) => (
                    <TableRow key={h.id} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-mono text-purple-400">{h.id}</TableCell>
                      <TableCell>{h.doc}</TableCell>
                      <TableCell>
                        <Badge className={h.action === "מאושר" ? "bg-emerald-900/60 text-emerald-300" : "bg-red-900/60 text-red-300"}>
                          {h.action === "מאושר" ? <CheckCircle2 className="w-3 h-3 inline ml-1" /> : <XCircle className="w-3 h-3 inline ml-1" />}
                          {h.action}
                        </Badge>
                      </TableCell>
                      <TableCell>{h.by}</TableCell>
                      <TableCell className="text-slate-400 font-mono text-xs">{h.date}</TableCell>
                      <TableCell className="font-mono text-blue-400">{h.duration}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SLA Dashboard ── */}
        <TabsContent value="sla">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">סוג זרימה</TableHead>
                    <TableHead className="text-right text-slate-400">יעד SLA</TableHead>
                    <TableHead className="text-right text-slate-400">ממוצע בפועל</TableHead>
                    <TableHead className="text-right text-slate-400">עמידה ב-SLA</TableHead>
                    <TableHead className="text-right text-slate-400">חריגות</TableHead>
                    <TableHead className="text-right text-slate-400">סה"כ בקשות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slaDashboard.map((s) => (
                    <TableRow key={s.workflow} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-medium">{s.workflow}</TableCell>
                      <TableCell className="font-mono text-slate-400">{s.target}</TableCell>
                      <TableCell className="font-mono text-blue-400">{s.avg}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={s.compliance} className="h-2 w-20" />
                          <span className={`text-sm font-bold ${s.compliance >= 90 ? "text-emerald-400" : s.compliance >= 80 ? "text-amber-400" : "text-red-400"}`}>
                            {s.compliance}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={s.breaches > 2 ? "bg-red-900/60 text-red-300" : s.breaches > 0 ? "bg-amber-900/60 text-amber-300" : "bg-emerald-900/60 text-emerald-300"}>
                          {s.breaches > 0 && <AlertTriangle className="w-3 h-3 inline ml-1" />}
                          {s.breaches}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-slate-300">{s.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* SLA summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Card className="bg-[#12121a] border-[#1e1e2e]">
              <CardContent className="p-4 text-center space-y-2">
                <BarChart3 className="w-6 h-6 text-blue-400 mx-auto" />
                <div className="text-2xl font-bold text-blue-400">4.2 שעות</div>
                <div className="text-xs text-slate-400">ממוצע זמן אישור כולל</div>
              </CardContent>
            </Card>
            <Card className="bg-[#12121a] border-[#1e1e2e]">
              <CardContent className="p-4 text-center space-y-2">
                <AlertTriangle className="w-6 h-6 text-amber-400 mx-auto" />
                <div className="text-2xl font-bold text-amber-400">10</div>
                <div className="text-xs text-slate-400">סה"כ חריגות SLA החודש</div>
              </CardContent>
            </Card>
            <Card className="bg-[#12121a] border-[#1e1e2e]">
              <CardContent className="p-4 text-center space-y-2">
                <History className="w-6 h-6 text-emerald-400 mx-auto" />
                <div className="text-2xl font-bold text-emerald-400">111</div>
                <div className="text-xs text-slate-400">סה"כ בקשות שטופלו החודש</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
