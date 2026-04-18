import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  FileSpreadsheet, Plus, Search, X, Save, Eye, Edit2, Trash2,
  TrendingUp, TrendingDown, ChevronsUpDown, CheckCircle2, Send,
  Loader2, Star, Award, Truck, Clock, DollarSign, BarChart3,
  ChevronRight, ChevronLeft, MoreHorizontal, Users, ShoppingCart, Target, Copy
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const fmt = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(Number(v || 0));

const STATUSES = ["טיוטה", "נשלח", "התקבלו הצעות", "בהשוואה", "נבחר", "בוטל"] as const;
const SC: Record<string, string> = {
  "טיוטה": "bg-gray-500/20 text-gray-300",
  "נשלח": "bg-blue-500/20 text-blue-300",
  "התקבלו הצעות": "bg-yellow-500/20 text-yellow-300",
  "בהשוואה": "bg-purple-500/20 text-purple-300",
  "נבחר": "bg-green-500/20 text-green-300",
  "בוטל": "bg-red-500/20 text-red-300",
};
const CATS = ["חומרי גלם", "ציוד", "שירותים", "קבלני משנה", "אחר"];

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-input rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className="text-xs font-mono text-foreground w-8 text-right">{score.toFixed(0)}</span>
    </div>
  );
}

function StarRating({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-3 h-3 ${i <= value ? "text-amber-400 fill-amber-400" : "text-gray-600"}`} />
      ))}
    </div>
  );
}


const load: any[] = [];
export default function RfqManagement() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "matrix" | "responses" | "items">("details");
  const [showAddResponse, setShowAddResponse] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [form, setForm] = useState<any>({
    title: "", category: "", requester: "", status: "טיוטה",
    deadline: "", estimatedValue: "", currency: "ILS",
    technicalSpec: "", deliveryTerms: "", notes: "",
    scoringWeights: { price: 40, quality: 25, delivery: 20, terms: 15 }
  });
  const [rfqItems, setRfqItems] = useState<any[]>([]);
  const [responseForm, setResponseForm] = useState<any>({
    supplierName: "", totalPrice: "", currency: "ILS", deliveryDays: "", paymentTerms: "", validityDays: 30, notes: ""
  });
  const [sendSuppliers, setSendSuppliers] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: rfqsRaw = [], isLoading } = useQuery({
    queryKey: ["rfqs"],
    queryFn: async () => { const r = await authFetch("/api/rfqs"); return r.json(); },
  });
  const rfqs: any[] = Array.isArray(rfqsRaw) ? rfqsRaw : (rfqsRaw?.data || []);

  const { data: suppliersRaw = [] } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: async () => { const r = await authFetch("/api/suppliers"); return r.json(); },
  });
  const suppliers: any[] = Array.isArray(suppliersRaw) ? suppliersRaw : (suppliersRaw?.data || []);

  const { data: detailData, refetch: refetchDetail } = useQuery({
    queryKey: ["rfq-detail", showDetail],
    queryFn: async () => {
      if (!showDetail) return null;
      const r = await authFetch(`/api/rfqs/${showDetail}`);
      return r.json();
    },
    enabled: showDetail !== null,
  });

  const { data: bestCombination } = useQuery({
    queryKey: ["rfq-best-combination", showDetail, detailData?.scoring_weights],
    queryFn: async () => {
      if (!showDetail || !detailData?.scoring_weights) return null;
      const sw = detailData.scoring_weights;
      const params = new URLSearchParams({ price: String(sw.price || 40), quality: String(sw.quality || 25), delivery: String(sw.delivery || 20), terms: String(sw.terms || 15) });
      const r = await authFetch(`/api/rfqs/${showDetail}/best-combination?${params}`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: showDetail !== null && !!detailData,
  });

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    let d = [...rfqs];
    if (search) {
      const s = search.toLowerCase();
      d = d.filter(r => r.rfq_number?.toLowerCase().includes(s) || r.title?.toLowerCase().includes(s) || r.requester?.toLowerCase().includes(s));
    }
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    if (catFilter !== "all") d = d.filter(r => r.category === catFilter);
    if (sortField) {
      d.sort((a, b) => {
        const av = a[sortField], bv = b[sortField];
        const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""), "he");
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return d;
  }, [rfqs, search, statusFilter, catFilter, sortField, sortDir]);

  const tp = Math.ceil(filtered.length / perPage);
  const pd = filtered.slice((page - 1) * perPage, page * perPage);

  const createMut = useMutation({
    mutationFn: async () => {
      const url = editId ? `/api/rfqs/${editId}` : "/api/rfqs";
      const method = editId ? "PUT" : "POST";
      const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "שגיאה"); }
      const rfq = await r.json();
      if (!editId && rfqItems.length > 0) {
        for (const item of rfqItems) {
          if (!item.itemDescription) continue;
          await authFetch(`/api/rfqs/${rfq.id}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
        }
      }
      return rfq;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      setShowCreate(false);
      setEditId(null);
      setForm({ title: "", category: "", requester: "", status: "טיוטה", deadline: "", estimatedValue: "", currency: "ILS", technicalSpec: "", deliveryTerms: "", notes: "", scoringWeights: { price: 40, quality: 25, delivery: 20, terms: 15 } });
      setRfqItems([]);
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`/api/rfqs/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rfqs"] }),
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`/api/rfqs/${showDetail}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierIds: sendSuppliers }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      refetchDetail();
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      setShowSendModal(false);
      setSendSuppliers([]);
    },
  });

  const addResponseMut = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`/api/rfqs/${showDetail}/responses`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(responseForm),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      refetchDetail();
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      setShowAddResponse(false);
      setResponseForm({ supplierName: "", totalPrice: "", currency: "ILS", deliveryDays: "", paymentTerms: "", validityDays: 30, notes: "" });
    },
  });

  const selectWinnerMut = useMutation({
    mutationFn: async ({ responseId, convertToPO }: { responseId: number; convertToPO: boolean }) => {
      const r = await authFetch(`/api/rfqs/${showDetail}/select-winner`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId, convertToPO }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      refetchDetail();
      qc.invalidateQueries({ queryKey: ["rfqs"] });
    },
  });

  const openEdit = (rfq: any) => {
    setForm({
      title: rfq.title || "",
      category: rfq.category || "",
      requester: rfq.requester || "",
      status: rfq.status || "טיוטה",
      deadline: rfq.deadline?.slice(0, 10) || "",
      estimatedValue: rfq.estimated_value || "",
      currency: rfq.currency || "ILS",
      technicalSpec: rfq.technical_spec || "",
      deliveryTerms: rfq.delivery_terms || "",
      notes: rfq.notes || "",
      scoringWeights: rfq.scoring_weights || { price: 40, quality: 25, delivery: 20, terms: 15 },
    });
    setEditId(rfq.id);
    setShowCreate(true);
  };

  const responses = detailData?.responses || [];
  const bestResponse = responses.length > 0
    ? responses.reduce((best: any, r: any) => r.score_total > (best?.score_total || 0) ? r : best, null)
    : null;

  const kpis = [
    { label: "סה\"כ RFQ", value: rfqs.length, color: "text-violet-400", icon: FileSpreadsheet },
    { label: "פתוחים", value: rfqs.filter(r => ["טיוטה", "נשלח"].includes(r.status)).length, color: "text-yellow-400", icon: Clock },
    { label: "הצעות התקבלו", value: rfqs.filter(r => r.status === "התקבלו הצעות").length, color: "text-blue-400", icon: Users },
    { label: "נבחרו", value: rfqs.filter(r => r.status === "נבחר").length, color: "text-green-400", icon: CheckCircle2 },
    { label: "בוטלו", value: rfqs.filter(r => r.status === "בוטל").length, color: "text-red-400", icon: X },
    { label: "סה\"כ שווי", value: fmt(rfqs.reduce((s, r) => s + Number(r.estimated_value || 0), 0)), color: "text-cyan-400", icon: DollarSign },
  ];

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-violet-400" />
            ניהול RFQ
          </h1>
          <p className="text-sm text-muted-foreground mt-1">בקשות הצעות מחיר, השוואת מטריצה, ניקוד ובחירת ספק</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setEditId(null); }} className="bg-violet-600 hover:bg-violet-700 gap-2">
          <Plus className="h-4 w-4" />RFQ חדש
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border">
            <CardContent className="p-4">
              {isLoading ? (
                <div className="space-y-2 animate-pulse"><div className="h-3 w-20 bg-muted rounded" /><div className="h-6 w-16 bg-muted rounded" /></div>
              ) : (
                <div>
                  <k.icon className={`h-4 w-4 ${k.color} mb-1`} />
                  <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card/60 border-border">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" />
            </div>
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הסטטוסים</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
              <option value="all">כל הקטגוריות</option>
              {CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(statusFilter !== "all" || catFilter !== "all" || search) && (
              <Button variant="ghost" size="sm" onClick={() => { setStatusFilter("all"); setCatFilter("all"); setSearch(""); }} className="text-red-400 hover:text-red-300 gap-1">
                <X className="h-3 w-3" />נקה
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background/50">
                  {[
                    { k: "rfq_number", l: "מספר RFQ" }, { k: "title", l: "כותרת" },
                    { k: "category", l: "קטגוריה" }, { k: "requester", l: "מבקש" },
                    { k: "suppliers_invited", l: "ספקים" }, { k: "quotes_received", l: "הצעות" },
                    { k: "estimated_value", l: "אומדן" }, { k: "deadline", l: "מועד" },
                    { k: "status", l: "סטטוס" },
                  ].map(col => (
                    <th key={col.k} className="p-3 text-right text-muted-foreground font-medium">
                      <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(col.k)}>
                        {col.l}<ChevronsUpDown className="h-3 w-3 opacity-40" />
                      </button>
                    </th>
                  ))}
                  <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={10} className="p-3">
                        <div className="flex gap-4 animate-pulse">
                          {Array.from({ length: 8 }).map((_, j) => <div key={j} className="h-4 bg-muted rounded flex-1" />)}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : pd.length === 0 ? (
                  <tr><td colSpan={10} className="p-16 text-center">
                    <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">אין RFQs</p>
                  </td></tr>
                ) : pd.map(row => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-mono text-xs text-violet-400">{row.rfq_number}</td>
                    <td className="p-3 font-medium text-foreground">{row.title}</td>
                    <td className="p-3 text-muted-foreground text-xs">{row.category}</td>
                    <td className="p-3 text-muted-foreground text-xs">{row.requester}</td>
                    <td className="p-3 text-center font-mono text-muted-foreground">{row.suppliers_invited || 0}</td>
                    <td className="p-3 text-center font-mono text-cyan-400">{row.quotes_received || 0}</td>
                    <td className="p-3 font-mono text-muted-foreground">{fmt(row.estimated_value)}</td>
                    <td className="p-3 text-muted-foreground text-xs">{row.deadline ? new Date(row.deadline).toLocaleDateString("he-IL") : "—"}</td>
                    <td className="p-3"><Badge className={`${SC[row.status] || "bg-gray-500/20 text-gray-300"} border-0 text-xs`}>{row.status}</Badge></td>
                    <td className="p-3">
                      <div className="flex items-center gap-1 justify-center">
                        <button onClick={() => { setShowDetail(row.id); setActiveTab("details"); }} className="p-1.5 hover:bg-muted rounded"><Eye className="h-3.5 w-3.5 text-muted-foreground" /></button>
                        <button onClick={() => openEdit(row)} className="p-1.5 hover:bg-muted rounded"><Edit2 className="h-3.5 w-3.5 text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord("/api/rfqs", row.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                        <button onClick={() => { if (confirm("למחוק?")) deleteMut.mutate(row.id); }} className="p-1.5 hover:bg-muted rounded"><Trash2 className="h-3.5 w-3.5 text-red-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between p-3 border-t border-border">
            <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>
              <span className="text-sm text-muted-foreground px-2 py-1">{page}/{tp || 1}</span>
              <Button variant="ghost" size="sm" disabled={page >= tp} onClick={() => setPage(p => p + 1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowCreate(false); setEditId(null); }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">{editId ? "עריכת RFQ" : "RFQ חדש"}</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setEditId(null); }}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-muted-foreground text-xs">כותרת *</Label>
                  <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="תיאור ה-RFQ" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">קטגוריה</Label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    <option value="">בחר...</option>
                    {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">מבקש</Label>
                  <Input value={form.requester} onChange={e => setForm({ ...form, requester: e.target.value })} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">מועד אחרון</Label>
                  <Input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">אומדן שווי (₪)</Label>
                  <Input type="number" value={form.estimatedValue} onChange={e => setForm({ ...form, estimatedValue: e.target.value })} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">סטטוס</Label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground text-xs">מפרט טכני</Label>
                  <textarea rows={2} value={form.technicalSpec} onChange={e => setForm({ ...form, technicalSpec: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" />
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground text-xs">תנאי אספקה ותשלום</Label>
                  <textarea rows={2} value={form.deliveryTerms} onChange={e => setForm({ ...form, deliveryTerms: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" />
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <h3 className="text-sm font-semibold text-violet-400 mb-3">משקלי ניקוד (%)</h3>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { key: "price", label: "מחיר" }, { key: "quality", label: "איכות" },
                    { key: "delivery", label: "אספקה" }, { key: "terms", label: "תנאים" }
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <Label className="text-muted-foreground text-xs">{label}</Label>
                      <Input type="number" min={0} max={100}
                        value={form.scoringWeights[key] || 0}
                        onChange={e => setForm({ ...form, scoringWeights: { ...form.scoringWeights, [key]: Number(e.target.value) } })}
                        className="bg-input border-border text-foreground mt-1" />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  סה"כ: {Object.values(form.scoringWeights).reduce((s: number, v: any) => s + Number(v), 0)}%
                  {Object.values(form.scoringWeights).reduce((s: number, v: any) => s + Number(v), 0) !== 100 && (
                    <span className="text-red-400 mr-2">חייב להיות 100%</span>
                  )}
                </p>
              </div>

              {!editId && (
                <div className="border-t border-border pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-violet-400">פריטים לבקשה</h3>
                    <Button size="sm" variant="outline" onClick={() => setRfqItems([...rfqItems, { itemDescription: "", quantity: 1, unit: "יחידה", estimatedPrice: "" }])} className="border-border text-xs gap-1">
                      <Plus className="h-3 w-3" />הוסף פריט
                    </Button>
                  </div>
                  {rfqItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2 mb-2">
                      <Input placeholder="תיאור פריט" value={item.itemDescription} onChange={e => { const upd = [...rfqItems]; upd[idx].itemDescription = e.target.value; setRfqItems(upd); }} className="bg-input border-border text-foreground flex-1" />
                      <Input type="number" placeholder="כמות" value={item.quantity} onChange={e => { const upd = [...rfqItems]; upd[idx].quantity = e.target.value; setRfqItems(upd); }} className="bg-input border-border text-foreground w-24" />
                      <Input placeholder="יחידה" value={item.unit} onChange={e => { const upd = [...rfqItems]; upd[idx].unit = e.target.value; setRfqItems(upd); }} className="bg-input border-border text-foreground w-24" />
                      <Button variant="ghost" size="sm" onClick={() => setRfqItems(rfqItems.filter((_, i) => i !== idx))} className="text-red-400"><X className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end items-center">
              {!form.title && <span className="text-xs text-red-400 ml-auto">⚠ יש להזין כותרת לפני שמירה</span>}
              <Button variant="outline" onClick={() => { setShowCreate(false); setEditId(null); }} className="border-border">ביטול</Button>
              <Button onClick={() => { if (!form.title) return; createMut.mutate(); }} disabled={createMut.isPending} className="bg-violet-600 hover:bg-violet-700 gap-1">
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editId ? "עדכן" : "צור RFQ"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDetail !== null && detailData && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowDetail(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-foreground">{detailData.rfq_number}</h2>
                <Badge className={`${SC[detailData.status] || ""} border-0`}>{detailData.status}</Badge>
              </div>
              <div className="flex gap-2">
                {["נשלח", "טיוטה"].includes(detailData.status) && (
                  <Button size="sm" onClick={() => setShowSendModal(true)} className="bg-blue-600 hover:bg-blue-700 gap-1 text-xs">
                    <Send className="h-3 w-3" />שלח לספקים
                  </Button>
                )}
                {["נשלח", "התקבלו הצעות", "בהשוואה"].includes(detailData.status) && (
                  <Button size="sm" onClick={() => setShowAddResponse(true)} className="bg-green-700 hover:bg-green-600 gap-1 text-xs">
                    <Plus className="h-3 w-3" />הוסף הצעה
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowDetail(null)}><X className="h-4 w-4" /></Button>
              </div>
            </div>

            <div className="flex border-b border-border">
              {[
                { key: "details", label: "פרטים" },
                { key: "items", label: `פריטים (${detailData.items?.length || 0})` },
                { key: "responses", label: `הצעות (${responses.length})` },
                { key: "matrix", label: "מטריצת השוואה" },
              ].map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key as any)}
                  className={`px-4 py-2.5 text-sm border-b-2 ${activeTab === t.key ? "border-violet-500 text-violet-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {activeTab === "details" && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { l: "כותרת", v: detailData.title },
                    { l: "קטגוריה", v: detailData.category },
                    { l: "מבקש", v: detailData.requester },
                    { l: "מועד אחרון", v: detailData.deadline ? new Date(detailData.deadline).toLocaleDateString("he-IL") : "—" },
                    { l: "אומדן שווי", v: fmt(detailData.estimated_value) },
                    { l: "מטבע", v: detailData.currency },
                    { l: "ספקים שהוזמנו", v: detailData.suppliersInvited?.length || 0 },
                    { l: "הצעות שהתקבלו", v: responses.length },
                  ].map((f, i) => (
                    <div key={i} className="bg-input rounded-lg p-3">
                      <p className="text-[11px] text-muted-foreground">{f.l}</p>
                      <p className="text-foreground font-medium mt-1">{f.v || "—"}</p>
                    </div>
                  ))}
                  {detailData.technical_spec && (
                    <div className="col-span-2 md:col-span-3 bg-input rounded-lg p-3">
                      <p className="text-[11px] text-muted-foreground mb-1">מפרט טכני</p>
                      <p className="text-foreground text-sm">{detailData.technical_spec}</p>
                    </div>
                  )}
                  <div className="col-span-2 md:col-span-3 bg-input rounded-lg p-3">
                    <p className="text-[11px] text-muted-foreground mb-2">משקלי ניקוד</p>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { k: "price", l: "מחיר" }, { k: "quality", l: "איכות" },
                        { k: "delivery", l: "אספקה" }, { k: "terms", l: "תנאים" }
                      ].map(({ k, l }) => (
                        <div key={k} className="text-center">
                          <div className="text-lg font-bold text-violet-400">{detailData.scoring_weights?.[k] || 0}%</div>
                          <div className="text-[11px] text-muted-foreground">{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "items" && (
                <div>
                  {detailData.items?.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">אין פריטים</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border">
                        <th className="p-2 text-right text-muted-foreground">תיאור</th>
                        <th className="p-2 text-right text-muted-foreground">כמות</th>
                        <th className="p-2 text-right text-muted-foreground">יחידה</th>
                        <th className="p-2 text-right text-muted-foreground">מחיר משוער</th>
                      </tr></thead>
                      <tbody>
                        {detailData.items?.map((item: any, i: number) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="p-2 text-foreground">{item.item_description}</td>
                            <td className="p-2 font-mono">{item.quantity}</td>
                            <td className="p-2 text-muted-foreground">{item.unit}</td>
                            <td className="p-2 text-muted-foreground">{item.estimated_price ? fmt(item.estimated_price) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === "responses" && (
                <div className="space-y-3">
                  {responses.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p>עדיין לא התקבלו הצעות</p>
                    </div>
                  ) : responses.map((resp: any, i: number) => (
                    <div key={i} className={`border rounded-lg p-4 ${resp.is_winner ? "border-green-500/50 bg-green-500/5" : "border-border bg-input"}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {resp.is_winner && <Award className="h-4 w-4 text-amber-400" />}
                          <span className="font-medium text-foreground">{resp.supplier_name}</span>
                          {resp.is_winner && <Badge className="bg-green-500/20 text-green-400 border-0 text-xs">זוכה</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          {!resp.is_winner && !detailData.responses?.some((r: any) => r.is_winner) && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => selectWinnerMut.mutate({ responseId: resp.id, convertToPO: false })}
                                className="border-amber-500/30 text-amber-400 text-xs gap-1 h-7">
                                <Award className="h-3 w-3" />בחר כזוכה
                              </Button>
                              <Button size="sm" onClick={() => selectWinnerMut.mutate({ responseId: resp.id, convertToPO: true })}
                                className="bg-green-700 hover:bg-green-600 text-xs gap-1 h-7">
                                <ShoppingCart className="h-3 w-3" />המר ל-PO
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mt-3">
                        <div><p className="text-[10px] text-muted-foreground">סכום</p><p className="text-cyan-400 font-mono font-bold">{fmt(resp.total_price)}</p></div>
                        <div><p className="text-[10px] text-muted-foreground">ימי אספקה</p><p className="text-foreground">{resp.delivery_days || "—"}</p></div>
                        <div><p className="text-[10px] text-muted-foreground">תנאי תשלום</p><p className="text-foreground text-xs">{resp.payment_terms || "—"}</p></div>
                        <div><p className="text-[10px] text-muted-foreground">ניקוד כולל</p><ScoreBar score={resp.score_total || 0} /></div>
                        <div className="space-y-1">
                          {[{ k: "score_price", l: "מחיר" }, { k: "score_quality", l: "איכות" }, { k: "score_delivery", l: "אספקה" }].map(s => (
                            <div key={s.k} className="flex items-center gap-1 text-[10px]">
                              <span className="text-muted-foreground w-10">{s.l}</span>
                              <ScoreBar score={resp[s.k] || 0} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "matrix" && (
                <div>
                  {responses.length < 2 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p>נדרשות לפחות 2 הצעות להשוואה</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr>
                            <th className="p-3 text-right text-muted-foreground bg-input border border-border">קריטריון</th>
                            {responses.map((r: any) => (
                              <th key={r.id} className={`p-3 text-center border border-border ${r.is_winner ? "bg-green-500/10" : "bg-input"}`}>
                                <div className="font-medium text-foreground">{r.supplier_name}</div>
                                {r.is_winner && <Badge className="bg-green-500/20 text-green-400 border-0 text-[10px] mt-1">זוכה</Badge>}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { label: "סכום כולל", key: "total_price", format: (v: any) => fmt(v), best: "min" },
                            { label: "ימי אספקה", key: "delivery_days", format: (v: any) => v ? `${v} ימים` : "—", best: "min" },
                            { label: "תנאי תשלום", key: "payment_terms", format: (v: any) => v || "—", best: null },
                            { label: "ניקוד מחיר", key: "score_price", format: (v: any) => v ? `${v.toFixed(0)}/100` : "—", best: "max" },
                            { label: "ניקוד איכות", key: "score_quality", format: (v: any) => v ? `${v.toFixed(0)}/100` : "—", best: "max" },
                            { label: "ניקוד אספקה", key: "score_delivery", format: (v: any) => v ? `${v.toFixed(0)}/100` : "—", best: "max" },
                            { label: "ניקוד תנאים", key: "score_terms", format: (v: any) => v ? `${v.toFixed(0)}/100` : "—", best: "max" },
                            { label: "ניקוד כולל", key: "score_total", format: (v: any) => v ? `${v.toFixed(1)}/100` : "—", best: "max" },
                          ].map((row, ri) => {
                            const vals = responses.map((r: any) => Number(r[row.key] || 0)).filter(v => v > 0);
                            const bestVal = row.best === "min" ? Math.min(...vals) : row.best === "max" ? Math.max(...vals) : null;
                            return (
                              <tr key={ri} className={ri % 2 === 0 ? "" : "bg-input/30"}>
                                <td className="p-3 font-medium text-muted-foreground border border-border">{row.label}</td>
                                {responses.map((r: any) => {
                                  const val = Number(r[row.key] || 0);
                                  const isBest = bestVal !== null && val > 0 && val === bestVal;
                                  return (
                                    <td key={r.id} className={`p-3 text-center border border-border ${isBest ? "bg-green-500/10 text-green-400 font-bold" : "text-foreground"}`}>
                                      {row.format(r[row.key])}
                                      {isBest && <span className="mr-1 text-[10px]">✓</span>}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {bestResponse && !detailData.responses?.some((r: any) => r.is_winner) && (
                        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-green-400" />
                            <span className="text-green-400 text-sm">המלצה כוללת: <strong>{bestResponse.supplier_name}</strong> (ניקוד {bestResponse.score_total?.toFixed(1)})</span>
                          </div>
                          <Button size="sm" onClick={() => selectWinnerMut.mutate({ responseId: bestResponse.id, convertToPO: true })}
                            className="bg-green-700 hover:bg-green-600 text-xs gap-1">
                            <ShoppingCart className="h-3 w-3" />המר ל-PO
                          </Button>
                        </div>
                      )}
                      {bestCombination && bestCombination.combination && bestCombination.combination.some((c: any) => c.bestLine) && (
                        <div className="mt-4">
                          <h4 className="text-sm font-semibold text-amber-400 mb-2 flex items-center gap-2">
                            <Award className="h-4 w-4" />שילוב מיטבי לפי פריט
                          </h4>
                          <p className="text-xs text-muted-foreground mb-2">בחירה אופטימלית של ספק לכל פריט בנפרד על פי ניקוד משוקלל ({bestCombination.suppliersCount} ספקים)</p>
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-input">
                                <th className="text-right px-3 py-2 text-muted-foreground border border-border">פריט</th>
                                <th className="text-right px-3 py-2 text-muted-foreground border border-border">ספק מומלץ</th>
                                <th className="text-right px-3 py-2 text-muted-foreground border border-border">מחיר יחידה</th>
                                <th className="text-right px-3 py-2 text-muted-foreground border border-border">סה"כ שורה</th>
                                <th className="text-right px-3 py-2 text-muted-foreground border border-border">ניקוד</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bestCombination.combination.map((c: any, li: number) => (
                                <tr key={li} className={`border-t border-border ${c.bestLine ? "hover:bg-amber-500/5" : "opacity-50"}`}>
                                  <td className="px-3 py-2 text-foreground border border-border">{c.item?.item_description || c.item?.itemDescription || `פריט ${li + 1}`}</td>
                                  <td className="px-3 py-2 text-amber-400 font-medium border border-border">{c.bestLine?.supplierName || "—"}</td>
                                  <td className="px-3 py-2 font-mono text-foreground border border-border">{c.bestLine ? fmt(c.bestLine.unitPrice) : "—"}</td>
                                  <td className="px-3 py-2 font-mono text-emerald-400 border border-border">{c.bestLine ? fmt(c.bestLine.totalPrice) : "—"}</td>
                                  <td className="px-3 py-2 border border-border">{c.bestLine ? <ScoreBar score={c.bestLine.scoreTotal || 0} /> : "—"}</td>
                                </tr>
                              ))}
                              <tr className="bg-input font-bold">
                                <td colSpan={3} className="px-3 py-2 text-right text-muted-foreground border border-border">סה"כ שילוב מיטבי</td>
                                <td className="px-3 py-2 font-mono text-emerald-400 border border-border">{fmt(bestCombination.totalCost)}</td>
                                <td className="border border-border"></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddResponse && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setShowAddResponse(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold text-foreground">הוספת הצעת מחיר</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowAddResponse(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <Label className="text-muted-foreground text-xs">שם ספק *</Label>
                <Input value={responseForm.supplierName} onChange={e => setResponseForm({ ...responseForm, supplierName: e.target.value })} className="bg-input border-border text-foreground mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-muted-foreground text-xs">סכום כולל (₪)</Label>
                  <Input type="number" value={responseForm.totalPrice} onChange={e => setResponseForm({ ...responseForm, totalPrice: e.target.value })} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">ימי אספקה</Label>
                  <Input type="number" value={responseForm.deliveryDays} onChange={e => setResponseForm({ ...responseForm, deliveryDays: e.target.value })} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">תנאי תשלום</Label>
                  <Input value={responseForm.paymentTerms} onChange={e => setResponseForm({ ...responseForm, paymentTerms: e.target.value })} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">תוקף (ימים)</Label>
                  <Input type="number" value={responseForm.validityDays} onChange={e => setResponseForm({ ...responseForm, validityDays: e.target.value })} className="bg-input border-border text-foreground mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">הערות</Label>
                <textarea rows={2} value={responseForm.notes} onChange={e => setResponseForm({ ...responseForm, notes: e.target.value })} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => setShowAddResponse(false)} className="border-border">ביטול</Button>
              <Button onClick={() => addResponseMut.mutate()} disabled={!responseForm.supplierName || addResponseMut.isPending} className="bg-green-700 hover:bg-green-600 gap-1">
                {addResponseMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}שמור
              </Button>
            </div>
          </div>
        </div>
      )}

      {showSendModal && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={() => setShowSendModal(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-md max-h-[60vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-bold text-foreground">שליחת RFQ לספקים</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowSendModal(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <p className="text-sm text-muted-foreground mb-3">בחר ספקים לשליחת ה-RFQ:</p>
              {suppliers.slice(0, 20).map((s: any) => (
                <label key={s.id} className="flex items-center gap-3 p-2 hover:bg-muted/30 rounded cursor-pointer">
                  <input type="checkbox" checked={sendSuppliers.includes(s.id)}
                    onChange={e => setSendSuppliers(e.target.checked ? [...sendSuppliers, s.id] : sendSuppliers.filter(id => id !== s.id))}
                    className="rounded" />
                  <span className="text-foreground text-sm">{s.supplierName || s.supplier_name}</span>
                  <span className="text-muted-foreground text-xs">{s.supplierNumber || s.supplier_number}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => setShowSendModal(false)} className="border-border">ביטול</Button>
              <Button onClick={() => sendMut.mutate()} disabled={sendSuppliers.length === 0 || sendMut.isPending} className="bg-blue-600 hover:bg-blue-700 gap-1">
                {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                שלח ל-{sendSuppliers.length} ספקים
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
