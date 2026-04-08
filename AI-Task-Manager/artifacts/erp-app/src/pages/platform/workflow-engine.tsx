import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  GitBranch, Clock, CheckCircle, XCircle, AlertTriangle, Timer,
  ShieldCheck, DollarSign, FileText, Factory, Truck, Pencil,
  ShoppingCart, Tag, ArrowUpRight, Users, Layers, Zap, Activity
} from "lucide-react";

/* ─── Approval Type Config ─── */
const APPROVAL_TYPES: Record<string, { label: string; color: string; icon: any }> = {
  approval_matrix:        { label: "מטריצת אישורים",   color: "bg-blue-500/15 text-blue-400 border-blue-500/30",     icon: Layers },
  role_based:             { label: "לפי תפקיד",        color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30", icon: Users },
  amount_based:           { label: "לפי סכום",          color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: DollarSign },
  exception:              { label: "חריגה",             color: "bg-red-500/15 text-red-400 border-red-500/30",         icon: AlertTriangle },
  drawing:                { label: "שרטוט",             color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",      icon: Pencil },
  purchase:               { label: "רכש",               color: "bg-amber-500/15 text-amber-400 border-amber-500/30",   icon: ShoppingCart },
  pricing:                { label: "תמחור",             color: "bg-purple-500/15 text-purple-400 border-purple-500/30", icon: Tag },
  release_to_production:  { label: "שחרור לייצור",      color: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: Factory },
  release_to_delivery:    { label: "שחרור לאספקה",      color: "bg-pink-500/15 text-pink-400 border-pink-500/30",      icon: Truck },
};

/* ─── KPI Data ─── */
const kpis = [
  { label: "תהליכים פעילים",   value: 34,    icon: Activity,      color: "text-blue-400",    bg: "from-blue-500/20 to-blue-900/10" },
  { label: "ממתינים לאישור",    value: 18,    icon: Clock,         color: "text-amber-400",   bg: "from-amber-500/20 to-amber-900/10" },
  { label: "אושרו היום",        value: 12,    icon: CheckCircle,   color: "text-green-400",   bg: "from-green-500/20 to-green-900/10" },
  { label: "נדחו",              value: 3,     icon: XCircle,       color: "text-red-400",     bg: "from-red-500/20 to-red-900/10" },
  { label: "זמן אישור ממוצע",   value: "4.2h", icon: Timer,        color: "text-cyan-400",    bg: "from-cyan-500/20 to-cyan-900/10" },
  { label: "חריגות SLA",        value: 5,     icon: AlertTriangle, color: "text-orange-400",  bg: "from-orange-500/20 to-orange-900/10" },
];

/* ─── Pending Approvals ─── */
const pendingApprovals = [
  { id: "WF-1001", type: "purchase",              ref: "PO-2026-0487",   requester: "דנה לוי",    module: "רכש",    amount: 185000, urgency: "critical", days: 3 },
  { id: "WF-1002", type: "pricing",               ref: "PRC-2026-112",   requester: "נועה פרידמן", module: "תמחור",  amount: 42000,  urgency: "high",     days: 2 },
  { id: "WF-1003", type: "drawing",               ref: "DRW-A-4521",     requester: "אורי כהן",   module: "הנדסה",  amount: 0,      urgency: "medium",   days: 1 },
  { id: "WF-1004", type: "release_to_production", ref: "WO-2026-0093",   requester: "יוסי מלכה",  module: "ייצור",  amount: 320000, urgency: "critical", days: 4 },
  { id: "WF-1005", type: "exception",             ref: "EXC-2026-018",   requester: "מירי אביטל", module: "כספים",  amount: 95000,  urgency: "high",     days: 2 },
  { id: "WF-1006", type: "purchase",              ref: "PO-2026-0491",   requester: "אלון גבע",   module: "רכש",    amount: 67000,  urgency: "medium",   days: 1 },
  { id: "WF-1007", type: "release_to_delivery",   ref: "DEL-2026-0215",  requester: "רחל אברהם",  module: "אספקה",  amount: 248000, urgency: "high",     days: 3 },
  { id: "WF-1008", type: "amount_based",          ref: "INV-2026-0782",  requester: "מירי אביטל", module: "כספים",  amount: 520000, urgency: "critical", days: 5 },
  { id: "WF-1009", type: "role_based",            ref: "HR-2026-044",    requester: "שרון דוד",   module: "משאבי אנוש", amount: 18000, urgency: "low",  days: 1 },
  { id: "WF-1010", type: "approval_matrix",       ref: "PRJ-2026-007",   requester: "אורי כהן",   module: "פרויקטים", amount: 1250000, urgency: "critical", days: 6 },
  { id: "WF-1011", type: "drawing",               ref: "DRW-B-1187",     requester: "טל ברק",     module: "הנדסה",  amount: 0,      urgency: "medium",   days: 2 },
  { id: "WF-1012", type: "purchase",              ref: "PO-2026-0499",   requester: "דנה לוי",    module: "רכש",    amount: 142000, urgency: "high",     days: 2 },
];

/* ─── Approval Matrix ─── */
const matrixRules = [
  { action: "הזמנת רכש",           threshold: 50000,   role: "מנהל רכש",       levels: 1, escalation: "48h" },
  { action: "הזמנת רכש",           threshold: 200000,  role: "סמנכ\"ל תפעול",  levels: 2, escalation: "24h" },
  { action: "הזמנת רכש",           threshold: 500000,  role: "מנכ\"ל",          levels: 3, escalation: "12h" },
  { action: "עדכון מחירון",         threshold: 0,       role: "מנהל תמחור",     levels: 1, escalation: "72h" },
  { action: "חריגת תקציב",         threshold: 10000,   role: "מנהל מחלקה",     levels: 1, escalation: "24h" },
  { action: "חריגת תקציב",         threshold: 100000,  role: "סמנכ\"ל כספים",  levels: 2, escalation: "12h" },
  { action: "שחרור לייצור",        threshold: 0,       role: "מהנדס ראשי",     levels: 2, escalation: "24h" },
  { action: "שחרור לאספקה",        threshold: 0,       role: "מנהל לוגיסטיקה", levels: 1, escalation: "48h" },
  { action: "אישור שרטוט",         threshold: 0,       role: "מהנדס ראשי",     levels: 2, escalation: "24h" },
  { action: "הנחה מעל 15%",        threshold: 0,       role: "מנהל מכירות",    levels: 2, escalation: "12h" },
];

/* ─── History Log ─── */
const historyLog = [
  { id: "WF-0991", ref: "PO-2026-0472",   type: "purchase",              approver: "עוזי אלקבץ",  decision: "approved", date: "2026-04-08 09:12", comment: "" },
  { id: "WF-0990", ref: "DRW-A-4498",     type: "drawing",               approver: "אורי כהן",    decision: "approved", date: "2026-04-08 08:45", comment: "תיקון קל בקוטר" },
  { id: "WF-0989", ref: "PRC-2026-108",   type: "pricing",               approver: "נועה פרידמן", decision: "rejected", date: "2026-04-07 17:30", comment: "מרווח נמוך מדי" },
  { id: "WF-0988", ref: "WO-2026-0088",   type: "release_to_production", approver: "יוסי מלכה",  decision: "approved", date: "2026-04-07 16:20", comment: "" },
  { id: "WF-0987", ref: "EXC-2026-015",   type: "exception",             approver: "מירי אביטל", decision: "approved", date: "2026-04-07 15:05", comment: "אושר עם תנאי" },
  { id: "WF-0986", ref: "DEL-2026-0198",  type: "release_to_delivery",   approver: "רחל אברהם",  decision: "approved", date: "2026-04-07 14:40", comment: "" },
  { id: "WF-0985", ref: "PO-2026-0465",   type: "purchase",              approver: "דנה לוי",    decision: "rejected", date: "2026-04-07 13:10", comment: "ספק לא מאושר" },
  { id: "WF-0984", ref: "INV-2026-0760",  type: "amount_based",          approver: "עוזי אלקבץ",  decision: "approved", date: "2026-04-07 11:50", comment: "" },
  { id: "WF-0983", ref: "PRJ-2026-005",   type: "approval_matrix",       approver: "עוזי אלקבץ",  decision: "approved", date: "2026-04-07 10:30", comment: "אישור סופי" },
  { id: "WF-0982", ref: "HR-2026-039",    type: "role_based",            approver: "שרון דוד",   decision: "approved", date: "2026-04-06 16:45", comment: "" },
];

/* ─── Workflow Definitions ─── */
const workflowDefs = [
  { name: "אישור הזמנת רכש",       steps: 3, modules: ["רכש", "כספים"],            status: "active" },
  { name: "שחרור לייצור",          steps: 4, modules: ["הנדסה", "ייצור", "איכות"],  status: "active" },
  { name: "שחרור לאספקה",          steps: 2, modules: ["ייצור", "לוגיסטיקה"],       status: "active" },
  { name: "אישור שרטוט טכני",      steps: 3, modules: ["הנדסה", "מכירות"],          status: "active" },
  { name: "אישור תמחור והנחות",    steps: 2, modules: ["תמחור", "מכירות", "כספים"], status: "active" },
  { name: "אישור חריגת תקציב",     steps: 3, modules: ["כספים", "הנהלה"],           status: "active" },
  { name: "אישור העסקת עובד",      steps: 2, modules: ["משאבי אנוש", "כספים"],     status: "active" },
  { name: "אישור שינוי הנדסי (ECO)", steps: 5, modules: ["הנדסה", "ייצור", "איכות", "רכש"], status: "draft" },
  { name: "אישור ספק חדש",         steps: 3, modules: ["רכש", "כספים", "איכות"],    status: "active" },
  { name: "אישור זיכוי לקוח",      steps: 2, modules: ["שירות", "כספים"],           status: "draft" },
];

/* ─── Helpers ─── */
const fmt = (n: number) => n === 0 ? "-" : "₪" + n.toLocaleString("he-IL");

const urgencyBadge = (u: string) => {
  const m: Record<string, { label: string; cls: string }> = {
    critical: { label: "קריטי",  cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    high:     { label: "גבוה",   cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
    medium:   { label: "בינוני", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    low:      { label: "נמוך",   cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
  };
  const c = m[u] || m.medium;
  return <Badge variant="outline" className={`text-[11px] ${c.cls}`}>{c.label}</Badge>;
};

const decisionBadge = (d: string) => {
  if (d === "approved") return <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/30 text-[11px]">אושר</Badge>;
  return <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30 text-[11px]">נדחה</Badge>;
};

const statusBadge = (s: string) => {
  if (s === "active") return <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/30 text-[11px]">פעיל</Badge>;
  return <Badge variant="outline" className="bg-gray-500/15 text-gray-400 border-gray-500/30 text-[11px]">טיוטה</Badge>;
};

/* ─── Component ─── */
export default function WorkflowEngine() {
  const [tab, setTab] = useState("pending");

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] text-gray-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30">
          <GitBranch className="h-6 w-6 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-l from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            מנוע Workflow ואישורים
          </h1>
          <p className="text-sm text-gray-500">טכנו-כל עוזי — ניהול תהליכי אישור מרכזי</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-gradient-to-br border-white/5 backdrop-blur-sm" style={{ backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))` }}>
            <CardContent className={`p-4 bg-gradient-to-br ${k.bg} rounded-lg`}>
              <div className="flex items-center justify-between mb-2">
                <k.icon className={`h-5 w-5 ${k.color}`} />
                <span className="text-[11px] text-gray-500">{k.label}</span>
              </div>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="pending" className="data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-300">
            ממתינים ({pendingApprovals.length})
          </TabsTrigger>
          <TabsTrigger value="matrix" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">
            מטריצה
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300">
            היסטוריה
          </TabsTrigger>
          <TabsTrigger value="definitions" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300">
            תהליכים
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Pending ── */}
        <TabsContent value="pending">
          <Card className="bg-white/[0.02] border-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-gray-200 flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-400" />
                אישורים ממתינים — כל המודולים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-gray-400 text-right">מזהה</TableHead>
                    <TableHead className="text-gray-400 text-right">סוג</TableHead>
                    <TableHead className="text-gray-400 text-right">הפניה</TableHead>
                    <TableHead className="text-gray-400 text-right">מבקש</TableHead>
                    <TableHead className="text-gray-400 text-right">מודול</TableHead>
                    <TableHead className="text-gray-400 text-right">סכום</TableHead>
                    <TableHead className="text-gray-400 text-right">דחיפות</TableHead>
                    <TableHead className="text-gray-400 text-right">ימים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingApprovals.map((a) => {
                    const t = APPROVAL_TYPES[a.type];
                    return (
                      <TableRow key={a.id} className="border-white/5 hover:bg-white/[0.03]">
                        <TableCell className="font-mono text-xs text-gray-400">{a.id}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[11px] ${t.color} flex items-center gap-1 w-fit`}>
                            <t.icon className="h-3 w-3" />
                            {t.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-blue-400">{a.ref}</TableCell>
                        <TableCell className="text-sm">{a.requester}</TableCell>
                        <TableCell className="text-sm text-gray-400">{a.module}</TableCell>
                        <TableCell className="font-mono text-sm">{fmt(a.amount)}</TableCell>
                        <TableCell>{urgencyBadge(a.urgency)}</TableCell>
                        <TableCell>
                          <span className={`font-mono text-sm ${a.days >= 4 ? "text-red-400" : a.days >= 2 ? "text-orange-400" : "text-gray-400"}`}>
                            {a.days}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Matrix ── */}
        <TabsContent value="matrix">
          <Card className="bg-white/[0.02] border-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-gray-200 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-400" />
                מטריצת אישורים — סף וסמכות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-gray-400 text-right">פעולה</TableHead>
                    <TableHead className="text-gray-400 text-right">סף ₪</TableHead>
                    <TableHead className="text-gray-400 text-right">תפקיד נדרש</TableHead>
                    <TableHead className="text-gray-400 text-right">רמות</TableHead>
                    <TableHead className="text-gray-400 text-right">אסקלציה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrixRules.map((r, i) => (
                    <TableRow key={i} className="border-white/5 hover:bg-white/[0.03]">
                      <TableCell className="text-sm font-medium">{r.action}</TableCell>
                      <TableCell className="font-mono text-sm text-emerald-400">{r.threshold > 0 ? fmt(r.threshold) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-indigo-500/15 text-indigo-400 border-indigo-500/30 text-[11px]">{r.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {Array.from({ length: r.levels }).map((_, li) => (
                            <div key={li} className="w-3 h-3 rounded-full bg-blue-500/40 border border-blue-400/50" />
                          ))}
                          {Array.from({ length: 3 - r.levels }).map((_, li) => (
                            <div key={li} className="w-3 h-3 rounded-full bg-white/5 border border-white/10" />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-orange-400 font-mono">{r.escalation}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: History ── */}
        <TabsContent value="history">
          <Card className="bg-white/[0.02] border-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-gray-200 flex items-center gap-2">
                <FileText className="h-5 w-5 text-green-400" />
                היסטוריית אישורים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-gray-400 text-right">מזהה</TableHead>
                    <TableHead className="text-gray-400 text-right">הפניה</TableHead>
                    <TableHead className="text-gray-400 text-right">סוג</TableHead>
                    <TableHead className="text-gray-400 text-right">מאשר</TableHead>
                    <TableHead className="text-gray-400 text-right">החלטה</TableHead>
                    <TableHead className="text-gray-400 text-right">תאריך</TableHead>
                    <TableHead className="text-gray-400 text-right">הערה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyLog.map((h) => {
                    const t = APPROVAL_TYPES[h.type];
                    return (
                      <TableRow key={h.id} className="border-white/5 hover:bg-white/[0.03]">
                        <TableCell className="font-mono text-xs text-gray-400">{h.id}</TableCell>
                        <TableCell className="font-mono text-xs text-blue-400">{h.ref}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[11px] ${t.color}`}>{t.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{h.approver}</TableCell>
                        <TableCell>{decisionBadge(h.decision)}</TableCell>
                        <TableCell className="font-mono text-xs text-gray-500">{h.date}</TableCell>
                        <TableCell className="text-xs text-gray-500 max-w-[200px] truncate">{h.comment || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Definitions ── */}
        <TabsContent value="definitions">
          <Card className="bg-white/[0.02] border-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-gray-200 flex items-center gap-2">
                <Zap className="h-5 w-5 text-cyan-400" />
                הגדרות תהליכים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-gray-400 text-right">שם תהליך</TableHead>
                    <TableHead className="text-gray-400 text-right">שלבים</TableHead>
                    <TableHead className="text-gray-400 text-right">מודולים</TableHead>
                    <TableHead className="text-gray-400 text-right">סטטוס</TableHead>
                    <TableHead className="text-gray-400 text-right">התקדמות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workflowDefs.map((w, i) => (
                    <TableRow key={i} className="border-white/5 hover:bg-white/[0.03]">
                      <TableCell className="text-sm font-medium">{w.name}</TableCell>
                      <TableCell>
                        <span className="font-mono text-sm text-cyan-400">{w.steps}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {w.modules.map((m) => (
                            <Badge key={m} variant="outline" className="bg-white/5 text-gray-300 border-white/10 text-[10px]">{m}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{statusBadge(w.status)}</TableCell>
                      <TableCell className="w-32">
                        <Progress value={w.status === "active" ? 100 : 40} className="h-1.5 bg-white/5" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
