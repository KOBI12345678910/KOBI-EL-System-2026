import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Banknote, Plus, Search } from "lucide-react";
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

const methodLabels: Record<string, string> = { bank_transfer: "העברה בנקאית", check: "צ'ק", cash: "מזומן", credit_card: "כרטיס אשראי", other: "אחר" };
const typeLabels: Record<string, string> = { outgoing: "תשלום יוצא", incoming: "תשלום נכנס" };
const statusColors: Record<string, string> = { completed: "bg-green-500/20 text-green-400", pending: "bg-yellow-500/20 text-yellow-400", cancelled: "bg-red-500/20 text-red-400", bounced: "bg-red-500/20 text-red-400" };
const statusLabels: Record<string, string> = { completed: "בוצע", pending: "ממתין", cancelled: "בוטל", bounced: "חזר" };

export default function PaymentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("details");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const validation = useFormValidation({ amount: { required: true, min: 0 }, description: { required: true } });
  const [form, setForm] = useState({
    payment_date: new Date().toISOString().split("T")[0],
    payment_type: "outgoing", payment_method: "bank_transfer",
    amount: "", description: "", reference_number: "", check_number: "",
    currency: "ILS", status: "pending",
  });

  const { data: rawData } = useQuery({
    queryKey: ["payments", statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      return authJson(`${API}/finance/payments?${params}`);
    },
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => authJson(`${API}/finance/payments`, {
      method: "POST", body: JSON.stringify(body),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["accounts-payable"] });
      qc.invalidateQueries({ queryKey: ["accounts-receivable"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["financial-transactions"] });
      qc.invalidateQueries({ queryKey: ["executive-dashboard"] });
      qc.invalidateQueries({ queryKey: ["cross-module-summary"] });
      setDialogOpen(false);
      toast({ title: "תשלום נוצר בהצלחה" });
    },
  });

  const data = Array.isArray(rawData) ? rawData : rawData?.data || [];
  const rows = data.filter((r: any) => !search || r.description?.includes(search) || r.reference_number?.includes(search));
  const totalAmount = rows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center">
            <Banknote className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-foreground">תשלומים</h1>
            <p className="text-muted-foreground text-sm">{rows.length} תשלומים | סה"כ: {fmt(totalAmount)}</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-500"><Plus className="w-4 h-4 ml-2" />תשלום חדש</Button>
          </DialogTrigger>
          <DialogContent className="bg-slate-900 border-slate-700 text-foreground max-w-lg" dir="rtl">
            <DialogHeader><DialogTitle>תשלום חדש</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>תאריך</Label><Input type="date" value={form.payment_date} onChange={e => setForm({...form, payment_date: e.target.value})} className="bg-slate-800 border-slate-600" /></div>
                <div><Label>סוג</Label>
                  <Select value={form.payment_type} onValueChange={v => setForm({...form, payment_type: v})}>
                    <SelectTrigger className="bg-slate-800 border-slate-600"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(typeLabels).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><Label>סכום <RequiredMark /></Label><Input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="bg-slate-800 border-slate-600" placeholder="0.00" /><FormFieldError validation={validation} field="amount" /></div>
                <div><Label>אמצעי תשלום</Label>
                  <Select value={form.payment_method} onValueChange={v => setForm({...form, payment_method: v})}>
                    <SelectTrigger className="bg-slate-800 border-slate-600"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(methodLabels).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              {form.payment_method === "check" && (
                <div><Label>מספר צ'ק</Label><Input value={form.check_number} onChange={e => setForm({...form, check_number: e.target.value})} className="bg-slate-800 border-slate-600" /></div>
              )}
              <div><Label>אסמכתא</Label><Input value={form.reference_number} onChange={e => setForm({...form, reference_number: e.target.value})} className="bg-slate-800 border-slate-600" /></div>
              <div><Label>תיאור <RequiredMark /></Label><Input value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="bg-slate-800 border-slate-600" /><FormFieldError validation={validation} field="description" /></div>
              <Button onClick={() => { if (!validation.validate(form)) return; createMutation.mutate({ ...form, amount: parseFloat(form.amount) }); }} disabled={createMutation.isPending} className="bg-blue-600 hover:bg-blue-500">
                {createMutation.isPending ? "שומר..." : "שמור תשלום"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {rows.length > 1 && (() => {
        const now = new Date();
        const cm = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        const pm = (() => { const d = new Date(now.getFullYear(), now.getMonth()-1, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; })();
        const cq = Math.floor(now.getMonth()/3);
        const qMonths = (q: number, y: number) => [0,1,2].map(i => `${y}-${String(q*3+i+1).padStart(2,"0")}`);
        const cqMonths = qMonths(cq, now.getFullYear());
        const pqMonths = cq > 0 ? qMonths(cq-1, now.getFullYear()) : qMonths(3, now.getFullYear()-1);
        const sumPeriod = (months: string[]) => rows.filter((i: any) => months.some(m => i.payment_date?.startsWith(m))).reduce((a: any, i: any) => {
          const amt = Number(i.amount||0);
          return i.payment_type === 'incoming' ? { ...a, incoming: a.incoming + amt, count: a.count + 1 } : { ...a, outgoing: a.outgoing + amt, count: a.count + 1 };
        }, { incoming: 0, outgoing: 0, count: 0 });
        const curM = sumPeriod([cm]), prevM = sumPeriod([pm]);
        const curQ = sumPeriod(cqMonths), prevQ = sumPeriod(pqMonths);
        const pctChange = (c: number, p: number) => p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / Math.abs(p)) * 100);
        const Arrow = ({ val, inverse }: { val: number; inverse?: boolean }) => { const up = inverse ? val < 0 : val > 0; const down = inverse ? val > 0 : val < 0; return up ? <span className="text-green-400 text-xs font-bold">▲ +{Math.abs(val)}%</span> : down ? <span className="text-red-400 text-xs font-bold">▼ {Math.abs(val)}%</span> : <span className="text-muted-foreground text-xs">—</span>; };
        return (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="text-sm font-bold text-gray-300 mb-3">📊 השוואת תקופות</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/30">
                  <div className="text-[10px] text-muted-foreground mb-1">תשלומים יוצאים: חודש נוכחי מול קודם</div>
                  <div className="text-lg font-bold text-blue-300">{fmt(curM.outgoing)}</div>
                  <div className="text-xs text-muted-foreground">מול {fmt(prevM.outgoing)}</div>
                  <Arrow val={pctChange(curM.outgoing, prevM.outgoing)} inverse />
                </div>
                <div className="bg-green-500/10 rounded-lg p-3 border border-green-500/30">
                  <div className="text-[10px] text-muted-foreground mb-1">תשלומים נכנסים: חודש נוכחי מול קודם</div>
                  <div className="text-lg font-bold text-green-300">{fmt(curM.incoming)}</div>
                  <div className="text-xs text-muted-foreground">מול {fmt(prevM.incoming)}</div>
                  <Arrow val={pctChange(curM.incoming, prevM.incoming)} />
                </div>
                <div className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/30">
                  <div className="text-[10px] text-muted-foreground mb-1">רבעון נוכחי מול קודם (יוצא)</div>
                  <div className="text-lg font-bold text-purple-300">{fmt(curQ.outgoing)}</div>
                  <div className="text-xs text-muted-foreground">מול {fmt(prevQ.outgoing)}</div>
                  <Arrow val={pctChange(curQ.outgoing, prevQ.outgoing)} inverse />
                </div>
                <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/30">
                  <div className="text-[10px] text-muted-foreground mb-1">כמות: חודש נוכחי מול קודם</div>
                  <div className="text-lg font-bold text-amber-300">{curM.count}</div>
                  <div className="text-xs text-muted-foreground">מול {prevM.count}</div>
                  <Arrow val={pctChange(curM.count, prevM.count)} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="pr-10 bg-slate-800/50 border-slate-700" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-slate-800/50 border-slate-700"><SelectValue placeholder="סטטוס" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            {Object.entries(statusLabels).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <BulkActions items={rows} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
        defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/finance/payments/${id}`, { method: "DELETE" }))); qc.invalidateQueries({ queryKey: ["payments"] }); }),
        defaultBulkActions.export(async (ids) => { const csv = rows.filter((r: any) => ids.includes(String(r.id))).map((r: any) => `${r.payment_date},${r.description},${r.amount},${r.status}`).join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "payments.csv"; a.click(); }),
      ]} />

      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-700 text-muted-foreground">
              <th className="p-3"><BulkCheckbox items={rows} selectedIds={selectedIds} onToggleAll={(ids) => toggleAll(ids)} type="header" /></th>
              <th className="p-3 text-right">תאריך</th>
              <th className="p-3 text-right">סוג</th>
              <th className="p-3 text-right">אמצעי</th>
              <th className="p-3 text-right">תיאור</th>
              <th className="p-3 text-right">אסמכתא</th>
              <th className="p-3 text-right">סכום</th>
              <th className="p-3 text-right">סטטוס</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">אין תשלומים</td></tr>
              ) : rows.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer" onClick={() => { setSelectedItem(r); setDetailTab("details"); }}>
                  <td className="p-3" onClick={e => e.stopPropagation()}><BulkCheckbox id={String(r.id)} isSelected={isSelected(String(r.id))} onToggle={() => toggle(String(r.id))} type="row" /></td>
                  <td className="p-3 text-gray-300">{fmtDate(r.payment_date)}</td>
                  <td className="p-3 text-gray-300">{typeLabels[r.payment_type] || r.payment_type}</td>
                  <td className="p-3 text-gray-300">{methodLabels[r.payment_method] || r.payment_method}</td>
                  <td className="p-3 text-foreground">{r.description || "-"}</td>
                  <td className="p-3 text-gray-300">{r.reference_number || r.check_number || "-"}</td>
                  <td className="p-3 font-mono text-foreground">{fmt(r.amount)}</td>
                  <td className="p-3"><Badge className={statusColors[r.status] || "bg-slate-600"}>{statusLabels[r.status] || r.status}</Badge></td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-600 font-bold text-foreground">
                  <td className="p-3"></td>
                  <td className="p-3" colSpan={5}>סה"כ ({rows.length} שורות)</td>
                  <td className="p-3 font-mono">{fmt(totalAmount)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      {selectedItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-slate-700">
              <h2 className="text-xl font-bold text-foreground">תשלום #{selectedItem.id}</h2>
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
                  <StatusTransition currentStatus={selectedItem.status} statuses={[{key:"pending",label:"ממתין",color:"bg-yellow-500"},{key:"completed",label:"בוצע",color:"bg-green-500"},{key:"cancelled",label:"בוטל",color:"bg-red-500"}]} onTransition={async (s) => { await authFetch(`${API}/finance/payments/${selectedItem.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) }); qc.invalidateQueries({ queryKey: ["payments"] }); setSelectedItem({ ...selectedItem, status: s }); }} />
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div><div className="text-xs text-muted-foreground mb-1">תאריך</div><div className="text-sm text-foreground">{fmtDate(selectedItem.payment_date)}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">סוג</div><div className="text-sm text-foreground">{typeLabels[selectedItem.payment_type] || selectedItem.payment_type}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">אמצעי</div><div className="text-sm text-foreground">{methodLabels[selectedItem.payment_method] || selectedItem.payment_method}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">סכום</div><div className="text-sm text-foreground font-bold">{fmt(selectedItem.amount)}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">תיאור</div><div className="text-sm text-foreground">{selectedItem.description || "-"}</div></div>
                    <div><div className="text-xs text-muted-foreground mb-1">אסמכתא</div><div className="text-sm text-foreground">{selectedItem.reference_number || "-"}</div></div>
                  </div>
                </div>
              )}
              {detailTab === "related" && <RelatedRecords entityType="payments" entityId={selectedItem.id} tabs={[{ key: "invoices", label: "חשבוניות", endpoint: `${API}/customer-invoices?payment_id=${selectedItem.id}` }, { key: "bank-reconciliation", label: "התאמות בנק", endpoint: `${API}/bank-reconciliation?payment_id=${selectedItem.id}` }]} />}
              {detailTab === "docs" && <AttachmentsSection entityType="payments" entityId={selectedItem.id} />}
              {detailTab === "history" && <ActivityLog entityType="payments" entityId={selectedItem.id} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
