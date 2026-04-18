import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Database, FileText, Play, CheckCircle, XCircle, Clock,
  Download, Upload, Plus, AlertTriangle, RefreshCw, Repeat, Loader2
} from "lucide-react";

const FALLBACK_MASAV_BATCHES = [
  { id: 1, number: "MSV-2026-042", date: "2026-04-08", type: "חיוב (גבייה)", total: 185000, count: 12, status: "generated", fileName: "masav_042_20260408.dat" },
  { id: 2, number: "MSV-2026-041", date: "2026-04-01", type: "זיכוי (תשלום ספקים)", total: 320000, count: 8, status: "sent", fileName: "masav_041_20260401.dat" },
  { id: 3, number: "MSV-2026-040", date: "2026-03-25", type: "חיוב (גבייה)", total: 142000, count: 15, status: "processed", fileName: "masav_040_20260325.dat", successCount: 13, failCount: 2 },
  { id: 4, number: "MSV-2026-039", date: "2026-03-18", type: "חיוב (גבייה)", total: 98000, count: 10, status: "processed", fileName: "masav_039_20260318.dat", successCount: 10, failCount: 0 },
];

const FALLBACK_FAILED_DEBITS = [
  { id: 1, batch: "MSV-2026-040", customer: "לקוח X", amount: 4500, reason: "אין כיסוי", retryCount: 1, nextRetry: "2026-04-10" },
  { id: 2, batch: "MSV-2026-040", customer: "לקוח Y", amount: 2800, reason: "חשבון סגור", retryCount: 2, nextRetry: null },
];

const FALLBACK_MANDATES = [
  { id: 1, customer: "חברת אלומיניום ישראל", bank: "לאומי", branch: "125", account: "345-67890", amount: 15000, frequency: "חודשי", status: "active", startDate: "2025-01-01", endDate: "2026-12-31" },
  { id: 2, customer: "עיריית חיפה", bank: "הפועלים", branch: "632", account: "789-12345", amount: 8500, frequency: "חודשי", status: "active", startDate: "2025-06-01", endDate: null },
  { id: 3, customer: 'נדל"ן פלוס', bank: "מזרחי", branch: "412", account: "567-89012", amount: 12000, frequency: "חודשי", status: "suspended", startDate: "2025-03-01", endDate: null },
  { id: 4, customer: "סופרגז אנרגיה", bank: "דיסקונט", branch: "045", account: "123-45678", amount: 5800, frequency: "חודשי", status: "cancelled", startDate: "2024-01-01", endDate: "2026-02-28" },
];

const fmt = (v: number) => `₪${v.toLocaleString("he-IL")}`;

export default function MasavManagement() {
  const [showCreateBatch, setShowCreateBatch] = useState(false);

  const { data: masavBatches = FALLBACK_MASAV_BATCHES, isLoading: isLoadingBatches } = useQuery({
    queryKey: ["finance-masav-batches"],
    queryFn: async () => {
      const r = await authFetch("/api/finance/masav/batches");
      if (!r.ok) return FALLBACK_MASAV_BATCHES;
      return r.json();
    },
  });

  const { data: failedDebits = FALLBACK_FAILED_DEBITS, isLoading: isLoadingFailed } = useQuery({
    queryKey: ["finance-masav-failed"],
    queryFn: async () => {
      const r = await authFetch("/api/finance/masav/failed-debits");
      if (!r.ok) return FALLBACK_FAILED_DEBITS;
      return r.json();
    },
  });

  const { data: mandates = FALLBACK_MANDATES, isLoading: isLoadingMandates } = useQuery({
    queryKey: ["finance-masav-mandates"],
    queryFn: async () => {
      const r = await authFetch("/api/finance/masav/mandates");
      if (!r.ok) return FALLBACK_MANDATES;
      return r.json();
    },
  });

  const isLoading = isLoadingBatches || isLoadingFailed || isLoadingMandates;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="mr-3 text-muted-foreground">טוען נתוני מס"ב...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Database className="h-7 w-7 text-primary" /> מס"ב והוראות קבע
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">קבצי מס"ב | הרשאות חיוב | חיובים שנכשלו | מחזורי ניסיון</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showCreateBatch} onOpenChange={setShowCreateBatch}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 ml-1" /> קובץ מס"ב חדש</Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader><DialogTitle>יצירת קובץ מס"ב</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">סוג</Label>
                  <select className="w-full border rounded px-3 py-2 text-sm">
                    <option>חיוב (גבייה מלקוחות)</option>
                    <option>זיכוי (תשלום לספקים)</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">תאריך ערך</Label>
                  <Input type="date" defaultValue={new Date().toISOString().split("T")[0]} />
                </div>
                <p className="text-xs text-muted-foreground">הקובץ ייווצר מהוראות קבע פעילות שמועד החיוב שלהן הגיע.</p>
                <Button className="w-full" onClick={() => setShowCreateBatch(false)}>
                  <FileText className="h-4 w-4 ml-1" /> צור קובץ
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-blue-700">הרשאות פעילות</p>
            <p className="text-2xl font-bold text-blue-800">{mandates.filter(m => m.status === "active").length}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-amber-700">חיובים שנכשלו</p>
            <p className="text-2xl font-bold text-amber-800">{failedDebits.length}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-emerald-700">הצלחה אחרון</p>
            <p className="text-2xl font-bold text-emerald-800">87%</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-purple-700">גבייה חודשית</p>
            <p className="text-xl font-bold font-mono text-purple-800">{fmt(mandates.filter(m => m.status === "active").reduce((s, m) => s + m.amount, 0))}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="batches">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="batches" className="text-xs gap-1"><FileText className="h-3.5 w-3.5" /> קבצי מס"ב</TabsTrigger>
          <TabsTrigger value="mandates" className="text-xs gap-1"><Repeat className="h-3.5 w-3.5" /> הרשאות</TabsTrigger>
          <TabsTrigger value="failed" className="text-xs gap-1"><XCircle className="h-3.5 w-3.5" /> נכשלו</TabsTrigger>
          <TabsTrigger value="retry" className="text-xs gap-1"><RefreshCw className="h-3.5 w-3.5" /> ניסיון חוזר</TabsTrigger>
        </TabsList>

        <TabsContent value="batches">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">מספר</TableHead>
                    <TableHead className="text-right text-xs font-semibold">תאריך</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סוג</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סכום</TableHead>
                    <TableHead className="text-right text-xs font-semibold">עסקאות</TableHead>
                    <TableHead className="text-right text-xs font-semibold">קובץ</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סטטוס</TableHead>
                    <TableHead className="text-right text-xs font-semibold">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {masavBatches.map(b => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs font-medium">{b.number}</TableCell>
                      <TableCell className="text-xs">{b.date}</TableCell>
                      <TableCell className="text-xs">{b.type}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">{fmt(b.total)}</TableCell>
                      <TableCell className="text-xs">
                        {b.status === "processed"
                          ? <span>{b.successCount} <CheckCircle className="h-3 w-3 text-emerald-500 inline" /> / {b.failCount} <XCircle className="h-3 w-3 text-red-500 inline" /></span>
                          : b.count}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">{b.fileName}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${
                          b.status === "processed" ? "bg-emerald-100 text-emerald-700" :
                          b.status === "sent" ? "bg-blue-100 text-blue-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {b.status === "processed" ? "עובד" : b.status === "sent" ? "נשלח" : "נוצר"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {b.status === "generated" && <Button variant="outline" size="sm" className="h-6 text-[10px]"><Play className="h-3 w-3 ml-1" />שלח</Button>}
                          <Button variant="ghost" size="icon" className="h-6 w-6"><Download className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mandates">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">לקוח</TableHead>
                    <TableHead className="text-right text-xs font-semibold">בנק</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סניף</TableHead>
                    <TableHead className="text-right text-xs font-semibold">חשבון</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סכום</TableHead>
                    <TableHead className="text-right text-xs font-semibold">תדירות</TableHead>
                    <TableHead className="text-right text-xs font-semibold">תוקף</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mandates.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-xs">{m.customer}</TableCell>
                      <TableCell className="text-xs">{m.bank}</TableCell>
                      <TableCell className="font-mono text-[10px]">{m.branch}</TableCell>
                      <TableCell className="font-mono text-[10px]">{m.account}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">{fmt(m.amount)}</TableCell>
                      <TableCell className="text-xs">{m.frequency}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">
                        {m.startDate} — {m.endDate || "ללא הגבלה"}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${
                          m.status === "active" ? "bg-emerald-100 text-emerald-700" :
                          m.status === "suspended" ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {m.status === "active" ? "פעיל" : m.status === "suspended" ? "מושהה" : "מבוטל"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failed">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">קובץ</TableHead>
                    <TableHead className="text-right text-xs font-semibold">לקוח</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סכום</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סיבה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">ניסיונות</TableHead>
                    <TableHead className="text-right text-xs font-semibold">ניסיון הבא</TableHead>
                    <TableHead className="text-right text-xs font-semibold">פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failedDebits.map(f => (
                    <TableRow key={f.id} className="bg-red-50/20">
                      <TableCell className="font-mono text-[10px]">{f.batch}</TableCell>
                      <TableCell className="font-medium text-xs">{f.customer}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-red-600">{fmt(f.amount)}</TableCell>
                      <TableCell className="text-xs">{f.reason}</TableCell>
                      <TableCell className="font-mono text-xs">{f.retryCount}/3</TableCell>
                      <TableCell className="text-xs">{f.nextRetry || "—"}</TableCell>
                      <TableCell>
                        {f.nextRetry
                          ? <Button variant="outline" size="sm" className="h-6 text-[10px]"><RefreshCw className="h-3 w-3 ml-1" />נסה שוב</Button>
                          : <Badge className="bg-red-100 text-red-700 text-[9px]">מוצה</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retry">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <RefreshCw className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
              <p>מחזורי ניסיון חוזר מתבצעים אוטומטית</p>
              <p className="text-xs mt-1">עד 3 ניסיונות בהפרש של 5 ימים</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
