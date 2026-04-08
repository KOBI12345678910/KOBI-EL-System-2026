import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users, Phone, Mail, Clock, AlertTriangle, CheckCircle, DollarSign,
  TrendingDown, Calendar, FileText, Send, Plus, Filter, Search,
  ArrowUpRight, ArrowDownRight, MessageSquare, Bell
} from "lucide-react";

// ============================================================
// DATA
// ============================================================
const agingBuckets = [
  { label: "שוטף (0-30)", amount: 680000, count: 24, color: "bg-emerald-500", textColor: "text-emerald-700" },
  { label: "30-60 ימים", amount: 320000, count: 12, color: "bg-amber-500", textColor: "text-amber-700" },
  { label: "60-90 ימים", amount: 185000, count: 8, color: "bg-orange-500", textColor: "text-orange-700" },
  { label: "90-120 ימים", amount: 95000, count: 4, color: "bg-red-500", textColor: "text-red-700" },
  { label: "120+ ימים", amount: 52000, count: 3, color: "bg-red-800", textColor: "text-red-800" },
];

const overdueCustomers = [
  { id: 1, name: "חברת אלומיניום ישראל בע\"מ", balance: 245000, overdue: 128000, overdueDays: 68, lastPayment: "2026-02-15", lastContact: "2026-04-05", nextAction: "שיחת מעקב", priority: "high", promisedDate: "2026-04-15", promisedAmount: 80000 },
  { id: 2, name: "משרד הביטחון - מחלקת תשתיות", balance: 185000, overdue: 185000, overdueDays: 92, lastPayment: "2026-01-10", lastContact: "2026-04-02", nextAction: "מכתב התראה 2", priority: "critical", promisedDate: null, promisedAmount: 0 },
  { id: 3, name: "עיריית חיפה - מחלקת הנדסה", balance: 95000, overdue: 95000, overdueDays: 45, lastPayment: "2026-03-01", lastContact: "2026-04-07", nextAction: "המתנה לאישור תקציבי", priority: "medium", promisedDate: "2026-04-20", promisedAmount: 95000 },
  { id: 4, name: "קבוצת שיכון ובינוי", balance: 72000, overdue: 35000, overdueDays: 38, lastPayment: "2026-03-20", lastContact: "2026-04-03", nextAction: "שיחה שבועית", priority: "low", promisedDate: "2026-04-12", promisedAmount: 35000 },
  { id: 5, name: "סופרגז אנרגיה", balance: 58000, overdue: 58000, overdueDays: 115, lastPayment: "2025-12-20", lastContact: "2026-03-28", nextAction: "העברה לגבייה משפטית", priority: "critical", promisedDate: null, promisedAmount: 0 },
  { id: 6, name: 'נדל"ן פלוס בע"מ', balance: 42000, overdue: 18000, overdueDays: 22, lastPayment: "2026-03-25", lastContact: "2026-04-08", nextAction: "תזכורת אוטומטית", priority: "low", promisedDate: "2026-04-18", promisedAmount: 18000 },
];

const collectionTasks = [
  { id: 1, customer: "משרד הביטחון", task: "שליחת מכתב התראה שני", dueDate: "2026-04-10", assignee: "שרה כהן", status: "overdue", amount: 185000 },
  { id: 2, customer: "חברת אלומיניום ישראל", task: "שיחת מעקב על הבטחת תשלום", dueDate: "2026-04-12", assignee: "דוד לוי", status: "pending", amount: 80000 },
  { id: 3, customer: "עיריית חיפה", task: "בדיקת סטטוס אישור תקציבי", dueDate: "2026-04-15", assignee: "שרה כהן", status: "pending", amount: 95000 },
  { id: 4, customer: "סופרגז אנרגיה", task: "העברה לעו\"ד גבייה", dueDate: "2026-04-08", assignee: "CFO", status: "overdue", amount: 58000 },
  { id: 5, customer: "קבוצת שיכון ובינוי", task: "שיחת מעקב שבועית", dueDate: "2026-04-14", assignee: "דוד לוי", status: "pending", amount: 35000 },
];

const dunningHistory = [
  { date: "2026-04-07", customer: "משרד הביטחון", type: "מכתב התראה 1", channel: "email", status: "sent" },
  { date: "2026-04-05", customer: "חברת אלומיניום ישראל", type: "שיחת טלפון", channel: "phone", status: "connected" },
  { date: "2026-04-03", customer: "סופרגז אנרגיה", type: "מכתב התראה 3 (לפני משפטי)", channel: "registered_mail", status: "sent" },
  { date: "2026-04-02", customer: "עיריית חיפה", type: "שיחת טלפון", channel: "phone", status: "voicemail" },
  { date: "2026-03-28", customer: 'נדל"ן פלוס', type: "תזכורת אוטומטית", channel: "email", status: "sent" },
];

const totalReceivables = agingBuckets.reduce((s, b) => s + b.amount, 0);
const totalOverdue = agingBuckets.slice(1).reduce((s, b) => s + b.amount, 0);
const totalPromised = overdueCustomers.reduce((s, c) => s + c.promisedAmount, 0);

const fmt = (v: number) => `₪${v.toLocaleString("he-IL")}`;

export default function CollectionsDashboard() {
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showPromiseDialog, setShowPromiseDialog] = useState(false);

  const priorityBadge = (p: string) => {
    switch (p) {
      case "critical": return <Badge className="bg-red-100 text-red-700 border-red-200">קריטי</Badge>;
      case "high": return <Badge className="bg-orange-100 text-orange-700 border-orange-200">גבוה</Badge>;
      case "medium": return <Badge className="bg-amber-100 text-amber-700 border-amber-200">בינוני</Badge>;
      default: return <Badge className="bg-green-100 text-green-700 border-green-200">נמוך</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" /> גבייה וחייבים
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Aging | משימות גבייה | הבטחות תשלום | מכתבי התראה</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Send className="h-3.5 w-3.5 ml-1" /> שלח תזכורות</Button>
          <Dialog open={showPromiseDialog} onOpenChange={setShowPromiseDialog}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-3.5 w-3.5 ml-1" /> רשום הבטחה</Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader><DialogTitle>רישום הבטחת תשלום</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-xs">לקוח</Label><Input placeholder="חפש לקוח..." /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">סכום מובטח</Label><Input type="number" /></div>
                  <div><Label className="text-xs">תאריך מובטח</Label><Input type="date" /></div>
                </div>
                <div><Label className="text-xs">הערות</Label><Textarea placeholder="פרטי השיחה..." /></div>
                <Button className="w-full" onClick={() => setShowPromiseDialog(false)}>שמור הבטחה</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3">
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-blue-600 mb-1" />
            <p className="text-[10px] text-blue-700">סה״כ חייבים</p>
            <p className="text-xl font-bold font-mono text-blue-800">{fmt(totalReceivables)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-red-600 mb-1" />
            <p className="text-[10px] text-red-700">באיחור</p>
            <p className="text-xl font-bold font-mono text-red-800">{fmt(totalOverdue)}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Clock className="h-5 w-5 mx-auto text-amber-600 mb-1" />
            <p className="text-[10px] text-amber-700">DSO ממוצע</p>
            <p className="text-xl font-bold font-mono text-amber-800">42 ימים</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <CheckCircle className="h-5 w-5 mx-auto text-emerald-600 mb-1" />
            <p className="text-[10px] text-emerald-700">הבטחות פתוחות</p>
            <p className="text-xl font-bold font-mono text-emerald-800">{fmt(totalPromised)}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Bell className="h-5 w-5 mx-auto text-purple-600 mb-1" />
            <p className="text-[10px] text-purple-700">משימות גבייה</p>
            <p className="text-xl font-bold text-purple-800">{collectionTasks.filter(t => t.status === "overdue").length} דחופות</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">גיול חובות (Aging)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-1 h-10 rounded-lg overflow-hidden mb-3">
            {agingBuckets.map((b, i) => (
              <div
                key={i}
                className={`${b.color} flex items-center justify-center text-white text-[10px] font-bold transition-all hover:opacity-80`}
                style={{ width: `${(b.amount / totalReceivables) * 100}%` }}
                title={`${b.label}: ${fmt(b.amount)} (${b.count} מסמכים)`}
              >
                {(b.amount / totalReceivables * 100) > 8 && `${(b.amount / totalReceivables * 100).toFixed(0)}%`}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {agingBuckets.map((b, i) => (
              <div key={i} className="text-center">
                <p className="text-[10px] text-muted-foreground">{b.label}</p>
                <p className={`text-sm font-bold font-mono ${b.textColor}`}>{fmt(b.amount)}</p>
                <p className="text-[10px] text-muted-foreground">{b.count} מסמכים</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="customers">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="customers" className="text-xs gap-1"><Users className="h-3.5 w-3.5" /> לקוחות חייבים</TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs gap-1"><Calendar className="h-3.5 w-3.5" /> משימות גבייה</TabsTrigger>
          <TabsTrigger value="promises" className="text-xs gap-1"><CheckCircle className="h-3.5 w-3.5" /> הבטחות</TabsTrigger>
          <TabsTrigger value="dunning" className="text-xs gap-1"><Send className="h-3.5 w-3.5" /> התראות</TabsTrigger>
        </TabsList>

        {/* Overdue Customers */}
        <TabsContent value="customers">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-right text-xs font-semibold">לקוח</TableHead>
                      <TableHead className="text-right text-xs font-semibold">יתרה כוללת</TableHead>
                      <TableHead className="text-right text-xs font-semibold">באיחור</TableHead>
                      <TableHead className="text-right text-xs font-semibold">ימי איחור</TableHead>
                      <TableHead className="text-right text-xs font-semibold">תשלום אחרון</TableHead>
                      <TableHead className="text-right text-xs font-semibold">קשר אחרון</TableHead>
                      <TableHead className="text-right text-xs font-semibold">פעולה הבאה</TableHead>
                      <TableHead className="text-right text-xs font-semibold">עדיפות</TableHead>
                      <TableHead className="text-right text-xs font-semibold">פעולות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdueCustomers.sort((a, b) => b.overdue - a.overdue).map(c => (
                      <TableRow key={c.id} className={`hover:bg-muted/10 ${c.priority === "critical" ? "bg-red-50/30" : ""}`}>
                        <TableCell className="font-medium text-xs max-w-[180px] truncate">{c.name}</TableCell>
                        <TableCell className="font-mono text-xs">{fmt(c.balance)}</TableCell>
                        <TableCell className="font-mono text-xs font-bold text-red-600">{fmt(c.overdue)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`font-mono text-[10px] ${c.overdueDays > 90 ? "text-red-600 border-red-300" : c.overdueDays > 60 ? "text-orange-600 border-orange-300" : "text-amber-600 border-amber-300"}`}>
                            {c.overdueDays}d
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{c.lastPayment}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{c.lastContact}</TableCell>
                        <TableCell className="text-[10px]">{c.nextAction}</TableCell>
                        <TableCell>{priorityBadge(c.priority)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" title="התקשר"><Phone className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" title="שלח מייל"><Mail className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" title="שלח התראה"><Send className="h-3 w-3" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Collection Tasks */}
        <TabsContent value="tasks">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">לקוח</TableHead>
                    <TableHead className="text-right text-xs font-semibold">משימה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סכום</TableHead>
                    <TableHead className="text-right text-xs font-semibold">תאריך יעד</TableHead>
                    <TableHead className="text-right text-xs font-semibold">אחראי</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collectionTasks.map(t => (
                    <TableRow key={t.id} className={t.status === "overdue" ? "bg-red-50/30" : ""}>
                      <TableCell className="font-medium text-xs">{t.customer}</TableCell>
                      <TableCell className="text-xs">{t.task}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">{fmt(t.amount)}</TableCell>
                      <TableCell className="text-[10px]">{t.dueDate}</TableCell>
                      <TableCell className="text-xs">{t.assignee}</TableCell>
                      <TableCell>
                        {t.status === "overdue"
                          ? <Badge className="bg-red-100 text-red-700 text-[9px]">באיחור</Badge>
                          : <Badge className="bg-blue-100 text-blue-700 text-[9px]">ממתין</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Promised Payments */}
        <TabsContent value="promises">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">לקוח</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סכום מובטח</TableHead>
                    <TableHead className="text-right text-xs font-semibold">תאריך הבטחה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueCustomers.filter(c => c.promisedAmount > 0).map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium text-xs">{c.name}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-emerald-600">{fmt(c.promisedAmount)}</TableCell>
                      <TableCell className="text-xs">{c.promisedDate}</TableCell>
                      <TableCell>
                        {c.promisedDate && new Date(c.promisedDate) < new Date()
                          ? <Badge className="bg-red-100 text-red-700 text-[9px]">עבר מועד</Badge>
                          : <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">ממתין</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dunning History */}
        <TabsContent value="dunning">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">תאריך</TableHead>
                    <TableHead className="text-right text-xs font-semibold">לקוח</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סוג</TableHead>
                    <TableHead className="text-right text-xs font-semibold">ערוץ</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dunningHistory.map((d, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{d.date}</TableCell>
                      <TableCell className="font-medium text-xs">{d.customer}</TableCell>
                      <TableCell className="text-xs">{d.type}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[9px]">
                          {d.channel === "email" ? "📧 מייל" : d.channel === "phone" ? "📞 טלפון" : "📬 דואר רשום"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${d.status === "connected" ? "bg-emerald-100 text-emerald-700" : d.status === "voicemail" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                          {d.status === "connected" ? "התחבר" : d.status === "voicemail" ? "הודעה" : "נשלח"}
                        </Badge>
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
