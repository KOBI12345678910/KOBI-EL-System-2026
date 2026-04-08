import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CreditCard, DollarSign,
  CheckCircle, XCircle, AlertTriangle, Clock, Link2, RefreshCw,
  Search, Filter, Download, RotateCcw, Loader2
} from "lucide-react";

const FALLBACK_PAYMENTS = [
  { id: 1, date: "2026-04-08", type: "incoming", entity: "חברת אלומיניום ישראל", document: "INV-000234", amount: 45000, method: "העברה בנקאית", reference: "TXN-88921", status: "completed", matched: true },
  { id: 2, date: "2026-04-08", type: "incoming", entity: "קבוצת שיכון ובינוי", document: "INV-000228", amount: 72000, method: "צ'ק", reference: "CHK-4421", status: "completed", matched: true },
  { id: 3, date: "2026-04-07", type: "outgoing", entity: "מפעלי ברזל השרון", document: "EXI-000145", amount: 85000, method: "העברה בנקאית", reference: "TXN-88920", status: "completed", matched: true },
  { id: 4, date: "2026-04-07", type: "incoming", entity: "עיריית חיפה", document: null, amount: 35000, method: "העברה בנקאית", reference: "TXN-88919", status: "completed", matched: false },
  { id: 5, date: "2026-04-06", type: "outgoing", entity: "חברת חשמל", document: "EXI-000147", amount: 12000, method: "הוראת קבע", reference: "DD-2234", status: "completed", matched: true },
  { id: 6, date: "2026-04-06", type: "incoming", entity: "סופרגז אנרגיה", document: "INV-000215", amount: 28000, method: "כרטיס אשראי", reference: "CC-99812", status: "failed", matched: false },
  { id: 7, date: "2026-04-05", type: "outgoing", entity: "Foshan Glass Co.", document: "EXI-000142", amount: 180000, method: "SWIFT", reference: "SW-44521", status: "pending", matched: true },
  { id: 8, date: "2026-04-04", type: "incoming", entity: 'נדל"ן פלוס', document: "INV-000230", amount: 18000, method: "העברה בנקאית", reference: "TXN-88915", status: "reversed", matched: false },
];

const fmt = (v: number) => `₪${v.toLocaleString("he-IL")}`;

export default function PaymentOperations() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: allPayments = FALLBACK_PAYMENTS, isLoading } = useQuery({
    queryKey: ["finance-payment-operations"],
    queryFn: async () => {
      const r = await authFetch("/api/finance/payment-operations");
      if (!r.ok) return FALLBACK_PAYMENTS;
      return r.json();
    },
  });

  const totalIncoming = allPayments.filter((p: any) => p.type === "incoming" && p.status === "completed").reduce((s: number, p: any) => s + p.amount, 0);
  const totalOutgoing = allPayments.filter((p: any) => p.type === "outgoing" && p.status === "completed").reduce((s: number, p: any) => s + p.amount, 0);
  const unmatched = allPayments.filter((p: any) => !p.matched);
  const failed = allPayments.filter((p: any) => p.status === "failed");
  const reversed = allPayments.filter((p: any) => p.status === "reversed");

  const filtered = allPayments.filter(p => {
    if (typeFilter !== "all" && p.type !== typeFilter) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search && !p.entity.includes(search) && !p.reference.includes(search)) return false;
    return true;
  });

  const typeBadge = (type: string) => type === "incoming"
    ? <Badge className="bg-emerald-100 text-emerald-700 text-[9px]"><ArrowDownLeft className="h-2.5 w-2.5 ml-0.5" />נכנס</Badge>
    : <Badge className="bg-red-100 text-red-700 text-[9px]"><ArrowUpRight className="h-2.5 w-2.5 ml-0.5" />יוצא</Badge>;

  const statusBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge className="bg-emerald-100 text-emerald-700 text-[9px]"><CheckCircle className="h-2.5 w-2.5 ml-0.5" />הושלם</Badge>;
      case "pending": return <Badge className="bg-amber-100 text-amber-700 text-[9px]"><Clock className="h-2.5 w-2.5 ml-0.5" />ממתין</Badge>;
      case "failed": return <Badge className="bg-red-100 text-red-700 text-[9px]"><XCircle className="h-2.5 w-2.5 ml-0.5" />נכשל</Badge>;
      case "reversed": return <Badge className="bg-purple-100 text-purple-700 text-[9px]"><RotateCcw className="h-2.5 w-2.5 ml-0.5" />בוטל</Badge>;
      default: return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="mr-3 text-muted-foreground">טוען תפעול תשלומים...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="h-7 w-7 text-primary" /> תפעול תשלומים
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">נכנסים | יוצאים | שיוכים | כשלונות | ביטולים</p>
        </div>
        <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 ml-1" /> ייצוא</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-6 gap-3">
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <ArrowDownLeft className="h-5 w-5 mx-auto text-emerald-600 mb-1" />
            <p className="text-[10px] text-emerald-700">נכנסים</p>
            <p className="text-lg font-bold font-mono text-emerald-800">{fmt(totalIncoming)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <ArrowUpRight className="h-5 w-5 mx-auto text-red-600 mb-1" />
            <p className="text-[10px] text-red-700">יוצאים</p>
            <p className="text-lg font-bold font-mono text-red-800">{fmt(totalOutgoing)}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-blue-600 mb-1" />
            <p className="text-[10px] text-blue-700">נטו</p>
            <p className="text-lg font-bold font-mono text-blue-800">{fmt(totalIncoming - totalOutgoing)}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Link2 className="h-5 w-5 mx-auto text-amber-600 mb-1" />
            <p className="text-[10px] text-amber-700">לא משויכים</p>
            <p className="text-lg font-bold text-amber-800">{unmatched.length}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <XCircle className="h-5 w-5 mx-auto text-red-600 mb-1" />
            <p className="text-[10px] text-red-700">נכשלו</p>
            <p className="text-lg font-bold text-red-800">{failed.length}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <RotateCcw className="h-5 w-5 mx-auto text-purple-600 mb-1" />
            <p className="text-[10px] text-purple-700">בוטלו</p>
            <p className="text-lg font-bold text-purple-800">{reversed.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-3 pb-3">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="חפש ישות / אסמכתא..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs pr-8" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="כיוון" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="incoming">נכנסים</SelectItem>
                <SelectItem value="outgoing">יוצאים</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="סטטוס" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="completed">הושלם</SelectItem>
                <SelectItem value="pending">ממתין</SelectItem>
                <SelectItem value="failed">נכשל</SelectItem>
                <SelectItem value="reversed">בוטל</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-right text-xs font-semibold">תאריך</TableHead>
                  <TableHead className="text-right text-xs font-semibold">כיוון</TableHead>
                  <TableHead className="text-right text-xs font-semibold">ישות</TableHead>
                  <TableHead className="text-right text-xs font-semibold">מסמך</TableHead>
                  <TableHead className="text-right text-xs font-semibold">סכום</TableHead>
                  <TableHead className="text-right text-xs font-semibold">אמצעי</TableHead>
                  <TableHead className="text-right text-xs font-semibold">אסמכתא</TableHead>
                  <TableHead className="text-right text-xs font-semibold">משויך</TableHead>
                  <TableHead className="text-right text-xs font-semibold">סטטוס</TableHead>
                  <TableHead className="text-right text-xs font-semibold">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id} className={`hover:bg-muted/10 ${p.status === "failed" ? "bg-red-50/20" : p.status === "reversed" ? "bg-purple-50/20" : !p.matched ? "bg-amber-50/20" : ""}`}>
                    <TableCell className="text-xs">{p.date}</TableCell>
                    <TableCell>{typeBadge(p.type)}</TableCell>
                    <TableCell className="font-medium text-xs max-w-[160px] truncate">{p.entity}</TableCell>
                    <TableCell className="font-mono text-[10px]">{p.document || <span className="text-amber-600">לא משויך</span>}</TableCell>
                    <TableCell className={`font-mono text-xs font-bold ${p.type === "incoming" ? "text-emerald-600" : "text-red-600"}`}>
                      {p.type === "incoming" ? "+" : "-"}{fmt(p.amount)}
                    </TableCell>
                    <TableCell className="text-[10px]">{p.method}</TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">{p.reference}</TableCell>
                    <TableCell>
                      {p.matched
                        ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                        : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                    </TableCell>
                    <TableCell>{statusBadge(p.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {!p.matched && <Button variant="ghost" size="icon" className="h-6 w-6" title="שייך"><Link2 className="h-3 w-3" /></Button>}
                        {p.status === "failed" && <Button variant="ghost" size="icon" className="h-6 w-6" title="נסה שוב"><RefreshCw className="h-3 w-3" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
