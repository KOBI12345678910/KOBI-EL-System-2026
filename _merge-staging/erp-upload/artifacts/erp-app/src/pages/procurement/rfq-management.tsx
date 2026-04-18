import { useState, useEffect, useMemo } from "react";
import {
  FileText, Search, Plus, X, Save, Send, Clock, CheckCircle2, Award,
  ArrowUpDown, Filter, RefreshCw, Trash2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => "₪" + fmt(v);

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  draft:     { label: "טיוטה",    color: "bg-gray-500/20 text-gray-400 border-gray-500/30",     icon: FileText },
  published: { label: "פורסם",    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",     icon: Send },
  closed:    { label: "סגור",     color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: Clock },
  awarded:   { label: "הוכרע",    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: Award },
  cancelled: { label: "בוטל",     color: "bg-red-500/20 text-red-400 border-red-500/30",        icon: X },
};

const statusPipeline = ["draft", "published", "closed", "awarded"];

function StatusPipeline({ current }: { current: string }) {
  const currentIdx = statusPipeline.indexOf(current);
  return (
    <div className="flex items-center gap-1">
      {statusPipeline.map((s, i) => {
        const st = statusMap[s];
        const active = i <= currentIdx;
        return (
          <div key={s} className="flex items-center gap-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
              active ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-500"
            }`}>
              {i + 1}
            </div>
            <span className={`text-xs ${active ? "text-blue-400" : "text-gray-500"}`}>{st?.label}</span>
            {i < statusPipeline.length - 1 && (
              <div className={`w-4 h-0.5 ${active && i < currentIdx ? "bg-blue-600" : "bg-gray-700"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RfqManagementPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<any>({ items_list: [{ description: "", quantity: 1, unit: "יח'" }] });
  const [saving, setSaving] = useState(false);
  const [selectedRfq, setSelectedRfq] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/procurement-sap/rfqs`);
      if (res.ok) setItems(safeArray(await res.json()));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let arr = [...items];
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter(i => (i.rfq_number || "").toLowerCase().includes(s) || (i.title || "").toLowerCase().includes(s));
    }
    if (filterStatus !== "all") arr = arr.filter(i => i.status === filterStatus);
    arr.sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [items, search, filterStatus, sortField, sortDir]);

  const kpi = useMemo(() => {
    const total = items.length;
    const published = items.filter(i => i.status === "published").length;
    const closed = items.filter(i => i.status === "closed").length;
    const awarded = items.filter(i => i.status === "awarded").length;
    return { total, published, closed, awarded };
  }, [items]);

  const addItem = () => {
    const list = [...(form.items_list || []), { description: "", quantity: 1, unit: "יח'" }];
    setForm({ ...form, items_list: list });
  };

  const removeItem = (idx: number) => {
    const list = (form.items_list || []).filter((_: any, i: number) => i !== idx);
    setForm({ ...form, items_list: list });
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const list = [...(form.items_list || [])];
    list[idx] = { ...list[idx], [field]: value };
    setForm({ ...form, items_list: list });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await authFetch(`${API}/procurement-sap/rfqs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      setForm({ items_list: [{ description: "", quantity: 1, unit: "יח'" }] });
      load();
    } catch {}
    setSaving(false);
  };

  const kpis = [
    { icon: FileText, label: 'סה"כ RFQs', value: fmt(kpi.total), color: "from-blue-600 to-blue-800" },
    { icon: Send, label: "פורסמו", value: fmt(kpi.published), color: "from-cyan-600 to-cyan-800" },
    { icon: Clock, label: "נסגרו", value: fmt(kpi.closed), color: "from-yellow-600 to-yellow-800" },
    { icon: Award, label: "הוכרעו", value: fmt(kpi.awarded), color: "from-emerald-600 to-emerald-800" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">ניהול RFQ - בקשות להצעות מחיר</h1>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setForm({ items_list: [{ description: "", quantity: 1, unit: "יח'" }] }); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "סגור" : "RFQ חדש"}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className={`rounded-xl bg-gradient-to-br ${k.color} p-4 border border-white/10`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-white/70">{k.label}</div>
                <div className="text-2xl font-bold text-white mt-1">{k.value}</div>
              </div>
              <k.icon className="w-8 h-8 text-white/30" />
            </div>
          </div>
        ))}
      </div>

      {/* Create RFQ Form */}
      {showForm && (
        <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">יצירת RFQ חדש</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">כותרת *</label>
              <input type="text" className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">קטגוריה</label>
              <select className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                value={form.category || ""} onChange={e => setForm({ ...form, category: e.target.value })}>
                <option value="">בחר...</option>
                <option value="raw_materials">חומרי גלם</option>
                <option value="equipment">ציוד</option>
                <option value="services">שירותים</option>
                <option value="it">IT</option>
                <option value="office">משרד</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">מועד אחרון</label>
              <input type="date" className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                value={form.deadline || ""} onChange={e => setForm({ ...form, deadline: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">תקציב מוערך</label>
              <input type="number" className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                value={form.budget || ""} onChange={e => setForm({ ...form, budget: +e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-300 mb-1">תיאור</label>
              <input type="text" className="w-full rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200"
                value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-300">פריטים</h3>
              <button onClick={addItem} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                <Plus className="w-3 h-3" /> הוסף פריט
              </button>
            </div>
            {(form.items_list || []).map((item: any, idx: number) => (
              <div key={idx} className="flex gap-2 items-center">
                <input type="text" placeholder="תיאור פריט" className="flex-1 rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200 text-sm"
                  value={item.description || ""} onChange={e => updateItem(idx, "description", e.target.value)} />
                <input type="number" placeholder="כמות" className="w-20 rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200 text-sm"
                  value={item.quantity || ""} onChange={e => updateItem(idx, "quantity", +e.target.value)} />
                <input type="text" placeholder="יחידה" className="w-20 rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-gray-200 text-sm"
                  value={item.unit || ""} onChange={e => updateItem(idx, "unit", e.target.value)} />
                <button onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-300">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm">ביטול</button>
            <button onClick={handleSave} disabled={saving || !form.title}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? "שומר..." : "שמור RFQ"}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="חיפוש RFQ..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pr-10 pl-3 py-2 rounded-lg border border-gray-600 bg-gray-800/50 text-gray-200 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="rounded-lg border border-gray-600 bg-gray-800/50 px-3 py-2 text-gray-200 text-sm">
            <option value="all">כל הסטטוסים</option>
            {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <span className="text-sm text-gray-400">{filtered.length} תוצאות</span>
      </div>

      {/* Status Pipeline Display */}
      {selectedRfq && (
        <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-white">{selectedRfq.title} - מעקב סטטוס</h3>
            <button onClick={() => setSelectedRfq(null)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <StatusPipeline current={selectedRfq.status || "draft"} />
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/60">
              <tr>
                {[
                  { key: "rfq_number", label: "מספר RFQ" },
                  { key: "title", label: "כותרת" },
                  { key: "category", label: "קטגוריה" },
                  { key: "deadline", label: "מועד אחרון" },
                  { key: "responses_count", label: "תגובות" },
                  { key: "budget", label: "תקציב" },
                  { key: "awarded_vendor", label: "ספק נבחר" },
                  { key: "status", label: "סטטוס" },
                ].map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)}
                    className="px-4 py-3 text-right font-medium text-gray-300 cursor-pointer hover:text-white whitespace-nowrap">
                    <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3 opacity-40" /></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">טוען נתונים...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">לא נמצאו RFQs</td></tr>
              ) : filtered.map((item, idx) => {
                const st = statusMap[item.status] || { label: item.status || "—", color: "bg-gray-500/20 text-gray-400" };
                const isOverdue = item.deadline && new Date(item.deadline) < new Date() && item.status !== "awarded" && item.status !== "cancelled";
                return (
                  <tr key={item.id || idx} className="hover:bg-gray-800/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedRfq(item)}>
                    <td className="px-4 py-3 text-blue-400 font-medium">{item.rfq_number || "—"}</td>
                    <td className="px-4 py-3 text-gray-200">{item.title || "—"}</td>
                    <td className="px-4 py-3 text-gray-400">{item.category || "—"}</td>
                    <td className={`px-4 py-3 text-xs ${isOverdue ? "text-red-400 font-medium" : "text-gray-400"}`}>
                      {item.deadline || "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300">{item.responses_count ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-300">{item.budget ? fmtCurrency(item.budget) : "—"}</td>
                    <td className="px-4 py-3 text-gray-300">{item.awarded_vendor || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={`${st.color} border text-xs`}>{st.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
