import { useState, useEffect, useMemo } from "react";
import { Plus, Edit2, Trash2, X, Save, Search, Clock, CheckCircle2, Loader2, FileText, DollarSign, Hash, ArrowUpDown } from "lucide-react";
import { motion } from "framer-motion";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

interface DebitNote { id: number; note_number: string; customer_id: number; customer_name: string; supplier_id: number; supplier_name: string; amount: number; reason: string; reference_invoice: string; notes: string; status: string; type: string; created_at: string; }
const statusMap: Record<string, { label: string; color: string }> = { draft: { label: "טיוטה", color: "bg-muted/20 text-gray-300" }, approved: { label: "מאושר", color: "bg-blue-500/20 text-blue-300" }, issued: { label: "הונפק", color: "bg-green-500/20 text-green-300" }, cancelled: { label: "מבוטל", color: "bg-red-500/20 text-red-300" } };

export default function DebitNotesPage() {
  const [items, setItems] = useState<DebitNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""); const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DebitNote | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DebitNote | null>(null);
  const [detailTab, setDetailTab] = useState("details");
  const token = localStorage.getItem("erp_token") || "";
  const headers: any = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const load = () => {
    setLoading(true);
    fetch(`${API}/finance-control/debit-notes`, { headers })
      .then(r => r.json()).then(d => setItems(safeArray(d))).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    return items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || i.note_number?.toLowerCase().includes(search.toLowerCase()) || i.customer_name?.toLowerCase().includes(search.toLowerCase()) || i.supplier_name?.toLowerCase().includes(search.toLowerCase()))
    );
  }, [items, search, filterStatus]);

  const openCreate = () => { setEditing(null); setForm({ customer_name: "", supplier_name: "", amount: 0, reason: "", reference_invoice: "", notes: "" }); setShowForm(true); };
  const openEdit = (r: DebitNote) => { setEditing(r); setForm({ customer_name: r.customer_name, supplier_name: r.supplier_name, amount: r.amount, reason: r.reason, reference_invoice: r.reference_invoice, notes: r.notes }); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/finance-control/debit-notes/${editing.id}` : `${API}/finance-control/debit-notes`;
      await fetch(url, { method: editing ? "PUT" : "POST", headers, body: JSON.stringify(form) });
      setShowForm(false); load();
    } finally { setSaving(false); }
  };

  const kpis = [
    { label: "סה\"כ הודעות חיוב", value: items.length, icon: Hash, color: "text-blue-400" },
    { label: "טיוטות", value: items.filter(i => i.status === "draft").length, icon: Clock, color: "text-muted-foreground" },
    { label: "מאושרות", value: items.filter(i => i.status === "approved").length, icon: CheckCircle2, color: "text-green-400" },
    { label: "סכום כולל", value: `₪${fmt(items.reduce((s, i) => s + Number(i.amount || 0), 0))}`, icon: DollarSign, color: "text-amber-400" },
  ];

  if (loading) return <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-400" /></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] to-[#1a1f35] text-foreground p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-l from-orange-400 to-red-300 bg-clip-text text-transparent flex items-center gap-3">
              <FileText className="w-8 h-8 text-orange-400" />
              הודעות חיוב
            </h1>
            <p className="text-muted-foreground mt-1">ניהול הודעות חיוב (Debit Notes)</p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg transition">
            <Plus className="w-4 h-4" /> הודעת חיוב חדשה
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {kpis.map((k, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-card border border-white/10 rounded-xl p-4 flex items-center gap-4">
              <k.icon className={`w-8 h-8 ${k.color}`} />
              <div><p className="text-sm text-muted-foreground">{k.label}</p><p className="text-2xl font-bold">{k.value}</p></div>
            </motion.div>
          ))}
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2 bg-card border border-white/10 rounded-lg text-foreground" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground">
            <option value="all">כל הסטטוסים</option>
            <option value="draft">טיוטה</option>
            <option value="approved">מאושר</option>
            <option value="issued">הונפק</option>
            <option value="cancelled">מבוטל</option>
          </select>
        </div>

        <div className="bg-card border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-muted-foreground border-b border-white/10 bg-card/5">
              <th className="text-right py-3 px-4">מספר</th>
              <th className="text-right py-3 px-4">לקוח/ספק</th>
              <th className="text-right py-3 px-4">סכום</th>
              <th className="text-right py-3 px-4">סיבה</th>
              <th className="text-right py-3 px-4">חשבונית מקור</th>
              <th className="text-right py-3 px-4">סטטוס</th>
              <th className="text-right py-3 px-4">תאריך</th>
              <th className="text-right py-3 px-4">פעולות</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">אין הודעות חיוב</td></tr>}
              {filtered.map(item => {
                const st = statusMap[item.status] || { label: item.status, color: "bg-muted/20 text-gray-300" };
                return (
                  <tr key={item.id} className="border-b border-white/5 hover:bg-card/5 cursor-pointer transition" onClick={() => { setSelectedItem(item); setDetailTab("details"); }}>
                    <td className="py-3 px-4 font-mono text-blue-400">{item.note_number}</td>
                    <td className="py-3 px-4">{item.customer_name || item.supplier_name || "-"}</td>
                    <td className="py-3 px-4 font-medium text-orange-400">₪{fmt(item.amount)}</td>
                    <td className="py-3 px-4 text-muted-foreground truncate max-w-[200px]">{item.reason}</td>
                    <td className="py-3 px-4">{item.reference_invoice || "-"}</td>
                    <td className="py-3 px-4"><span className={`px-2 py-1 rounded-full text-xs ${st.color}`}>{st.label}</span></td>
                    <td className="py-3 px-4 text-muted-foreground">{item.created_at?.slice(0, 10)}</td>
                    <td className="py-3 px-4 flex gap-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEdit(item)} className="p-1 hover:bg-blue-500/20 rounded"><Edit2 className="w-4 h-4 text-blue-400" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setSelectedItem(null)}>
            <div className="bg-card border border-white/10 rounded-xl w-full max-w-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">הודעת חיוב {selectedItem.note_number}</h3>
                <button onClick={() => setSelectedItem(null)}><X className="w-5 h-5" /></button>
              </div>
              <div className="flex gap-2 border-b border-white/10 pb-2">
                {["details", "history"].map(tab => (
                  <button key={tab} onClick={() => setDetailTab(tab)}
                    className={`px-3 py-1 rounded-lg text-sm ${detailTab === tab ? "bg-blue-600 text-foreground" : "text-muted-foreground hover:bg-card/5"}`}>
                    {tab === "details" ? "פרטים" : "היסטוריה"}
                  </button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="grid grid-cols-2 gap-4">
                  <div><span className="text-muted-foreground text-sm">מספר</span><p className="font-mono">{selectedItem.note_number}</p></div>
                  <div><span className="text-muted-foreground text-sm">סכום</span><p className="text-orange-400 font-bold">₪{fmt(selectedItem.amount)}</p></div>
                  <div><span className="text-muted-foreground text-sm">לקוח</span><p>{selectedItem.customer_name || "-"}</p></div>
                  <div><span className="text-muted-foreground text-sm">ספק</span><p>{selectedItem.supplier_name || "-"}</p></div>
                  <div className="col-span-2"><span className="text-muted-foreground text-sm">סיבה</span><p>{selectedItem.reason || "-"}</p></div>
                  <div><span className="text-muted-foreground text-sm">חשבונית מקור</span><p>{selectedItem.reference_invoice || "-"}</p></div>
                  <div><span className="text-muted-foreground text-sm">תאריך</span><p>{selectedItem.created_at?.slice(0, 10)}</p></div>
                  <div className="col-span-2"><span className="text-muted-foreground text-sm">הערות</span><p>{selectedItem.notes || "-"}</p></div>
                </div>
              )}
              {detailTab === "history" && <p className="text-muted-foreground text-center py-8">אין היסטוריה</p>}
            </div>
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="bg-card border border-white/10 rounded-xl w-full max-w-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">{editing ? "עריכת הודעת חיוב" : "הודעת חיוב חדשה"}</h3>
                <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-sm text-muted-foreground">שם לקוח</label><input value={form.customer_name || ""} onChange={e => setForm({ ...form, customer_name: e.target.value })} className="w-full mt-1 px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground" /></div>
                  <div><label className="text-sm text-muted-foreground">שם ספק</label><input value={form.supplier_name || ""} onChange={e => setForm({ ...form, supplier_name: e.target.value })} className="w-full mt-1 px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-sm text-muted-foreground">סכום</label><input type="number" value={form.amount || 0} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground" /></div>
                  <div><label className="text-sm text-muted-foreground">חשבונית מקור</label><input value={form.reference_invoice || ""} onChange={e => setForm({ ...form, reference_invoice: e.target.value })} className="w-full mt-1 px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground" /></div>
                </div>
                <div><label className="text-sm text-muted-foreground">סיבה</label><textarea value={form.reason || ""} onChange={e => setForm({ ...form, reason: e.target.value })} className="w-full mt-1 px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground" rows={2} /></div>
                <div><label className="text-sm text-muted-foreground">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full mt-1 px-3 py-2 bg-card border border-white/10 rounded-lg text-foreground" rows={2} /></div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-white/10 rounded-lg hover:bg-card/5">ביטול</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg disabled:opacity-50">
                  <Save className="w-4 h-4" /> {saving ? "שומר..." : "שמירה"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
