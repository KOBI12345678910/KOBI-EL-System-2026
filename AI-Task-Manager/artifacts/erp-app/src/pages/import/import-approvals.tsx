import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckSquare, FileText, DollarSign, ShieldAlert, AlertTriangle,
  Unlock, Clock, CheckCircle2, XCircle, User, ArrowUpDown
} from "lucide-react";

// ── Approval types ───────────────────────────────────────────────────
const approvalTypes = [
  { key: "import_order", label: "הזמנות יבוא", icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10", pending: 3 },
  { key: "foreign_payment", label: "תשלומים לחו\"ל", icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10", pending: 2 },
  { key: "customs_cost", label: "עלויות מכס", icon: ShieldAlert, color: "text-amber-400", bg: "bg-amber-500/10", pending: 2 },
  { key: "exceptional_charge", label: "חיובים חריגים", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10", pending: 1 },
  { key: "release", label: "שחרור סחורה", icon: Unlock, color: "text-purple-400", bg: "bg-purple-500/10", pending: 2 },
];

// ── Pending approvals ────────────────────────────────────────────────
const pendingApprovals = [
  { id: "APR-1001", type: "הזמנות יבוא", ref: "PO-5501", amount: "$48,200", requester: "דני כהן", urgency: "גבוהה", status: "pending", date: "2026-04-06" },
  { id: "APR-1002", type: "תשלומים לחו\"ל", ref: "PAY-7720", amount: "$32,500", requester: "מירב לוי", urgency: "בינונית", status: "pending", date: "2026-04-07" },
  { id: "APR-1003", type: "עלויות מכס", ref: "CUS-3301", amount: "₪82,000", requester: "אבי ישראלי", urgency: "גבוהה", status: "pending", date: "2026-04-07" },
  { id: "APR-1004", type: "חיובים חריגים", ref: "EXC-440", amount: "₪14,500", requester: "רותי בר", urgency: "נמוכה", status: "pending", date: "2026-04-05" },
  { id: "APR-1005", type: "הזמנות יבוא", ref: "PO-5502", amount: "$91,800", requester: "דני כהן", urgency: "קריטית", status: "pending", date: "2026-04-08" },
  { id: "APR-1006", type: "שחרור סחורה", ref: "REL-880", amount: "₪340,000", requester: "שמעון דוד", urgency: "גבוהה", status: "pending", date: "2026-04-08" },
  { id: "APR-1007", type: "תשלומים לחו\"ל", ref: "PAY-7721", amount: "$27,000", requester: "מירב לוי", urgency: "בינונית", status: "pending", date: "2026-04-06" },
  { id: "APR-1008", type: "עלויות מכס", ref: "CUS-3302", amount: "₪56,000", requester: "אבי ישראלי", urgency: "גבוהה", status: "pending", date: "2026-04-07" },
  { id: "APR-1009", type: "הזמנות יבוא", ref: "PO-5503", amount: "$22,400", requester: "יוסי חדד", urgency: "נמוכה", status: "pending", date: "2026-04-04" },
  { id: "APR-1010", type: "שחרור סחורה", ref: "REL-881", amount: "₪195,000", requester: "שמעון דוד", urgency: "קריטית", status: "pending", date: "2026-04-08" },
];

const approvedItems = [
  { id: "APR-0991", type: "הזמנות יבוא", ref: "PO-5498", amount: "$65,000", requester: "דני כהן", urgency: "גבוהה", status: "approved", date: "2026-04-03", approvedBy: "עוזי אל" },
  { id: "APR-0992", type: "תשלומים לחו\"ל", ref: "PAY-7715", amount: "$41,200", requester: "מירב לוי", urgency: "בינונית", status: "approved", date: "2026-04-02", approvedBy: "עוזי אל" },
  { id: "APR-0993", type: "עלויות מכס", ref: "CUS-3298", amount: "₪73,000", requester: "אבי ישראלי", urgency: "גבוהה", status: "approved", date: "2026-04-01", approvedBy: "רונן שפירא" },
  { id: "APR-0994", type: "שחרור סחורה", ref: "REL-876", amount: "₪280,000", requester: "שמעון דוד", urgency: "קריטית", status: "approved", date: "2026-04-01", approvedBy: "עוזי אל" },
  { id: "APR-0995", type: "הזמנות יבוא", ref: "PO-5497", amount: "$33,700", requester: "יוסי חדד", urgency: "נמוכה", status: "approved", date: "2026-03-30", approvedBy: "רונן שפירא" },
];

const rejectedItems = [
  { id: "APR-0988", type: "חיובים חריגים", ref: "EXC-435", amount: "₪28,000", requester: "רותי בר", urgency: "בינונית", status: "rejected", date: "2026-03-28", reason: "חריגה מתקציב — דרוש אישור מנכ\"ל" },
  { id: "APR-0989", type: "תשלומים לחו\"ל", ref: "PAY-7710", amount: "$18,500", requester: "מירב לוי", urgency: "נמוכה", status: "rejected", date: "2026-03-29", reason: "מסמכים חסרים — חשבונית ספק לא צורפה" },
  { id: "APR-0990", type: "הזמנות יבוא", ref: "PO-5495", amount: "$120,000", requester: "דני כהן", urgency: "גבוהה", status: "rejected", date: "2026-03-27", reason: "ספק לא עמד בתנאי אשראי" },
];

const urgencyBadge = (u: string) => {
  const map: Record<string, string> = {
    "קריטית": "bg-red-500/20 text-red-300 border-red-500/30",
    "גבוהה": "bg-orange-500/20 text-orange-300 border-orange-500/30",
    "בינונית": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    "נמוכה": "bg-slate-500/20 text-slate-300 border-slate-500/30",
  };
  return map[u] || map["נמוכה"];
};

const statusBadge = (s: string) => {
  const map: Record<string, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
    pending: { cls: "bg-amber-500/20 text-amber-300 border-amber-500/30", label: "ממתין", Icon: Clock },
    approved: { cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", label: "מאושר", Icon: CheckCircle2 },
    rejected: { cls: "bg-red-500/20 text-red-300 border-red-500/30", label: "נדחה", Icon: XCircle },
  };
  return map[s] || map.pending;
};

export default function ImportApprovals() {
  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-500/10">
          <CheckSquare className="h-6 w-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">אישורי יבוא</h1>
          <p className="text-slate-400 text-sm">טכנו-כל עוזי — ניהול אישורים והרשאות יבוא</p>
        </div>
        <Badge className="mr-auto bg-amber-500/20 text-amber-300 border-amber-500/30">
          10 ממתינים לאישור
        </Badge>
      </div>

      {/* ── Approval type cards ────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {approvalTypes.map((t) => (
          <Card key={t.key} className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${t.bg}`}>
                <t.icon className={`h-5 w-5 ${t.color}`} />
              </div>
              <div>
                <p className="text-xs text-slate-400">{t.label}</p>
                <p className="text-lg font-bold text-white">{t.pending}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="bg-slate-800/50 border border-slate-700">
          <TabsTrigger value="pending" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300">
            <Clock className="h-4 w-4 ml-1" /> ממתינים ({pendingApprovals.length})
          </TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 ml-1" /> מאושרים ({approvedItems.length})
          </TabsTrigger>
          <TabsTrigger value="rejected" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-300">
            <XCircle className="h-4 w-4 ml-1" /> נדחו ({rejectedItems.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Pending ──────────────────────────────────────────── */}
        <TabsContent value="pending">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-amber-400" /> בקשות ממתינות לאישור
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">מזהה</TableHead>
                    <TableHead className="text-slate-400 text-right">סוג</TableHead>
                    <TableHead className="text-slate-400 text-right">אסמכתא</TableHead>
                    <TableHead className="text-slate-400 text-right">סכום</TableHead>
                    <TableHead className="text-slate-400 text-right">מבקש</TableHead>
                    <TableHead className="text-slate-400 text-right">דחיפות</TableHead>
                    <TableHead className="text-slate-400 text-right">תאריך</TableHead>
                    <TableHead className="text-slate-400 text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingApprovals.map((row) => {
                    const sb = statusBadge(row.status);
                    return (
                      <TableRow key={row.id} className="border-slate-700/50 hover:bg-slate-700/30">
                        <TableCell className="text-slate-300 font-mono text-sm">{row.id}</TableCell>
                        <TableCell className="text-slate-300">{row.type}</TableCell>
                        <TableCell className="text-blue-400 font-mono text-sm">{row.ref}</TableCell>
                        <TableCell className="text-white font-semibold">{row.amount}</TableCell>
                        <TableCell className="text-slate-300 flex items-center gap-1"><User className="h-3 w-3 text-slate-500" />{row.requester}</TableCell>
                        <TableCell><Badge className={urgencyBadge(row.urgency)}>{row.urgency}</Badge></TableCell>
                        <TableCell className="text-slate-400 text-sm">{row.date}</TableCell>
                        <TableCell><Badge className={sb.cls}><sb.Icon className="h-3 w-3 ml-1" />{sb.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Approved ─────────────────────────────────────────── */}
        <TabsContent value="approved">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" /> בקשות שאושרו
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">מזהה</TableHead>
                    <TableHead className="text-slate-400 text-right">סוג</TableHead>
                    <TableHead className="text-slate-400 text-right">אסמכתא</TableHead>
                    <TableHead className="text-slate-400 text-right">סכום</TableHead>
                    <TableHead className="text-slate-400 text-right">מבקש</TableHead>
                    <TableHead className="text-slate-400 text-right">אושר ע\"י</TableHead>
                    <TableHead className="text-slate-400 text-right">תאריך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvedItems.map((row) => (
                    <TableRow key={row.id} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-slate-300 font-mono text-sm">{row.id}</TableCell>
                      <TableCell className="text-slate-300">{row.type}</TableCell>
                      <TableCell className="text-blue-400 font-mono text-sm">{row.ref}</TableCell>
                      <TableCell className="text-white font-semibold">{row.amount}</TableCell>
                      <TableCell className="text-slate-300">{row.requester}</TableCell>
                      <TableCell className="text-emerald-400">{row.approvedBy}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{row.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Rejected ─────────────────────────────────────────── */}
        <TabsContent value="rejected">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-400" /> בקשות שנדחו
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">מזהה</TableHead>
                    <TableHead className="text-slate-400 text-right">סוג</TableHead>
                    <TableHead className="text-slate-400 text-right">אסמכתא</TableHead>
                    <TableHead className="text-slate-400 text-right">סכום</TableHead>
                    <TableHead className="text-slate-400 text-right">מבקש</TableHead>
                    <TableHead className="text-slate-400 text-right">סיבת דחייה</TableHead>
                    <TableHead className="text-slate-400 text-right">תאריך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rejectedItems.map((row) => (
                    <TableRow key={row.id} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-slate-300 font-mono text-sm">{row.id}</TableCell>
                      <TableCell className="text-slate-300">{row.type}</TableCell>
                      <TableCell className="text-blue-400 font-mono text-sm">{row.ref}</TableCell>
                      <TableCell className="text-white font-semibold">{row.amount}</TableCell>
                      <TableCell className="text-slate-300">{row.requester}</TableCell>
                      <TableCell className="text-red-300 text-sm">{row.reason}</TableCell>
                      <TableCell className="text-slate-400 text-sm">{row.date}</TableCell>
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
