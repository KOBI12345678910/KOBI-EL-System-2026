import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  SendHorizontal, Mail, MessageSquare, Printer, Globe, PenTool,
  CheckCircle2, Clock, AlertTriangle, FileText, FileCheck, Truck,
  FileSignature, Copy, MailCheck, Eye, XCircle, LayoutTemplate,
} from "lucide-react";

/* ── mock data ── */

const outgoingQueue = [
  { id: "OUT-001", name: "הצעת מחיר פרויקט אלפא", type: "הצעת מחיר", recipient: "דלתא תעשיות / יוסי כהן", channel: "אימייל", needsSign: true, signed: "כן", status: "מוכן לשליחה", date: "2026-04-08" },
  { id: "OUT-002", name: "חשבונית מס 12045", type: "חשבונית", recipient: "מגה-טק בע\"מ / שרה לוי", channel: "אימייל", needsSign: false, signed: "—", status: "נשלח", date: "2026-04-07" },
  { id: "OUT-003", name: "תעודת משלוח SHP-445", type: "תעודת משלוח", recipient: "פלדות הצפון / דוד מזרחי", channel: "WhatsApp", needsSign: false, signed: "—", status: "נשלח", date: "2026-04-07" },
  { id: "OUT-004", name: "חוזה שירות שנתי 2026", type: "חוזה", recipient: "אומגה סולושנס / רחל אברהם", channel: "פורטל", needsSign: true, signed: "ממתין", status: "ממתין לחתימה", date: "—" },
  { id: "OUT-005", name: "אישור הזמנה PO-7890", type: "אישור", recipient: "טופ-מתכת / אלון גולדשטיין", channel: "אימייל", needsSign: false, signed: "—", status: "נשלח", date: "2026-04-06" },
  { id: "OUT-006", name: "דו\"ח איכות Q1-2026", type: "דו\"ח", recipient: "מכון התקנים / נועה פרידמן", channel: "דואר", needsSign: true, signed: "כן", status: "מוכן לשליחה", date: "2026-04-08" },
  { id: "OUT-007", name: "הצעת מחיר ציר SH-40", type: "הצעת מחיר", recipient: "גמא הנדסה / עומר חדד", channel: "אימייל", needsSign: true, signed: "ממתין", status: "ממתין לחתימה", date: "—" },
  { id: "OUT-008", name: "חשבונית מס 12046", type: "חשבונית", recipient: "סיגמא לוגיסטיקה / מיכל ברק", channel: "פקס", needsSign: false, signed: "—", status: "בהכנה", date: "—" },
  { id: "OUT-009", name: "חוזה אספקה שנתי", type: "חוזה", recipient: "דלתא תעשיות / יוסי כהן", channel: "פורטל", needsSign: true, signed: "כן", status: "נשלח", date: "2026-04-05" },
  { id: "OUT-010", name: "תעודת משלוח SHP-446", type: "תעודת משלוח", recipient: "מגה-טק בע\"מ / שרה לוי", channel: "WhatsApp", needsSign: false, signed: "—", status: "בהכנה", date: "—" },
];

const deliveryConfirmations = [
  { id: "OUT-002", name: "חשבונית מס 12045", recipient: "מגה-טק בע\"מ", sentDate: "2026-04-07", readDate: "2026-04-07 14:32", readStatus: "נקרא" },
  { id: "OUT-003", name: "תעודת משלוח SHP-445", recipient: "פלדות הצפון", sentDate: "2026-04-07", readDate: "2026-04-07 16:10", readStatus: "נקרא" },
  { id: "OUT-005", name: "אישור הזמנה PO-7890", recipient: "טופ-מתכת", sentDate: "2026-04-06", readDate: "—", readStatus: "לא נקרא" },
  { id: "OUT-009", name: "חוזה אספקה שנתי", recipient: "דלתא תעשיות", sentDate: "2026-04-05", readDate: "2026-04-05 09:45", readStatus: "אושר קבלה" },
  { id: "OUT-011", name: "הצעת מחיר מערכת הנעה", recipient: "אומגה סולושנס", sentDate: "2026-04-04", readDate: "2026-04-04 11:20", readStatus: "נקרא" },
];

const templates = [
  { name: "הצעת מחיר סטנדרטית", type: "הצעת מחיר", lastUsed: "2026-04-07", uses: 34, icon: FileText, color: "text-blue-400", bg: "bg-blue-950/40 border-blue-800/40" },
  { name: "חשבונית מס / קבלה", type: "חשבונית", lastUsed: "2026-04-07", uses: 89, icon: FileCheck, color: "text-emerald-400", bg: "bg-emerald-950/40 border-emerald-800/40" },
  { name: "תעודת משלוח", type: "תעודת משלוח", lastUsed: "2026-04-06", uses: 67, icon: Truck, color: "text-orange-400", bg: "bg-orange-950/40 border-orange-800/40" },
  { name: "חוזה שירות / אספקה", type: "חוזה", lastUsed: "2026-04-05", uses: 12, icon: FileSignature, color: "text-purple-400", bg: "bg-purple-950/40 border-purple-800/40" },
  { name: "אישור הזמנה", type: "אישור", lastUsed: "2026-04-06", uses: 45, icon: CheckCircle2, color: "text-cyan-400", bg: "bg-cyan-950/40 border-cyan-800/40" },
  { name: "דו\"ח תקופתי", type: "דו\"ח", lastUsed: "2026-04-01", uses: 8, icon: Copy, color: "text-rose-400", bg: "bg-rose-950/40 border-rose-800/40" },
];

/* ── helpers ── */

const statusColor: Record<string, string> = {
  "בהכנה": "bg-slate-700 text-slate-300",
  "ממתין לחתימה": "bg-amber-900/60 text-amber-300",
  "מוכן לשליחה": "bg-blue-900/60 text-blue-300",
  "נשלח": "bg-emerald-900/60 text-emerald-300",
  "אושר קבלה": "bg-green-900/60 text-green-300",
};

const channelIcon: Record<string, JSX.Element> = {
  "אימייל": <Mail className="w-4 h-4 text-blue-400" />,
  "WhatsApp": <MessageSquare className="w-4 h-4 text-green-400" />,
  "דואר": <Printer className="w-4 h-4 text-orange-400" />,
  "פקס": <Printer className="w-4 h-4 text-slate-400" />,
  "פורטל": <Globe className="w-4 h-4 text-purple-400" />,
};

const readColor: Record<string, string> = {
  "נקרא": "bg-emerald-900/60 text-emerald-300",
  "לא נקרא": "bg-amber-900/60 text-amber-300",
  "אושר קבלה": "bg-green-900/60 text-green-300",
};

const signedBadge = (v: string) => {
  if (v === "כן") return <Badge className="bg-emerald-900/60 text-emerald-300">כן</Badge>;
  if (v === "ממתין") return <Badge className="bg-amber-900/60 text-amber-300">ממתין</Badge>;
  return <span className="text-slate-500">—</span>;
};

/* ── KPIs ── */

const kpis = [
  { label: "נשלחו היום", value: 6, icon: <SendHorizontal className="w-5 h-5" />, color: "text-emerald-400" },
  { label: "ממתינים לשליחה", value: 3, icon: <Clock className="w-5 h-5" />, color: "text-amber-400" },
  { label: "דורשים חתימה לפני שליחה", value: 2, icon: <PenTool className="w-5 h-5" />, color: "text-red-400" },
  { label: "נשלחו החודש", value: 89, icon: <MailCheck className="w-5 h-5" />, color: "text-blue-400" },
];

/* ── component ── */

export default function OutgoingDocuments() {
  const [tab, setTab] = useState("queue");

  const sentCount = outgoingQueue.filter((d) => d.status === "נשלח").length;
  const totalCount = outgoingQueue.length;

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SendHorizontal className="w-7 h-7 text-blue-400" />
        <h1 className="text-2xl font-bold tracking-tight">מסמכים יוצאים</h1>
        <Badge className="bg-blue-900/50 text-blue-300 mr-auto">טכנו-כל עוזי</Badge>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-4 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className={k.color}>{k.icon}</span>
                <span className="text-2xl font-bold">{k.value.toLocaleString("he-IL")}</span>
              </div>
              <span className="text-xs text-slate-400">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Send progress */}
      <Card className="bg-[#12121a] border-[#1e1e2e]">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">התקדמות שליחה יומית</span>
            <span className="font-semibold text-blue-300">{sentCount}/{totalCount} נשלחו</span>
          </div>
          <Progress value={(sentCount / totalCount) * 100} className="h-2" />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-[#12121a] border border-[#1e1e2e] flex-wrap">
          <TabsTrigger value="queue">תור שליחה</TabsTrigger>
          <TabsTrigger value="sent">נשלחו</TabsTrigger>
          <TabsTrigger value="confirmations">אישורי קבלה</TabsTrigger>
          <TabsTrigger value="templates">תבניות</TabsTrigger>
        </TabsList>

        {/* ── Tab: Queue ── */}
        <TabsContent value="queue" className="space-y-4">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                תור שליחה — מסמכים יוצאים
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">מזהה</TableHead>
                    <TableHead className="text-right text-slate-400">שם מסמך</TableHead>
                    <TableHead className="text-right text-slate-400">סוג</TableHead>
                    <TableHead className="text-right text-slate-400">נמען</TableHead>
                    <TableHead className="text-right text-slate-400">ערוץ</TableHead>
                    <TableHead className="text-right text-slate-400">דורש חתימה</TableHead>
                    <TableHead className="text-right text-slate-400">חתום</TableHead>
                    <TableHead className="text-right text-slate-400">סטטוס</TableHead>
                    <TableHead className="text-right text-slate-400">תאריך שליחה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outgoingQueue.map((doc) => (
                    <TableRow key={doc.id} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-mono text-blue-300">{doc.id}</TableCell>
                      <TableCell className="font-medium">{doc.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-slate-300 border-slate-600">{doc.type}</Badge></TableCell>
                      <TableCell className="text-sm text-slate-300">{doc.recipient}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          {channelIcon[doc.channel]}
                          <span className="text-sm">{doc.channel}</span>
                        </span>
                      </TableCell>
                      <TableCell>{doc.needsSign ? <Badge className="bg-amber-900/60 text-amber-300">כן</Badge> : <span className="text-slate-500">לא</span>}</TableCell>
                      <TableCell>{signedBadge(doc.signed)}</TableCell>
                      <TableCell><Badge className={statusColor[doc.status] || "bg-slate-700 text-slate-300"}>{doc.status}</Badge></TableCell>
                      <TableCell className="text-sm text-slate-400">{doc.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Sent ── */}
        <TabsContent value="sent" className="space-y-4">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                מסמכים שנשלחו
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">מזהה</TableHead>
                    <TableHead className="text-right text-slate-400">שם מסמך</TableHead>
                    <TableHead className="text-right text-slate-400">סוג</TableHead>
                    <TableHead className="text-right text-slate-400">נמען</TableHead>
                    <TableHead className="text-right text-slate-400">ערוץ</TableHead>
                    <TableHead className="text-right text-slate-400">תאריך שליחה</TableHead>
                    <TableHead className="text-right text-slate-400">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outgoingQueue.filter((d) => d.status === "נשלח" || d.status === "אושר קבלה").map((doc) => (
                    <TableRow key={doc.id} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-mono text-blue-300">{doc.id}</TableCell>
                      <TableCell className="font-medium">{doc.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-slate-300 border-slate-600">{doc.type}</Badge></TableCell>
                      <TableCell className="text-sm text-slate-300">{doc.recipient}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          {channelIcon[doc.channel]}
                          <span className="text-sm">{doc.channel}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-400">{doc.date}</TableCell>
                      <TableCell><Badge className={statusColor[doc.status] || "bg-slate-700 text-slate-300"}>{doc.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Delivery Confirmations ── */}
        <TabsContent value="confirmations" className="space-y-4">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="w-5 h-5 text-cyan-400" />
                אישורי קבלה — מעקב קריאה
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">מזהה</TableHead>
                    <TableHead className="text-right text-slate-400">שם מסמך</TableHead>
                    <TableHead className="text-right text-slate-400">נמען</TableHead>
                    <TableHead className="text-right text-slate-400">תאריך שליחה</TableHead>
                    <TableHead className="text-right text-slate-400">תאריך קריאה</TableHead>
                    <TableHead className="text-right text-slate-400">סטטוס קריאה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryConfirmations.map((doc) => (
                    <TableRow key={doc.id} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-mono text-blue-300">{doc.id}</TableCell>
                      <TableCell className="font-medium">{doc.name}</TableCell>
                      <TableCell className="text-sm text-slate-300">{doc.recipient}</TableCell>
                      <TableCell className="text-sm text-slate-400">{doc.sentDate}</TableCell>
                      <TableCell className="text-sm text-slate-400">{doc.readDate}</TableCell>
                      <TableCell>
                        <Badge className={readColor[doc.readStatus] || "bg-slate-700 text-slate-300"}>
                          {doc.readStatus === "נקרא" && <Eye className="w-3 h-3 ml-1 inline" />}
                          {doc.readStatus === "לא נקרא" && <XCircle className="w-3 h-3 ml-1 inline" />}
                          {doc.readStatus === "אושר קבלה" && <CheckCircle2 className="w-3 h-3 ml-1 inline" />}
                          {doc.readStatus}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Templates ── */}
        <TabsContent value="templates" className="space-y-4">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <LayoutTemplate className="w-5 h-5 text-purple-400" />
                תבניות שליחה מהירה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {templates.map((t) => {
                  const Icon = t.icon;
                  return (
                    <Card key={t.name} className={`${t.bg} border cursor-pointer hover:brightness-125 transition-all`}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <Icon className={`w-6 h-6 ${t.color}`} />
                          <div>
                            <p className="font-semibold text-sm">{t.name}</p>
                            <p className="text-xs text-slate-400">{t.type}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>שימוש אחרון: {t.lastUsed}</span>
                          <Badge variant="outline" className="text-slate-300 border-slate-600">{t.uses} שימושים</Badge>
                        </div>
                        <div className="flex justify-end">
                          <Badge className="bg-blue-900/60 text-blue-300 cursor-pointer hover:bg-blue-800/60">
                            <SendHorizontal className="w-3 h-3 ml-1 inline" />
                            שלח מתבנית
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}