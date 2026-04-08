import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Repeat, Plus, Search, Pause, Play, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { authJson, authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
function fmt(n: number) { return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n); }
function fmtDate(d: string) { return d ? new Date(d).toLocaleDateString("he-IL") : "-"; }

const statusColors: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  paused: "bg-yellow-500/20 text-yellow-400",
  completed: "bg-blue-500/20 text-blue-400",
  needs_attention: "bg-red-500/20 text-red-400",
  cancelled: "bg-muted/20 text-muted-foreground",
};
const statusLabels: Record<string, string> = {
  active: "פעיל",
  paused: "מושהה",
  completed: "הסתיים",
  needs_attention: "דורש טיפול",
  cancelled: "בוטל",
};

const frequencyLabels: Record<string, string> = {
  monthly: "חודשי",
  bimonthly: "דו-חודשי",
  quarterly: "רבעוני",
  yearly: "שנתי",
  weekly: "שבועי",
};

export default function StandingOrdersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const soValidation = useFormValidation({ customer_name: { required: true }, amount: { required: true, min: 0 } });
  const [form, setForm] = useState({
    customer_name: "",
    amount: "",
    frequency: "monthly",
    start_date: new Date().toISOString().split("T")[0],
    end_date: "",
    description: "",
    payment_method: "credit_card",
  });

  const { data } = useQuery({
    queryKey: ["standing-orders", statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      return authJson(`${API}/finance/standing-orders?${params}`);
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => authJson(`${API}/finance/standing-orders`, {
      method: "POST", body: JSON.stringify(body),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["standing-orders"] });
      setDialogOpen(false);
      toast({ title: "הוראת קבע נוצרה בהצלחה" });
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      authJson(`${API}/finance/standing-orders/${id}`, {
        method: "PUT", body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["standing-orders"] }),
  });

  const items = (data?.data || []).filter((item: any) =>
    !search || item.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    item.description?.toLowerCase().includes(search.toLowerCase())
  );

  const totalActive = items.filter((i: any) => i.status === "active").length;
  const totalAmount = items.filter((i: any) => i.status === "active").reduce((s: number, i: any) => s + Number(i.amount || 0), 0);

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Repeat className="w-6 h-6 text-indigo-400" /> הוראות קבע
          </h1>
          <p className="text-muted-foreground mt-1">{totalActive} פעילות | סה"כ חיוב חודשי: {fmt(totalAmount)}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 ml-2" />הוראת קבע חדשה
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 max-w-lg" dir="rtl">
            <DialogHeader><DialogTitle>הוראת קבע חדשה</DialogTitle></DialogHeader>
            <div className="grid gap-4">
              <div><Label>שם לקוח</Label><Input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>סכום</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                <div>
                  <Label>תדירות</Label>
                  <Select value={form.frequency} onValueChange={v => setForm({ ...form, frequency: v })}>
                    <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {Object.entries(frequencyLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>תאריך התחלה</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
                <div><Label>תאריך סיום (אופציונלי)</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
              </div>
              <div>
                <Label>אמצעי תשלום</Label>
                <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                  <SelectTrigger className="bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="credit_card">כרטיס אשראי</SelectItem>
                    <SelectItem value="bank_transfer">הוראת קבע בנקאית</SelectItem>
                    <SelectItem value="masav">מס"ב</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>תיאור</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="bg-slate-800 border-slate-700" /></div>
              <Button onClick={() => createMutation.mutate({ ...form, amount: parseFloat(form.amount), status: "active" })} disabled={!form.customer_name || !form.amount}>
                צור הוראת קבע
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי לקוח..." className="pr-9 bg-slate-800 border-slate-700" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="p-3 text-right text-muted-foreground font-medium">לקוח</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">תיאור</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">סכום</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">תדירות</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">תאריך התחלה</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">תאריך סיום</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
                  <th className="p-3 text-right text-muted-foreground font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer" onClick={() => { setSelectedItem(item); setDetailTab("details"); }}>
                    <td className="p-3 text-foreground font-medium">{item.customer_name || "-"}</td>
                    <td className="p-3 text-slate-300">{item.description || "-"}</td>
                    <td className="p-3 text-indigo-400 font-medium">{fmt(Number(item.amount || 0))}</td>
                    <td className="p-3 text-slate-300">{frequencyLabels[item.frequency] || item.frequency}</td>
                    <td className="p-3 text-slate-300">{fmtDate(item.start_date)}</td>
                    <td className="p-3 text-slate-300">{fmtDate(item.end_date)}</td>
                    <td className="p-3">
                      <Badge className={statusColors[item.status] || "bg-slate-600"}>
                        {item.status === "needs_attention" && <AlertTriangle className="w-3 h-3 ml-1" />}
                        {statusLabels[item.status] || item.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        {item.status === "active" && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => updateStatus.mutate({ id: item.id, status: "paused" })}>
                            <Pause className="w-3.5 h-3.5 text-yellow-400" />
                          </Button>
                        )}
                        {item.status === "paused" && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => updateStatus.mutate({ id: item.id, status: "active" })}>
                            <Play className="w-3.5 h-3.5 text-green-400" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">אין הוראות קבע</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold text-foreground">הוראת קבע: {selectedItem.customer_name}</h2>
              <button onClick={() => setSelectedItem(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="flex border-b border-border/50">
              {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>
            <div className="p-6">
              {detailTab === "details" && (
                <div className="space-y-4">
                  <StatusTransition currentStatus={selectedItem.status} statuses={[{key:"active",label:"פעיל",color:"bg-green-500"},{key:"paused",label:"מושהה",color:"bg-yellow-500"},{key:"cancelled",label:"מבוטל",color:"bg-red-500"},{key:"completed",label:"הושלם",color:"bg-blue-500"}]} onTransition={async (s) => { await authFetch(`${API}/standing-orders/${selectedItem.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) }); qc.invalidateQueries({ queryKey: ["standing-orders"] }); setSelectedItem({ ...selectedItem, status: s }); }} />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div><div className="text-xs text-muted-foreground mb-1">לקוח</div><div className="text-sm text-foreground">{selectedItem.customer_name}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">סכום</div><div className="text-sm text-indigo-400 font-bold">{fmt(Number(selectedItem.amount || 0))}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תדירות</div><div className="text-sm text-foreground">{frequencyLabels[selectedItem.frequency] || selectedItem.frequency}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תאריך התחלה</div><div className="text-sm text-foreground">{fmtDate(selectedItem.start_date)}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תאריך סיום</div><div className="text-sm text-foreground">{fmtDate(selectedItem.end_date)}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תיאור</div><div className="text-sm text-foreground">{selectedItem.description || "-"}</div></div>
                  </div>
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="standing-orders" entityId={selectedItem.id} tabs={[{ key: "payments", label: "תשלומים", endpoint: `${API}/payments?standing_order_id=${selectedItem.id}` }]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="standing-orders" entityId={selectedItem.id} />}
              {detailTab === "history" && <ActivityLog entityType="standing-orders" entityId={selectedItem.id} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
