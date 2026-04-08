import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Lock, Users, ShieldAlert, FileText, CalendarCheck, DollarSign,
  Eye, Edit2, Trash2, CheckCircle, XCircle, AlertTriangle, Clock,
} from "lucide-react";

/* ── submodules (10): field_permissions, row_permissions, approval_audit_trail,
   document_access_logs, stock_change_logs, price_change_logs, cost_override_logs,
   sensitive_action_approvals, deletion_controls, period_locking ── */

const FALLBACK_KPIS = [
  { label: "משתמשים פעילים", value: "34", icon: Users, color: "text-blue-400" },
  { label: "פעולות רגישות היום", value: "12", icon: ShieldAlert, color: "text-red-400" },
  { label: "אירועי ביקורת השבוע", value: "847", icon: FileText, color: "text-emerald-400" },
  { label: "תקופות נעולות", value: "6", icon: CalendarCheck, color: "text-amber-400" },
  { label: "שינויי הרשאות", value: "9", icon: Lock, color: "text-purple-400" },
  { label: "ניסיונות כניסה כושלים", value: "3", icon: AlertTriangle, color: "text-orange-400" },
];

const FALLBACK_AUDIT_TRAIL = [
  { ts: "2026-04-08 09:12", user: "עוזי כהן", action: "עדכון מחיר", module: "מוצרים", entity: "ברגים M8", oldVal: "₪12.50", newVal: "₪14.00", ip: "192.168.1.10" },
  { ts: "2026-04-08 08:45", user: "רונית לוי", action: "מחיקת רשומה", module: "ספקים", entity: "ספק מתכת בע\"מ", oldVal: "פעיל", newVal: "נמחק", ip: "192.168.1.22" },
  { ts: "2026-04-08 08:30", user: "יוסי אברהם", action: "שינוי הרשאה", module: "הרשאות", entity: "תפקיד מחסנאי", oldVal: "קריאה", newVal: "קריאה+כתיבה", ip: "192.168.1.15" },
  { ts: "2026-04-07 17:10", user: "דנה שמיר", action: "אישור הזמנה", module: "רכש", entity: "PO-2026-0412", oldVal: "ממתין", newVal: "מאושר", ip: "192.168.1.31" },
  { ts: "2026-04-07 16:55", user: "עוזי כהן", action: "נעילת תקופה", module: "כספים", entity: "מרץ 2026", oldVal: "פתוח", newVal: "נעול", ip: "192.168.1.10" },
  { ts: "2026-04-07 15:20", user: "מיכל דוד", action: "ייצוא דוח", module: "דוחות", entity: "דוח רווח והפסד", oldVal: "—", newVal: "PDF", ip: "192.168.1.44" },
  { ts: "2026-04-07 14:00", user: "אבי גולן", action: "עדכון מלאי", module: "מלאי", entity: "אום M10x50", oldVal: "1,200", newVal: "1,350", ip: "192.168.1.18" },
  { ts: "2026-04-07 11:30", user: "רונית לוי", action: "שינוי עלות", module: "תמחיר", entity: "פלטת אלומיניום", oldVal: "₪85.00", newVal: "₪92.00", ip: "192.168.1.22" },
];

const roles = ["מנהל מערכת", "מנהל ייצור", "מנהל רכש", "מחסנאי", "חשב", "מנהל מכירות", "עובד ייצור", "צופה"];
const modules = ["מוצרים", "מלאי", "רכש", "מכירות", "כספים", "ייצור", "דוחות", "הרשאות"];
const permMatrix: Record<string, Record<string, string>> = {
  "מנהל מערכת":  { "מוצרים": "rwd", "מלאי": "rwd", "רכש": "rwd", "מכירות": "rwd", "כספים": "rwd", "ייצור": "rwd", "דוחות": "rwd", "הרשאות": "rwd" },
  "מנהל ייצור":  { "מוצרים": "rw", "מלאי": "rw", "רכש": "r", "מכירות": "r", "כספים": "r", "ייצור": "rwd", "דוחות": "rw", "הרשאות": "-" },
  "מנהל רכש":    { "מוצרים": "rw", "מלאי": "rw", "רכש": "rwd", "מכירות": "r", "כספים": "r", "ייצור": "r", "דוחות": "rw", "הרשאות": "-" },
  "מחסנאי":      { "מוצרים": "r", "מלאי": "rw", "רכש": "r", "מכירות": "-", "כספים": "-", "ייצור": "r", "דוחות": "r", "הרשאות": "-" },
  "חשב":         { "מוצרים": "r", "מלאי": "r", "רכש": "rw", "מכירות": "r", "כספים": "rwd", "ייצור": "r", "דוחות": "rwd", "הרשאות": "-" },
  "מנהל מכירות": { "מוצרים": "rw", "מלאי": "r", "רכש": "-", "מכירות": "rwd", "כספים": "r", "ייצור": "-", "דוחות": "rw", "הרשאות": "-" },
  "עובד ייצור":  { "מוצרים": "r", "מלאי": "r", "רכש": "-", "מכירות": "-", "כספים": "-", "ייצור": "rw", "דוחות": "-", "הרשאות": "-" },
  "צופה":        { "מוצרים": "r", "מלאי": "r", "רכש": "r", "מכירות": "r", "כספים": "r", "ייצור": "r", "דוחות": "r", "הרשאות": "-" },
};

const FALLBACK_SENSITIVE_ACTIONS = [
  { id: 1, action: "מחיקת ספק", user: "רונית לוי", ts: "2026-04-08 08:45", status: "approved", approver: "עוזי כהן", module: "ספקים", risk: "high" },
  { id: 2, action: "שינוי תנאי תשלום", user: "דנה שמיר", ts: "2026-04-08 07:30", status: "pending", approver: "—", module: "רכש", risk: "medium" },
  { id: 3, action: "עדכון שער מט\"ח", user: "מיכל דוד", ts: "2026-04-07 16:00", status: "approved", approver: "עוזי כהן", module: "כספים", risk: "high" },
  { id: 4, action: "ביטול חשבונית", user: "אבי גולן", ts: "2026-04-07 14:20", status: "rejected", approver: "מיכל דוד", module: "כספים", risk: "high" },
  { id: 5, action: "שינוי הרשאת מנהל", user: "יוסי אברהם", ts: "2026-04-07 12:10", status: "approved", approver: "עוזי כהן", module: "הרשאות", risk: "critical" },
  { id: 6, action: "מחיקת הזמנת רכש", user: "דנה שמיר", ts: "2026-04-07 10:50", status: "approved", approver: "עוזי כהן", module: "רכש", risk: "medium" },
  { id: 7, action: "איפוס סיסמה", user: "עוזי כהן", ts: "2026-04-06 18:00", status: "approved", approver: "מערכת", module: "אבטחה", risk: "medium" },
  { id: 8, action: "ייצוא נתוני לקוחות", user: "מיכל דוד", ts: "2026-04-06 15:30", status: "pending", approver: "—", module: "מכירות", risk: "high" },
];

const FALLBACK_PERIOD_LOCKING = [
  { month: "ינואר 2026", status: "locked", lockedBy: "עוזי כהן", date: "2026-02-05" },
  { month: "פברואר 2026", status: "locked", lockedBy: "עוזי כהן", date: "2026-03-04" },
  { month: "מרץ 2026", status: "locked", lockedBy: "עוזי כהן", date: "2026-04-07" },
  { month: "אפריל 2026", status: "open", lockedBy: "—", date: "—" },
  { month: "מאי 2026", status: "open", lockedBy: "—", date: "—" },
  { month: "יוני 2026", status: "open", lockedBy: "—", date: "—" },
  { month: "Q1 2026", status: "locked", lockedBy: "מיכל דוד", date: "2026-04-07" },
  { month: "Q2 2026", status: "open", lockedBy: "—", date: "—" },
];

const FALLBACK_PRICE_CHANGES = [
  { item: "ברגים M8", oldPrice: "₪12.50", newPrice: "₪14.00", changedBy: "עוזי כהן", reason: "עליית מחיר חומר גלם", ts: "2026-04-08 09:12" },
  { item: "אומים M10", oldPrice: "₪3.20", newPrice: "₪3.80", changedBy: "דנה שמיר", reason: "עדכון ספק", ts: "2026-04-07 14:30" },
  { item: "פלטת אלומיניום 3מ\"מ", oldPrice: "₪85.00", newPrice: "₪92.00", changedBy: "רונית לוי", reason: "שינוי עלות ייצור", ts: "2026-04-07 11:30" },
  { item: "צינור פלדה 2\"", oldPrice: "₪45.00", newPrice: "₪42.00", changedBy: "עוזי כהן", reason: "הנחת כמות מספק", ts: "2026-04-06 16:20" },
  { item: "לוח חשמל תעשייתי", oldPrice: "₪320.00", newPrice: "₪355.00", changedBy: "אבי גולן", reason: "עליית מחירי רכיבים", ts: "2026-04-06 10:00" },
  { item: "שמן חיתוך 20L", oldPrice: "₪180.00", newPrice: "₪195.00", changedBy: "דנה שמיר", reason: "עדכון מחירון ספק", ts: "2026-04-05 13:45" },
  { item: "כפפות עבודה (100)", oldPrice: "₪65.00", newPrice: "₪58.00", changedBy: "יוסי אברהם", reason: "ספק חלופי זול", ts: "2026-04-05 09:15" },
  { item: "ברגים M12", oldPrice: "₪18.00", newPrice: "₪20.50", changedBy: "עוזי כהן", reason: "התאמה למחירון 2026", ts: "2026-04-04 11:00" },
];

function PermIcon({ perm }: { perm: string }) {
  if (perm === "-") return <XCircle className="h-3.5 w-3.5 text-zinc-600" />;
  return (
    <span className="flex gap-1 justify-center">
      {perm.includes("r") && <Eye className="h-3.5 w-3.5 text-blue-400" />}
      {perm.includes("w") && <Edit2 className="h-3.5 w-3.5 text-amber-400" />}
      {perm.includes("d") && <Trash2 className="h-3.5 w-3.5 text-red-400" />}
    </span>
  );
}

const riskColors: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/30",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  medium: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  low: "bg-green-500/20 text-green-300 border-green-500/30",
};
const riskLabels: Record<string, string> = { critical: "קריטי", high: "גבוה", medium: "בינוני", low: "נמוך" };

const statusCfg: Record<string, { label: string; cls: string; icon: typeof CheckCircle }> = {
  approved: { label: "אושר", cls: "bg-green-500/20 text-green-300", icon: CheckCircle },
  pending:  { label: "ממתין", cls: "bg-amber-500/20 text-amber-300", icon: Clock },
  rejected: { label: "נדחה", cls: "bg-red-500/20 text-red-300", icon: XCircle },
};

export default function SecurityAudit() {
  const { data: securityauditData } = useQuery({
    queryKey: ["security-audit"],
    queryFn: () => authFetch("/api/platform/security_audit"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = securityauditData ?? FALLBACK_KPIS;

  const [tab, setTab] = useState("audit");

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] text-zinc-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/20">
          <Lock className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-l from-red-300 to-orange-300 bg-clip-text text-transparent">
            אבטחה, הרשאות וביקורת
          </h1>
          <p className="text-sm text-zinc-500">טכנו-כל עוזי &mdash; ניטור אבטחה, הרשאות, ושינויים</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-[#111118] border-zinc-800/60">
            <CardContent className="p-4 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">{k.label}</span>
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <span className="text-xl font-bold text-zinc-100">{k.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-[#111118] border border-zinc-800/60 gap-1 flex-wrap">
          <TabsTrigger value="audit" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-300">יומן ביקורת</TabsTrigger>
          <TabsTrigger value="perms" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300">הרשאות</TabsTrigger>
          <TabsTrigger value="sensitive" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-300">פעולות רגישות</TabsTrigger>
          <TabsTrigger value="periods" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300">נעילת תקופות</TabsTrigger>
          <TabsTrigger value="prices" className="data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300">שינויי מחיר</TabsTrigger>
        </TabsList>

        {/* ── Audit Trail ── */}
        <TabsContent value="audit">
          <Card className="bg-[#111118] border-zinc-800/60">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800/60 hover:bg-transparent">
                    <TableHead className="text-zinc-400 text-right">זמן</TableHead>
                    <TableHead className="text-zinc-400 text-right">משתמש</TableHead>
                    <TableHead className="text-zinc-400 text-right">פעולה</TableHead>
                    <TableHead className="text-zinc-400 text-right">מודול</TableHead>
                    <TableHead className="text-zinc-400 text-right">ישות</TableHead>
                    <TableHead className="text-zinc-400 text-right">ערך ישן</TableHead>
                    <TableHead className="text-zinc-400 text-right">ערך חדש</TableHead>
                    <TableHead className="text-zinc-400 text-right">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditTrail.map((r, i) => (
                    <TableRow key={i} className="border-zinc-800/40 hover:bg-zinc-800/20">
                      <TableCell className="text-xs text-zinc-400 font-mono">{r.ts}</TableCell>
                      <TableCell className="text-sm text-zinc-200">{r.user}</TableCell>
                      <TableCell><Badge variant="outline" className="bg-zinc-800/40 text-zinc-300 border-zinc-700">{r.action}</Badge></TableCell>
                      <TableCell className="text-sm text-zinc-400">{r.module}</TableCell>
                      <TableCell className="text-sm text-zinc-200">{r.entity}</TableCell>
                      <TableCell className="text-xs text-red-400 font-mono">{r.oldVal}</TableCell>
                      <TableCell className="text-xs text-green-400 font-mono">{r.newVal}</TableCell>
                      <TableCell className="text-xs text-zinc-500 font-mono">{r.ip}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Permissions Matrix ── */}
        <TabsContent value="perms">
          <Card className="bg-[#111118] border-zinc-800/60">
            <CardContent className="p-0 overflow-x-auto">
              <div className="flex items-center gap-4 p-4 border-b border-zinc-800/40 text-xs text-zinc-500">
                <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5 text-blue-400" /> קריאה</span>
                <span className="flex items-center gap-1"><Edit2 className="h-3.5 w-3.5 text-amber-400" /> כתיבה</span>
                <span className="flex items-center gap-1"><Trash2 className="h-3.5 w-3.5 text-red-400" /> מחיקה</span>
                <span className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5 text-zinc-600" /> ללא גישה</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800/60 hover:bg-transparent">
                    <TableHead className="text-zinc-400 text-right sticky right-0 bg-[#111118] z-10">תפקיד</TableHead>
                    {modules.map((m) => <TableHead key={m} className="text-zinc-400 text-center">{m}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => (
                    <TableRow key={role} className="border-zinc-800/40 hover:bg-zinc-800/20">
                      <TableCell className="text-sm text-zinc-200 font-medium sticky right-0 bg-[#111118] z-10">{role}</TableCell>
                      {modules.map((mod) => (
                        <TableCell key={mod} className="text-center">
                          <PermIcon perm={permMatrix[role]?.[mod] || "-"} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Sensitive Actions ── */}
        <TabsContent value="sensitive">
          <Card className="bg-[#111118] border-zinc-800/60">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800/60 hover:bg-transparent">
                    <TableHead className="text-zinc-400 text-right">פעולה</TableHead>
                    <TableHead className="text-zinc-400 text-right">מבצע</TableHead>
                    <TableHead className="text-zinc-400 text-right">מודול</TableHead>
                    <TableHead className="text-zinc-400 text-right">זמן</TableHead>
                    <TableHead className="text-zinc-400 text-center">סיכון</TableHead>
                    <TableHead className="text-zinc-400 text-center">סטטוס</TableHead>
                    <TableHead className="text-zinc-400 text-right">מאשר</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sensitiveActions.map((s) => {
                    const st = statusCfg[s.status] || statusCfg.pending;
                    const StIcon = st.icon;
                    return (
                      <TableRow key={s.id} className="border-zinc-800/40 hover:bg-zinc-800/20">
                        <TableCell className="text-sm text-zinc-200 font-medium">{s.action}</TableCell>
                        <TableCell className="text-sm text-zinc-300">{s.user}</TableCell>
                        <TableCell className="text-sm text-zinc-400">{s.module}</TableCell>
                        <TableCell className="text-xs text-zinc-400 font-mono">{s.ts}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`${riskColors[s.risk]} text-xs`}>{riskLabels[s.risk]}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`${st.cls} text-xs gap-1`}>
                            <StIcon className="h-3 w-3" />{st.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-zinc-400">{s.approver}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Period Locking ── */}
        <TabsContent value="periods">
          <Card className="bg-[#111118] border-zinc-800/60">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800/60 hover:bg-transparent">
                    <TableHead className="text-zinc-400 text-right">תקופה</TableHead>
                    <TableHead className="text-zinc-400 text-center">סטטוס</TableHead>
                    <TableHead className="text-zinc-400 text-center">התקדמות</TableHead>
                    <TableHead className="text-zinc-400 text-right">ננעל ע\"י</TableHead>
                    <TableHead className="text-zinc-400 text-right">תאריך נעילה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periodLocking.map((p, i) => {
                    const locked = p.status === "locked";
                    return (
                      <TableRow key={i} className="border-zinc-800/40 hover:bg-zinc-800/20">
                        <TableCell className="text-sm text-zinc-200 font-medium">{p.month}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={locked ? "bg-green-500/20 text-green-300 border-green-500/30" : "bg-zinc-700/30 text-zinc-400 border-zinc-600"}>
                            {locked ? <Lock className="h-3 w-3 ml-1" /> : <CalendarCheck className="h-3 w-3 ml-1" />}
                            {locked ? "נעול" : "פתוח"}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4">
                          <Progress value={locked ? 100 : 0} className="h-2 bg-zinc-800" />
                        </TableCell>
                        <TableCell className="text-sm text-zinc-400">{p.lockedBy}</TableCell>
                        <TableCell className="text-xs text-zinc-500 font-mono">{p.date}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Price Changes ── */}
        <TabsContent value="prices">
          <Card className="bg-[#111118] border-zinc-800/60">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800/60 hover:bg-transparent">
                    <TableHead className="text-zinc-400 text-right">פריט</TableHead>
                    <TableHead className="text-zinc-400 text-right">מחיר ישן</TableHead>
                    <TableHead className="text-zinc-400 text-right">מחיר חדש</TableHead>
                    <TableHead className="text-zinc-400 text-center">שינוי</TableHead>
                    <TableHead className="text-zinc-400 text-right">שונה ע\"י</TableHead>
                    <TableHead className="text-zinc-400 text-right">סיבה</TableHead>
                    <TableHead className="text-zinc-400 text-right">תאריך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceChanges.map((p, i) => {
                    const oldN = parseFloat(p.oldPrice.replace(/[^\d.]/g, ""));
                    const newN = parseFloat(p.newPrice.replace(/[^\d.]/g, ""));
                    const pct = ((newN - oldN) / oldN * 100).toFixed(1);
                    const up = newN > oldN;
                    return (
                      <TableRow key={i} className="border-zinc-800/40 hover:bg-zinc-800/20">
                        <TableCell className="text-sm text-zinc-200 font-medium">{p.item}</TableCell>
                        <TableCell className="text-sm text-red-400 font-mono">{p.oldPrice}</TableCell>
                        <TableCell className="text-sm text-green-400 font-mono">{p.newPrice}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={up ? "bg-red-500/15 text-red-300 border-red-500/30" : "bg-green-500/15 text-green-300 border-green-500/30"}>
                            {up ? "+" : ""}{pct}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-zinc-400">{p.changedBy}</TableCell>
                        <TableCell className="text-sm text-zinc-400 max-w-[180px] truncate">{p.reason}</TableCell>
                        <TableCell className="text-xs text-zinc-500 font-mono">{p.ts}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
