// ============================================================
// Commercial / Sales Orders — list + status transitions
// Generated: 2026-04-18
// ============================================================
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authJson } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Eye, ArrowRightCircle, Package } from "lucide-react";

interface SalesOrder {
  id: number;
  order_number: string;
  customer_id: number;
  quote_id: number | null;
  status: string;
  order_date: string;
  expected_delivery: string | null;
  currency: string;
  subtotal: string | number;
  discount_total: string | number;
  vat_total: string | number;
  total_with_vat: string | number;
  notes: string | null;
  created_at: string;
}

const STATUSES = [
  "draft", "confirmed", "in_fulfillment", "shipped", "invoiced", "closed", "cancelled",
] as const;
const STATUS_HE: Record<string, string> = {
  draft: "טיוטה", confirmed: "מאושרת", in_fulfillment: "בביצוע",
  shipped: "נשלחה", invoiced: "חויבה", closed: "סגורה", cancelled: "בוטלה",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-500", confirmed: "bg-blue-500", in_fulfillment: "bg-amber-500",
  shipped: "bg-indigo-500", invoiced: "bg-purple-500", closed: "bg-emerald-600", cancelled: "bg-red-500",
};

const fmtILS = (v: string | number) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
};

export default function SalesOrdersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const limit = 20;

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    customer_id: "" as string, quote_id: "" as string, subtotal: "0", discount_total: "0",
    vat_rate: "0.18", expected_delivery: "", notes: "",
  });

  const [transitionOrder, setTransitionOrder] = useState<SalesOrder | null>(null);
  const [transitionTo, setTransitionTo] = useState<string>("");
  const [transitionReason, setTransitionReason] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["commercial", "sales-orders", { search, statusFilter, page }],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (search) qs.set("q", search);
      if (statusFilter !== "all") qs.set("status", statusFilter);
      qs.set("limit", String(limit));
      qs.set("offset", String(page * limit));
      return authJson(`/api/commercial/sales-orders?${qs.toString()}`);
    },
    staleTime: 15_000,
  });

  const rows: SalesOrder[] = useMemo(() => data?.data ?? [], [data]);
  const total = data?.total ?? 0;

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      authJson("/api/commercial/sales-orders", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["commercial", "sales-orders"] }); setCreateOpen(false); },
  });

  const transitionMutation = useMutation({
    mutationFn: async ({ id, to_status, reason }: { id: number; to_status: string; reason?: string }) =>
      authJson(`/api/commercial/sales-orders/${id}/transition`, {
        method: "POST", body: JSON.stringify({ to_status, reason: reason || undefined }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commercial", "sales-orders"] });
      setTransitionOrder(null); setTransitionReason(""); setTransitionTo("");
    },
  });

  function submitCreate() {
    const payload = {
      customer_id: Number(createForm.customer_id),
      quote_id: createForm.quote_id ? Number(createForm.quote_id) : null,
      subtotal: Number(createForm.subtotal),
      discount_total: Number(createForm.discount_total),
      vat_rate: Number(createForm.vat_rate),
      expected_delivery: createForm.expected_delivery || null,
      notes: createForm.notes || null,
      status: "draft",
    };
    if (!payload.customer_id) { alert("יש לבחור לקוח"); return; }
    createMutation.mutate(payload);
  }

  function submitTransition() {
    if (!transitionOrder || !transitionTo) return;
    transitionMutation.mutate({ id: transitionOrder.id, to_status: transitionTo, reason: transitionReason });
  }

  return (
    <div dir="rtl" className="p-6 space-y-6 min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-emerald-400" />
          <h1 className="text-2xl font-bold">הזמנות מכירה</h1>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 ml-2" />הזמנה חדשה</Button>
          </DialogTrigger>
          <DialogContent dir="rtl" className="max-w-xl">
            <DialogHeader><DialogTitle>הזמנה חדשה</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>מזהה לקוח *</Label><Input type="number" value={createForm.customer_id} onChange={e => setCreateForm({ ...createForm, customer_id: e.target.value })} /></div>
              <div><Label>מזהה הצעה (אופציונלי)</Label><Input type="number" value={createForm.quote_id} onChange={e => setCreateForm({ ...createForm, quote_id: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>סכום לפני הנחה</Label><Input type="number" value={createForm.subtotal} onChange={e => setCreateForm({ ...createForm, subtotal: e.target.value })} /></div>
                <div><Label>הנחה</Label><Input type="number" value={createForm.discount_total} onChange={e => setCreateForm({ ...createForm, discount_total: e.target.value })} /></div>
                <div><Label>מע״מ</Label><Input type="number" step="0.01" value={createForm.vat_rate} onChange={e => setCreateForm({ ...createForm, vat_rate: e.target.value })} /></div>
              </div>
              <div><Label>אספקה צפויה</Label><Input type="date" value={createForm.expected_delivery} onChange={e => setCreateForm({ ...createForm, expected_delivery: e.target.value })} /></div>
              <div><Label>הערות</Label><Textarea value={createForm.notes} onChange={e => setCreateForm({ ...createForm, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button onClick={submitCreate} disabled={createMutation.isPending}>צור הזמנה</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader><CardTitle>סינון</CardTitle></CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="h-4 w-4 absolute right-3 top-3 text-slate-400" />
            <Input className="pr-9" placeholder="חיפוש לפי מספר/הערות" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_HE[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-0">
          {isLoading && <div className="p-6 text-center text-slate-400">טוען…</div>}
          {error && <div className="p-6 text-center text-red-400">שגיאה בטעינה</div>}
          {!isLoading && !error && rows.length === 0 && (
            <div className="p-12 text-center text-slate-400">אין הזמנות. לחץ "הזמנה חדשה" להתחלה.</div>
          )}
          {!isLoading && rows.length > 0 && (
            <>
              <Table dir="rtl">
                <TableHeader>
                  <TableRow>
                    <TableHead>מספר</TableHead>
                    <TableHead>לקוח</TableHead>
                    <TableHead>תאריך</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead className="text-left">סה״כ כולל מע״מ</TableHead>
                    <TableHead>אספקה צפויה</TableHead>
                    <TableHead>פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.order_number}</TableCell>
                      <TableCell>#{row.customer_id}</TableCell>
                      <TableCell>{row.order_date}</TableCell>
                      <TableCell><Badge className={STATUS_COLOR[row.status] ?? "bg-slate-500"}>{STATUS_HE[row.status] ?? row.status}</Badge></TableCell>
                      <TableCell className="text-left font-mono">{fmtILS(row.total_with_vat)}</TableCell>
                      <TableCell>{row.expected_delivery ?? "—"}</TableCell>
                      <TableCell className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setTransitionOrder(row); setTransitionTo(""); }}>
                          <ArrowRightCircle className="h-3 w-3 ml-1" />שנה סטטוס
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between p-4 border-t border-slate-800">
                <span className="text-xs text-slate-400">מציג {page * limit + 1}–{Math.min((page + 1) * limit, total)} מתוך {total}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>קודם</Button>
                  <Button size="sm" variant="outline" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}>הבא</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Transition dialog */}
      <Dialog open={!!transitionOrder} onOpenChange={(o) => !o && setTransitionOrder(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>שינוי סטטוס — {transitionOrder?.order_number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>סטטוס יעד</Label>
              <Select value={transitionTo} onValueChange={setTransitionTo}>
                <SelectTrigger><SelectValue placeholder="בחר סטטוס" /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s} value={s} disabled={s === transitionOrder?.status}>{STATUS_HE[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>סיבה (אופציונלי)</Label><Textarea value={transitionReason} onChange={e => setTransitionReason(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button onClick={submitTransition} disabled={!transitionTo || transitionMutation.isPending}>
              בצע מעבר
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
